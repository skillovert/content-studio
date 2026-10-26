// The edit of an edited video (Travel Video Editing kit): one timeline in edit/edit.json, made by hand on the
// editor page or by Claude from the story (later), saved as the creator works, with named versions.
//   edit/edit.json            {version, updated, scenes: [{id, title}], main: [clip], over: [clip], voice: [clip], music: [clip]}
//   edit/versions/<n>.json    a saved version ({...edit, name, saved})
// main plays one clip after another (video, photo, a graphic, or a gap waiting for a clip); the other tracks
// place clips at a time (`at`, seconds). A clip:
//   {id, kind: video|image|audio|graphic|gap, asset?, in?, out?, dur?, at?, speed, volume, mute, fadeIn, fadeOut,
//    fit: cover|contain|blur, scene?, speaker?, text?, note?, graphic?, cutout?, look?, camera?, clean?, duck?, grade?}
// clean: light|medium|strong noise cleanup of the clip's sound (server/sound.mjs); duck: how much a Music clip
// goes down while someone talks (off|light|strong, default strong); grade: the colour (public/mix.js).
// in/out are seconds of the original; a photo, graphic, gap or line has its own `dur`. A `line` (Voice track) is a
// voice-over line still to record (speaker, text); a gap with `camera` is a piece to camera still to record.
// A graphic shows a plan graphic (`graphic`, full screen) or a cutout (`cutout`: a reference flash, quote, map
// inset... in the brand's style; on the Over track it sits over the footage); `prompt` is the idea it came from.
// A video or photo with a `look` plays inside a cutout frame (an old TV, a polaroid...) instead of full screen.
import fs from 'node:fs';
import path from 'node:path';
import {readJson, writeJson} from './workspace.mjs';
import * as AS from './assets.mjs';
import {cleanGrade, DUCK} from '../public/mix.js';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
const editFile = (dir) => path.join(AS.editDir(dir), 'edit.json');
const versionsDir = (dir) => path.join(AS.editDir(dir), 'versions');
export const TRACKS = ['main', 'over', 'voice', 'music'];
const KINDS = ['video', 'image', 'audio', 'graphic', 'gap', 'line'];
const FITS = ['cover', 'contain', 'blur'];
export const CUTOUT_KINDS = ['ref', 'quote', 'doc', 'keyword', 'place', 'stat', 'date'];
const CUTOUT_TEXT = ['style', 'outlet', 'date', 'headline', 'url', 'label', 'value', 'source', 'text', 'sub', 'speaker'];
const CUTOUT_LISTS = ['places', 'marks'];
/** A cutout as the scenes draw it (scenes/types.ts Insert), text fields only. */
export function cleanCutout(c) {
  if (!c || !CUTOUT_KINDS.includes(c.kind)) return null;
  const out = {kind: c.kind};
  if (c.place === 'full' || c.place === 'over') out.place = c.place; // else the brand's choice for its kind
  for (const k of CUTOUT_TEXT) if (c[k]) out[k] = str(c[k], k === 'text' ? 400 : 160);
  for (const k of CUTOUT_LISTS) if (Array.isArray(c[k]) && c[k].length) out[k] = c[k].slice(0, 12).map((x) => str(x, 60));
  return out;
}
const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
const r3 = (x) => Math.round(x * 1000) / 1000;
const str = (v, n) => String(v ?? '').slice(0, n);

export const empty = () => ({version: 1, updated: null, scenes: [], main: [], over: [], voice: [], music: []});

/** How long a clip lasts on the timeline. */
export const clipDur = (c) => (c.kind === 'video' || c.kind === 'audio' ? Math.max(0, (c.out - c.in) / (c.speed || 1)) : c.dur || 0);

/** Where each main clip starts, and the whole length (main, or a later clip on another track). */
export function layoutOf(edit) {
  let t = 0;
  const starts = edit.main.map((c) => ((t += clipDur(c)), t - clipDur(c)));
  const others = ['over', 'voice', 'music'].flatMap((k) => edit[k].map((c) => c.at + clipDur(c)));
  return {starts, duration: r3(Math.max(t, ...others, 0))};
}

