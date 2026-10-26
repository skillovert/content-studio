// Graphics on an edited video's timeline (Travel Video Editing kit, step 5). Each graphic clip, and each clip
// shown inside a cutout frame, is rendered on its own (scenes/Piece.tsx) as a short 540p video the editor plays:
//   edit/pieces/<key>.mp4    full screen (a plan graphic, a full-screen cutout, a clip in a frame)
//   edit/pieces/<key>.webm   laid over the footage, with a see-through background
// The key is a hash of what is drawn, the theme and the brand, so a piece is only made again when it changes.
// The look is the brand's: every graphic and cutout gets the brand's next kept style for its kind (stored on the
// clip, so it stays), and the theme the video is locked to.
// A graphic can start as an idea (`prompt`): Claude writes what it shows, "API first" as for the cut; without an
// API key edit/graphics-brief.md and edit/graphics-schema.json are written for a project thread, which writes
// edit/graphics.json back. The editor puts the answers on its clips.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import {spawn} from 'node:child_process';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {APP_DIR, readJson, writeJson, write, today} from './workspace.mjs';
import {apiKey} from './settings.mjs';
import {loadProfile, brandProps} from './brand.mjs';
import {installThemeFonts} from './themes.mjs';
import {graphicSchema} from './plan-schema.mjs';
import {MODEL} from './planner.mjs';
import * as AS from './assets.mjs';
import * as ED from './edit.mjs';
import * as CU from './cutouts.mjs';
import * as PV from './preview.mjs';
import * as SP from './speech.mjs';
import {ffmpeg} from './media.mjs';
import {EDIT_GRAPHICS, story} from './cut.mjs';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
const piecesDir = (dir) => path.join(AS.editDir(dir), 'pieces');
const briefFile = (dir) => path.join(AS.editDir(dir), 'graphics-brief.md');
const answerFile = (dir) => path.join(AS.editDir(dir), 'graphics.json');
const renders = new Map(); // video dir -> {status, done, total, error}
const writers = new Map(); // video dir -> {status, ids, results, log, error}
export const BASE = () => `http://127.0.0.1:${Number(process.env.PORT || 4330)}`;
export const wsUrl = (root, file) => `${BASE()}/ws/${path.relative(root, file).split(path.sep).map(encodeURIComponent).join('/')}`;
const state = (dir) => readJson(path.join(dir, 'video.json'), {});

/** The cutout kind a clip of the creator's own footage becomes inside a frame. */
export const LOOK_KIND = {video: 'clip', image: 'photo'};

// ---------- the brand's styles ----------
/** Styles the brand keeps, per kind of graphic, cutout and frame (for the editor's pickers). */
export function lookChoices(profile) {
  const kept = CU.brandStyles(profile);
  const cat = (id) => {
    const c = CU.CATEGORIES.find((x) => x.id === id);
    return {id, name: c.name, styles: c.styles.filter((s) => kept[id].includes(s.id)).map((s) => ({id: s.id, name: s.name, about: s.about}))};
  };
  return {
    graphic: Object.fromEntries(Object.entries(CU.GRAPHIC_CAT).map(([type, id]) => [type, cat(id)])),
    cutout: Object.fromEntries(Object.entries(CU.CATEGORY_OF).filter(([k]) => ED.CUTOUT_KINDS.includes(k)).map(([k, id]) => [k, cat(id)])),
    look: {video: cat('clip'), image: cat('photo')},
  };
}

