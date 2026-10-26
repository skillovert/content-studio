// Face moments (creator-on-camera videos): each line's layout says where the creator is at the start
// of the line, and faceFor how long (0 = the whole line). Then the face leaves with a transition
// and the graphic takes the whole screen while she reads the rest off camera. In the preview the
// face is a marked empty slot with the line to say; the recorded camera takes fill the same slots.
import React from 'react';
import {AbsoluteFill, interpolate, OffthreadVideo, random, Sequence, useCurrentFrame} from 'remotion';
import {Video} from 'lucide-react';
import {C, F} from '@studio/brand/theme';
import {COURSE} from '@studio/brand/course';
import type {Layout, Plan} from './types';
import {f, FPS} from './types';

type FaceLayout = Exclude<Layout, 'voice'>;
/** How the face leaves for the graphic; picked per line so the video does not repeat one move. */
export const EXITS = ['iris', 'push', 'shrink', 'wipe', 'glitch'] as const;
type Exit = (typeof EXITS)[number];
export type FaceLine = {key: string; layout: FaceLayout; from: number; to: number; secs: number; vo: string; exit: Exit; who: string};

const IN = 8;
const OUT = 12;

export const faceLines = (plan: Plan): FaceLine[] => {
  let n = 0;
  // who is on camera: the line's speaker, or every host in the studio shot
  const everyone = (plan.hosts || []).map((h) => h.name).join(' & ');
  return plan.scenes.flatMap((s, si) =>
    s.lines.flatMap((l, li) => {
      const layout = (l.layout || 'voice') as Layout;
      if (layout === 'voice') return [];
      const start = f(l.start);
      const end = f(l.end) + 4;
      const secs = l.faceFor && l.faceFor > 0 ? Math.min(l.faceFor, l.end - l.start) : l.end - l.start;
      const who = layout === 'studio' || l.speaker === 'all' ? everyone : l.speaker || '';
      return [{key: `${si}-${li}`, layout, from: start - 4, to: Math.min(end, start + f(secs)), secs, vo: l.vo, exit: EXITS[n++ % EXITS.length], who}];
    }),
  );
};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const current = (frame: number, lines: FaceLine[]) => lines.find((l) => frame >= l.from - IN && frame < l.to + OUT);
/** 0 → 1 coming in, 1 while up, then 1 → 0 over the exit. */
const enter = (frame: number, l: FaceLine) => interpolate(frame, [l.from - IN, l.from], [0, 1], clamp);
const leave = (frame: number, l: FaceLine) => interpolate(frame, [l.to - 2, l.to + OUT - 2], [0, 1], clamp);

/** The graphics make room for side and split layouts: smaller and on the other half. */
const SHIFT: Partial<Record<FaceLayout, [number, number]>> = {
  'face-left': [330, 0.6], 'face-right': [-330, 0.6], 'face-split': [480, 0.5], 'face-phone': [-300, 0.62],
};
export const FaceShift: React.FC<{lines: FaceLine[]; children: React.ReactNode}> = ({lines, children}) => {
  const frame = useCurrentFrame();
  const l = current(frame, lines);
  const s = l && SHIFT[l.layout];
  const k = s ? enter(frame, l!) * (1 - leave(frame, l!)) : 0;
  return <AbsoluteFill style={{transform: k ? `translateX(${s![0] * k}px) scale(${1 - (1 - s![1]) * k})` : undefined}}>{children}</AbsoluteFill>;
};