/** A clean edit: known assets only, in/out inside the original, numbers in range, ids unique. */
export function clean(edit, assets) {
  const byId = new Map(assets.filter((a) => a.ready).map((a) => [a.id, a]));
  const seen = new Set();
  const id = (v) => {
    let x = str(v, 40).replace(/[^\w-]/g, '') || 'c';
    while (seen.has(x)) x = `${x}-${Math.random().toString(36).slice(2, 6)}`;
    seen.add(x);
    return x;
  };
  const scenes = (Array.isArray(edit?.scenes) ? edit.scenes : []).slice(0, 60).map((s) => ({id: id(s.id), title: str(s.title, 80).trim() || 'Scene'}));
  const sceneIds = new Set(scenes.map((s) => s.id));
  const clip = (c, track) => {
    const kind = KINDS.includes(c?.kind) ? c.kind : null;
    // a "line" is a voice-over line still to record: on the Voice track only
    if (!kind || (track === 'main' && (kind === 'audio' || kind === 'line')) || (track === 'voice' && !['audio', 'video', 'line'].includes(kind)) || (track === 'music' && kind !== 'audio' && kind !== 'video') || (track === 'over' && kind === 'line')) return null;
    const a = c.asset ? byId.get(c.asset) : null;
    if ((kind === 'video' || kind === 'audio' || kind === 'image') && !a) return null;
    const out = {id: id(c.id), kind};
    if (a) out.asset = a.id;
    if (kind === 'video' || kind === 'audio') {
      const len = a.dur || 0;
      out.in = r3(num(c.in, 0, Math.max(0, len - 0.1), 0));
      out.out = r3(num(c.out, out.in + 0.1, len, len));
      out.speed = num(c.speed, 0.25, 4, 1);
      out.volume = num(c.volume, 0, 2, 1);
      out.mute = Boolean(c.mute);
      out.fadeIn = num(c.fadeIn, 0, 10, 0);
      out.fadeOut = num(c.fadeOut, 0, 10, 0);
    } else out.dur = r3(num(c.dur, 0.2, 600, kind === 'image' ? 4 : 5));
    if (kind === 'video' || kind === 'image') out.fit = FITS.includes(c.fit) ? c.fit : 'cover';
    if (kind === 'image') out.move = c.move === 'still' ? 'still' : 'slow'; // a slow push-in, or still
    if (track !== 'main') out.at = r3(num(c.at, 0, 36000, 0));
    if (track === 'main' && sceneIds.has(c.scene)) out.scene = c.scene;
    if ((track === 'voice' || (kind === 'gap' && c.camera) || kind === 'video') && c.speaker) out.speaker = str(c.speaker, 40);
    if (kind === 'gap' && c.camera) out.camera = true; // a piece to camera, recorded later
    if (c.text) out.text = str(c.text, 2000);
    if (c.note) out.note = str(c.note, 300);
    if (kind === 'graphic' && c.graphic && typeof c.graphic === 'object') out.graphic = c.graphic;
    if (kind === 'graphic' && !out.graphic && cleanCutout(c.cutout)) out.cutout = cleanCutout(c.cutout);
    if (kind === 'graphic' && c.prompt) out.prompt = str(c.prompt, 1000);
    if ((kind === 'video' || kind === 'audio') && ['light', 'medium', 'strong'].includes(c.clean)) out.clean = c.clean;
    if (track === 'music' && c.duck in DUCK && c.duck !== 'strong') out.duck = c.duck;
    if ((kind === 'video' || kind === 'image') && cleanGrade(c.grade)) out.grade = cleanGrade(c.grade);
    if ((kind === 'video' || kind === 'image') && c.look && typeof c.look === 'object') out.look = {style: str(c.look.style, 30), label: str(c.look.label, 60)};
    return out;
  };
  const out = {version: 1, updated: new Date().toISOString(), scenes};
  for (const t of TRACKS) out[t] = (Array.isArray(edit?.[t]) ? edit[t] : []).slice(0, 2000).map((c) => clip(c, t)).filter(Boolean);
  out.scenes = scenes.filter((x) => out.main.some((c) => c.scene === x.id)); // a scene with no clips left is gone
  if (edit?.name) out.name = str(edit.name, 80);
  return out;
}

export function load(dir) {
  return readJson(editFile(dir), null) || empty();
}

export function versions(dir) {
  const d = versionsDir(dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => /^\d+\.json$/.test(f)).map((f) => {
    const v = readJson(path.join(d, f), {});
    return {n: Number(f.slice(0, -5)), name: v.name || '', saved: v.saved || null, duration: layoutOf({...empty(), ...v}).duration};
  }).sort((a, b) => a.n - b.n);
}

/** What the editor page needs: the edit, the ready assets (lean), the speakers and the saved versions. */
export function status(dir, speakers = []) {
  const assets = AS.status(dir).assets.filter((a) => a.ready).map(({id, file, kind, dur, w, h, fps, proxy, stills, wave, sound, dark, audio, created}) => ({id, file, kind, dur, w, h, fps, proxy, stills, wave, sound, dark, audio, created}));
  const edit = load(dir);
  return {edit, duration: layoutOf(edit).duration, assets, speakers, versions: versions(dir)};
}

export function save(dir, body) {
  const edit = clean(body, AS.status(dir).assets);
  writeJson(editFile(dir), edit);
  return {edit, duration: layoutOf(edit).duration};
}

/** Keep the current edit as a numbered version with a name. */
export function saveVersion(dir, name) {
  const edit = load(dir);
  const n = (versions(dir).at(-1)?.n || 0) + 1;
  writeJson(path.join(versionsDir(dir), `${n}.json`), {...edit, name: str(name, 80) || `Version ${n}`, saved: new Date().toISOString()});
  return versions(dir);
}

/** Go back to a saved version (the current edit is kept as a version first). */
export function restore(dir, n) {
  const file = path.join(versionsDir(dir), `${Number(n)}.json`);
  if (!fs.existsSync(file)) throw fail('No such version', 404);
  saveVersion(dir, 'Before going back');
  const {name, saved, ...edit} = readJson(file, {});
  writeJson(editFile(dir), {...empty(), ...edit, updated: new Date().toISOString()});
  return load(dir);
}