/** Every graphic, cutout and framed clip without a style gets the brand's next kept one (and a cutout its place). */
export function assignStyles(edit, profile) {
  const kept = CU.brandStyles(profile);
  const place = CU.placer(profile);
  const n = {};
  const next = (cat) => {
    const list = kept[cat];
    const i = n[cat] ?? 0;
    n[cat] = i + 1;
    return list[i % list.length];
  };
  // styles already on the timeline count, so new ones carry on the rotation
  const clips = ['main', 'over'].flatMap((k) => (edit[k] || []).map((c) => [k, c]));
  for (const [, c] of clips) {
    const cat = c.graphic ? CU.GRAPHIC_CAT[c.graphic.type] : c.cutout ? CU.CATEGORY_OF[c.cutout.kind] : c.look ? CU.CATEGORY_OF[LOOK_KIND[c.kind]] : null;
    const st = c.graphic?.style || c.cutout?.style || c.look?.style;
    if (cat && st) n[cat] = (n[cat] ?? 0) + 1;
  }
  for (const [track, c] of clips) {
    if (c.kind === 'graphic' && c.graphic?.type && CU.GRAPHIC_CAT[c.graphic.type]) {
      const cat = CU.GRAPHIC_CAT[c.graphic.type];
      const asked = String(c.graphic.style || '').split(':').pop();
      c.graphic = {...c.graphic, style: kept[cat].includes(asked) || CU.CATEGORIES.find((x) => x.id === cat).styles.some((s) => s.id === asked) ? asked : next(cat)};
    }
    if (c.kind === 'graphic' && c.cutout?.kind) {
      const cat = CU.CATEGORY_OF[c.cutout.kind];
      c.cutout = {...c.cutout, ...(cat && !c.cutout.style ? {style: next(cat)} : {}), place: track === 'main' ? 'full' : c.cutout.place || place(c.cutout.kind)};
    }
    if (c.look && LOOK_KIND[c.kind] && !c.look.style) c.look = {...c.look, style: next(CU.CATEGORY_OF[LOOK_KIND[c.kind]])};
  }
  return edit;
}

// ---------- what each piece draws ----------
/** The piece of one clip ({piece, dur, alpha, src}), or null when the clip is not drawn by the scene library. */
export function specOf(c, track, byId) {
  const dur = Math.round(ED.clipDur(c) * 1000) / 1000;
  if (c.kind === 'graphic' && c.graphic?.type) {
    const g = c.graphic;
    const piece = {graphic: {type: g.type, kicker: g.kicker || '', title: g.title || '', items: (g.items || []).map((x) => ({label: x.label || '', value: x.value || '', detail: x.detail || '', tone: x.tone || 'neutral'})), lines: g.lines || [], stamp: g.stamp || '', highlights: g.highlights || [], sourceId: g.sourceId || '', ...(g.style ? {style: g.style} : {})}};
    return {piece, dur, alpha: false};
  }
  if (c.kind === 'graphic' && c.cutout?.kind) {
    const place = track === 'main' ? 'full' : c.cutout.place || 'over';
    return {piece: {insert: {...c.cutout, place}}, dur, alpha: place === 'over'};
  }
  const a = c.asset ? byId.get(c.asset) : null;
  if (c.look && a && LOOK_KIND[c.kind]) {
    const place = track === 'main' ? 'full' : 'over';
    const insert = {kind: LOOK_KIND[c.kind], style: c.look.style || '', label: c.look.label || '', place, ...(c.kind === 'video' ? {start: c.in, speed: c.speed || 1} : {})};
    return {piece: {insert}, dur, alpha: place === 'over', src: {asset: a.id, file: a.proxy}};
  }
  return null;
}

export function context(root, playlist, dir) {
  const profile = loadProfile(root);
  const theme = PV.themeFor(root, playlist, dir, profile);
  const brand = profile.exists ? brandProps(profile, theme) : undefined;
  return {profile, theme, brand, salt: JSON.stringify([theme.id, theme.version, brand || null, playlist.name])};
}

const keyOf = (spec, salt) => crypto.createHash('sha1').update(JSON.stringify([spec, salt])).digest('hex').slice(0, 16);
const fileOf = (dir, key, alpha) => path.join(piecesDir(dir), `${key}.${alpha ? 'webm' : 'mp4'}`);

