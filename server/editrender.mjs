// Preview and final of an edited video (Travel Video Editing kit, step 7), rendered with Remotion from the
// timeline (scenes/Edit.tsx): the clips with their colour, the graphics and cutouts, the clips over the picture,
// and every sound with its fades, cleanup and the music going down under the voices.
//   preview/<CODE>-edit-540p-vN.mp4     from the 540p working copies, quick, every version kept
//   final/<CODE>-<1080|1440|2160>p.mp4  from full-size copies of the originals
//   final/<CODE>-sound.m4a              the mix alone (for dubbing or a podcast)
//   final/<CODE>.<lang>.srt             subtitles: the voice-over lines and what is said in the clips that keep
//                                       their sound (from the transcripts)
//   final/<CODE>-chapters.txt           the scenes as YouTube chapters
//   edit/master/<id>-<h>.mp4 | <id>.jpg | <id>.m4a   the full-size copies (HDR tone-mapped, 30 fps), made once
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {APP_DIR} from './workspace.mjs';
import {loadProfile} from './brand.mjs';
import {installThemeFonts} from './themes.mjs';
import {DUCK, gradeParts, talkIntervals} from '../public/mix.js';
import {SIZES} from './finish.mjs';
import * as AS from './assets.mjs';
import * as ED from './edit.mjs';
import * as PC from './pieces.mjs';
import * as PV from './preview.mjs';
import * as SO from './sound.mjs';
import * as SP from './speech.mjs';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
const jobs = new Map(); // video dir -> {status, kind, size, stage, progress, error}
const masterDir = (dir) => path.join(AS.editDir(dir), 'master');
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Items of a track with their start and end (as the editor lays them out). */
export function itemsOf(edit, track) {
  if (track !== 'main') return edit[track].map((c) => ({c, start: c.at, end: c.at + ED.clipDur(c)}));
  const {starts} = ED.layoutOf(edit);
  return edit.main.map((c, i) => ({c, start: starts[i], end: starts[i] + ED.clipDur(c)}));
}

/** What still needs doing before the final: spaces for clips, pieces to camera and lines to record, graphics. */
export function todo(edit) {
  const out = [];
  const n = (k, test) => edit[k].filter(test).length;
  const gaps = n('main', (c) => c.kind === 'gap' && !c.camera);
  const cams = n('main', (c) => c.kind === 'gap' && c.camera);
  const lines = n('voice', (c) => c.kind === 'line');
  const graphics = ['main', 'over'].reduce((s, k) => s + n(k, (c) => c.kind === 'graphic' && !c.graphic?.type && !c.cutout?.kind), 0);
  if (gaps) out.push(`${gaps} space${gaps > 1 ? 's' : ''} still wait for a clip`);
  if (cams) out.push(`${cams} piece${cams > 1 ? 's' : ''} to camera not recorded`);
  if (lines) out.push(`${lines} voice-over line${lines > 1 ? 's' : ''} not recorded`);
  if (graphics) out.push(`${graphics} graphic${graphics > 1 ? 's' : ''} not written yet`);
  return out;
}

// ---------- full-size copies ----------
const masterOf = (dir, a, h) => path.join(masterDir(dir), a.kind === 'video' ? `${a.id}-${h}.mp4` : a.kind === 'image' ? `${a.id}.jpg` : `${a.id}.m4a`);

async function makeMaster(root, dir, a, h) {
  const out = masterOf(dir, a, h);
  if (fs.existsSync(out)) return out;
  const src = path.join(AS.rawDir(dir), a.file);
  const tmp = `${out}.part${path.extname(out)}`;
  fs.mkdirSync(path.dirname(out), {recursive: true});
  if (a.kind === 'image') await AS.run(root, ['ffmpeg', '-y', '-v', 'error', '-i', src, '-vf', "scale='min(3840,iw)':-2", '-frames:v', '1', '-q:v', '2', tmp]);
  else if (a.kind === 'audio') await AS.run(root, ['ffmpeg', '-y', '-v', 'error', '-i', src, '-vn', '-c:a', 'aac', '-b:a', '256k', '-f', 'mp4', tmp]);
  else {
    // the long side never above the final's: a vertical phone clip keeps its shape
    const vf = [a.hdr ? AS.TONEMAP : null, a.h > a.w ? `scale=-2:'min(${Math.round(h * 16 / 9)},ih)'` : `scale=-2:'min(${h},ih)'`, 'format=yuv420p'].filter(Boolean).join(',');
    await AS.run(root, ['ffmpeg', '-y', '-v', 'error', '-i', src, '-r', '30', '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-g', '30', ...(a.audio !== false ? ['-c:a', 'aac', '-b:a', '256k', '-ac', '2'] : ['-an']), '-movflags', '+faststart', tmp]);
  }
  fs.renameSync(tmp, out);
  return out;
}

