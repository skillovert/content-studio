// Speech to text for the creator's clips and voice notes, offline, with whisper.cpp. Installed once per PC in
// the user's home folder (never in the channel folder): ~/.content-studio/whisper/ holds the helper package,
// the whisper.cpp program and the model. Each transcript goes to <video>/edit/transcripts/<asset id>.json:
//   {lang, model, made, segments: [{start, end, text}], words: [[start, end, text]]}
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {APP_DIR, readJson} from './workspace.mjs';
import {loadSettings, saveSettings} from './settings.mjs';
import {ffmpeg} from './media.mjs';
import * as PV from './preview.mjs';
import * as AS from './assets.mjs';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
export const VERSION = '1.5.5';
const HELPER = '@remotion/install-whisper-cpp@4.0.537';
export const MODELS = {
  small: {name: 'Small', size: 'about 470 MB', about: 'Faster; good for clear English and Urdu.'},
  medium: {name: 'Medium', size: 'about 1.5 GB', about: 'Slower; better with Urdu, Punjabi, mixed speech and noise.'},
};
const home = () => process.env.CS_WHISPER || path.join(os.homedir(), '.content-studio', 'whisper');
const paths = () => ({home: home(), program: path.join(home(), 'whisper.cpp'), models: path.join(home(), 'models'), helper: path.join(home(), 'node_modules', '@remotion', 'install-whisper-cpp')});
export const transcriptFile = (dir, id) => path.join(AS.editDir(dir), 'transcripts', `${id}.json`);
const exe = (p) => path.join(p.program, process.platform === 'win32' ? 'main.exe' : 'main');
const modelFile = (p, m) => path.join(p.models, `ggml-${m}.bin`);
let install = null; // {status, stage, progress, error}
const jobs = new Map(); // video dir -> {status, done, total, current, error}

export const modelOf = () => (MODELS[loadSettings().speechModel] ? loadSettings().speechModel : 'medium');
export function ready(model = modelOf()) {
  const p = paths();
  return fs.existsSync(p.helper) && fs.existsSync(exe(p)) && fs.existsSync(modelFile(p, model));
}

export function status() {
  const model = modelOf();
  return {ready: ready(model), model, models: MODELS, where: paths().home, install: install && {status: install.status, stage: install.stage, progress: install.progress, error: install.error || null}};
}

function sh(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {cwd, shell: process.platform === 'win32'});
    let err = '';
    p.stderr?.on('data', (d) => (err = (err + d).slice(-2000)));
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.trim().split('\n').slice(-3).join(' ') || `${cmd} failed`))));
  });
}

/** Install (or switch to) a model: the helper package, the whisper.cpp program, then the model file. */
export function startInstall(model = modelOf()) {
  if (!MODELS[model]) throw fail('Pick small or medium');
  if (install?.status === 'running') throw fail('Already installing', 409);
  saveSettings({speechModel: model});
  const p = paths();
  install = {status: 'running', stage: 'helper', progress: 0};
  (async () => {
    fs.mkdirSync(p.home, {recursive: true});
    if (!fs.existsSync(p.helper)) {
      if (!fs.existsSync(path.join(p.home, 'package.json'))) fs.writeFileSync(path.join(p.home, 'package.json'), JSON.stringify({name: 'content-studio-whisper', private: true}));
      await sh(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund', HELPER], p.home);
    }
    // a half-finished program folder from an earlier try is cleared, so the installer starts clean
    if (fs.existsSync(p.program) && !fs.existsSync(exe(p))) fs.rmSync(p.program, {recursive: true, force: true});
    await runChild({action: 'install', model}, (m) => m.stage && Object.assign(install, {stage: m.stage, progress: m.progress ?? 0}));
  })()
    .then(() => (install.status = 'done'))
    .catch((e) => Object.assign(install, {status: 'error', error: e.message}));
  return status();
}

function runChild(extra, onLine) {
  const p = paths();
  const jobFile = path.join(os.tmpdir(), `content-studio-whisper-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(jobFile, JSON.stringify({studio: p.home, version: VERSION, dir: p.program, models: p.models, model: modelOf(), ...extra}));
  let error = null;
  return PV.run([path.join(APP_DIR, 'render', 'whisper.mjs'), jobFile], p.home, (m) => {
    if (m.error) error = m.error;
    onLine(m);
  })
    .catch((e) => {
      throw new Error(error || e.message);
    })
    .finally(() => fs.rm(jobFile, {force: true}, () => {}));
}

/** 16 kHz mono WAV of an original (what whisper.cpp reads). */
function toWav16(root, src, out) {
  const f = ffmpeg(root);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  return new Promise((resolve, reject) => {
    const p = spawn(f.ffmpeg, ['-y', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out], {env: f.env, cwd: f.cwd});
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c ? reject(new Error(err.trim().slice(-200))) : resolve(out)));
  });
}

/** Clips and voice notes with sound and no transcript yet. */
export function waiting(dir) {
  return AS.status(dir).assets.filter((a) => a.ready && a.kind !== 'image' && a.audio !== false && (a.sound || []).length && !fs.existsSync(transcriptFile(dir, a.id)));
}

export function videoStatus(dir) {
  const j = jobs.get(dir);
  return {ready: ready(), waiting: waiting(dir).length, job: j ? {status: j.status, done: j.done, total: j.total, current: j.current, error: j.error || null} : null};
}

/** Every waiting clip, one after another; `language` (e.g. "ur", "en") or null to detect it per clip. */
export function startTranscribe(root, dir, language = null) {
  if (!ready()) throw fail('Install speech to text first (Settings)', 409);
  if (jobs.get(dir)?.status === 'running') throw fail('Already listening to the clips', 409);
  const todo = waiting(dir);
  const job = {status: 'running', done: 0, total: todo.length, current: null};
  jobs.set(dir, job);
  (async () => {
    for (const a of todo) {
      job.current = a.file;
      const wav = path.join(AS.editDir(dir), 'speech', `${a.id}.wav`);
      await toWav16(root, path.join(AS.rawDir(dir), a.file), wav);
      await runChild({action: 'transcribe', language, files: [{wav, out: transcriptFile(dir, a.id), name: a.file}]}, () => {});
      job.done++;
    }
  })()
    .then(() => (job.status = 'done'))
    .catch((e) => Object.assign(job, {status: 'error', error: e.message}))
    .finally(() => setTimeout(() => jobs.get(dir) === job && jobs.delete(dir), 60_000).unref());
  return videoStatus(dir);
}

export const transcriptOf = (dir, id) => readJson(transcriptFile(dir, id), null);