/** Every clip's piece: {clips: {id: {file, ready, alpha}}, missing, job}. */
export function status(root, playlist, dir) {
  const ctx = context(root, playlist, dir);
  const byId = new Map(AS.status(dir).assets.filter((a) => a.ready).map((a) => [a.id, a]));
  const edit = ED.load(dir);
  const clips = {};
  const todo = [];
  for (const track of ['main', 'over']) {
    for (const c of edit[track]) {
      const spec = specOf(c, track, byId);
      if (!spec) continue;
      const key = keyOf(spec, ctx.salt);
      const file = fileOf(dir, key, spec.alpha);
      const ready = fs.existsSync(file);
      clips[c.id] = {file: path.relative(dir, file).split(path.sep).join('/'), ready, alpha: spec.alpha};
      if (!ready) todo.push({spec, file});
    }
  }
  const j = renders.get(dir);
  return {clips, missing: todo.length, todo, ctx, job: j ? {status: j.status, done: j.done, total: j.total, error: j.error || null} : null};
}

export const publicStatus = (root, playlist, dir) => {
  const {todo, ctx, ...st} = status(root, playlist, dir);
  return st;
};

/** Render every missing piece, in one go (one bundle); started again when the edit changed meanwhile. */
export function startPieces(root, playlist, dir, opts = {}) {
  if (renders.get(dir)?.status === 'running') return publicStatus(root, playlist, dir);
  const st = status(root, playlist, dir);
  if (!st.todo.length) return publicStatus(root, playlist, dir);
  const check = PV.studioCheck(root);
  if (!check.ok && check.why !== 'install') throw fail(check.why);
  const job = {status: 'running', done: 0, total: st.todo.length};
  renders.set(dir, job);
  const jobFile = path.join(os.tmpdir(), `content-studio-pieces-${process.pid}-${Date.now()}.json`);
  (async () => {
    if (!check.ok) await PV.npmInstall(check.studio);
    const fontFiles = installThemeFonts(check.studio);
    // the theme is locked the first time anything of this video is made
    if (!state(dir).theme?.version) writeJson(path.join(dir, 'video.json'), {...state(dir), theme: {id: st.ctx.theme.id, version: st.ctx.theme.version}});
    const pieces = st.todo.map(({spec, file}) => {
      const piece = spec.src ? {insert: {...spec.piece.insert, url: wsUrl(root, path.join(dir, spec.src.file))}} : spec.piece;
      // a see-through piece is written aside first, then copied into a WebM with an index (seekable in the editor)
      return {props: {piece, dur: spec.dur, alpha: spec.alpha}, out: spec.alpha ? file.replace(/\.webm$/, '.raw.webm') : file, alpha: spec.alpha};
    });
    fs.writeFileSync(jobFile, JSON.stringify({
      studio: check.studio,
      common: {playlist: playlist.name, brand: st.ctx.brand, theme: st.ctx.theme, fontFiles},
      pieces,
      scale: 0.5,
      browserExecutable: opts.browserExecutable || process.env.CS_BROWSER || undefined,
    }));
    const remuxes = [];
    await PV.run([path.join(APP_DIR, 'render', 'render.mjs'), jobFile], check.studio, (m) => {
      if (m.error) job.error = m.error;
      if (m.made && m.made.endsWith('.raw.webm')) remuxes.push(indexWebm(root, m.made).then(() => job.done++));
      else if (m.made) job.done++;
    });
    await Promise.all(remuxes);
    job.status = 'done';
  })()
    .catch((e) => Object.assign(job, {status: 'error', error: job.error || e.message}))
    .finally(() => {
      fs.rm(jobFile, {force: true}, () => {});
      if (job.status === 'done') {
        prune(root, playlist, dir);
        // the creator kept editing while these were made: make the new ones too
        if (status(root, playlist, dir).todo.length) setImmediate(() => startPieces(root, playlist, dir, opts));
      }
      setTimeout(() => renders.get(dir) === job && renders.delete(dir), 60_000).unref();
    });
  return publicStatus(root, playlist, dir);
}

/** Copy a WebM into one with its duration and cues (Remotion's has neither, so the browser cannot seek in it). */
function indexWebm(root, raw) {
  const f = ffmpeg(root);
  const out = raw.replace(/\.raw\.webm$/, '.webm');
  return new Promise((resolve, reject) => {
    const p = spawn(f.ffmpeg, ['-y', '-v', 'error', '-i', raw, '-c', 'copy', '-f', 'webm', out + '.part'], {env: f.env, cwd: f.cwd});
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (c) => {
      if (c) return reject(new Error(err.trim().slice(-200) || 'WebM copy failed'));
      fs.renameSync(out + '.part', out);
      fs.rmSync(raw, {force: true});
      resolve(out);
    });
  });
}