// ---------- the props ----------
/** The Edit composition's props. quality: 'preview' (working copies) or 'final' (full-size copies, height h). */
export function propsFor(root, playlist, dir, {quality = 'preview', h = 1080} = {}) {
  const edit = ED.load(dir);
  const byId = new Map(AS.status(dir).assets.filter((a) => a.ready).map((a) => [a.id, a]));
  const ctx = PC.context(root, playlist, dir);
  const url = (file) => PC.wsUrl(root, file);
  const pic = (a) => url(quality === 'final' ? masterOf(dir, a, h) : path.join(dir, a.proxy));
  const still = (a) => (a.stills?.[0] ? url(path.join(dir, a.stills[0].file)) : undefined);
  const sounds = [];
  const soundOf = (c, it, duck = 1) => {
    const a = c.asset ? byId.get(c.asset) : null;
    if (!a || a.kind === 'image' || a.audio === false || c.mute || !(c.volume ?? 1)) return;
    const clean = c.clean && fs.existsSync(SO.cleanFile(dir, a.id, c.clean)) ? SO.cleanFile(dir, a.id, c.clean) : null;
    sounds.push({from: r3(it.start), dur: r3(it.end - it.start), src: url(clean || (quality === 'final' ? masterOf(dir, a, h) : path.join(dir, a.proxy))), trimIn: c.in || 0, speed: c.speed || 1, volume: c.volume ?? 1, fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0, duck});
  };
  const picture = (c, it, track) => {
    const base = {from: r3(it.start), dur: r3(it.end - it.start)};
    const spec = PC.specOf(c, track, byId);
    if (spec) {
      const a = spec.src ? byId.get(spec.src.asset) : null;
      const piece = a ? {insert: {...spec.piece.insert, url: pic(a)}} : spec.piece;
      return {...base, kind: 'piece', piece, alpha: spec.alpha};
    }
    const a = c.asset ? byId.get(c.asset) : null;
    if (a && (c.kind === 'video' || c.kind === 'image')) {
      return {...base, kind: c.kind, src: pic(a), trimIn: c.in || 0, speed: c.speed || 1, fit: c.fit || 'cover', move: c.move, still: still(a), grade: c.grade ? gradeParts(c.grade) : null, pip: track === 'over'};
    }
    return {...base, kind: 'gap'};
  };
  const main = itemsOf(edit, 'main').map((it) => (soundOf(it.c, it), picture(it.c, it, 'main')));
  // over the picture: only what draws something (a graphic still waiting for Claude is left out)
  const over = itemsOf(edit, 'over').map((it) => (soundOf(it.c, it), picture(it.c, it, 'over'))).filter((p) => p.kind !== 'gap');
  for (const it of itemsOf(edit, 'voice')) soundOf(it.c, it);
  for (const it of itemsOf(edit, 'music')) soundOf(it.c, it, DUCK[it.c.duck || 'strong']);
  return {
    duration: ED.layoutOf(edit).duration,
    main,
    over,
    sounds,
    talk: talkIntervals(edit, byId, itemsOf),
    playlist: playlist.name,
    brand: ctx.brand,
    theme: ctx.theme,
  };
}

// ---------- subtitles and chapters ----------
const stamp = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** Cues of at most ~84 characters, splitting a long line over its time by its words. */
function cuesOf(text, start, end) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const parts = [];
  let cur = [];
  for (const w of words) {
    if ([...cur, w].join(' ').length > 84 && cur.length) (parts.push(cur), (cur = []));
    cur.push(w);
  }
  if (cur.length) parts.push(cur);
  const per = (end - start) / Math.max(1, words.length);
  let t = start;
  return parts.map((p) => {
    const c = {start: t, end: t + per * p.length, text: p.join(' ')};
    t = c.end;
    return c;
  });
}

/** The subtitles: voice-over lines (recorded or not) and what is said in clips that keep their sound. */
export function srtOf(dir, edit) {
  const cues = [];
  for (const it of itemsOf(edit, 'voice')) if (it.c.text) cues.push(...cuesOf(it.c.text, it.start, it.end));
  for (const k of ['main', 'over']) {
    for (const it of itemsOf(edit, k)) {
      const c = it.c;
      if (c.kind !== 'video' || c.mute || (c.volume ?? 1) < 0.5 || !c.asset) continue;
      const tr = SP.transcriptOf(dir, c.asset);
      const sp = c.speed || 1;
      for (const s of tr?.segments || []) {
        if (s.end <= c.in || s.start >= c.out) continue;
        const a = it.start + (Math.max(s.start, c.in) - c.in) / sp;
        const b = it.start + (Math.min(s.end, c.out) - c.in) / sp;
        if (b - a > 0.3) cues.push(...cuesOf(s.text, a, b));
      }
    }
  }
  cues.sort((p, q) => p.start - q.start);
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
}

/** The scenes as YouTube chapters ("0:00 Hook"). */
export function chaptersOf(edit) {
  const out = [];
  for (const it of itemsOf(edit, 'main')) {
    const s = it.c.scene ? edit.scenes.find((x) => x.id === it.c.scene) : null;
    if (s && out.at(-1)?.id !== s.id) out.push({id: s.id, title: s.title, t: it.start});
  }
  if (out.length && out[0].t > 0) out[0].t = 0; // YouTube wants the first at 0:00
  const clock = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}`) + `:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return out.map((c) => `${clock(c.t)} ${c.title}`).join('\n');
}

