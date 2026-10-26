// The creator's own material for one video: clips, audio and photos in <video>/media/, named by what
// they show (e.g. karachi-flood-street.mp4, minister-phone-call.m4a, wiz-research-team.jpg). Each is
// matched to the line whose words fit its name (or a plan line's `media`), and the visual director
// plays it there in the brand's style:
//   video  a clip player (REC camera, old TV, phone...) under the voice, muted (b-roll)
//   audio  an audio player (old phone line, radio...) after its line; the voice pauses for it, and the
//          sound is filtered to match the style (media/fx/<name>.<style>.wav)
//   image  a photo (polaroid, framed...), or the portrait in a quote when its name is the speaker's
//   media/media.json   {<file>: {kind, dur}}
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import os from 'node:os';
import {readJson, rendererDir, writeJson} from './workspace.mjs';
import {RATE, readWav, writeWav} from './wav.mjs';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
const KINDS = {video: /\.(mp4|mov|webm|m4v)$/i, audio: /\.(mp3|m4a|wav|ogg|aac)$/i, image: /\.(jpe?g|png|webp)$/i};
const NAME = /^[A-Za-z0-9][\w.-]{0,80}\.[a-z0-9]{2,4}$/i;
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'clip', 'video', 'audio', 'photo', 'image', 'img', 'final', 'copy', 'new']);
export const mediaDir = (dir) => path.join(dir, 'media');
const metaFile = (dir) => path.join(mediaDir(dir), 'media.json');
export const kindOf = (name) => Object.keys(KINDS).find((k) => KINDS[k].test(name)) || null;

