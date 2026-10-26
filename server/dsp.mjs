// Sound cleanup in plain JavaScript (the renderer's bundled ffmpeg has no noise or EQ filters): spectral noise
// gating like a "noise reduction" effect. The noise is learnt from the quietest moments of the clip (wind, traffic,
// fan hum, hiss), then every moment keeps what stands above it; rumble under 80 Hz goes too.
const N = 2048; // window (about 43 ms at 48 kHz)
const HOP = N / 4;

/** In-place radix-2 FFT of (re, im); inverse when inv. */
export function fft(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n);
}

export const STRENGTH = {light: {over: 1.6, floor: 0.3}, medium: {over: 2.6, floor: 0.16}, strong: {over: 4, floor: 0.08}};

/** Samples (Float32Array, mono) -> cleaned samples of the same length. */
export function denoise(x, rate, strength = 'medium') {
  const {over, floor} = STRENGTH[strength] || STRENGTH.medium;
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const frames = Math.max(1, Math.ceil((x.length + N) / HOP));
  const bins = N / 2 + 1;
  const pad = (i) => (i >= 0 && i < x.length ? x[i] : 0);
  // 1. the spectrum of every frame, and its energy
  const mags = new Float32Array(frames * bins);
  const energy = new Float64Array(frames);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    const s = f * HOP - N;
    for (let i = 0; i < N; i++) (re[i] = pad(s + i) * win[i]), (im[i] = 0);
    fft(re, im);
    for (let k = 0; k < bins; k++) {
      const m = Math.hypot(re[k], im[k]);
      mags[f * bins + k] = m;
      energy[f] += m * m;
    }
  }
  // 2. the noise: the average spectrum of the quietest tenth of the frames that are not silent
  const order = [...energy.keys()].filter((f) => energy[f] > 1e-9).sort((a, b) => energy[a] - energy[b]);
  const quiet = order.slice(0, Math.max(1, Math.floor(order.length * 0.1)));
  const noise = new Float64Array(bins);
  for (const f of quiet) for (let k = 0; k < bins; k++) noise[k] += mags[f * bins + k] / quiet.length;
  const lowCut = Math.round((80 / rate) * N);
  // 3. a gain per frame and bin (smoothed over time so it does not warble), then back to sound
  const out = new Float64Array(x.length + 2 * N);
  const norm = new Float64Array(x.length + 2 * N);
  const prev = new Float64Array(bins).fill(1);
  for (let f = 0; f < frames; f++) {
    const s = f * HOP - N;
    for (let i = 0; i < N; i++) (re[i] = pad(s + i) * win[i]), (im[i] = 0);
    fft(re, im);
    for (let k = 0; k < bins; k++) {
      const m = mags[f * bins + k];
      let g = k < lowCut ? 0 : m > 0 ? Math.max(floor, 1 - (over * noise[k] * noise[k]) / (m * m)) : floor;
      g = g > prev[k] ? 0.5 * prev[k] + 0.5 * g : 0.8 * prev[k] + 0.2 * g; // quick to open, slow to close
      prev[k] = g;
      re[k] *= g;
      im[k] *= g;
      if (k > 0 && k < N / 2) (re[N - k] = re[k]), (im[N - k] = -im[k]);
    }
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      out[s + N + i] += re[i] * win[i];
      norm[s + N + i] += win[i] * win[i];
    }
  }
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const w = norm[i + N];
    y[i] = Math.max(-1, Math.min(1, w > 1e-6 ? out[i + N] / w : 0));
  }
  return y;
}