/** Pieces no clip of the edit or its saved versions uses any more are removed. */
function prune(root, playlist, dir) {
  const d = piecesDir(dir);
  if (!fs.existsSync(d)) return;
  const keep = new Set(Object.values(status(root, playlist, dir).clips).map((c) => path.basename(c.file)));
  for (const f of fs.readdirSync(d)) if (/^[0-9a-f]{16}\.(mp4|webm)$/.test(f) && !keep.has(f)) fs.rmSync(path.join(d, f), {force: true});
}

// ---------- graphics from an idea ----------
const str = (description) => ({type: 'string', description});
const arr = (items, description) => ({type: 'array', items, description});
const obj = (properties, description) => ({type: 'object', description, properties, required: Object.keys(properties), additionalProperties: false});

export function cutoutSchema() {
  return obj({
    kind: {type: 'string', enum: ED.CUTOUT_KINDS, description: [
      'ref: a news story or source flashes in (outlet, date, headline, url = the site\'s address)',
      'quote: a person\'s words (speaker, label = who they are, text = the words, marks = words to highlight)',
      'doc: a page of a source with its key line marked (outlet, headline, text = the key line)',
      'keyword: a word or name shown big (text, sub = a short meaning)',
      'place: a map inset (places = country names in English, label = the frame label)',
      'stat: one big number (value, label = what it counts, source)',
      'date: a date stamp (text = the date, sub = what happened)',
    ].join('\n')},
    place: {type: 'string', enum: ['', 'full', 'over'], description: '"" = as the brand places this kind; full = takes the screen for its moment; over = on one side while the footage plays behind'},
    outlet: str('ref, doc: the publisher, or ""'),
    date: str('ref: the date like "12 Oct 2026", or ""'),
    headline: str('ref, doc: the headline, or ""'),
    url: str('ref: the site, e.g. "dawn.com", or ""'),
    label: str('quote: who the speaker is; place: frame label; stat: what the number counts; or ""'),
    value: str('stat: the number, e.g. "4,700 m", or ""'),
    source: str('stat: where the number is from, or ""'),
    text: str('quote: the words; doc: the key line; keyword: the word; date: the date; or ""'),
    sub: str('keyword, date: one short line, or ""'),
    speaker: str('quote: the speaker\'s name, or ""'),
    places: arr(str('Country name in English'), 'place: the countries to mark'),
    marks: arr(str('Exact words of the quote'), 'quote: words to highlight'),
  }, 'A cutout');
}

export function graphicsSchema() {
  return obj({
    graphics: arr(obj({
      id: str('The clip id from the list'),
      kind: {type: 'string', enum: ['graphic', 'cutout'], description: 'graphic = a full-screen graphic (maps of the trip, routes, prices, timelines, ratings...); cutout = a short flash or inset (a reference, a quote, a keyword, a number, a map inset)'},
      graphic: {...graphicSchema(EDIT_GRAPHICS), description: 'kind graphic: what it shows. kind cutout: type "title" with empty fields'},
      cutout: {...cutoutSchema(), description: 'kind cutout: what it shows. kind graphic: kind "keyword" with empty fields'},
      seconds: {type: 'number', description: 'How long it should stay on screen to be read (3 to 12)'},
    }, 'One graphic'), 'One per clip in the list'),
  }, 'The graphics');
}

