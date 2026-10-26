// Built-in look of Content Studio's renderer (engine/): neutral defaults that the creator's brand
// profile (brand/profile.json, laid on by scenes/brand.ts) replaces before anything renders.
export const COURSE = {
  kind: 'playlist' as const,
  name: 'News',
  nameLines: ['News'],
  brand: '',
  channelName: '',
  trainer: '',
  role: '',
  tags: [] as string[],
  channel: '',
  site: '',
  pricing: '',
  photo: '', // presenter photo under public/ (brand/<file>, copied from the channel folder before a render)
  color: '#D0353B', // accent on the dark canvas
  colorDeep: '#8E1B1F', // brand fill (labels, stinger, thumbnail canvas)
  colorRgb: '208,53,59',
  thumbBg: '#8E1B1F',
  thumbGrid: '#7E171B',
  cyan: '#34D6E0',
  black: '#0A0A0A',
  bed: 'audio/beds/news-bed-a-urgent-breaking.mp3',
  bedVolume: 0.1, // beds are mastered at -20 LUFS; 0.1 sits under SFX and voice
};

// Scenes are designed on a 1920x1080 canvas and fitted into the free area: below the
// top labels, leaving the bottom ~16% free for captions and the ds. bug.
export const BAR_H = 60;
export const TICKER_H = 50;
export const SAFE = {scale: 0.765, top: 80};
export const CAPTION_TOP = SAFE.top + 1080 * SAFE.scale; // ≈ 906px of 1080
