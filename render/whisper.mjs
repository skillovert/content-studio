// Speech to text with whisper.cpp (through @remotion/install-whisper-cpp in the studio's own install), run by
// server/speech.mjs as a child process:  node render/whisper.mjs <job.json>
// job: {studio, version, model, dir (whisper.cpp), models (folder), action: 'install' | 'transcribe', files: [{wav, out}]}
// Prints one JSON object per line ({stage, progress} while working, then {done} or {error}).
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const say = (o) => process.stdout.write(JSON.stringify(o) + '\n');

async function main() {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const req = createRequire(path.join(path.resolve(job.studio), 'package.json'));
  const W = req('@remotion/install-whisper-cpp');
  if (job.action === 'install') {
    say({stage: 'program', progress: 0});
    await W.installWhisperCpp({to: job.dir, version: job.version, printOutput: false});
    say({stage: 'model', progress: 0});
    await W.downloadWhisperModel({model: job.model, folder: job.models, printOutput: false, onProgress: (downloaded, total) => say({stage: 'model', progress: total ? downloaded / total : 0})});
    say({done: true});
    return;
  }
  for (const [i, f] of job.files.entries()) {
    say({stage: 'listening', progress: i / job.files.length, file: f.name});
    const r = await W.transcribe({inputPath: f.wav, whisperPath: job.dir, whisperCppVersion: job.version, model: job.model, modelFolder: job.models, tokenLevelTimestamps: true, printOutput: false, language: job.language || null, splitOnWord: true});
    const sec = (ms) => Math.round(ms) / 1000;
    const segments = r.transcription.map((s) => ({start: sec(s.offsets.from), end: sec(s.offsets.to), text: s.text.trim()})).filter((s) => s.text && !/^\[.*\]$/.test(s.text));
    const words = r.transcription.flatMap((s) => (s.tokens || []).filter((t) => t.text.trim() && !/^\[_/.test(t.text)).map((t) => [sec(t.offsets.from), sec(t.offsets.to), t.text]));
    fs.mkdirSync(path.dirname(f.out), {recursive: true});
    fs.writeFileSync(f.out, JSON.stringify({lang: r.result?.language || null, model: job.model, made: new Date().toISOString(), segments, words}));
    fs.rmSync(f.wav, {force: true});
    say({stage: 'listening', progress: (i + 1) / job.files.length, file: f.name, done1: f.out});
  }
  say({done: true});
}

main().catch((e) => {
  say({error: String(e?.message || e).slice(0, 1500)});
  process.exit(1);
});