/** The renderer's own ffmpeg/ffprobe (<renderer>/node_modules/@remotion/compositor-*), else the system's. */
export function ffmpeg(root) {
  const base = path.join(rendererDir(root), 'node_modules', '@remotion');
  let dir = null;
  try {
    const c = fs.readdirSync(base).filter((d) => d.startsWith('compositor-'));
    dir = c.map((d) => path.join(base, d)).find((d) => fs.existsSync(path.join(d, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'))) || null;
  } catch {
    /* no studio install */
  }
  const exe = (n) => (dir ? path.join(dir, process.platform === 'win32' ? `${n}.exe` : n) : n);
  const env = dir ? {...process.env, LD_LIBRARY_PATH: [dir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'), DYLD_LIBRARY_PATH: dir} : process.env;
  return {ffmpeg: exe('ffmpeg'), ffprobe: exe('ffprobe'), env, cwd: dir || undefined};
}
/** A camera take or phone clip as an even 30 fps H.264 MP4 (at most 1080 high), which the renderer seeks
 * reliably (browser WebM recordings often have no index). Resolves to `out`. */
export function toMp4(root, src, out, height = 1080) {
  const f = ffmpeg(root);
  const tmp = out + '.part.mp4';
  return new Promise((resolve, reject) => {
    const p = spawn(f.ffmpeg, ['-y', '-v', 'error', '-i', src, '-r', '30', '-vf', `scale=-2:'min(${height},ih)'`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', tmp], {env: f.env, cwd: f.cwd});
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code) return (fs.rmSync(tmp, {force: true}), reject(new Error(`Could not convert ${path.basename(src)}: ${err.trim().slice(-300)}`)));
      fs.renameSync(tmp, out);
      resolve(out);
    });
  });
}
function duration(root, file) {
  const f = ffmpeg(root);
  const r = spawnSync(f.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], {env: f.env, cwd: f.cwd, encoding: 'utf8'});
  const d = parseFloat(r.stdout);
  return Number.isFinite(d) ? Math.round(d * 100) / 100 : null;
}

export function list(dir) {
  const meta = readJson(metaFile(dir), {});
  let files = [];
  try {
    files = fs.readdirSync(mediaDir(dir)).filter((n) => kindOf(n));
  } catch {
    /* none yet */
  }
  return files.sort().map((name) => ({name, kind: kindOf(name), dur: meta[name]?.dur ?? null, words: words(name)}));
}

export function save(root, dir, name, buf) {
  name = String(name || '').replace(/\s+/g, '-');
  if (!NAME.test(name) || !kindOf(name)) throw fail('Use a short file name with letters, numbers and dashes, ending .mp4, .mov, .webm, .mp3, .m4a, .wav, .jpg or .png');
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail('The file is empty');
  fs.mkdirSync(mediaDir(dir), {recursive: true});
  const file = path.join(mediaDir(dir), name);
  fs.writeFileSync(file, buf);
  const meta = readJson(metaFile(dir), {});
  meta[name] = {kind: kindOf(name), dur: kindOf(name) === 'image' ? null : duration(root, file), added: new Date().toISOString()};
  writeJson(metaFile(dir), meta);
  return list(dir);
}

export function remove(dir, name) {
  if (!NAME.test(name)) throw fail('Unknown file');
  fs.rmSync(path.join(mediaDir(dir), name), {force: true});
  const meta = readJson(metaFile(dir), {});
  delete meta[name];
  writeJson(metaFile(dir), meta);
  return list(dir);
}

/** "karachi-flood-street.mp4" -> ["karachi", "flood", "street"]. */
export function words(name) {
  return name.replace(/\.[^.]+$/, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
}
const lineWords = (vo) => new Set(String(vo).replace(/"/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

/**
 * Which line each file goes on: {"<s>-<l>": item}. A plan line's `media` (a file name) wins; otherwise
 * the line sharing the most name words, one file per line, never a face moment.
 */
export function match(plan, items) {
  const out = {};
  const used = new Set();
  plan.scenes.forEach((s, si) => s.lines.forEach((l, li) => {
    const m = l.media && items.find((x) => x.name === l.media);
    if (m) (out[`${si}-${li}`] = m), used.add(m.name);
  }));
  for (const it of items) {
    if (used.has(it.name) || it.kind === 'image' && !it.words.length) continue;
    let best = null;
    plan.scenes.forEach((s, si) => s.lines.forEach((l, li) => {
      const key = `${si}-${li}`;
      if (out[key] || (l.layout && l.layout !== 'voice')) return;
      const w = lineWords(l.vo);
      const score = it.words.filter((x) => w.has(x)).length;
      if (score && (!best || score > best.score)) best = {key, score};
    }));
    if (best) (out[best.key] = it), used.add(it.name);
  }
  return out;
}

/** Seconds the voice pauses after a line so its audio clip can play: {"<s>-<l>": seconds}. */
export function pauses(plan, items) {
  const m = match(plan, items);
  return Object.fromEntries(Object.entries(m).filter(([, it]) => it.kind === 'audio' && it.dur).map(([k, it]) => [k, Math.min(30, it.dur) + 0.4]));
}

/** The plan with each line's pause (before timing). */
export function withPauses(plan, items) {
  const p = pauses(plan, items);
  return {...plan, scenes: plan.scenes.map((s, si) => ({...s, lines: s.lines.map((l, li) => (p[`${si}-${li}`] ? {...l, pause: p[`${si}-${li}`]} : l))}))};
}

// Sound per audio style, done here in JS (the renderer's ffmpeg only decodes): a call through an old
// phone line, a radio, a voicemail, tape. Each is a chain of filters on 48 kHz mono samples.
function biquad(x, type, f0, q = 0.707) {
  const w = (2 * Math.PI * f0) / RATE;
  const al = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  const [a0, a1, a2] = [1 + al, -2 * c, 1 - al];
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    (x2 = x1), (x1 = x[i]), (y2 = y1), (y1 = v);
    y[i] = v;
  }
  return y;
}
function compress(x, thDb, ratio) {
  const th = 10 ** (thDb / 20);
  const att = Math.exp(-1 / (0.005 * RATE));
  const rel = Math.exp(-1 / (0.08 * RATE));
  let env = 0;
  return x.map((v) => {
    const a = Math.abs(v);
    env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;
    return env > th ? v * ((th * (env / th) ** (1 / ratio)) / env) : v;
  });
}
const crush = (x, bits, mix) => x.map((v) => v * (1 - mix) + (Math.round(v * 2 ** (bits - 1)) / 2 ** (bits - 1)) * mix);
function echo(x, ms, decay) {
  const d = Math.round((ms / 1000) * RATE);
  const y = Float32Array.from(x);
  for (let i = d; i < y.length; i++) y[i] += y[i - d] * decay;
  return y;
}
function vibrato(x, hz, ms) {
  const depth = (ms / 1000) * RATE;
  return x.map((_, i) => {
    const p = i - depth * (1 + Math.sin((2 * Math.PI * hz * i) / RATE));
    const a = Math.floor(p);
    return a < 0 ? 0 : x[a] + ((x[a + 1] ?? x[a]) - x[a]) * (p - a);
  });
}
const hiss = (x, level) => {
  let s = 12345;
  return x.map((v) => ((s = (s * 1103515245 + 12345) & 0x7fffffff), v + ((s / 0x7fffffff) * 2 - 1) * level));
};
const gain = (x, g) => x.map((v) => v * g);
function normalize(x, peak = 0.95) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m > 0 ? gain(x, peak / m) : x;
}
export const AUDIO_FX = {
  phone: (x) => crush(compress(biquad(biquad(biquad(biquad(x, 'hp', 320), 'hp', 320), 'lp', 3300), 'lp', 3300), -22, 5), 11, 0.25),
  radio: (x) => compress(echo(biquad(biquad(biquad(x, 'hp', 220), 'lp', 4800), 'lp', 4800), 18, 0.18), -20, 3),
  voicemail: (x) => compress(biquad(biquad(biquad(x, 'hp', 260), 'lp', 4000), 'lp', 4000), -24, 6),
  cassette: (x) => hiss(vibrato(biquad(x, 'lp', 8500), 0.7, 1.5), 0.004),
  studio: null,
};

/** The file to play for an audio insert in a style: the styled copy (made once), or the original. */
export function styledAudio(root, dir, name, style) {
  const src = path.join(mediaDir(dir), name);
  const fx = AUDIO_FX[style];
  if (!fx || !fs.existsSync(src)) return `media/${name}`;
  const rel = `media/fx/${name.replace(/\.[^.]+$/, '')}.${style}.wav`;
  const out = path.join(dir, rel);
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) return rel;
  fs.mkdirSync(path.dirname(out), {recursive: true});
  // decode anything (mp3, m4a, wav...) to 48 kHz mono 16-bit with the renderer's ffmpeg, then style it
  const tmp = path.join(os.tmpdir(), `cs-media-${process.pid}-${Date.now()}.wav`);
  const f = ffmpeg(root);
  const r = spawnSync(f.ffmpeg, ['-y', '-v', 'error', '-i', src, '-ac', '1', '-ar', String(RATE), '-c:a', 'pcm_s16le', tmp], {env: f.env, cwd: f.cwd, encoding: 'utf8'});
  try {
    if (r.status !== 0) return `media/${name}`;
    writeWav(out, normalize(fx(readWav(tmp).data)));
    return rel;
  } catch {
    return `media/${name}`;
  } finally {
    fs.rmSync(tmp, {force: true});
  }
}
