// 16-bit PCM WAV read/write (takes from the browser, voice tracks, styled audio clips).
import fs from 'node:fs';
import path from 'node:path';

export const RATE = 48000;
const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});

export function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw fail(`${path.basename(file)} is not a WAV file`);
  let o = 12;
  let fmt = null;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = {format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22)};
    if (id === 'data' && fmt) {
      if (fmt.format !== 1 || fmt.bits !== 16) throw fail(`${path.basename(file)}: only 16-bit PCM WAV is supported`);
      const n = Math.floor(Math.min(size, b.length - o - 8) / 2 / fmt.channels);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let ch = 0; ch < fmt.channels; ch++) s += b.readInt16LE(o + 8 + (i * fmt.channels + ch) * 2);
        out[i] = s / fmt.channels / 32768;
      }
      return {rate: fmt.rate, data: out};
    }
    o += 8 + size + (size % 2);
  }
  throw fail(`${path.basename(file)} has no audio data`);
}
export function writeWav(file, data, rate = RATE) {
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + data.length * 2, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), 44 + i * 2);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, b);
}