/** Where the face goes, per layout (1920x1080). */
export const BOX: Record<FaceLayout, React.CSSProperties & {left?: number; top?: number; width: number; height: number}> = {
  'face-full': {left: 0, top: 0, width: 1920, height: 1080},
  studio: {left: 0, top: 0, width: 1920, height: 1080},
  'face-left': {left: 64, top: 130, width: 600, height: 820},
  'face-right': {left: 1256, top: 130, width: 600, height: 820},
  'face-split': {left: 0, top: 0, width: 960, height: 1080},
  'face-circle': {left: 1480, top: 600, width: 360, height: 360},
  'face-corner': {left: 1416, top: 120, width: 440, height: 248},
  'face-frame': {left: 1270, top: 550, width: 540, height: 400},
  'face-phone': {left: 1380, top: 110, width: 430, height: 860},
};
const RADIUS: Record<FaceLayout, number> = {'face-full': 0, studio: 0, 'face-left': 18, 'face-right': 18, 'face-split': 0, 'face-circle': 999, 'face-corner': 12, 'face-frame': 26, 'face-phone': 48};

/** The exit move applied to the face box (k = 0 → 1). */
function exitStyle(exit: Exit, k: number, box: {left?: number; top?: number; width: number; height: number}, key: string): React.CSSProperties {
  if (!k) return {};
  switch (exit) {
    case 'iris': // closes to a point in the middle
      return {clipPath: `circle(${(1 - k) * 75}% at 50% 50%)`};
    case 'push': // slides off the nearer edge
      return {transform: `translateX(${((box.left || 0) + box.width / 2 < 960 ? -1 : 1) * k * (box.width + 200)}px)`};
    case 'shrink': // shrinks into the presenter badge, bottom-left
      return {transform: `translate(${(64 - (box.left || 0)) * k}px, ${(1040 - (box.top || 0) - box.height) * k}px) scale(${1 - 0.92 * k})`, transformOrigin: '0% 100%', opacity: 1 - k * 0.6};
    case 'wipe': // a diagonal wipe
      return {clipPath: `polygon(${k * 140}% 0, 100% 0, 100% 100%, ${k * 140 - 40}% 100%)`};
    case 'glitch': { // jitters and drops out
      const j = random(`${key}-${Math.round(k * 12)}`);
      return {transform: `translateX(${(j - 0.5) * 60 * k}px)`, opacity: k > 0.7 ? 0 : 1 - k * 0.3 * j, filter: `hue-rotate(${j * 90 * k}deg) saturate(${1 + 2 * k})`};
    }
  }
}

/** A brand-coloured streak that sweeps across with the wipe exit, so the cut feels designed. */
const WipeBar: React.FC<{k: number}> = ({k}) =>
  k > 0 && k < 1 ? <div style={{position: 'absolute', top: -200, bottom: -200, left: `${k * 140 - 22}%`, width: 70, background: COURSE.color, transform: 'skewX(-18deg)', boxShadow: `0 0 40px ${COURSE.color}`}} /> : null;

