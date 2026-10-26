// Playlists: playlists/<slug>/PLAYLIST.md (read by people and Claude) + playlist.json (the app's data).
// PLAYLIST.md is regenerated from playlist.json in the same shape it has today; lines the app does not
// own are kept under "## Notes". The first time a folder has no playlist.json, it is imported from PLAYLIST.md.
import {loadProfile} from './brand.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {APP_DIR, read, readJson, write, writeJson, parseTable, renderTable, findSection, sectionTable, stripMd, slugify, toArchive, today, longDate, SLUG} from './workspace.mjs';
import {pickValues, applicableStandards, hashtagsFor, valuesOf, nameField} from './taxonomy.mjs';
import {listVideos} from './videos.mjs';
import {KITS, cleanHosts} from './kits.mjs';

export const DEFAULT_FIELDS = ['topic', 'section', 'label', 'cause', 'region', 'industry', 'audience', 'breakout'];

export const playlistsDir = (root) => path.join(root, 'playlists');

/** A new playlist's production settings: the brand profile's defaults (brand/profile.json) when given. */
export function defaultProduction(root) {
  const b = root ? loadProfile(root) : null;
  return {
    bed: b?.sound.defaultBed || 'a', // BRAND-GUIDE C1.7: news bed A under every News video
    fx: b?.sound.fxWithVoice ?? 0.6, // SFX + music level under the recorded voice
    preview: b?.output.preview || '540p',
    finalVideo: '1080p',
    finalThumb: '1080p',
    voiceLanguage: b?.languages.voice || 'ur-Latn',
    subtitles: b?.languages.subtitles || ['ur-Latn', 'ur-Arab'],
    dubs: b?.languages.dubs || [],
  };
}

/** The music beds that come with the app (engine/public/audio/beds), for a channel without its own;
 * served at /eng/audio/beds/ (the page plays /ws/eng/... links through the same route). */
function engineBeds() {
  const dir = path.join(APP_DIR, 'engine', 'public', 'audio', 'beds');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => /^news-bed-([a-z])-(.+)\.mp3$/i.exec(f))
    .filter(Boolean)
    .map(([f, id, name]) => ({id, name: name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), file: `eng/audio/beds/${f}`, mp3: `eng/audio/beds/${f}`}));
}

export function listBeds(root) {
  const dir = path.join(root, 'audio', 'news-beds');
  if (!fs.existsSync(dir)) return engineBeds();
  return fs
    .readdirSync(dir)
    .filter((f) => /^news-bed-[a-z]-.+\.wav$/i.test(f))
    .map((f) => {
      const [, id, name] = /^news-bed-([a-z])-(.+)\.wav$/i.exec(f);
      return {id, name: name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), file: `audio/news-beds/${f}`, mp3: `audio/news-beds/${f.replace(/\.wav$/i, '.mp3')}`};
    });
}

// ---- import from today's PLAYLIST.md ----
const DEFAULT_ROW = {format: 'format', 'news label': 'label', topic: 'topic', section: 'section', cause: 'cause', region: 'region', industry: 'industry', audience: 'audience', breakout: 'breakout', codes: 'codes'};

