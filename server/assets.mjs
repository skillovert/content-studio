// The creator's raw material for an edited video (Travel Video Editing kit): clips, photos, voice notes and
// music, as recorded. Originals stay untouched in raw/; Content Studio makes light working copies and a log
// that Claude reads to build the edit (what is said, what is seen, where it is loud or dark).
//   raw/                         the originals (copied in by the creator, or uploaded)
//   edit/assets.json             {assets: [{id, file, kind, size, mtime, dur, w, h, fps, created, place, hdr, audio,
//                                  proxy, stills: [{t, file}], wave, sound: [[a, b]], dark: [[a, b]], transcript}]}
//   edit/proxy/<id>.mp4|m4a|jpg  540p / AAC / 1280 px working copies, used while editing and in the preview
//   edit/stills/<id>/<n>.jpg     a still at every scene change (and at least every 8 s), 320 px wide
//   edit/wave/<id>.json          {step, peaks: [0..255]} for the timeline's waveform
//   edit/transcripts/<id>.json   speech to text with times, when Whisper is installed (server/speech.mjs)
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {readJson, writeJson} from './workspace.mjs';
import {ffmpeg} from './media.mjs';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
export const KINDS = {video: /\.(mp4|mov|m4v|webm|mkv|avi|mts|m2ts|3gp)$/i, audio: /\.(mp3|m4a|wav|aac|ogg|opus|flac|amr|weba)$/i, image: /\.(jpe?g|png|webp|heic|heif)$/i};
export const kindOf = (name) => Object.keys(KINDS).find((k) => KINDS[k].test(name)) || null;
export const rawDir = (dir) => path.join(dir, 'raw');
export const editDir = (dir) => path.join(dir, 'edit');
const logFile = (dir) => path.join(editDir(dir), 'assets.json');
const STILL_GAP = 8; // a still at least this often (s), even without a scene change
const MAX_STILLS = 30;
const WAVE_STEP = 0.05; // seconds per waveform peak
const jobs = new Map(); // video dir -> {status, done, total, current, stage, error, log}

/** A file name as an id: lower case words joined by "-", unique in the log. */
export function idFor(name, taken) {
  const base = path.basename(name, path.extname(name)).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'asset';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Every original under raw/ (sub-folders too, e.g. raw/day-1/), as paths relative to raw/. */
function rawFiles(dir) {
  const out = [];
  const walk = (d, rel) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(path.join(d, e.name), rel ? `${rel}/${e.name}` : e.name);
      else if (kindOf(e.name)) out.push(rel ? `${rel}/${e.name}` : e.name);
    }
  };
  walk(rawDir(dir), '');
  return out.sort();
}

/** The log matched to what is in raw/ now: new files added (not processed yet), removed files dropped. */
export function scan(dir) {
  const log = readJson(logFile(dir), {assets: []});
  const files = rawFiles(dir);
  const byFile = new Map(log.assets.map((a) => [a.file, a]));
  const taken = new Set();
  const assets = files.map((file) => {
    const st = fs.statSync(path.join(rawDir(dir), file));
    const old = byFile.get(file);
    if (old && old.size === st.size && Math.round(old.mtime) === Math.round(st.mtimeMs)) return (taken.add(old.id), old);
    const id = old?.id || idFor(path.basename(file), new Set([...taken, ...log.assets.map((a) => a.id)]));
    taken.add(id);
    return {id, file, kind: kindOf(file), size: st.size, mtime: st.mtimeMs, ready: false};
  });
  return {...log, assets};
}

export function status(dir) {
  const log = scan(dir);
  const live = jobs.get(dir);
  return {
    raw: path.relative(path.dirname(path.dirname(path.dirname(dir))), rawDir(dir)).split(path.sep).join('/'),
    assets: log.assets,
    waiting: log.assets.filter((a) => !a.ready).length,
    job: live ? {status: live.status, done: live.done, total: live.total, current: live.current, stage: live.stage, error: live.error || null} : null,
  };
}

// ---------- running ffmpeg ----------
export function run(root, args, {stdout = false} = {}) {
  const f = ffmpeg(root);
  return new Promise((resolve, reject) => {
    const p = spawn(args[0] === 'probe' ? f.ffprobe : f.ffmpeg, args.slice(1), {env: f.env, cwd: f.cwd});
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => stdout && out.push(d));
    p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    p.on('error', reject);
    p.on('close', (code) => (code ? reject(new Error(err.trim().split('\n').slice(-2).join(' ') || `ffmpeg exited ${code}`)) : resolve(stdout ? Buffer.concat(out) : err)));
  });
}

