// Finish (after recording): re-time the video to the real voices, then one full-length voice track and
// subtitles per language, and a 540p check video with the voice, so scene cuts land on the spoken lines.
//   voiceover/timing.json            every line's start/end on the re-timed video, and each language's take length
//   audio/<CODE>.<lang>.wav          the voice track, exactly as long as the video (48 kHz, 16-bit mono)
//   subtitles/<CODE>.<lang>.srt      cues when that voice actually speaks
//   preview/<CODE>-timed-540p.<lang>.mp4   check video: graphics on the new timing, bed and SFX under the voice
//   final/<CODE>-<1080|1440|2160>p.<lang>.mp4  the final video: as the check video, plus the camera takes in their
//                                    face and studio slots (camera/<CODE>-<key>.mp4, converted once)
//   youtube/*.md                     chapters re-timed to the voices, footage credits added
// Every line gets as long as its longest language (fitted dubs keep that close to the creator's take), plus a
// breath; scene graphics are keyed to line starts, so the animation follows.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {APP_DIR, readJson, writeJson} from './workspace.mjs';
import {withTiming} from './plan-schema.mjs';
import * as RC from './recording.mjs';
import * as PV from './preview.mjs';
import * as MD from './media.mjs';
import * as FT from './footage.mjs';
import {installThemeFonts} from './themes.mjs';
import {readWav, writeWav, RATE} from './wav.mjs';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
export const PACE = {sceneIn: 0.5, sceneOut: 0.8, gap: 0.35, breath: 0.15, minLine: 1.2};
const TARGET_RMS = 10 ** (-20 / 20); // every take levelled to the same speech loudness
const round = (x) => Math.round(x * 1000) / 1000;
const timingFile = (dir) => path.join(dir, 'voiceover', 'timing.json');
const jobs = new Map();
/** Final sizes (picture height) -> render scale of the 1920x1080 composition. */
export const SIZES = {1080: 1, 1440: 4 / 3, 2160: 2};
const finalName = (video, lang, size) => `${video.code}-${size}p.${lang}.mp4`;

/** Line windows from the takes: {duration, scenes: [{start, end}], lines: {key: {start, end, durs, longest, recorded}}}. */
export function retime(plan, langs, takes, pace = PACE) {
  const est = plan.duration ? plan : withTiming(plan);
  const lines = {};
  const scenes = [];
  let t = 0;
  est.scenes.forEach((s, si) => {
    const start = t;
    let c = start + pace.sceneIn;
    s.lines.forEach((l, li) => {
      const key = `${si}-${li}`;
      const durs = {};
      for (const lang of langs) {
        const k = takes[lang]?.[key];
        if (k && k.peak >= 0.02 && k.dur) durs[lang] = k.dur;
      }
      const recorded = langs[0] in durs;
      if (!recorded) durs[langs[0]] = l.end - l.start; // not recorded yet: the script's estimate
      const longest = Object.keys(durs).reduce((a, b) => (durs[b] > durs[a] ? b : a));
      const win = Math.max(pace.minLine, durs[longest] + pace.breath);
      lines[key] = {start: round(c), end: round(c + win), durs: Object.fromEntries(Object.entries(durs).map(([k, v]) => [k, round(v)])), longest, recorded};
      c += win + pace.gap + (Number(l.pause) || 0); // the creator's audio clip after this line
    });
    t = c - pace.gap + pace.sceneOut;
    scenes.push({start: round(start), end: round(t)});
  });
  return {duration: round(t), scenes, lines};
}

/** The approved plan on the re-timed clock (what the check video and the finals render). */
export function timedPlan(plan, timing) {
  const est = plan.duration ? plan : withTiming(plan);
  return {
    ...est,
    duration: timing.duration,
    scenes: est.scenes.map((s, si) => ({
      ...s,
      ...timing.scenes[si],
      lines: s.lines.map((l, li) => ({...l, start: timing.lines[`${si}-${li}`].start, end: timing.lines[`${si}-${li}`].end})),
    })),
  };
}

export {readWav, writeWav};

function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.floor((x.length * to) / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i * from) / to;
    const a = Math.floor(p);
    const f = p - a;
    out[i] = x[a] * (1 - f) + (x[a + 1] ?? x[a]) * f;
  }
  return out;
}
function level(x) {
  let s = 0;
  for (const v of x) s += v * v;
  const rms = Math.sqrt(s / Math.max(1, x.length));
  if (rms < 1e-5) return x;
  let g = TARGET_RMS / rms;
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v * g));
  if (peak > 0.95) g *= 0.95 / peak;
  return x.map((v) => v * g);
}

