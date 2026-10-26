// Themes: named looks laid over the brand colours (canvas palette, texture, fonts, screen effect,
// transitions). A brand never stores just a theme's name: adopting one writes a full, versioned copy
// to brand/themes/<id>/v<N>.json, and every video locks the id + version it was made with, so later
// changes to a theme only reach new videos (brand-setup skill).
import fs from 'node:fs';
import path from 'node:path';
import {APP_DIR, readJson, writeJson} from './workspace.mjs';

const PALETTE_DARK = {
  bg0: '#0A0A0A', bg1: '#141414', bg2: '#1B1B1B', card: '#141414', inset: '#1C1C1C', ink: '#0A0A0A',
  text: '#F7F7F7', muted: '#9A9A9A', line: 'rgba(255, 255, 255, 0.12)', fill: 'rgba(255, 255, 255, 0.06)', fill2: 'rgba(255, 255, 255, 0.14)',
  shadow: '0 1px 2px rgba(0,0,0,0.5), 0 18px 48px rgba(0,0,0,0.55)', red: '#FF4D4F', amber: '#F5B83D', green: '#35C986',
};

/** Theme fonts shipped in assets/fonts (copied to studio/public/fonts/themes/ before a render). */
export const THEME_FONTS = [
  ['Playfair Display', 'playfair-display-latin-400-normal.woff2', '400'],
  ['Playfair Display', 'playfair-display-latin-700-normal.woff2', '700'],
  ['Playfair Display', 'playfair-display-latin-900-normal.woff2', '900'],
  ['Source Serif 4', 'source-serif-4-latin-400-normal.woff2', '400'],
  ['Source Serif 4', 'source-serif-4-latin-600-normal.woff2', '600'],
  ['Source Serif 4', 'source-serif-4-latin-700-normal.woff2', '700'],
  ['VT323', 'vt323-latin-400-normal.woff2', '400'],
];

// version 1 of each built-in theme. Changing a built-in later means a new version here; brands that
// adopted an older version keep their stored copy until they choose to update.
export const BUILTIN = {
  dark: {
    id: 'dark', name: 'Dark newsroom', version: 1,
    about: 'Black canvas, faint moving grid, a glow of the brand colour, vignette, glitch cuts.',
    palette: PALETTE_DARK,
    fonts: {},
    backdrop: {kind: 'grid', glow: 0.22, vignette: 0.6},
    effect: {},
    transition: 'glitch',
  },
  light: {
    id: 'light', name: 'Light clean', version: 1,
    about: 'Off-white canvas, white cards, soft shadows, quiet cuts.',
    palette: {
      bg0: '#F3F1EC', bg1: '#FFFFFF', bg2: '#E9E6E0', card: '#FFFFFF', inset: '#ECE9E3', ink: '#15171A',
      text: '#15171A', muted: '#62656B', line: 'rgba(0, 0, 0, 0.12)', fill: 'rgba(0, 0, 0, 0.05)', fill2: 'rgba(0, 0, 0, 0.12)',
      shadow: '0 1px 2px rgba(0,0,0,0.08), 0 14px 36px rgba(0,0,0,0.12)', red: '#D92D30', amber: '#C98A0B', green: '#1E9E63',
    },
    fonts: {},
    backdrop: {kind: 'grid', glow: 0.12, vignette: 0.08, light: true},
    effect: {},
    transition: 'slide',
  },
  newspaper: {
    id: 'newspaper', name: 'Newspaper', version: 1,
    about: 'Cream paper, black ink, serif headlines, column rules, halftone dots, page-turn cuts.',
    palette: {
      bg0: '#EFE8D8', bg1: '#F7F2E6', bg2: '#E4DCC8', card: '#F7F2E6', inset: '#E8E0CD', ink: '#1B1A17',
      text: '#1B1A17', muted: '#5E584C', line: 'rgba(27, 26, 23, 0.22)', fill: 'rgba(27, 26, 23, 0.06)', fill2: 'rgba(27, 26, 23, 0.14)',
      shadow: '0 1px 1px rgba(40,30,10,0.12), 0 10px 26px rgba(40,30,10,0.16)', red: '#B3261E', amber: '#A86B00', green: '#2E7D4A',
    },
    fonts: {head: 'Playfair Display', body: 'Source Serif 4'},
    backdrop: {kind: 'paper', columns: 6, halftone: true, grain: 0.22, vignette: 0.12, light: true},
    effect: {},
    transition: 'page',
  },
  oldtv: {
    id: 'oldtv', name: 'Old TV', version: 1,
    about: 'Curved glass, scan lines, colour fringing, rounded vignette, rolling bar, channel-switch cuts.',
    palette: {...PALETTE_DARK, bg0: '#0C0F0C', bg1: '#141A15', card: '#141A15', inset: '#18201A', text: '#EAF5EA', muted: '#8FA393'},
    fonts: {mono: 'VT323'},
    backdrop: {kind: 'grid', glow: 0.16, vignette: 0.5},
    effect: {crt: true, scanlines: 0.22, fringe: 2, curve: 0.9, flicker: 0.04, roll: true},
    transition: 'tv',
  },
  documentary: {
    id: 'documentary', name: 'Documentary', version: 1,
    about: 'Warm dark canvas, film grain, letterbox bars, soft warm grade, slow dissolves.',
    palette: {...PALETTE_DARK, bg0: '#13100C', bg1: '#1C1813', card: '#1C1813', inset: '#221D17', text: '#F3EBDD', muted: '#A99D8A', amber: '#E0A84A'},
    fonts: {head: 'Source Serif 4'},
    backdrop: {kind: 'plain', glow: 0.18, vignette: 0.55},
    effect: {grain: 0.12, letterbox: 64, warm: 0.12},
    transition: 'dissolve',
  },
};

