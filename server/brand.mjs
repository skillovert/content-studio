// The creator's brand profile (brand/profile.json in the channel folder): the machine-readable side
// of BRAND-GUIDE.md that tools read to look and behave like this creator without code changes
// (brand-setup skill). Missing fields fall back to DEFAULTS, so an empty or partial file works.
import fs from 'node:fs';
import path from 'node:path';
import {readJson, writeJson} from './workspace.mjs';
import {cleanCutouts, cleanPlaces} from './cutouts.mjs';

export const DEFAULTS = {
  name: '', // channel name as written on screen
  handle: '', // @username (never used as the name)
  role: '',
  site: '',
  tags: [],
  presenter: {name: '', photo: '', side: 'left'}, // photo: file in the channel folder (brand/presenter.png), copied to the renderer
  logo: {main: '', onColor: '', light: ''}, // files in the channel folder (brand/logo.svg), copied to the renderer
  colors: {
    accent: '#D0353B', // readable accent on the dark canvas
    brand: '#8E1B1F', // brand fill (labels, stinger, thumbnail canvas)
    highlight: '#34D6E0', // dot, highlights, waveform
    bg: '#0A0A0A',
    text: '#F7F7F7',
  },
  fonts: {head: 'Geist', body: 'Inter', mono: 'Geist Mono'},
  chrome: {label: 'Breaking News'}, // fallback top-left label when a plan has none
  thumbnail: {box: '', stamp: 'ask'}, // box: key-visual box colour ('' = the brand's dark colour); stamp: 'ask' per video, or 'none'
  languages: {voice: 'ur-Latn', subtitles: ['ur-Latn', 'ur-Arab'], dubs: []},
  sound: {defaultBed: 'a', bedVolume: 0.1, fxWithVoice: 0.6},
  output: {preview: '540p', finals: ['1080p', '2k', '4k'], fps: 30},
  theme: {default: 'dark'}, // default theme id (server/themes.mjs); its stored copy lives in brand/themes/<id>/
  scheme: '', // older profiles: 'light' meant the light theme
  face: 'ask', // creator on camera: 'ask' per video, 'always' or 'never' (graphics only)
  cutouts: {}, // cutout styles the brand uses per category (server/cutouts.mjs); a missing category = every style
  cutoutPlace: {}, // per category "full" (default, the whole screen) or "over" (on one side of the scene)
  captionsInVideo: false, // owner rule (24 Oct 2026): no captions burnt into videos; SRTs are separate files
  narrative: {basis: 'ask', notes: ''}, // 'own' | 'mainstream' | 'ask'
  monetization: {paths: [], disclosures: []},
};

const HEX = /^#[0-9a-f]{6}$/i;
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
function merge(base, over) {
  if (!isObj(over)) return structuredClone(base);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) out[k] = isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

export const profileFile = (root) => path.join(root, 'brand', 'profile.json');

export function loadProfile(root) {
  const file = profileFile(root);
  return {...merge(DEFAULTS, readJson(file, {})), exists: fs.existsSync(file)};
}

export function profileProblems(p) {
  const out = [];
  if (!String(p.name || '').trim()) out.push('Channel name is empty');
  for (const [k, v] of Object.entries(p.colors || {})) if (!HEX.test(v)) out.push(`Colour "${k}" must look like #1A2B3C`);
  if (!/^[a-z0-9-]{2,40}$/.test(p.theme?.default || '')) out.push('Pick a theme');
  if (!['ask', 'always', 'never'].includes(p.face)) out.push('On camera must be ask, always or never');
  if (p.thumbnail?.box && !HEX.test(p.thumbnail.box)) out.push('Thumbnail box colour must look like #1A2B3C');
  if (!['own', 'mainstream', 'ask'].includes(p.narrative?.basis)) out.push('Research basis must be own, mainstream or ask');
  return out;
}

export function saveProfile(root, body) {
  const {exists, ...clean} = merge(DEFAULTS, body);
  clean.cutouts = cleanCutouts(clean.cutouts);
  clean.cutoutPlace = cleanPlaces(clean.cutoutPlace);
  const problems = profileProblems(clean);
  if (problems.length) throw Object.assign(new Error(problems.join('; ')), {status: 400});
  writeJson(profileFile(root), clean);
  return loadProfile(root);
}

/** The brand's default theme id (older profiles said scheme: 'light'). */
export const defaultThemeId = (p) => (p.scheme === 'light' && (!p.theme?.default || p.theme.default === 'dark') ? 'light' : p.theme?.default || 'dark');

// Contrast (WCAG): accents are graphics and large text, so 3:1 against the canvas is the floor.
const MIN_CONTRAST = 3;
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
function toHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** The same hue, darkened (light canvas) or lightened (dark canvas) just until it reads on every
 * background given. Colours that already read are returned unchanged. */
export function readableOn(hex, backgrounds, min = MIN_CONTRAST) {
  const bgs = backgrounds.filter((b) => HEX.test(b || ''));
  if (!HEX.test(hex || '') || !bgs.length) return hex;
  const worst = () => Math.min(...bgs.map((b) => contrast(out, b)));
  let out = hex;
  if (worst() >= min) return hex;
  const [h, s, l] = toHsl(hex);
  const darker = bgs.reduce((t, b) => t + lum(b), 0) / bgs.length > 0.18;
  for (let step = 1; step <= 50; step++) {
    out = fromHsl(h, s, Math.min(1, Math.max(0, darker ? l - step * 0.02 : l + step * 0.02)));
    if (worst() >= min) return out;
  }
  return out;
}

/** What the video scenes need (scenes/brand.ts applies it over the studio's built-in look). With the
 * video's theme, the accent and highlight are adjusted to read on that theme's canvas and cards. */
export function brandProps(p, theme = null) {
  const pal = theme?.palette || {};
  const canvas = !theme || theme.id === 'dark' ? [p.colors?.bg, pal.card] : [pal.bg0, pal.card];
  const colors = {...p.colors};
  for (const k of ['accent', 'highlight']) colors[k] = readableOn(colors[k], canvas);
  return {
    name: p.name,
    handle: p.handle,
    role: p.role,
    site: p.site,
    tags: p.tags,
    presenter: p.presenter,
    logo: p.logo,
    colors,
    fonts: p.fonts,
    label: p.chrome?.label || '',
    thumbBox: p.thumbnail?.box || '',
  };
}