/** Length, size, frame rate, when and where it was recorded, HDR, has sound. */
export async function probe(root, file) {
  const raw = await run(root, ['probe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], {stdout: true});
  return probeInfo(JSON.parse(raw.toString('utf8')));
}
export function probeInfo(j) {
  const v = (j.streams || []).find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  const tags = {...(j.format?.tags || {}), ...(v?.tags || {})};
  const rot = Math.abs(Number(v?.side_data_list?.find((s) => 'rotation' in s)?.rotation ?? tags.rotate ?? 0)) % 180 === 90;
  const [n, d] = String(v?.avg_frame_rate || v?.r_frame_rate || '0/1').split('/').map(Number);
  const iso = tags['com.apple.quicktime.location.ISO6709'] || tags.location || '';
  const gps = /([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(iso);
  const dur = Number(j.format?.duration || v?.duration || a?.duration || 0);
  return {
    dur: Math.round(dur * 100) / 100,
    w: v ? (rot ? v.height : v.width) : 0,
    h: v ? (rot ? v.width : v.height) : 0,
    fps: d ? Math.round((n / d) * 100) / 100 : 0,
    created: tags['com.apple.quicktime.creationdate'] || tags.creation_time || null,
    place: gps ? {lat: Number(gps[1]), lon: Number(gps[2])} : null,
    hdr: /smpte2084|arib-std-b67/.test(v?.color_transfer || ''),
    audio: Boolean(a),
    codec: v?.codec_name || a?.codec_name || null,
  };
}

/** HDR phone footage (HLG / PQ) mapped to normal video, so it does not look grey and washed out. */
export const TONEMAP = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

async function makeProxy(root, src, out, info) {
  const tmp = out + '.part' + path.extname(out);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  if (info.kind === 'image') {
    await run(root, ['ffmpeg', '-y', '-v', 'error', '-i', src, '-vf', "scale='min(1280,iw)':-2", '-frames:v', '1', '-q:v', '3', tmp]);
  } else if (info.kind === 'audio') {
    await run(root, ['ffmpeg', '-y', '-v', 'error', '-i', src, '-vn', '-c:a', 'aac', '-b:a', '128k', '-f', 'mp4', tmp]);
  } else {
    const vf = [info.hdr ? TONEMAP : null, 'scale=-2:540', 'format=yuv420p'].filter(Boolean).join(',');
    // a keyframe every second, so the timeline scrubs smoothly
    await run(root, ['ffmpeg', '-y', '-v', 'error', '-i', src, '-r', '30', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-g', '30', ...(info.audio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an']), '-movflags', '+faststart', tmp]);
  }
  fs.renameSync(tmp, out);
}

/** Tiny grey frames, twice a second: scene changes (big jumps between frames) and dark stretches. */
export function scenesFrom(frames, step = 0.5, {cut = 22, gap = 1.5, dark = 20} = {}) {
  const px = frames[0]?.length || 1;
  const cuts = [0];
  const darkRuns = [];
  let runStart = null;
  frames.forEach((fr, i) => {
    const t = i * step;
    let mean = 0;
    for (const v of fr) mean += v;
    mean /= px;
    if (mean < dark) runStart ??= t;
    else if (runStart != null) (t - runStart >= 1 && darkRuns.push([runStart, t]), (runStart = null));
    if (!i) return;
    let diff = 0;
    const prev = frames[i - 1];
    for (let k = 0; k < px; k++) diff += Math.abs(fr[k] - prev[k]);
    diff /= px;
    if ((diff > cut && t - cuts.at(-1) >= gap) || t - cuts.at(-1) >= STILL_GAP) cuts.push(t);
  });
  if (runStart != null && frames.length * step - runStart >= 1) darkRuns.push([runStart, frames.length * step]);
  return {cuts, dark: darkRuns};
}

/** Peaks for the waveform (0-255 per WAVE_STEP) and the stretches with sound (above -42 dB for 0.3 s or more). */
export function waveFrom(samples, rate) {
  const n = Math.max(1, Math.round(rate * WAVE_STEP));
  const peaks = [];
  const loud = [];
  for (let i = 0; i < samples.length; i += n) {
    let pk = 0;
    let sum = 0;
    const end = Math.min(samples.length, i + n);
    for (let k = i; k < end; k++) {
      const v = Math.abs(samples[k]);
      if (v > pk) pk = v;
      sum += v * v;
    }
    peaks.push(Math.min(255, Math.round(Math.sqrt(pk) * 255))); // square root: quiet speech still shows
    loud.push(20 * Math.log10(Math.sqrt(sum / Math.max(1, end - i)) + 1e-9) > -42);
  }
  const sound = [];
  let s = null;
  loud.forEach((on, i) => {
    if (on) s ??= i;
    else if (s != null) ((i - s) * WAVE_STEP >= 0.3 && sound.push([s * WAVE_STEP, i * WAVE_STEP]), (s = null));
  });
  if (s != null) sound.push([s * WAVE_STEP, loud.length * WAVE_STEP]);
  const r = (x) => Math.round(x * 100) / 100;
  return {step: WAVE_STEP, peaks, sound: sound.map(([a, b]) => [r(a), r(b)])};
}

async function processOne(root, dir, a, job) {
  const src = path.join(rawDir(dir), a.file);
  const ed = editDir(dir);
  const rel = (p) => path.relative(dir, p).split(path.sep).join('/');
  job.stage = 'reading';
  const info = {...a, ...(await probe(root, src))};
  delete info.error;
  if (a.kind === 'image') Object.assign(info, {dur: 0, fps: 0});
  job.stage = 'working copy';
  const proxy = path.join(ed, 'proxy', `${a.id}.${a.kind === 'image' ? 'jpg' : a.kind === 'audio' ? 'm4a' : 'mp4'}`);
  await makeProxy(root, src, proxy, info);
  info.proxy = rel(proxy);
  // a browser recording (WebM) does not say how long it is: the working copy does
  if (a.kind !== 'image' && !(info.dur > 0)) info.dur = (await probe(root, proxy)).dur || 0;
  if (a.kind === 'video') {
    job.stage = 'scenes';
    const raw = await run(root, ['ffmpeg', '-v', 'error', '-i', proxy, '-r', '2', '-vf', 'scale=32:18', '-pix_fmt', 'gray', '-c:v', 'rawvideo', '-f', 'image2pipe', 'pipe:1'], {stdout: true});
    const frames = [];
    for (let i = 0; i + 576 <= raw.length; i += 576) frames.push(raw.subarray(i, i + 576));
    const {cuts, dark} = scenesFrom(frames);
    const pick = cuts.length > MAX_STILLS ? cuts.filter((_, i) => i % Math.ceil(cuts.length / MAX_STILLS) === 0) : cuts;
    const sd = path.join(ed, 'stills', a.id);
    fs.rmSync(sd, {recursive: true, force: true});
    fs.mkdirSync(sd, {recursive: true});
    info.stills = [];
    for (const [i, t] of pick.entries()) {
      const out = path.join(sd, `${i}.jpg`);
      await run(root, ['ffmpeg', '-y', '-v', 'error', '-ss', String(Math.min(t + 0.2, Math.max(0, info.dur - 0.1))), '-i', proxy, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', out]);
      info.stills.push({t, file: rel(out)});
    }
    info.dark = dark;
  }
  if (a.kind === 'image') info.stills = [{t: 0, file: info.proxy}];
  if (a.kind !== 'image' && info.audio !== false) {
    job.stage = 'sound';
    const wav = await run(root, ['ffmpeg', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '8000', '-c:a', 'pcm_s16le', '-bitexact', '-f', 'wav', 'pipe:1'], {stdout: true});
    const at = wav.indexOf('data');
    const pcm = wav.subarray(at < 0 ? 44 : at + 8);
    const samples = new Float32Array(pcm.length >> 1);
    for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
    const w = waveFrom(samples, 8000);
    const wf = path.join(ed, 'wave', `${a.id}.json`);
    writeJson(wf, {step: w.step, peaks: w.peaks});
    info.wave = rel(wf);
    info.sound = w.sound;
  }
  info.ready = true;
  info.processed = new Date().toISOString();
  return info;
}

/** Make working copies, stills, waveforms for every new or changed original, one at a time. */
export function processAll(root, dir, {after} = {}) {
  if (jobs.get(dir)?.status === 'running') throw fail('Already working on the files', 409);
  const log = scan(dir);
  const todo = log.assets.filter((a) => !a.ready);
  if (!todo.length) return status(dir);
  const job = {status: 'running', done: 0, total: todo.length, current: null, stage: null};
  jobs.set(dir, job);
  writeJson(logFile(dir), log);
  (async () => {
    for (const a of todo) {
      job.current = a.file;
      try {
        const info = await processOne(root, dir, a, job);
        const now = scan(dir);
        writeJson(logFile(dir), {...now, assets: now.assets.map((x) => (x.id === a.id ? info : x))});
      } catch (e) {
        const now = scan(dir);
        writeJson(logFile(dir), {...now, assets: now.assets.map((x) => (x.id === a.id ? {...x, error: e.message.slice(0, 300)} : x))});
      }
      job.done++;
    }
    if (after) await after();
  })()
    .then(() => (job.status = 'done'))
    .catch((e) => Object.assign(job, {status: 'error', error: e.message}))
    .finally(() => setTimeout(() => jobs.get(dir) === job && jobs.delete(dir), 60_000).unref());
  return status(dir);
}

/** An upload streamed straight into raw/ (clips can be gigabytes); `folder` = a folder inside it (e.g. recorded). */
export function upload(dir, name, req, folder = '') {
  const clean = path.basename(String(name || '')).replace(/[^\w.\- ()]+/g, '').trim();
  if (!clean || !kindOf(clean)) throw fail('Videos, photos and audio only (mp4, mov, jpg, png, heic, mp3, m4a, wav...)');
  const into = path.join(rawDir(dir), String(folder).replace(/[^\w-]+/g, ''));
  fs.mkdirSync(into, {recursive: true});
  let target = path.join(into, clean);
  for (let n = 2; fs.existsSync(target); n++) target = path.join(into, `${path.basename(clean, path.extname(clean))} (${n})${path.extname(clean)}`);
  const tmp = target + '.uploading';
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    req.pipe(out);
    req.on('error', (e) => (out.destroy(), fs.rmSync(tmp, {force: true}), reject(e)));
    out.on('error', (e) => (fs.rmSync(tmp, {force: true}), reject(e)));
    out.on('finish', () => (fs.renameSync(tmp, target), resolve({file: path.relative(rawDir(dir), target).split(path.sep).join('/')})));
  });
}
