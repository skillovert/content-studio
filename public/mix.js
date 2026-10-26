// Colour and mix rules of an edited video, shared by the editor (public/edit.js), the server (server/edit.mjs)
// and the final render, so what the creator sees while editing is what the final shows.
//   grade: {look?, exposure, contrast, saturation, temperature, tint, shadows, highlights, fade, vignette}
//   exposure -2..2 stops; the others -1..1 (fade and vignette 0..1). Drawn as an SVG colour matrix and tone curve
//   plus CSS brightness, contrast and saturation, which the browser and Remotion's Chrome both apply.

export const GRADE_KEYS = {exposure: [-2, 2], contrast: [-1, 1], saturation: [-1, 1], temperature: [-1, 1], tint: [-1, 1], shadows: [-1, 1], highlights: [-1, 1], fade: [0, 1], vignette: [0, 1]};

/** Ready-made looks: a start the creator can tune. */
export const LOOKS = {
  natural: {name: 'Natural', grade: {}},
  warm: {name: 'Warm', grade: {temperature: 0.35, saturation: 0.1, contrast: 0.08}},
  golden: {name: 'Golden hour', grade: {temperature: 0.55, tint: 0.08, exposure: 0.1, saturation: 0.15, fade: 0.08}},
  cool: {name: 'Cool mountains', grade: {temperature: -0.35, saturation: 0.05, contrast: 0.1, highlights: -0.1}},
  vivid: {name: 'Vivid', grade: {saturation: 0.35, contrast: 0.18, shadows: 0.05}},
  film: {name: 'Soft film', grade: {fade: 0.35, contrast: -0.08, saturation: -0.15, temperature: 0.12}},
  moody: {name: 'Moody', grade: {exposure: -0.2, contrast: 0.25, saturation: -0.25, shadows: -0.3, vignette: 0.45}},
  mono: {name: 'Black and white', grade: {saturation: -1, contrast: 0.2}},
};

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, Number(v) || 0));
const r2 = (x) => Math.round(x * 100) / 100;

/** A clean grade, or null when it changes nothing. */
export function cleanGrade(g) {
  if (!g || typeof g !== 'object') return null;
  const out = {};
  if (LOOKS[g.look]) out.look = g.look;
  for (const [k, range] of Object.entries(GRADE_KEYS)) {
    const v = r2(clamp(g[k], range));
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** The SVG filter parts and the CSS of a grade: {matrix, table, css, vignette}. */
export function gradeParts(g) {
  const x = {...Object.fromEntries(Object.keys(GRADE_KEYS).map((k) => [k, 0])), ...(g || {})};
  const t = x.temperature;
  const n = x.tint;
  const lift = 0.08 * x.fade;
  const span = 1 - 0.12 * x.fade;
  const rs = span * (1 + 0.12 * t + 0.04 * n);
  const gs = span * (1 - 0.08 * n);
  const bs = span * (1 - 0.14 * t + 0.04 * n);
  const matrix = [rs, 0, 0, 0, lift, 0, gs, 0, 0, lift, 0, 0, bs, 0, lift, 0, 0, 0, 1, 0].map((v) => Math.round(v * 1000) / 1000).join(' ');
  // tone curve: shadows lift or crush the low quarter, highlights the high quarter
  const table = [0, 0.25 + 0.09 * x.shadows, 0.5 + 0.03 * (x.shadows + x.highlights), 0.75 + 0.09 * x.highlights, 1].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000).join(' ');
  const css = [`brightness(${r2(2 ** x.exposure)})`, `contrast(${r2(1 + x.contrast * 0.6)})`, `saturate(${r2(1 + x.saturation)})`].join(' ');
  return {matrix, table, css, vignette: x.vignette};
}

export const isPlain = (g) => !cleanGrade(g);

// ---------- music under the voices ----------
export const DUCK = {off: 1, light: 0.55, strong: 0.3};
const RAMP_IN = 0.3;
const RAMP_OUT = 0.5;

/** Stretches of the timeline where someone talks: voice-over (recorded or still a line) and clips that keep their sound. */
export function talkIntervals(edit, assets, itemsOf) {
  const out = [];
  for (const it of itemsOf(edit, 'voice')) out.push([it.start, it.end]);
  for (const k of ['main', 'over']) {
    for (const it of itemsOf(edit, k)) {
      const c = it.c;
      const a = c.asset ? assets.get(c.asset) : null;
      if (!a || c.kind !== 'video' || c.mute || (c.volume ?? 1) < 0.5) continue;
      const sp = c.speed || 1;
      for (const [s, e] of a.sound || []) {
        const s1 = Math.max(s, c.in);
        const e1 = Math.min(e, c.out);
        if (e1 > s1) out.push([it.start + (s1 - c.in) / sp, it.start + (e1 - c.in) / sp]);
      }
    }
  }
  return out.sort((p, q) => p[0] - q[0]);
}

/** The music's level at time t: lowered while someone talks, with soft ramps. */
export function duckAt(t, intervals, level) {
  if (level >= 1) return 1;
  let k = 0;
  for (const [s, e] of intervals) {
    if (s - RAMP_IN > t) break;
    if (t > e + RAMP_OUT) continue;
    k = Math.max(k, t < s ? (t - (s - RAMP_IN)) / RAMP_IN : t > e ? 1 - (t - e) / RAMP_OUT : 1);
    if (k >= 1) break;
  }
  return 1 - (1 - level) * k;
}
