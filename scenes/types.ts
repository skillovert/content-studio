// Props the preview and thumbnail compositions get from Content Studio (server/preview.mjs).
// The plan is the approved plan with timings (server/plan-schema.mjs withTiming).

export type Tone = 'neutral' | 'bad' | 'good' | 'warn' | 'accent';
export type Item = {label: string; value: string; detail: string; tone: Tone; slot?: string}; // slot: a footage shot (F07-1)
export type GraphicType =
  | 'title' | 'presenter' | 'clippings' | 'quote' | 'timeline' | 'map' | 'bars' | 'number' | 'stamps' | 'cards'
  | 'terminal' | 'flow' | 'gauge' | 'table' | 'versions' | 'comment' | 'checklist' | 'help' | 'outro' | 'continue'
  | 'footage' | 'route' | 'roadtrip' | 'weather' | 'tiers' | 'phrases' | 'dosdonts' | 'rating'; // travel kit (scenes/travel.tsx)
// style: the brand's style for a travel graphic (server/cutouts.mjs); slot: a footage line's id (F07)
export type Graphic = {type: GraphicType; kicker: string; title: string; items: Item[]; lines: string[]; stamp: string; highlights: string[]; sourceId: string; style?: string; slot?: string};

export type Layout = 'voice' | 'face-full' | 'face-left' | 'face-right' | 'face-split' | 'face-circle' | 'face-corner' | 'face-frame' | 'face-phone';
export type Line = {vo: string; cue: string; start: number; end: number; layout?: Layout; faceFor?: number; graphic?: Graphic; speaker?: string};
export type Host = {name: string; gender: string};
export type PlanScene = {kind: string; title: string; visual: string; onScreen: string[]; lines: Line[]; sourceIds: string[]; start: number; end: number};
export type Source = {id: string; outlet: string; title: string; url: string; date: string; kind: string};
export type Quote = {speaker: string; text: string; sourceId: string; date: string};
export type Thumbnail = {jargonTitle: string; urduLine: string; urduLineRoman: string; lines?: {lang: string; text: string}[]; stamp: string; keyVisual: string};

export type Plan = {
  title: string;
  asOf: string;
  newsLabel: string;
  summary: string;
  card: {topic: string[]; cause: string[]};
  sources: Source[];
  quotes: Quote[];
  scenes: PlanScene[];
  thumbnail: Thumbnail;
  duration: number;
  kit?: string; // a kit plan (server/kits.mjs), e.g. travel-doc
  hosts?: Host[];
};

/** An extra visual the director (server/director.mjs) lays over the plan's graphic; times in seconds. */
export type Insert = {
  kind: 'ref' | 'place' | 'stat' | 'date' | 'footage' | 'quote' | 'doc' | 'keyword' | 'clip' | 'audio' | 'photo';
  style?: string; // the brand's style for this kind (server/cutouts.mjs)
  place?: 'full' | 'over'; // full screen for its moment (default), or on one side of the scene
  from: number;
  to: number;
  outlet?: string; date?: string; headline?: string; url?: string; // ref, footage
  places?: string[]; label?: string; // place ('*' = the whole world); label also for stat
  value?: string; source?: string; // stat
  text?: string; sub?: string; // date, keyword; text = the quote's words for quote
  speaker?: string; marks?: string[]; photo?: string; // quote
  others?: {outlet?: string; date?: string; headline?: string}[]; // ref: other sources (stack style)
  name?: string; // clip, audio, photo: the creator's file (url = where it plays from, label = its caption)
  start?: number; speed?: number; // clip: second of the file it starts from, and its speed (edited videos)
};

/** The creator's brand (server/brand.mjs brandProps); every field optional, studio look as fallback. */
export type Brand = {
  name?: string; handle?: string; role?: string; site?: string; tags?: string[]; label?: string;
  presenter?: {name?: string; photo?: string; side?: string};
  logo?: {main?: string; onColor?: string; light?: string};
  colors?: {accent?: string; brand?: string; highlight?: string; bg?: string; text?: string};
  fonts?: {head?: string; body?: string; mono?: string};
  thumbBox?: string; // key-visual box colour on the thumbnail
};

/** A stored theme (server/themes.mjs BUILTIN shape). */
export type Theme = {
  id: string; name: string; version: number;
  palette?: Record<string, string>;
  fonts?: {head?: string; body?: string; mono?: string};
  backdrop?: {kind?: 'grid' | 'paper' | 'plain'; glow?: number; vignette?: number; light?: boolean; columns?: number; halftone?: boolean; grain?: number};
  effect?: {crt?: boolean; scanlines?: number; fringe?: number; curve?: number; flicker?: number; roll?: boolean; grain?: number; letterbox?: number; warm?: number};
  transition?: 'glitch' | 'slide' | 'page' | 'tv' | 'dissolve';
};

export type PreviewProps = {
  code: string;
  playlist: string; // playlist name (from the taxonomy), top-right with the cyan dot
  label: string; // News label shown top-left, e.g. "Breaking News" ("" = none)
  cause: string; // lead Cause, outlined next to the label, e.g. "Explained"
  lang: string;
  bed: string | null; // file under studio/public, e.g. audio/beds/news-bed-a-urgent-breaking.wav
  fx: number;
  captions: boolean; // burn the voice-over text in (preview has no voice yet)
  voice?: string; // the full-length voice track (finish step's check video and finals)
  plan: Plan;
  inserts?: Insert[]; // the director's inserts
  footage?: Record<string, {url: string; kind: 'video' | 'image'}>;
  cameras?: Record<string, {url: string; trimIn: number}>; // final: the camera take per face line (key "scene-line"), trimIn = seconds cut from its start // footage shots that have a clip or photo (slot -> file)
  brand?: Brand; // the creator's profile
  theme?: Theme; // the locked theme of this video
  fontFiles?: {family: string; file: string; weight: string}[];
};

export const FPS = 30;
export const f = (sec: number) => Math.round(sec * FPS);

/** One graphic of an edited video, rendered alone (scenes/Piece.tsx, server/pieces.mjs). */
export type PieceProps = {
  piece: {graphic?: Graphic; insert?: Insert};
  dur: number; // seconds
  alpha: boolean; // see-through background (a cutout laid over the footage)
  playlist: string;
  brand?: Brand;
  theme?: Theme;
  fontFiles?: {family: string; file: string; weight: string}[];
};

/** The colour of one clip, worked out by public/mix.js gradeParts. */
export type EditGrade = {matrix: string; table: string; css: string; vignette: number};
/** One picture on an edited video's timeline (server/editrender.mjs); times in seconds. */
export type EditClip = {
  from: number; dur: number;
  kind: 'video' | 'image' | 'piece' | 'gap';
  src?: string; trimIn?: number; speed?: number;
  fit?: 'cover' | 'contain' | 'blur'; move?: 'slow' | 'still'; still?: string; // still: the blurred fill
  grade?: EditGrade | null;
  piece?: PieceProps['piece']; alpha?: boolean; // a graphic, cutout or clip in a frame
  pip?: boolean; // an Over clip shown as picture in picture
};
/** One sound: a clip's own sound, a voice-over take, music. duck = its level while someone talks (1 = stays). */
export type EditSound = {from: number; dur: number; src: string; trimIn: number; speed: number; volume: number; fadeIn: number; fadeOut: number; duck: number};
export type EditProps = {
  duration: number;
  main: EditClip[];
  over: EditClip[];
  sounds: EditSound[];
  talk: [number, number][];
  playlist: string;
  brand?: Brand;
  theme?: Theme;
  fontFiles?: {family: string; file: string; weight: string}[];
};
