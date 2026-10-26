// Brand tokens: news dark newsroom look (black canvas, dark cards, red + cyan).
// The course identity colour lives in COURSE.color (src/brand/course.ts); `C.course`
// mirrors it so scenes can use it. Every lesson picks these up.
import {COURSE} from './course';

export const C = {
  bg0: '#0A0A0A', // canvas (black)
  bg1: '#141414', // cards
  bg2: '#1B1B1B', // inset / grey panels
  course: COURSE.color,
  courseDeep: COURSE.colorDeep,
  green: '#35C986', // "fixed / ok"
  greenDeep: '#5EE0A4',
  mint: '#34D6E0', // keys / secondary accent (DS cyan dot)
  sky: '#34D6E0',
  cyan: '#34D6E0',
  text: '#F7F7F7',
  muted: '#9A9A9A',
  line: 'rgba(255, 255, 255, 0.12)',
  card: '#141414',
  fill: 'rgba(255, 255, 255, 0.06)', // subtle tinted surface (rows, bars)
  fill2: 'rgba(255, 255, 255, 0.14)',
  inset: '#1C1C1C', // code panes, url bars, log panes
  onSolid: '#FFFFFF', // text/icons on a solid accent fill
  ink: '#0A0A0A',
  red: '#FF4D4F', // danger (brighter than the brand red so it reads on black)
  amber: '#F5B83D',
  blue: '#4D8DFF',
  purple: '#A68BFF',
  greenRgb: '53,201,134',
  mintRgb: '52,214,224',
  skyRgb: '52,214,224',
  shadow: '0 1px 2px rgba(0,0,0,0.5), 0 18px 48px rgba(0,0,0,0.55)',
};

export const F = {
  head: '"Geist", "Inter", "Noto Sans Devanagari", sans-serif',
  body: '"Inter", "Geist", "Noto Sans Devanagari", sans-serif',
  mono: '"Geist Mono", ui-monospace, monospace',
  urdu: '"Noto Nastaliq Urdu", "Inter", serif',
  arabic: '"Noto Sans Arabic", "Inter", sans-serif',
  bengali: '"Noto Sans Bengali", "Inter", sans-serif',
};

export const FPS = 30;
export const W = 1920;
export const H = 1080;