// ---------- running ----------
const previews = (dir, code) => {
  const d = path.join(dir, 'preview');
  return fs.existsSync(d) ? fs.readdirSync(d).map((f) => new RegExp(`^${code}-edit-540p-v(\\d+)\\.mp4$`).exec(f)).filter(Boolean).map((m) => ({v: Number(m[1]), file: `preview/${m[0]}`})).sort((a, b) => a.v - b.v) : [];
};

export function status(dir, video) {
  const j = jobs.get(dir);
  const fd = path.join(dir, 'final');
  const finals = fs.existsSync(fd) ? fs.readdirSync(fd).filter((f) => f.startsWith(`${video.code}`) && /\.(mp4|m4a|srt|txt)$/.test(f) && !f.includes('.part')).map((f) => `final/${f}`) : [];
  return {
    todo: todo(ED.load(dir)),
    sizes: Object.keys(SIZES),
    previews: previews(dir, video.code),
    finals,
    job: j ? {status: j.status, kind: j.kind, size: j.size, stage: j.stage, progress: j.progress, error: j.error || null} : null,
  };
}

/** Make the preview (kind 'preview') or the final at a size (1080, 1440, 2160). */
export function startRender(root, playlist, video, dir, {kind = 'preview', size = '1080'} = {}, opts = {}) {
  if (jobs.get(dir)?.status === 'running') throw fail('Already rendering this video', 409);
  const edit = ED.load(dir);
  if (!edit.main.length) throw fail('The timeline is empty');
  if (kind === 'final' && !SIZES[size]) throw fail('Pick 1080, 1440 or 2160');
  const check = PV.studioCheck(root);
  if (!check.ok && check.why !== 'install') throw fail(check.why);
  const job = {status: 'running', kind, size: kind === 'final' ? size : '540', stage: 'starting', progress: 0};
  jobs.set(dir, job);
  const jobFile = path.join(os.tmpdir(), `content-studio-edit-${process.pid}-${Date.now()}.json`);
  const h = Number(size);
  (async () => {
    if (!check.ok) await PV.npmInstall(check.studio);
    if (kind === 'final') {
      // full-size copies of every original in use
      const byId = new Map(AS.status(dir).assets.filter((a) => a.ready).map((a) => [a.id, a]));
      const used = [...new Set(['main', 'over', 'voice', 'music'].flatMap((k) => edit[k].map((c) => c.asset)).filter((id) => byId.has(id)))];
      job.stage = 'copies';
      for (const [i, id] of used.entries()) {
        await makeMaster(root, dir, byId.get(id), h);
        job.progress = (i + 1) / used.length;
      }
    }
    const props = {...propsFor(root, playlist, dir, {quality: kind === 'final' ? 'final' : 'preview', h}), fontFiles: installThemeFonts(check.studio)};
    const v = (previews(dir, video.code).at(-1)?.v || 0) + 1;
    const out = kind === 'final' ? path.join(dir, 'final', `${video.code}-${size}p.mp4`) : path.join(dir, 'preview', `${video.code}-edit-540p-v${v}.mp4`);
    const wav = kind === 'final' ? path.join(os.tmpdir(), `content-studio-mix-${process.pid}-${Date.now()}.wav`) : null;
    fs.writeFileSync(jobFile, JSON.stringify({
      studio: check.studio,
      composition: 'Edit',
      props,
      video: out,
      audio: wav,
      scale: kind === 'final' ? SIZES[size] : 0.5,
      crf: kind === 'final' ? 18 : 26,
      browserExecutable: opts.browserExecutable || process.env.CS_BROWSER || undefined,
    }));
    await PV.run([path.join(APP_DIR, 'render', 'render.mjs'), jobFile], check.studio, (m) => {
      if (m.error) job.error = m.error;
      if (m.stage) Object.assign(job, {stage: m.stage === 'bundle' ? 'starting' : m.stage, progress: m.progress ?? job.progress});
    });
    if (kind === 'final') {
      job.stage = 'subtitles';
      const profile = loadProfile(root);
      const lang = playlist.production?.voiceLanguage || profile.languages?.voice || 'ur-Latn';
      fs.writeFileSync(path.join(dir, 'final', `${video.code}.${lang}.srt`), srtOf(dir, edit));
      const ch = chaptersOf(edit);
      if (ch) fs.writeFileSync(path.join(dir, 'final', `${video.code}-chapters.txt`), `${ch}\n`);
      const m4a = path.join(dir, 'final', `${video.code}-sound.m4a`);
      try {
        await AS.run(root, ['ffmpeg', '-y', '-v', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '256k', '-f', 'mp4', `${m4a}.part`]);
        fs.renameSync(`${m4a}.part`, m4a);
      } finally {
        fs.rmSync(wav, {force: true});
      }
    }
    job.status = 'done';
  })()
    .catch((e) => Object.assign(job, {status: 'error', error: job.error || e.message}))
    .finally(() => {
      fs.rm(jobFile, {force: true}, () => {});
      setTimeout(() => jobs.get(dir) === job && jobs.delete(dir), 10 * 60_000).unref();
    });
  return status(dir, video);
}