/** An empty slot: dashed outline, camera mark, the layout, the seconds on camera and the line. */
const Slot: React.FC<{l: FaceLine}> = ({l}) => {
  const frame = useCurrentFrame();
  const full = l.layout === 'face-full' || l.layout === 'face-split' || l.layout === 'studio';
  const small = l.layout === 'face-circle' || l.layout === 'face-corner';
  const box = BOX[l.layout];
  const kIn = enter(frame, l);
  const kOut = leave(frame, l);
  const r = RADIUS[l.layout];
  return (
    <div style={{position: 'absolute', ...box, opacity: kIn, ...(kIn < 1 ? {transform: `scale(${0.94 + 0.06 * kIn})`} : {}), ...exitStyle(l.exit, kOut, box, l.key)}}>
      {l.layout === 'face-frame' ? <div style={{position: 'absolute', inset: -26, borderRadius: 34, background: 'linear-gradient(160deg, #5A3B22, #2E1D10)', boxShadow: '0 20px 50px rgba(0,0,0,0.55)'}} /> : null}
      {l.layout === 'face-phone' ? <div style={{position: 'absolute', inset: -16, borderRadius: 62, background: '#111', border: '3px solid #333', boxShadow: '0 20px 50px rgba(0,0,0,0.55)'}} /> : null}
      <div style={{position: 'absolute', inset: 0, borderRadius: r, overflow: 'hidden', background: full ? C.bg1 : 'rgba(10,10,10,0.78)', border: full ? 'none' : `3px dashed ${COURSE.cyan}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: small ? 6 : full ? 22 : 12, padding: small ? '0 24px' : full ? '0 120px' : '0 32px', textAlign: 'center', whiteSpace: 'normal'}}>
        {full ? <div style={{position: 'absolute', inset: 36, border: `3px dashed ${COURSE.cyan}`, borderRadius: 18}} /> : null}
        <Video size={small ? 40 : full ? 88 : 56} color={COURSE.cyan} strokeWidth={1.8} />
        <div style={{fontFamily: F.mono, fontWeight: 700, fontSize: small ? 18 : full ? 30 : 22, letterSpacing: '0.14em', color: COURSE.cyan}}>{l.layout === 'studio' ? `STUDIO${l.who ? ` · ${l.who.toUpperCase()}` : ''} · ${l.secs.toFixed(0)}S` : `${l.who ? l.who.toUpperCase() : 'YOUR FACE'} · ${l.layout.replace('face-', '').toUpperCase()} · ${l.secs.toFixed(0)}S`}</div>
        {small ? null : <div style={{fontFamily: F.body, fontWeight: 600, fontSize: full ? 36 : 24, lineHeight: 1.35, color: full ? C.text : '#FFFFFF', maxWidth: full ? 1100 : 520}}>{l.vo.replace(/"/g, '')}</div>}
      </div>
    </div>
  );
};

/** The recorded camera take in the slot's box, with the same entrance and exit. Its first frame after the
 * trim lines up with the line's start, as the voice does; its own sound is muted (the voice track carries it). */
const Camera: React.FC<{l: FaceLine; cam: {url: string; trimIn: number}}> = ({l, cam}) => {
  const frame = useCurrentFrame();
  const box = BOX[l.layout];
  const kIn = enter(frame, l);
  const kOut = leave(frame, l);
  const r = RADIUS[l.layout];
  const from = l.from - IN;
  const lineStart = l.from + 4;
  return (
    <div style={{position: 'absolute', ...box, opacity: kIn, ...(kIn < 1 ? {transform: `scale(${0.94 + 0.06 * kIn})`} : {}), ...exitStyle(l.exit, kOut, box, l.key)}}>
      {l.layout === 'face-frame' ? <div style={{position: 'absolute', inset: -26, borderRadius: 34, background: 'linear-gradient(160deg, #5A3B22, #2E1D10)', boxShadow: '0 20px 50px rgba(0,0,0,0.55)'}} /> : null}
      {l.layout === 'face-phone' ? <div style={{position: 'absolute', inset: -16, borderRadius: 62, background: '#111', border: '3px solid #333', boxShadow: '0 20px 50px rgba(0,0,0,0.55)'}} /> : null}
      <div style={{position: 'absolute', inset: 0, borderRadius: r, overflow: 'hidden', background: '#000'}}>
        <Sequence from={from} layout="none">
          <OffthreadVideo src={cam.url} muted startFrom={Math.max(0, Math.round(cam.trimIn * FPS) - (lineStart - from))} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </Sequence>
      </div>
    </div>
  );
};

/** Over the graphics (under the chrome): the camera take (finals) or the slot for the current face line, and its exit. */
export const FaceSlots: React.FC<{lines: FaceLine[]; cameras?: Record<string, {url: string; trimIn: number}>}> = ({lines, cameras}) => {
  const frame = useCurrentFrame();
  const l = current(frame, lines);
  if (!l) return null;
  const cam = cameras?.[l.key];
  return (
    <AbsoluteFill style={{pointerEvents: 'none', overflow: 'hidden'}}>
      {cam ? <Camera key={l.key} l={l} cam={cam} /> : <Slot l={l} />}
      {l.exit === 'wipe' ? <WipeBar k={leave(frame, l)} /> : null}
    </AbsoluteFill>
  );
};
