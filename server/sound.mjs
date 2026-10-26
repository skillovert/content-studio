// The sound of an edited video (Travel Video Editing kit, step 6): noise cleanup per clip and levelling.
//   edit/clean/<asset id>-<strength>.m4a   the original's sound with the noise taken out (mono, 48 kHz), made
//                                         once per file and strength; a clip set to "Clean noise" plays it
// Levelling measures the loudness of each clip in use (EBU R128, ffmpeg's loudnorm) and returns the volume that
// brings it to the target: talk and own sound at -16 LUFS (YouTube's level), music lower, under the voices.
import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {writeWav} from './wav.mjs';
import * as AS from './assets.mjs';
import * as ED from './edit.mjs';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
export const STRENGTHS = ['light', 'medium', 'strong'];
export const TARGET = {talk: -16, music: -27};
const cleanDir = (dir) => path.join(AS.editDir(dir), 'clean');
export const cleanFile = (dir, id, strength) => path.join(cleanDir(dir), `${id}-${strength}.m4a`);
const cleaners = new Map(); // video dir -> {status, queue: [[id, strength]], current, error}
const levellers = new Map(); // video dir -> {status, done, total, results, error}

/** Cleaned sound files ready, as {"<id>-<strength>": "edit/clean/..."}, and the cleanup job. */
export function status(dir) {
  const d = cleanDir(dir);
  const files = fs.existsSync(d) ? Object.fromEntries(fs.readdirSync(d).filter((f) => /^[\w-]+-(light|medium|strong)\.m4a$/.test(f)).map((f) => [f.slice(0, -4), `edit/clean/${f}`])) : {};
  const c = cleaners.get(dir);
  const l = levellers.get(dir);
  return {
    clean: files,
    cleaning: c ? {status: c.status, waiting: c.queue.map(([id, s]) => `${id}-${s}`), current: c.current, error: c.error || null} : null,
    levelling: l ? {status: l.status, done: l.done, total: l.total, results: l.status === 'done' ? l.results : null, error: l.error || null} : null,
  };
}

