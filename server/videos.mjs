// Videos ("pieces") inside a playlist folder: playlists/<playlist>/<CODE>-<slug>/.
// The piece's README.md is the record (BRAND-GUIDE Part D): title, taxonomy card, standards check,
// corrections. video.json beside it holds the app's own state (approvals, template, settings).
import fs from 'node:fs';
import path from 'node:path';
import {read, readJson, write, writeJson, parseTable, renderTable, findSection, sectionTable, stripMd, toArchive, VIDEO_FOLDER, SLUG, longDate} from './workspace.mjs';
import {CARD_FIELDS, pickValues, cardProblems, applicableStandards, showValue} from './taxonomy.mjs';
import {loadProfile} from './brand.mjs';
import {KITS, LENGTHS, forVideo, cleanHosts} from './kits.mjs';

const listFiles = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)) : []);

export function listVideos(root, tax, playlistDir) {
  if (!fs.existsSync(playlistDir)) return [];
  return fs
    .readdirSync(playlistDir, {withFileTypes: true})
    .filter((d) => d.isDirectory() && VIDEO_FOLDER.test(d.name))
    .map((d) => getVideo(root, tax, playlistDir, d.name))
    .sort((a, b) => a.code.localeCompare(b.code, 'en', {numeric: true}));
}

// README card row label -> field key
const ROW_TO_FIELD = {topic: 'topic', section: 'section', format: 'format', 'news label': 'label', label: 'label', region: 'region', industry: 'industry', audience: 'audience', breakout: 'breakout', cause: 'cause'};

export function parseCard(tax, readme) {
  const lines = (readme || '').split(/\r?\n/);
  const t = sectionTable(lines, 'Taxonomy card');
  if (!t || !t.rows.length) return null;
  const card = {notes: {}};
  for (const f of CARD_FIELDS) card[f] = [];
  for (const [label, value] of t.rows) {
    const field = ROW_TO_FIELD[stripMd(label).toLowerCase()];
    if (!field) continue;
    const {values, note} = pickValues(tax, field, value || '');
    card[field] = values;
    if (note) card.notes[field] = note;
  }
  const date = (lines[t.section.start].match(/\(([^)]+)\)/) || [])[1];
  card.date = date || null;
  return card;
}

export function renderCard(tax, card) {
  const rows = CARD_FIELDS.map((f) => {
    const vals = (card[f] || []).map((v) => showValue(f, v)).join(', ') || 'none';
    const note = card.notes?.[f];
    return [tax.fields[f].label, note ? `${vals} (${note})` : vals];
  });
  return renderTable(['Field', 'Value'], rows);
}