const dir = (root, id) => path.join(root, 'brand', 'themes', id);
const SAFE_ID = /^[a-z0-9-]{2,40}$/;

/** Versions of a theme the brand has stored. */
export function storedVersions(root, id) {
  const d = dir(root, id);
  if (!SAFE_ID.test(id) || !fs.existsSync(d)) return [];
  return fs.readdirSync(d).map((f) => /^v(\d+)\.json$/.exec(f)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b);
}

/** Every theme the app can offer: built-ins and the brand's own stored ones, with what is stored. */
export function listThemes(root) {
  const ids = new Set(Object.keys(BUILTIN));
  const base = path.join(root, 'brand', 'themes');
  if (fs.existsSync(base)) for (const id of fs.readdirSync(base)) if (SAFE_ID.test(id)) ids.add(id);
  return [...ids].map((id) => {
    const vs = storedVersions(root, id);
    const b = BUILTIN[id];
    const latest = vs.length ? loadTheme(root, id, vs.at(-1)) : b;
    return {id, name: latest.name, about: latest.about, builtin: Boolean(b), builtinVersion: b?.version || null, stored: vs, stills: stillsFor(root, id)};
  });
}

/** The brand's stored copy of a theme at a version (latest when none given). */
export function loadTheme(root, id, version) {
  const vs = storedVersions(root, id);
  const v = version || vs.at(-1);
  if (v && vs.includes(v)) return readJson(path.join(dir(root, id), `v${v}.json`));
  if (BUILTIN[id] && (!version || version === BUILTIN[id].version)) return BUILTIN[id];
  throw Object.assign(new Error(`Theme ${id} v${version} is not stored in brand/themes/`), {status: 404});
}

/**
 * Store a full copy of a theme for the brand (never just its name). With a built-in that changed since,
 * `update` stores the new built-in as the next version; old versions stay for the videos locked to them.
 */
export function adoptTheme(root, id, {update = false} = {}) {
  if (!SAFE_ID.test(id)) throw Object.assign(new Error('Unknown theme'), {status: 400});
  const vs = storedVersions(root, id);
  const b = BUILTIN[id];
  if (vs.length && !(update && b && readJson(path.join(dir(root, id), `v${vs.at(-1)}.json`)).source?.version !== b.version)) return {id, version: vs.at(-1)};
  if (!b) throw Object.assign(new Error(`Theme ${id} not found`), {status: 404});
  const version = (vs.at(-1) || 0) + 1;
  writeJson(path.join(dir(root, id), `v${version}.json`), {...b, version, source: {builtin: id, version: b.version}, stored: new Date().toISOString()});
  return {id, version};
}

export const stillsDir = (root, id, version) => path.join(root, 'brand', 'reference', 'themes', id, `v${version}`);

/** Reference stills of a theme version (brand/reference/themes/<id>/v<N>/*.jpg; latest stored version
 * when none given), relative to the channel folder. */
export function stillsFor(root, id, version) {
  if (!SAFE_ID.test(id)) return [];
  const v = version || storedVersions(root, id).at(-1) || BUILTIN[id]?.version;
  const d = stillsDir(root, id, v);
  if (!v || !fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().map((f) => `brand/reference/themes/${id}/v${v}/${f}`);
}

/** Copy the theme fonts into the studio's public folder (where the renderer serves files from). */
export function installThemeFonts(studio) {
  const to = path.join(studio, 'public', 'fonts', 'themes');
  fs.mkdirSync(to, {recursive: true});
  for (const [, file] of THEME_FONTS) {
    const src = path.join(APP_DIR, 'assets', 'fonts', file);
    const dst = path.join(to, file);
    if (fs.existsSync(src) && (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size)) fs.copyFileSync(src, dst);
  }
  return THEME_FONTS.map(([family, file, weight]) => ({family, file: `fonts/themes/${file}`, weight}));
}