export function importPlaylistMd(tax, slug, md) {
  const lines = (md || '').split(/\r?\n/);
  const name = stripMd((md.match(/^#\s+(.+)$/m) || [])[1] || slug);
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  const purpose = stripMd(lines.slice(h1 + 1).find((l) => l.trim() && !/^(rules:|\||#)/i.test(l.trim())) || '');
  const p = {name, slug, purpose, format: 'News', codePrefix: '', defaults: {}, instructions: [], production: defaultProduction(), rows: {}, notes: ''};
  const t = sectionTable(lines, 'Taxonomy defaults');
  for (const [label, value] of t?.rows || []) {
    const key = DEFAULT_ROW[stripMd(label).toLowerCase()];
    if (!key) continue;
    if (key === 'codes') {
      p.codePrefix = (stripMd(value).match(/^([A-Z]{1,4})\d/) || [])[1] || '';
    } else if (key === 'format') {
      p.format = pickValues(tax, 'format', value).values[0] || 'News';
    } else {
      // only bold values are defaults; the rest of the cell is the rule in words
      const bold = [...value.matchAll(/\*\*([^*]+)\*\*/g)].map((x) => x[1]).join(', ');
      p.defaults[key] = {values: pickValues(tax, key, bold).values, note: stripMd(value.replace(/\*\*([^*]+)\*\*/g, '$1'))};
    }
  }
  // content table (the one with a Code column) -> per-video row notes
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|\s*Code\s*\|/i.test(lines[i])) {
      const {rows} = parseTable(lines, i);
      const head = rows[0].map((h) => stripMd(h).toLowerCase());
      for (const r of rows.slice(1)) {
        const code = stripMd(r[0]);
        p.rows[code] = {check: r[head.indexOf('standards check')] || '', status: r[head.indexOf('status')] || ''};
      }
      break;
    }
  }
  if (!p.codePrefix) p.codePrefix = Object.keys(p.rows)[0]?.replace(/\d+$/, '') || name.replace(/[^A-Z]/g, '').slice(0, 2) || 'P';
  return p;
}

// ---- PLAYLIST.md from playlist.json ----
export function renderPlaylistMd(tax, p, videos) {
  const fmtRef = tax.formats[p.format]?.ref || 'flow not yet defined';
  const cell = (key) => {
    const d = p.defaults[key] || {values: [], note: ''};
    const shown = (d.values || []).map((v) => (key === 'label' ? v + ' News' : v));
    const note = (d.note || '').trim();
    if (!shown.length) return note || 'per piece';
    // an imported note already names the values in place ("always Explained (lead…)"): bold them there
    if (shown.every((v) => note.includes(v))) return shown.reduce((s, v) => s.replace(v, `**${v}**`), note);
    const vals = shown.map((v) => `**${v}**`).join(', ');
    return note ? `${vals} · ${note}` : vals;
  };
  const defaults = [
    ['Format', `**${p.format}** (flow: ${fmtRef.replace(/^BRAND-GUIDE /, 'BRAND-GUIDE ')})`],
    ...DEFAULT_FIELDS.map((k) => [tax.fields[k].label, cell(k)]),
    ['Codes', `${p.codePrefix}01, ${p.codePrefix}02 …`],
  ];
  const content = videos.map((v) => {
    const row = p.rows[v.code] || {};
    const c = v.card || {};
    const g4 = v.gates.find((g) => g.id === 4);
    return [v.code, `\`${v.folder}/\``, (c.topic || []).join(', '), (c.section || []).join(', '), (c.label || []).map((l) => l + ' News').join(', '), row.check || g4.detail, row.status || v.gates.filter((g) => g.status === 'done').map((g) => g.name).slice(-1)[0] || 'Planned'];
  });
  const prod = p.production;
  const auto = applicableStandards(tax, flatDefaults(p)).map((s) => `${s.name}: ${s.rule}`);
  const out = [
    `# ${p.name}`,
    '',
    p.purpose,
    `Rules: \`../../BRAND-GUIDE.md\` (process A3, ${p.format} flow ${fmtRef.replace(/^BRAND-GUIDE /, '')}). Built with Content Studio (\`tools/content-studio\`).`,
    '',
    '## Taxonomy defaults',
    renderTable(['Field', 'Default'], defaults),
    '',
    `Hashtags from these defaults: ${hashtagsFor(tax, flatDefaults(p)).join(' ') || 'none yet'}`,
    '',
    '## Standing instructions',
    'Passed to every video in this playlist (plan, script, scenes, descriptions).',
    ...p.instructions.filter(Boolean).map((s) => `- ${s}`),
    ...auto.map((s) => `- Standard · ${s}`),
    '',
    '## Production defaults',
    renderTable(['Setting', 'Value'], [
      ['News bed', `${prod.bed.toUpperCase()}${prod.bed === 'a' ? ' (Urgent / Breaking, default)' : ''}`],
      ['SFX + music under the voice', String(prod.fx)],
      ['Preview', prod.preview],
      ['Final video', prod.finalVideo],
      ['Final thumbnail', prod.finalThumb],
      ['Voice language', prod.voiceLanguage],
      ['Subtitles', prod.subtitles.join(', ') || 'none'],
      ['Dubs', prod.dubs.join(', ') || 'none'],
    ]),
    '',
    '## Videos',
    'Every piece needs its taxonomy card and a passed standards check (in its `README.md`) before upload.',
    '',
    renderTable(['Code', 'Folder', 'Topic', 'Section', 'Label', 'Standards check', 'Status'], content),
    '',
    'Each piece folder: `README.md` (taxonomy card, standards check, corrections), `video/`, `thumbnail/`, `youtube/` (title, description, chapters, sources, tags), `voiceover/` (script PDF).',
  ];
  if (p.notes?.trim()) out.push('', '## Notes', p.notes.trim());
  out.push('', `_Updated ${longDate()} by Content Studio._`, '');
  return out.join('\n');
}

// Playlist defaults as a card, for standards and hashtags.
export function flatDefaults(p) {
  const card = {format: [p.format]};
  for (const k of DEFAULT_FIELDS) card[k] = p.defaults[k]?.values || [];
  return card;
}

// ---- read / write ----
export function loadPlaylist(root, tax, slug) {
  if (!SLUG.test(slug)) throw Object.assign(new Error('bad playlist name'), {status: 400});
  const dir = path.join(playlistsDir(root), slug);
  if (!fs.existsSync(dir)) throw Object.assign(new Error('playlist not found: ' + slug), {status: 404});
  let p = readJson(path.join(dir, 'playlist.json'));
  if (!p) p = importPlaylistMd(tax, slug, read(path.join(dir, 'PLAYLIST.md'), `# ${slug}\n`));
  p.slug = slug;
  p.production = {...defaultProduction(root), ...(p.production || {})};
  p.defaults = p.defaults || {};
  p.instructions = p.instructions || [];
  p.rows = p.rows || {};
  p.videos = listVideos(root, tax, dir);
  p.standards = applicableStandards(tax, flatDefaults(p));
  p.hashtags = hashtagsFor(tax, flatDefaults(p));
  p.kit = KITS[p.kit] ? p.kit : 'news';
  p.hosts = cleanHosts(p.hosts, KITS[p.kit].maxHosts);
  p.kitName = KITS[p.kit].name;
  // a kit that comes with the app brings its own flow (story shape, graphics, hosts)
  p.flow = p.kit !== 'news' || tax.formats[p.format]?.flow === 'defined' ? 'defined' : 'not yet defined';
  p.nameField = nameField(tax, p.name);
  return p;
}

export function listPlaylists(root, tax) {
  const dir = playlistsDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, {withFileTypes: true})
    .filter((d) => d.isDirectory() && SLUG.test(d.name))
    .map((d) => {
      const p = loadPlaylist(root, tax, d.name);
      return {slug: p.slug, name: p.name, nameField: p.nameField, purpose: p.purpose, format: p.format, kit: p.kit, kitName: p.kitName, flow: p.flow, codePrefix: p.codePrefix, count: p.videos.length, topics: p.defaults.topic?.values || [], videos: p.videos.map((v) => ({code: v.code, title: v.title, done: v.gates.filter((g) => g.status === 'done' || g.status === 'kept').length}))};
    });
}

const STORED = ['name', 'slug', 'purpose', 'format', 'kit', 'hosts', 'codePrefix', 'defaults', 'instructions', 'production', 'rows', 'notes'];

export function savePlaylist(root, tax, p) {
  const dir = path.join(playlistsDir(root), p.slug);
  const data = Object.fromEntries(STORED.map((k) => [k, p[k]]));
  data.updated = today();
  writeJson(path.join(dir, 'playlist.json'), data);
  const full = loadPlaylist(root, tax, p.slug);
  write(path.join(dir, 'PLAYLIST.md'), renderPlaylistMd(tax, full, full.videos));
  return loadPlaylist(root, tax, p.slug);
}

function validate(tax, input, existing) {
  const p = {...existing, ...input};
  p.name = String(p.name || '').trim();
  if (!p.name) throw Object.assign(new Error('Pick the playlist name from the taxonomy'), {status: 400});
  const nf = nameField(tax, p.name);
  if (!nf) throw Object.assign(new Error(`"${p.name}" is not in our taxonomy. Playlist names always come from it (e.g. the Topic "Cybersecurity").`), {status: 400});
  if (!valuesOf(tax, 'format').includes(p.format)) throw Object.assign(new Error('Pick a format'), {status: 400});
  p.codePrefix = String(p.codePrefix || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (!p.codePrefix) throw Object.assign(new Error('Give a code prefix (letters, e.g. N)'), {status: 400});
  const defaults = {};
  for (const k of DEFAULT_FIELDS) {
    const d = (input.defaults || existing?.defaults || {})[k] || {};
    defaults[k] = {values: (d.values || []).filter((v) => valuesOf(tax, k).includes(v)), note: String(d.note || '').trim()};
  }
  // the playlist is about its name: that value leads its field's defaults
  if (defaults[nf] && !defaults[nf].values.includes(p.name)) defaults[nf].values.unshift(p.name);
  p.defaults = defaults;
  p.instructions = (p.instructions || []).map((s) => String(s).trim()).filter(Boolean);
  p.production = {...defaultProduction(), ...(p.production || {})};
  p.kit = KITS[p.kit] ? p.kit : 'news';
  p.hosts = cleanHosts(p.hosts, KITS[p.kit].maxHosts);
  if (KITS[p.kit].hosts && !p.hosts.length) throw Object.assign(new Error('Add the hosts (at least one): their names and genders shape the script and the dub voices'), {status: 400});
  return p;
}

export function createPlaylist(root, tax, input) {
  const p = validate(tax, {...input, production: {...defaultProduction(root), ...(input.production || {})}}, {instructions: [], rows: {}, notes: ''});
  p.slug = slugify(p.name);
  if (!SLUG.test(p.slug)) throw Object.assign(new Error('Folder name: lowercase letters, numbers and dashes'), {status: 400});
  const dir = path.join(playlistsDir(root), p.slug);
  if (fs.existsSync(dir)) throw Object.assign(new Error(`playlists/${p.slug} already exists`), {status: 409});
  const taken = listPlaylists(root, tax).find((x) => x.codePrefix === p.codePrefix);
  if (taken) throw Object.assign(new Error(`Code prefix ${p.codePrefix} is used by ${taken.name}`), {status: 409});
  fs.mkdirSync(dir, {recursive: true});
  return savePlaylist(root, tax, p);
}

export function updatePlaylist(root, tax, slug, input) {
  const existing = loadPlaylist(root, tax, slug);
  const p = validate(tax, {...input, slug}, existing);
  return savePlaylist(root, tax, p);
}

// the folder always follows the name: playlists/<name in kebab case>
export function renamePlaylist(root, tax, slug, {name}) {
  const existing = loadPlaylist(root, tax, slug);
  const p = validate(tax, {name}, existing);
  const target = slugify(p.name);
  if (target !== slug) {
    if (fs.existsSync(path.join(playlistsDir(root), target))) throw Object.assign(new Error(`playlists/${target} already exists`), {status: 409});
    fs.renameSync(path.join(playlistsDir(root), slug), path.join(playlistsDir(root), target));
  }
  return savePlaylist(root, tax, {...p, slug: target});
}

export const archivePlaylist = (root, slug) => {
  if (!SLUG.test(slug)) throw Object.assign(new Error('bad playlist name'), {status: 400});
  return toArchive(root, path.join(playlistsDir(root), slug));
};

// ---- suggestions: one playlist per Topic, with sensible defaults from A1/A2 ----
// section, causes (Explained always leads for our News pieces), audiences
const PROFILE = {
  AI: ['Horizons', ['No Hype', 'Future Ready'], ['Developers', 'Businesses', 'Students']],
  Cybersecurity: ['Safety', ['Stay Safe', 'Cyber Resilience'], ['Developers', 'Businesses', 'Security Pros']],
  Privacy: ['Safety', ['Privacy First'], ['Consumers']],
  Payments: ['Everyday', ['Consumer Rights'], ['Consumers', 'Freelancers']],
  Crypto: ['Economy', ['No Hype'], ['Investors', 'Consumers']],
  Cloud: ['Engineering', ['Cyber Resilience'], ['Developers', 'Businesses']],
  'Data Centres': ['Economy', ['Green Tech'], ['Businesses', 'Government']],
  Internet: ['Everyday', ['Digital Rights'], ['Consumers', 'Freelancers']],
  'Mobile Networks': ['Everyday', ['Consumer Rights'], ['Consumers']],
  Satellites: ['Horizons', ['Future Ready'], ['Consumers', 'Businesses']],
  Chips: ['Geopolitics', ['Future Ready'], ['Developers', 'Investors']],
  Gadgets: ['Everyday', ['Consumer Rights'], ['Consumers']],
  Apps: ['Everyday', ['Digital Literacy'], ['Consumers']],
  'Social Media': ['Everyday', ['Digital Literacy'], ['Creators', 'Consumers', 'Parents']],
  Software: ['Engineering', ['Cyber Resilience'], ['Developers']],
  'Open Source': ['Engineering', ['Local Builders'], ['Developers']],
  'E-Gov': ['Policy', ['Plain Law'], ['Consumers', 'Businesses']],
  'Digital ID': ['Policy', ['Privacy First'], ['Consumers']],
  'Creator Economy': ['Economy', ['Fair Pay'], ['Creators']],
  Freelancing: ['Talent', ['Fair Pay'], ['Freelancers']],
  Startups: ['Economy', ['Local Builders'], ['Founders', 'Investors']],
  Skills: ['Talent', ['Talent Growth'], ['Students', 'Freelancers']],
};

export function suggestPlaylists(root, tax) {
  const lists = listPlaylists(root, tax).map((x) => loadPlaylist(root, tax, x.slug));
  const covered = new Map(); // topic -> playlist names that already cover it
  const used = new Map(); // topic -> video codes that use it
  for (const p of lists) {
    for (const t of p.defaults.topic?.values || []) covered.set(t, [...(covered.get(t) || []), p.name]);
    // a video's lead (first) Topic is what it is about; the others are context
    for (const v of p.videos) for (const t of (v.card?.topic || []).slice(0, 1)) used.set(t, [...(used.get(t) || []), v.code]);
  }
  const prefixes = new Set(lists.map((p) => p.codePrefix));
  const prefixFor = (topic) => {
    const words = topic.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
    const tries = [words.map((w) => w[0]).join(''), topic.slice(0, 2), topic.slice(0, 3), words[0].slice(0, 1) + words[0].slice(-1)].map((s) => s.toUpperCase().replace(/[^A-Z]/g, ''));
    for (const t of tries) if (t && !prefixes.has(t)) return prefixes.add(t), t;
    for (let n = 2; ; n++) if (!prefixes.has(tries[1] + n)) return prefixes.add(tries[1] + n), tries[1] + n;
  };
  return valuesOf(tax, 'topic').map((topic) => {
    const [section, causes, audience] = PROFILE[topic] || ['Everyday', [], ['Consumers']];
    const name = topic; // names come from the taxonomy, never invented
    const defaults = {
      topic: {values: [topic], note: 'plus any other Topic the piece needs'},
      section: {values: [section], note: 'default; per piece when the angle differs'},
      label: {values: [], note: 'per piece, honest for the "as of" date, always with "News"'},
      cause: {values: ['Explained', ...causes], note: 'Explained leads (shown on the thumbnail)'},
      region: {values: ['Pakistan'], note: 'plus where the story happened'},
      industry: {values: [], note: 'per piece'},
      audience: {values: audience, note: ''},
      breakout: {values: [], note: 'when the story is one of the Pakistan breakouts'},
    };
    const p = {name, slug: slugify(name), purpose: `${topic} news for Pakistan, explained: what happened, what it means, and what you can do.`, format: 'News', codePrefix: prefixFor(topic), defaults, instructions: [], production: defaultProduction(root)};
    return {
      ...p,
      covered: covered.get(topic) || [],
      usedBy: used.get(topic) || [],
      recommended: (used.get(topic) || []).length > 0 && !(covered.get(topic) || []).length,
      standards: applicableStandards(tax, flatDefaults(p)).map((s) => s.name),
      hashtags: hashtagsFor(tax, flatDefaults(p)),
    };
  });
}