/** 48 kHz mono samples of an original's sound. */
async function samplesOf(root, src) {
  const wav = await AS.run(root, ['ffmpeg', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-bitexact', '-f', 'wav', 'pipe:1'], {stdout: true});
  const at = wav.indexOf('data');
  const pcm = wav.subarray(at < 0 ? 44 : at + 8);
  const n = Math.floor(pcm.length / 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = pcm.readInt16LE(i * 2) / 32768;
  return x;
}

const inWorker = (samples, rate, strength) => new Promise((resolve, reject) => {
  const w = new Worker(new URL('./dsp-worker.mjs', import.meta.url), {workerData: {samples, rate, strength}, transferList: [samples.buffer]});
  w.once('message', resolve);
  w.once('error', reject);
  w.once('exit', (c) => c && reject(new Error(`cleanup stopped (${c})`)));
});

async function cleanOne(root, dir, id, strength) {
  const a = AS.status(dir).assets.find((x) => x.id === id);
  if (!a) throw fail('No such footage');
  const out = cleanFile(dir, id, strength);
  const tmp = `${out}.wav`;
  const y = await inWorker(await samplesOf(root, path.join(AS.rawDir(dir), a.file)), 48000, strength);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  writeWav(tmp, y, 48000);
  try {
    await AS.run(root, ['ffmpeg', '-y', '-v', 'error', '-i', tmp, '-c:a', 'aac', '-b:a', '160k', '-f', 'mp4', `${out}.part`]);
    fs.renameSync(`${out}.part`, out);
  } finally {
    fs.rmSync(tmp, {force: true});
  }
}

/** Clean the noise out of a file's sound (queued; one file at a time). */
export function startClean(root, dir, id, strength = 'medium') {
  if (!STRENGTHS.includes(strength)) throw fail('Pick light, medium or strong');
  const a = AS.status(dir).assets.find((x) => x.id === id && x.ready);
  if (!a || a.kind === 'image') throw fail('That footage has no sound', 404);
  if (a.audio === false) throw fail('That clip has no sound');
  if (fs.existsSync(cleanFile(dir, id, strength))) return status(dir);
  let job = cleaners.get(dir);
  if (job?.status === 'running') {
    if (!job.queue.some(([i, s]) => i === id && s === strength) && job.current !== `${id}-${strength}`) job.queue.push([id, strength]);
    return status(dir);
  }
  job = {status: 'running', queue: [[id, strength]], current: null};
  cleaners.set(dir, job);
  (async () => {
    while (job.queue.length) {
      const [i, s] = job.queue.shift();
      job.current = `${i}-${s}`;
      await cleanOne(root, dir, i, s);
    }
    job.current = null;
  })()
    .then(() => (job.status = 'done'))
    .catch((e) => Object.assign(job, {status: 'error', error: e.message}))
    .finally(() => setTimeout(() => cleaners.get(dir) === job && cleaners.delete(dir), 60_000).unref());
  return status(dir);
}

/** Integrated loudness (LUFS) of seconds a..b of a file, or null when silent. */
export async function loudness(root, src, a, b) {
  const len = Math.max(0.5, b - a);
  // a long stretch is measured on its middle two minutes
  const from = len > 120 ? a + (len - 120) / 2 : a;
  const err = await AS.run(root, ['ffmpeg', '-hide_banner', '-nostats', '-ss', String(from), '-t', String(Math.min(len, 120)), '-i', src, '-vn', '-af', 'loudnorm=print_format=json', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1']);
  return loudnessOf(err);
}
export function loudnessOf(stderr) {
  const m = /"input_i"\s*:\s*"(-?[\d.]+|-inf)"/.exec(String(stderr));
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) && v > -70 ? v : null;
}

/** The volume that brings a clip at `lufs` to the target (100% = as recorded). */
export const volumeFor = (lufs, target) => Math.round(Math.min(2, Math.max(0.05, 10 ** ((target - lufs) / 20))) * 100) / 100;

/** Measure every clip with sound in the edit; results {clip id: volume}. The editor applies them (one undo step). */
export function startLevel(root, dir) {
  if (levellers.get(dir)?.status === 'running') throw fail('Already levelling the sound', 409);
  const edit = ED.load(dir);
  const byId = new Map(AS.status(dir).assets.filter((a) => a.ready).map((a) => [a.id, a]));
  const todo = [];
  for (const track of ['main', 'over', 'voice', 'music']) {
    for (const c of edit[track]) {
      const a = c.asset ? byId.get(c.asset) : null;
      if (!a || a.audio === false || !(c.kind === 'video' || c.kind === 'audio') || c.mute) continue;
      // b-roll under the voice-over keeps its low level; the clips that speak for themselves are levelled
      if ((track === 'main' || track === 'over') && (c.volume ?? 1) < 0.5) continue;
      todo.push({c, a, target: track === 'music' ? TARGET.music : TARGET.talk});
    }
  }
  if (!todo.length) throw fail('No clip with sound to level');
  const job = {status: 'running', done: 0, total: todo.length, results: {}};
  levellers.set(dir, job);
  (async () => {
    for (const {c, a, target} of todo) {
      const clean = c.clean && fs.existsSync(cleanFile(dir, a.id, c.clean)) ? cleanFile(dir, a.id, c.clean) : null;
      const lufs = await loudness(root, clean || path.join(AS.rawDir(dir), a.file), c.in, c.out);
      if (lufs != null) job.results[c.id] = volumeFor(lufs, target);
      job.done++;
    }
  })()
    .then(() => (job.status = 'done'))
    .catch((e) => Object.assign(job, {status: 'error', error: e.message}))
    .finally(() => setTimeout(() => levellers.get(dir) === job && levellers.delete(dir), 10 * 60_000).unref());
  return status(dir);
}