/** Graphic clips that have an idea and nothing drawn yet. */
export function pending(edit) {
  return ['main', 'over'].flatMap((track) => edit[track].filter((c) => c.kind === 'graphic' && c.prompt && !c.graphic?.type && !c.cutout?.kind).map((c) => ({c, track})));
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** What is happening around a time of the edit: the clip on screen, what is said there, the voice-over. */
function around(dir, edit, time, byId) {
  const {starts} = ED.layoutOf(edit);
  const i = edit.main.findIndex((c, k) => time >= starts[k] && time < starts[k] + ED.clipDur(c));
  const out = [];
  const m = i >= 0 ? edit.main[i] : null;
  const scene = m?.scene ? edit.scenes.find((s) => s.id === m.scene)?.title : '';
  if (scene) out.push(`Scene: ${scene}`);
  if (m?.asset) {
    const a = byId.get(m.asset);
    out.push(`On screen: ${a?.file || m.asset}${m.kind === 'video' ? ` (${m.in.toFixed(1)}-${m.out.toFixed(1)} s)` : ''}`);
    const t = SP.transcriptOf(dir, m.asset);
    const said = (t?.segments || []).filter((s) => s.end > (m.in ?? 0) - 5 && s.start < (m.out ?? 0) + 5).map((s) => s.text).join(' ');
    if (said) out.push(`Said there: ${said.slice(0, 600)}`);
  }
  const vo = edit.voice.filter((c) => c.kind === 'line' && c.at < time + 8 && c.at + ED.clipDur(c) > time - 8).map((c) => `${c.speaker ? `${c.speaker}: ` : ''}${c.text}`);
  if (vo.length) out.push(`Voice-over around it: ${vo.join(' / ')}`);
  return out;
}

export function briefText(root, playlist, video, dir, list) {
  const profile = loadProfile(root);
  const edit = ED.load(dir);
  const byId = new Map(AS.status(dir).assets.map((a) => [a.id, a]));
  const {starts} = ED.layoutOf(edit);
  return [
    `# Graphics: ${video.code} · ${video.title}`,
    '',
    `Today: ${today()}. Playlist: ${playlist.name}. Brand: ${profile.name || ''}.`,
    '',
    '## The story',
    story(dir) || '(no story written)',
    '',
    '## The graphics to write',
    ...list.flatMap(({c, track}) => {
      const at = track === 'main' ? starts[edit.main.indexOf(c)] : c.at;
      return [`### ${c.id} · ${track === 'main' ? 'full screen, on the Video track' : 'over the footage, on the Over track'} · at ${clock(at)} · ${ED.clipDur(c).toFixed(1)} s`, `Idea: ${c.prompt}`, ...around(dir, edit, at, byId), ''];
    }),
  ].join('\n');
}

export function systemPrompt(profile) {
  return [
    `You design the on-screen graphics of ${profile.name || 'this creator'}'s travel videos, edited from their own footage. The look (colours, fonts, styles, motion) comes from the brand automatically; you choose what kind of graphic fits each idea and write what it shows.`,
    '',
    '- Follow the creator\'s idea for each graphic; use the story and what is said around it for the details.',
    '- Full screen (Video track): a graphic that explains (a road trip map with the stops and distances, a route, prices, the weather, phrases, do\'s and don\'ts, a rating, a timeline, numbers). Over the footage (Over track): usually a cutout (a reference to a news story or source, a quote of someone met, a keyword, a number, a map inset); a graphic only when the idea asks for one.',
    '- On-screen text is short: names, numbers, a few words. Place names as they are known.',
    '- Facts only from the story, the footage, or well-known sources you can check (use web search for distances, heights, prices, dates). Never invent a number, a quote or a source; when unsure, leave it out.',
    '- Give each graphic the seconds it needs to be read.',
  ].join('\n');
}

/** Write the graphics of these clips (or every one waiting): API first, else the hand-off files. */
export function startWriting(root, playlist, video, dir, ids = null) {
  if (writers.get(dir)?.status === 'running') throw fail('Claude is already writing graphics for this video', 409);
  const edit = ED.load(dir);
  const list = pending(edit).filter(({c}) => !ids || ids.includes(c.id));
  if (!list.length) throw fail('No graphic is waiting: give a graphic an idea first');
  if (!apiKey()) {
    write(briefFile(dir), [
      briefText(root, playlist, video, dir, list),
      '## How to write them',
      systemPrompt(loadProfile(root)),
      '',
      '## How to deliver',
      `Write the answer as JSON to \`${path.relative(root, answerFile(dir)).split(path.sep).join('/')}\`, matching \`edit/graphics-schema.json\` (one entry per clip id above). The editor puts them on the timeline when the creator presses "Check for graphics".`,
      '',
      'Work on these graphics in their own project thread, not in the Content Studio development thread.',
    ].join('\n'));
    writeJson(path.join(AS.editDir(dir), 'graphics-schema.json'), graphicsSchema());
    return writingStatus(dir);
  }
  const job = {status: 'running', ids: list.map(({c}) => c.id), results: null, log: ['Reading the story and the timeline…']};
  writers.set(dir, job);
  runApi(root, playlist, video, dir, list, job)
    .then((out) => Object.assign(job, {status: 'done', results: answersOf(out)}))
    .catch((e) => Object.assign(job, {status: 'error', error: e instanceof Anthropic.AuthenticationError ? 'The API key was not accepted. Check it in Settings.' : e.message}))
    .finally(() => setTimeout(() => writers.get(dir) === job && writers.delete(dir), 30 * 60 * 1000).unref());
  return writingStatus(dir);
}

/** Claude's answer -> {clip id: {graphic} | {cutout}, dur}. */
export function answersOf(out) {
  const res = {};
  for (const g of out?.graphics || []) {
    if (!g?.id) continue;
    const dur = Math.min(20, Math.max(2, Number(g.seconds) || 0)) || undefined;
    if (g.kind === 'cutout' && ED.cleanCutout(g.cutout)) res[g.id] = {cutout: ED.cleanCutout(g.cutout), dur};
    else if (g.graphic?.type) res[g.id] = {graphic: g.graphic, dur};
  }
  return res;
}

export function writingStatus(dir) {
  const j = writers.get(dir);
  const file = readJson(answerFile(dir), null);
  return {
    hasKey: Boolean(apiKey()),
    job: j ? {status: j.status, ids: j.ids, log: j.log.slice(-4), error: j.error || null} : null,
    results: j?.status === 'done' ? j.results : null,
    handoff: !apiKey() && fs.existsSync(briefFile(dir)) ? {brief: 'edit/graphics-brief.md', expects: 'edit/graphics.json', ready: Boolean(file)} : null,
  };
}

/** Hand-off: the answers the project thread wrote. */
export function importAnswers(dir) {
  const file = readJson(answerFile(dir), null);
  if (!file) throw fail('No answer yet: edit/graphics.json is not there', 404);
  return {...writingStatus(dir), results: answersOf(file)};
}

async function runApi(root, playlist, video, dir, list, job) {
  const client = new Anthropic({apiKey: apiKey(), timeout: 10 * 60 * 1000});
  const submit = {name: 'submit_graphics', description: 'Submit the graphics. Call once, with one entry per clip.', input_schema: graphicsSchema(), strict: true};
  const messages = [{role: 'user', content: briefText(root, playlist, video, dir, list)}];
  let strict = true;
  for (let turn = 0; turn < 4; turn++) {
    let msg;
    try {
      msg = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: {type: 'adaptive'},
        output_config: {effort: 'medium'},
        system: systemPrompt(loadProfile(root)),
        tools: [{type: 'web_search_20260209', name: 'web_search', max_uses: 5}, strict ? submit : {...submit, strict: undefined}],
        messages,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (e) {
      if (strict && e instanceof Anthropic.BadRequestError && /schema|strict/i.test(e.message)) {
        strict = false;
        turn--;
        continue;
      }
      throw e;
    }
    if (msg.stop_reason === 'refusal') throw new Error('Claude declined this request. Fill the graphic in by hand.');
    const call = msg.content.find((b) => b.type === 'tool_use' && b.name === 'submit_graphics');
    if (call) return typeof call.input === 'string' ? JSON.parse(call.input) : call.input;
    messages.push({role: 'assistant', content: msg.content});
    if (msg.stop_reason === 'pause_turn') continue;
    messages.push({role: 'user', content: 'Now call submit_graphics.'});
  }
  throw new Error('No graphics after 4 steps.');
}
