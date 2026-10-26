// The creator's brand profile (brand/profile.json, via server/brand.mjs) laid over the studio's
// built-in look before anything renders. Studio components read COURSE, C and F, so changing those
// objects personalises the whole video and thumbnail without touching the studio's code.
import {getInputProps} from 'remotion';
import {COURSE} from '@studio/brand/course';
import {C, F} from '@studio/brand/theme';
import {continueRender, delayRender, staticFile} from 'remotion';
import type {Brand, Theme} from './types';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
const font = (name: string | undefined, rest: string) => (name ? `"${name}", ${rest}` : rest);
const fallback = (s: string) => s.split(',').slice(1).join(',').trim() || s;

/** The theme in use (server/themes.mjs): the brand's stored, versioned copy locked for this video. */
export const THEME = (getInputProps() as {theme?: Theme}).theme || null;
export const isLight = () => Boolean(THEME?.backdrop?.light);
const nativeCanvas = () => !THEME || THEME.id === 'dark'; // the brand's own bg/text belong to the dark look

/** Theme first (canvas, palette, fonts), then the brand (identity and accent colours) on top. */
export function applyTheme(t: Theme | null) {
  if (!t) return;
  Object.assign(C, t.palette || {});
  const f = t.fonts || {};
  Object.assign(F, {
    head: font(f.head, F.head),
    body: font(f.body, F.body),
    mono: font(f.mono, F.mono),
  });
}

export function applyBrand(b?: Brand | null) {
  if (!b) return;
  const c = b.colors || ({} as Brand['colors']);
  const set = <T extends object>(o: T, k: keyof T, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') (o as Record<string, unknown>)[k as string] = v;
  };
  set(COURSE, 'trainer', b.presenter?.name || b.name);
  set(COURSE, 'channelName', b.name);
  set(COURSE, 'role', b.role);
  set(COURSE, 'channel', b.handle);
  set(COURSE, 'site', b.site);
  if (b.tags?.length) COURSE.tags = b.tags;
  set(COURSE, 'photo', b.presenter?.photo);
  set(COURSE, 'name', b.label);
  if (c.accent) Object.assign(COURSE, {color: c.accent, colorRgb: rgb(c.accent)});
  if (c.brand) Object.assign(COURSE, {colorDeep: c.brand, thumbBg: c.brand});
  if (c.highlight) Object.assign(COURSE, {cyan: c.highlight});
  if (c.bg) Object.assign(COURSE, {black: c.bg});
  Object.assign(C, {
    course: COURSE.color,
    courseDeep: COURSE.colorDeep,
    cyan: COURSE.cyan,
    mint: COURSE.cyan,
    sky: COURSE.cyan,
    mintRgb: rgb(COURSE.cyan),
    skyRgb: rgb(COURSE.cyan),
    // the profile's bg/text are the dark-look colours; other themes keep their own canvas
    ...(c.bg && nativeCanvas() ? {bg0: c.bg, ink: c.bg} : {}),
    ...(c.text && nativeCanvas() ? {text: c.text} : {}),
  });
  // brand fonts, unless the theme brings its own for that role (a newspaper keeps its serif)
  const tf = THEME?.fonts || {};
  if (b.fonts) {
    Object.assign(F, {
      head: tf.head ? F.head : font(b.fonts.head, fallback(F.head)),
      body: tf.body ? F.body : font(b.fonts.body, fallback(F.body)),
      mono: tf.mono ? F.mono : font(b.fonts.mono, fallback(F.mono)),
    });
  }
}

/** Logo file in the renderer's public folder (onColor = for the brand-coloured title card); null = no
 * logo file, so a text logo with the brand's name is drawn instead. */
export const logoFile = (b: Brand | undefined, onColor: boolean): string | null =>
  (b ? (onColor ? b.logo?.onColor || b.logo?.main : b.logo?.main) : null) || null;

/** False without a presenter photo: scenes then show initials, never someone else's photo. */
export const hasPhoto = (b: Brand | undefined) => Boolean(b?.presenter?.photo);
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// Theme fonts (shipped with Content Studio, copied into studio/public/fonts/themes/ before a render).
const fontFiles = (getInputProps() as {fontFiles?: {family: string; file: string; weight: string}[]}).fontFiles || [];
if (typeof document !== 'undefined' && fontFiles.length) {
  const handle = delayRender('Loading theme fonts');
  Promise.all(fontFiles.map((x) => new FontFace(x.family, `url(${staticFile(x.file)}) format('woff2')`, {weight: x.weight}).load().then((f) => document.fonts.add(f)).catch(() => null)))
    .finally(() => continueRender(handle));
}

// Applied once when the bundle loads, so module-level styles see the creator's look too.
export const BRAND = (getInputProps() as {brand?: Brand}).brand;
applyTheme(THEME);
applyBrand(BRAND);