function parseCheck(readme) {
  const lines = (readme || '').split(/\r?\n/);
  const t = sectionTable(lines, 'Standards check');
  if (!t || !t.rows.length) return null;
  const rows = t.rows.map(([standard, result, evidence]) => ({standard: stripMd(standard), result: stripMd(result), evidence: evidence || ''}));
  const verdict = lines.slice(t.section.start, t.section.end).find((l) => /owner'?s verdict/i.test(l));
  return {rows, ownerVerdict: verdict ? stripMd(verdict).replace(/^owner'?s verdict[^:]*:\s*/i, '') : null};
}

function countSources(videoDir) {
  let n = 0;
  for (const f of listFiles(path.join(videoDir, 'youtube'), /\.md$/)) n = Math.max(n, (read(path.join(videoDir, 'youtube', f)).match(/https?:\/\/\S+/g) || []).length);
  return n;
}

// The 8 gates of BRAND-GUIDE A3, worked out from what is in the folder (video.json can record more).
export function gates(tax, v, videoDir) {
  const state = v.state || {};
  const card = v.card;
  const problems = card ? cardProblems(tax, card, {kit: state.kit}) : ['No taxonomy card yet'];
  const finals = listFiles(path.join(videoDir, 'video'), /\.mp4$/i).filter((f) => !/preview|record/i.test(f));
  const check = v.check;
  const gaps = check ? check.rows.filter((r) => /gap|fail/i.test(r.result)).length : 0;
  const sources = countSources(videoDir);
  const listed = (sectionTable((v.readme || '').split(/\r?\n/), 'Standards list')?.rows || []).length;
  const g = [
    {id: 0, name: 'Taxonomy card', status: problems.length ? 'todo' : 'done', detail: problems.join('; ') || (card.date ? `filled ${card.date}` : 'filled')},
    {id: 1, name: 'Standards list', status: check || listed ? 'done' : card ? 'todo' : 'blocked', detail: check ? `${check.rows.length} standards listed` : listed ? `${listed} standards listed (from the plan)` : card ? `${applicableStandards(tax, card).length} apply, listed when the plan is approved` : 'needs the card'},
    {id: 2, name: 'Research', status: sources >= 2 ? 'done' : 'todo', detail: sources ? `${sources} source links in the description` : 'no sources yet'},
    {id: 3, name: 'Build', status: finals.length || state.built ? 'done' : 'todo', detail: finals.length ? finals.join(', ') : 'no video yet'},
    {id: 4, name: 'Standards check', status: !check ? 'todo' : gaps ? (check.ownerVerdict ? 'kept' : 'warn') : 'done', detail: !check ? 'not checked' : gaps ? `${gaps} gap${gaps > 1 ? 's' : ''}${check.ownerVerdict ? ', owner kept as is' : ', blocks publishing'}` : 'all confirmed'},
    {id: 5, name: 'Owner approval', status: state.approved || finals.length ? 'done' : 'todo', detail: state.approved ? `approved ${state.approved}` : finals.length ? 'final exists (approved before Content Studio)' : 'stills + 540p preview first'},
    {id: 6, name: 'Publish', status: state.published ? 'done' : 'todo', detail: state.published ? `published ${state.published}` : 'not published'},
    {id: 7, name: 'Corrections', status: /^##\s+Corrections/m.test(v.readme || '') ? 'done' : 'todo', detail: 'dated, in the open'},
  ];
  return g;
}

export function getVideo(root, tax, playlistDir, folder) {
  const m = VIDEO_FOLDER.exec(folder);
  if (!m) throw new Error('not a video folder: ' + folder);
  const dir = path.join(playlistDir, folder);
  if (!fs.existsSync(dir)) throw Object.assign(new Error('video not found: ' + folder), {status: 404});
  const readme = read(path.join(dir, 'README.md'), '');
  const state = readJson(path.join(dir, 'video.json'), {});
  const h1 = (readme.match(/^#\s+(.+)$/m) || [])[1] || '';
  const title = state.title || stripMd(h1.replace(new RegExp(`^${m[1]}\\s*[·:\\-–]\\s*`), '')) || m[2];
  const v = {folder, code: m[1], slug: m[2], title, card: parseCard(tax, readme), check: parseCheck(readme), state, readme};
  v.gates = gates(tax, v, dir);
  v.files = Object.fromEntries(['video', 'thumbnail', 'youtube', 'voiceover', 'plan', 'preview', 'subtitles', 'derived'].map((k) => [k, listFiles(path.join(dir, k), /^[^.]/)]));
  return v;
}

export function saveCard(root, tax, playlistDir, folder, card) {
  const dir = path.join(playlistDir, folder);
  const file = path.join(dir, 'README.md');
  const clean = {notes: card.notes || {}};
  for (const f of CARD_FIELDS) clean[f] = (card[f] || []).filter((v) => tax.fields[f].values.some((x) => x.value === v));
  const table = renderCard(tax, clean);
  let lines = read(file, `# ${folder}\n`).split(/\r?\n/);
  const heading = `## Taxonomy card (${longDate()})`;
  const sec = findSection(lines, 'Taxonomy card');
  if (sec) {
    const t = sectionTable(lines, 'Taxonomy card');
    lines[sec.start] = heading;
    if (t.at) lines.splice(t.at[0], t.at[1] - t.at[0], ...table.split('\n'));
    else lines.splice(sec.start + 1, 0, ...table.split('\n'));
  } else {
    // new card goes right after the title block, before the first "## " section
    const at = lines.findIndex((l, i) => i > 0 && /^##\s/.test(l));
    const block = [heading, ...table.split('\n'), ''];
    if (at < 0) lines.push('', ...block);
    else lines.splice(at, 0, ...block);
  }
  write(file, lines.join('\n'));
  return getVideo(root, tax, playlistDir, folder);
}

export function renameVideo(root, tax, playlistDir, folder, {title, slug}) {
  let dir = path.join(playlistDir, folder);
  const m = VIDEO_FOLDER.exec(folder);
  if (title) {
    const file = path.join(dir, 'README.md');
    const text = read(file, '');
    const h1 = `# ${m[1]} · ${title.trim()}`;
    write(file, /^#\s+.+$/m.test(text) ? text.replace(/^#\s+.+$/m, h1) : `${h1}\n\n${text}`);
    const sj = path.join(dir, 'video.json');
    if (fs.existsSync(sj)) writeJson(sj, {...readJson(sj, {}), title: title.trim()});
  }
  let newFolder = folder;
  if (slug && slug !== m[2]) {
    if (!SLUG.test(slug)) throw Object.assign(new Error('folder name: lowercase letters, numbers and dashes only'), {status: 400});
    newFolder = `${m[1]}-${slug}`;
    if (fs.existsSync(path.join(playlistDir, newFolder))) throw Object.assign(new Error(newFolder + ' already exists'), {status: 409});
    fs.renameSync(dir, path.join(playlistDir, newFolder));
  }
  return getVideo(root, tax, playlistDir, newFolder);
}

export const archiveVideo = (root, playlistDir, folder) => toArchive(root, path.join(playlistDir, folder));

export {parseTable};

// ---- Phase 2: a new graphics-driven video ----
// Next free code in the playlist (codes are never reused, archived ones included).
export function nextCode(root, playlistDir, prefix) {
  const used = new Set();
  const scan = (dir) => fs.existsSync(dir) && fs.readdirSync(dir).forEach((f) => {
    const m = /^([A-Z]{1,4})(\d{2,4})-/.exec(f);
    if (m && m[1] === prefix) used.add(Number(m[2]));
  });
  scan(playlistDir);
  scan(path.join(root, 'archive', path.relative(root, playlistDir)));
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}${String(n).padStart(2, '0')}`;
}

export function createVideo(root, tax, defaults, playlistDir, {title, concept, links, pdf, face, faceAmount, faceSeconds, length, kit: kitId, format, hosts}) {
  title = String(title || '').trim();
  // the playlist's kit, format and hosts, unless this video sets its own
  const playlist = forVideo(tax, defaults, {kit: kitId, format, hosts});
  if (KITS[playlist.kit].hosts && !playlist.hosts.length) throw Object.assign(new Error('Add the hosts (at least one): their names and genders shape the script and the dub voices'), {status: 400});
  const kit = KITS[playlist.kit] || KITS.news;
  if (!title) throw Object.assign(new Error(kit.edit ? 'Name the trip (e.g. "Hunza road trip")' : kit.hosts ? 'Name the destination (e.g. "Istanbul" or "Hunza Valley")' : 'Give the video a name'), {status: 400});
  // a kit video needs only its subject (the destination); a News video needs its concept
  if (kit.id === 'news' && !String(concept || '').trim() && !pdf) throw Object.assign(new Error('Add the concept as text or a PDF'), {status: 400});
  if (playlist.flow !== 'defined') throw Object.assign(new Error(`The ${playlist.format} flow is not defined yet (BRAND-GUIDE Part C), so this playlist cannot produce videos.`), {status: 409});
  const code = nextCode(root, playlistDir, playlist.codePrefix);
  const slug = (title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'video';
  const folder = `${code}-${slug}`;
  const dir = path.join(playlistDir, folder);
  fs.mkdirSync(path.join(dir, 'concept'), {recursive: true});

  const linkList = String(links || '').split(/\s+/).filter((l) => /^https?:\/\//.test(l));
  write(path.join(dir, 'concept', 'concept.md'), [`# ${code} · ${title} · concept`, '', String(concept || '').trim() || (pdf ? '(see the PDF)' : kit.edit ? `${title}: the story is told with the footage.` : `A complete ${kit.name} guide to ${title}.`), '', ...(linkList.length ? ['## Links', ...linkList.map((l) => `- ${l}`), ''] : [])].join('\n'));
  if (pdf) {
    const name = (String(pdf.name || 'concept.pdf').replace(/[^\w.\- ]+/g, '').replace(/\.pdf$/i, '') || 'concept') + '.pdf';
    const buf = Buffer.from(String(pdf.data).replace(/^data:[^,]*,/, ''), 'base64');
    if (buf.subarray(0, 5).toString() !== '%PDF-') throw Object.assign(new Error('That file is not a PDF'), {status: 400});
    fs.writeFileSync(path.join(dir, 'concept', name), buf);
  }
  // card starts from the playlist defaults; the plan proposes the rest
  const card = {format: [playlist.format], notes: {}};
  for (const f of CARD_FIELDS) if (f !== 'format') card[f] = playlist.defaults?.[f]?.values || [];
  write(path.join(dir, 'README.md'), [`# ${code} · ${title}`, '', `- ${kit.id === 'news' ? 'Graphics-driven video' : kit.name} in ${playlist.name}. ${kit.edit ? 'Originals in \`raw/\`, the story in \`concept/\`, working copies and the edit in \`edit/\`.' : 'Concept in \`concept/\`, plan versions in \`plan/\`.'}`, '', '## Corrections', 'None yet.', ''].join('\n'));
  // with the creator on camera or graphics only; the brand can fix it for every video
  // (a kit with hosts always has them on camera: the studio moments)
  const rule = loadProfile(root).face;
  const on = kit.hosts ? true : rule === 'always' ? true : rule === 'never' ? false : Boolean(face);
  // what this video sets for itself (the rest follows the playlist)
  const own = {...(playlist.own.format ? {format: playlist.format} : {}), ...(playlist.own.hosts ? {hosts: playlist.hosts} : {})};
  const extra = {...(kit.id === 'news' ? (playlist.own.kit ? {kit: 'news'} : {}) : {kit: kit.id, length: LENGTHS[length] ? length : kit.defaultLength}), ...own};
  if (kit.edit) {
    fs.mkdirSync(path.join(dir, 'raw'), {recursive: true});
    writeJson(path.join(dir, 'video.json'), {title, template: 'edit', kit: kit.id, ...own, created: new Date().toISOString(), stage: 'assets'});
    return saveCard(root, tax, playlistDir, folder, card);
  }
  writeJson(path.join(dir, 'video.json'), {title, template: 'graphics', ...extra, face: on, ...(on ? faceOpts(kit.hosts ? {faceAmount: 'little', faceSeconds: 0} : {faceAmount, faceSeconds}) : {}), created: new Date().toISOString(), stage: 'plan'});
  return saveCard(root, tax, playlistDir, folder, card);
}

/** With the creator on camera or graphics only. Fixed once the plan is approved (the plan places the face moments). */
export function setFace(dir, body) {
  const file = path.join(dir, 'video.json');
  const s = readJson(file, {});
  if (s.plan?.approved) throw Object.assign(new Error('The plan is approved, so this is fixed. Ask for changes to make a new plan version first.'), {status: 409});
  const next = {...s, face: Boolean(body?.face), ...(body?.face ? faceOpts(body) : {})};
  writeJson(file, next);
  return {face: next.face, faceAmount: next.faceAmount, faceSeconds: next.faceSeconds};
}

/** Change what this video sets for itself (kit, format, hosts; null = back to the playlist's), until its plan
 * is approved. An edited video (own footage) and a planned one are made differently, so neither turns into the other. */
export function setVideoSetup(tax, playlist, dir, body = {}) {
  const file = path.join(dir, 'video.json');
  const s = readJson(file, {});
  if (s.plan?.approved) throw Object.assign(new Error('The plan is approved, so the kind of video and its speakers are fixed. Ask for changes to make a new plan version first.'), {status: 409});
  const next = {...s};
  for (const k of ['kit', 'format', 'hosts']) if (k in body) body[k] === null || body[k] === '' ? delete next[k] : (next[k] = body[k]);
  const before = forVideo(tax, playlist, s);
  const after = forVideo(tax, playlist, next);
  if (Boolean(KITS[before.kit].edit) !== Boolean(KITS[after.kit].edit)) throw Object.assign(new Error('An edit of your own footage and a planned video are made differently: start a new video for the other kind.'), {status: 409});
  if (KITS[after.kit].hosts && !after.hosts.length) throw Object.assign(new Error('Add the hosts (at least one)'), {status: 400});
  // keep only what differs from the playlist
  if (after.own.kit || KITS[after.kit].hosts) next.kit = after.kit;
  else delete next.kit;
  if (after.own.format) next.format = after.format;
  else delete next.format;
  if ('hosts' in next) next.hosts = cleanHosts(next.hosts, KITS[after.kit].maxHosts || 3);
  if (!next.hosts?.length) delete next.hosts;
  if (KITS[after.kit].hosts) next.face = true;
  writeJson(file, next);
  const {kit, kitName, format, hosts, flow, own} = forVideo(tax, playlist, next);
  return {kit, kitName, format, hosts, flow, own};
}

/** How much of the video shows the creator (little / balanced / lots) and how long each face moment lasts at most (0 = whole line). */
function faceOpts({faceAmount, faceSeconds}) {
  const secs = Math.max(0, Math.min(30, Math.round(Number(faceSeconds) * 10) / 10 || 0));
  return {faceAmount: ['little', 'balanced', 'lots'].includes(faceAmount) ? faceAmount : 'balanced', faceSeconds: secs};
}