// ---------- subtitles ----------
const ts = (sec) => {
  const ms = Math.round(sec * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
/** Words into lines of at most `max` characters. */
function wrap(text, max) {
  const out = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > max) (out.push(cur), (cur = w));
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}
/** One line of speech as cues of at most two 42-character rows, timed by their share of the text. */
export function cuesFor(text, start, end) {
  const rows = wrap(text, 42);
  const chunks = [];
  for (let i = 0; i < rows.length; i += 2) chunks.push(rows.slice(i, i + 2).join('\n'));
  const total = chunks.reduce((n, c) => n + c.length, 0) || 1;
  let t = start;
  return chunks.map((c) => {
    const d = ((end - start) * c.length) / total;
    const cue = {start: t, end: t + d, text: c};
    t += d;
    return cue;
  });
}
export const srt = (cues) => cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
const spoken = (text) => String(text || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();

// ---------- the step ----------
export function status(root, playlist, video, dir) {
  const timing = readJson(timingFile(dir), null);
  const langs = RC.languages(root, playlist);
  const live = jobs.get(dir);
  const file = (sub, name) => (fs.existsSync(path.join(dir, sub, name)) ? `${sub}/${name}` : null);
  return {
    made: timing?.made || null,
    duration: timing?.duration || null,
    langs: langs.map((lang) => ({
      lang,
      audio: file('audio', `${video.code}.${lang}.wav`),
      srt: file('subtitles', `${video.code}.${lang}.srt`),
      video: file('preview', `${video.code}-timed-540p.${lang}.mp4`),
      finals: Object.fromEntries(Object.keys(SIZES).map((size) => [size, file('final', finalName(video, lang, size))])),
      placed: timing?.tracks?.[lang]?.placed ?? null,
      missing: timing?.tracks?.[lang]?.missing ?? null,
    })),
    longest: timing?.longest || null,
    job: live ? {status: live.status, stage: live.stage, progress: live.progress, lang: live.lang, kind: live.kind, size: live.size, error: live.error} : null,
    sizes: Object.keys(SIZES),
  };
}

/** Re-time, then write every language's voice track and subtitles. */
export function make(root, playlist, video, dir, plan) {
  if (!plan) throw fail('Approve the plan first');
  const st = RC.status(root, playlist, dir, plan, true);
  const langs = st.langs;
  if (!Object.keys(st.takes[langs[0]] || {}).length) throw fail('Record your voice first', 409);
  const timing = retime(plan, langs, st.takes);
  const tracks = {};
  for (const lang of langs) {
    const track = new Float32Array(Math.ceil(timing.duration * RATE));
    const cues = [];
    let placed = 0;
    const missing = [];
    for (const l of st.lines) {
      const t = timing.lines[l.key];
      const take = st.takes[lang]?.[l.key];
      const text = spoken(lang === langs[0] ? l.vo : st.texts[lang]?.[l.key]);
      if (!take || take.peak < 0.02 || !fs.existsSync(path.join(dir, take.file))) {
        missing.push(l.key);
        continue;
      }
      const w = readWav(path.join(dir, take.file));
      const clip = level(resample(w.data, w.rate, RATE));
      const a = Math.round(t.start * RATE);
      for (let i = 0; i < clip.length && a + i < track.length; i++) track[a + i] += clip[i];
      if (text) cues.push(...cuesFor(text, t.start, t.start + Math.max(1, clip.length / RATE)));
      placed++;
    }
    tracks[lang] = {placed, missing};
    if (!placed) continue;
    writeWav(path.join(dir, 'audio', `${video.code}.${lang}.wav`), track);
    fs.mkdirSync(path.join(dir, 'subtitles'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'subtitles', `${video.code}.${lang}.srt`), srt(cues), 'utf8');
  }
  const longest = {};
  for (const v of Object.values(timing.lines)) longest[v.longest] = (longest[v.longest] || 0) + 1;
  writeJson(timingFile(dir), {made: new Date().toISOString(), planVersion: plan.meta?.version || null, pace: PACE, ...timing, longest, tracks});
  timeDescriptions(dir, plan, timing);
  return status(root, playlist, video, dir);
}

const clock = (sec) => {
  const t = Math.max(0, Math.floor(sec));
  const hh = Math.floor(t / 3600);
  const mm = String(Math.floor(t / 60) % 60);
  const ss = String(t % 60).padStart(2, '0');
  return hh ? `${hh}:${mm.padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};

/** A "## <name>" section's body replaced, up to the next heading or the closing _note_. */
function setSection(text, name, body) {
  const lines = text.split('\n');
  const at = lines.indexOf(`## ${name}`);
  if (at < 0) return text;
  let end = at + 1;
  while (end < lines.length && !/^(## |_)/.test(lines[end])) end++;
  return [...lines.slice(0, at + 1), ...body.split('\n'), '', ...lines.slice(end)].join('\n');
}

/** The descriptions' chapters on the voices' clock (YouTube wants the first at 0:00), and the footage credits. */
export function timeDescriptions(dir, plan, timing) {
  const ytDir = path.join(dir, 'youtube');
  if (!fs.existsSync(ytDir)) return;
  const chapters = plan.scenes.map((s, i) => `${clock(i ? timing.scenes[i].start : 0)} ${s.title}`).join('\n');
  const credits = FT.creditLines(dir);
  for (const name of fs.readdirSync(ytDir).filter((n) => n.endsWith('.md'))) {
    const file = path.join(ytDir, name);
    let text = fs.readFileSync(file, 'utf8');
    if (!/^## Chapters/m.test(text)) continue;
    text = setSection(text, 'Chapters', chapters);
    if (credits.length) {
      const body = credits.map((c) => `- ${c}`).join('\n');
      text = /^## Footage$/m.test(text) ? setSection(text, 'Footage', body) : text.replace(/^## Sources$/m, `## Footage\n${body}\n\n## Sources`);
    }
    text = text.replace(/Chapters use estimated timings until the voice is recorded\./, 'Chapters timed to the recorded voice.');
    fs.writeFileSync(file, text, 'utf8');
  }
}

/** key -> {url, trimIn} for every face line with a camera take, each converted once to an MP4 the renderer seeks well. */
async function camerasFor(root, dir, takes, base) {
  const out = {};
  for (const [key, t] of Object.entries(takes || {})) {
    if (!t.camera || !fs.existsSync(path.join(dir, t.camera))) continue;
    const src = path.join(dir, t.camera);
    const mp4 = src.replace(/\.\w+$/, '.mp4');
    if (mp4 !== src && (!fs.existsSync(mp4) || fs.statSync(mp4).mtimeMs < fs.statSync(src).mtimeMs)) await MD.toMp4(root, src, mp4);
    const rel = path.relative(root, mp4).split(path.sep).map(encodeURIComponent).join('/');
    out[key] = {url: `${base}/ws/${rel}`, trimIn: Number(t.trimIn) || 0};
  }
  return out;
}

/** A 540p check video on the new timing with one language's voice, bed and SFX a little lower (0.6). */
export function startCheck(root, playlist, video, dir, plan, lang, base, opts = {}) {
  return startRender(root, playlist, video, dir, plan, lang, base, {...opts, kind: 'check'});
}

/** The final video in one language at 1080p, 2K (1440p) or 4K (2160p): the check video's picture and sound, with
 * the camera takes in their slots. A face line with no camera take shows its graphic instead of an empty slot. */
export function startFinal(root, playlist, video, dir, plan, lang, size, base, opts = {}) {
  if (!SIZES[size]) throw fail(`Pick a size: ${Object.keys(SIZES).join(', ')}`);
  return startRender(root, playlist, video, dir, plan, lang, base, {...opts, kind: 'final', size: String(size)});
}

function startRender(root, playlist, video, dir, plan, lang, base, opts) {
  if (jobs.get(dir)?.status === 'running') throw fail('A video is already being made for this video', 409);
  const timing = readJson(timingFile(dir), null);
  if (!timing) throw fail('Make the voice tracks first', 409);
  const audio = path.join(dir, 'audio', `${video.code}.${lang}.wav`);
  if (!fs.existsSync(audio)) throw fail(`No ${lang} voice track yet`, 409);
  const check = PV.studioCheck(root);
  if (!check.ok) throw fail(check.why === 'install' ? 'Make a preview first (it installs the renderer)' : check.why, 409);
  const final = opts.kind === 'final';
  const props = PV.propsFor(root, playlist, video, timedPlan(plan, timing), dir);
  const rel = path.relative(root, audio).split(path.sep).map(encodeURIComponent).join('/');
  Object.assign(props, {voice: `${base}/ws/${rel}`, fx: 0.6, lang, fontFiles: installThemeFonts(check.studio)});
  const out = final ? path.join(dir, 'final', finalName(video, lang, opts.size)) : path.join(dir, 'preview', `${video.code}-timed-540p.${lang}.mp4`);
  const job = {status: 'running', stage: final ? 'camera' : 'bundle', progress: 0, lang, kind: opts.kind, size: opts.size || null};
  jobs.set(dir, job);
  const jobFile = path.join(os.tmpdir(), `content-studio-${opts.kind}-${video.code}-${process.pid}-${Date.now()}.json`);
  const takes = RC.status(root, playlist, dir, plan, true).takes[RC.languages(root, playlist)[0]];
  (async () => {
    if (final) {
      const cameras = await camerasFor(root, dir, takes, base);
      props.cameras = cameras;
      props.plan = {...props.plan, scenes: props.plan.scenes.map((s, si) => ({...s, lines: s.lines.map((l, li) => ((l.layout || 'voice') !== 'voice' && !cameras[`${si}-${li}`] ? {...l, layout: 'voice', faceFor: 0} : l))}))};
      job.stage = 'bundle';
    }
    fs.writeFileSync(jobFile, JSON.stringify({studio: check.studio, props, video: out, scale: final ? SIZES[opts.size] : 0.5, crf: final ? 18 : 26, browserExecutable: opts.browserExecutable || process.env.CS_BROWSER || undefined}));
    await PV.run([path.join(APP_DIR, 'render', 'render.mjs'), jobFile], check.studio, (m) => {
      if (m.error) job.error = m.error;
      if (m.stage) Object.assign(job, {stage: m.stage, progress: m.progress ?? job.progress});
    });
  })()
    .then(() => (job.status = 'done'))
    .catch((e) => Object.assign(job, {status: 'error', error: job.error || e.message}))
    .finally(() => {
      fs.rm(jobFile, {force: true}, () => {});
      setTimeout(() => jobs.get(dir) === job && jobs.delete(dir), 60_000).unref();
    });
  return status(root, playlist, video, dir);
}
