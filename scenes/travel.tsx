// Travel and places graphics (the Remote Documentary kit, server/kits.mjs). Each graphic comes in
// several styles; the brand keeps the ones it likes (server/cutouts.mjs travel categories) and the
// video rotates through them, so a playlist looks the same every time. Colours come from the brand
// (COURSE, tuned per theme) and the theme palette (C).
//   footage   full-screen licensed B-roll (the creator's clips, Pexels, or a marked placeholder) + a place label
//   map       zoom from the world into countries and places ("lat, lon"), in a map palette
//   route     a journey between stops: flight arcs, train line, road, dotted trail
//   roadtrip  a trip inside a region on an illustrated map (scenes/roadtrip.tsx)
//   weather   the 12 months: chart, forecast app, season calendar
//   tiers     price tiers: columns, receipts, price tags
//   phrases   local phrases: flashcards, speech bubbles, translator app
//   dosdonts  manners and scams: cards, road signs, stamped list
//   rating    the verdict: scorecard, stars, bars
import React from 'react';
import {AbsoluteFill, Img, interpolate, OffthreadVideo, random, Sequence, useCurrentFrame} from 'remotion';
import * as L from 'lucide-react';
import {C, F} from '@studio/brand/theme';
import {COURSE} from '@studio/brand/course';
import {Sfx, sp} from '@studio/components/ui';
import {ramp} from '@studio/components/dev';
import {MAP, centroid, fadeIn} from '@studio/components/footage';
import type {Graphic, Item, Tone} from './types';
import {RoadTripView} from './roadtrip';

export type FootageFile = {url: string; kind: 'video' | 'image'};
export type TravelCtx = {footage?: Record<string, FootageFile>};
type TV = React.FC<{g: Graphic; at: number[]; dur: number; ctx: TravelCtx}>;

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const TONE: Record<Tone, string> = {neutral: '#8A8A8A', bad: C.red, good: C.green, warn: C.amber, accent: COURSE.cyan};
const toneOf = (it: Item, fb: Tone = 'accent') => TONE[it.tone || fb] ?? TONE[fb];
const itemAt = (at: number[], j: number) => at[Math.min(j, at.length - 1)] ?? 0;
const pop = (p: number, dy = 30): React.CSSProperties => ({opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * dy}px) scale(${0.96 + 0.04 * p})`});

const Kicker: React.FC<{text: string; color?: string}> = ({text, color = COURSE.colorDeep}) =>
  text ? <span style={{alignSelf: 'flex-start', padding: '6px 16px', background: color, color: '#FFFFFF', fontFamily: F.mono, fontWeight: 700, fontSize: 24, letterSpacing: '0.14em', textTransform: 'uppercase'}}>{text}</span> : null;
const Head: React.FC<{g: Graphic; at?: number; color?: string; size?: number}> = ({g, at = 0, color = C.text, size = 66}) => {
  const frame = useCurrentFrame();
  const p = sp(frame, at);
  if (!g.kicker && !g.title) return null;
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 12, ...pop(p, 20)}}>
      <Kicker text={g.kicker} />
      {g.title ? <div style={{fontFamily: F.head, fontWeight: 800, fontSize: size, lineHeight: 1.05, color, letterSpacing: '-0.02em', whiteSpace: 'normal'}}>{g.title}</div> : null}
    </div>
  );
};

/* ================================================================== footage */

/** A landscape drawn in the brand's tints: what an empty footage slot shows until a clip fills it. */
const Scenic: React.FC<{seed: string; len: number}> = ({seed, len}) => {
  const frame = useCurrentFrame();
  const t = frame / Math.max(1, len);
  const r = (k: string) => random(`${seed}-${k}`);
  const ridge = (base: number, amp: number, k: string) => {
    const pts = Array.from({length: 13}, (_, i) => `${i * 170},${base - amp * (0.3 + 0.7 * r(`${k}${i}`))}`);
    return `M0,1080 L${pts.join(' L')} L1920,1080 Z`;
  };
  const sunX = 400 + r('sx') * 1100;
  return (
    <AbsoluteFill style={{background: `linear-gradient(180deg, ${C.bg2} 0%, rgba(${COURSE.colorRgb},0.55) 55%, ${C.bg1} 100%)`, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: sunX - 120, top: 260 - 40 * t, width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, rgba(255,236,200,0.9), rgba(${COURSE.colorRgb},0.0) 70%)`}} />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, transform: `translateX(${-30 * t}px) scale(1.06)`}}>
        <path d={ridge(640, 260, 'a')} fill={`rgba(${COURSE.colorRgb},0.35)`} />
        <path d={ridge(760, 220, 'b')} fill={COURSE.colorDeep} opacity={0.75} />
        <path d={ridge(900, 160, 'c')} fill={C.bg1} opacity={0.95} />
      </svg>
    </AbsoluteFill>
  );
};

/** One shot: the clip or photo filling the frame with a slow push, or the drawn placeholder and its slot tag. */
const Shot: React.FC<{it: Item & {slot?: string}; file?: FootageFile; len: number; i: number}> = ({it, file, len, i}) => {
  const frame = useCurrentFrame();
  const fadeInK = interpolate(frame, [0, 6], [0, 1], clamp);
  const t = frame / Math.max(1, len);
  const push = i % 2 ? `scale(${1.12 - 0.08 * t}) translateX(${-20 + 40 * t}px)` : `scale(${1.04 + 0.08 * t})`;
  const cover: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover', transform: push};
  return (
    <AbsoluteFill style={{opacity: fadeInK, overflow: 'hidden', background: '#000'}}>
      {file?.kind === 'video' ? <OffthreadVideo src={file.url} muted style={cover} /> : file?.kind === 'image' ? <Img src={file.url} style={cover} /> : <Scenic seed={it.slot || it.label} len={len} />}
      {!file ? (
        <div style={{position: 'absolute', right: 56, top: 120, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', border: `3px dashed ${COURSE.cyan}`, borderRadius: 14, background: 'rgba(10,10,10,0.72)', maxWidth: 820}}>
          <L.Clapperboard size={34} color={COURSE.cyan} strokeWidth={1.8} />
          <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
            <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 20, letterSpacing: '0.14em', color: COURSE.cyan}}>{`FOOTAGE ${it.slot || ''} · ADD A CLIP`}</span>
            <span style={{fontFamily: F.body, fontWeight: 600, fontSize: 24, color: '#FFFFFF', whiteSpace: 'normal'}}>{it.label}</span>
          </div>
        </div>
      ) : null}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 22%, transparent 62%, rgba(0,0,0,0.55) 100%)'}} />
    </AbsoluteFill>
  );
};

/** The place label over the footage, in the brand's style. */
const PlaceLabel: React.FC<{g: Graphic; dur: number}> = ({g, dur}) => {
  const frame = useCurrentFrame();
  const p = sp(frame, 8);
  const out = interpolate(frame, [dur - 8, dur], [1, 0], clamp);
  const title = g.title || '';
  const tag = g.kicker || '';
  if (!title && !tag) return null;
  const style = g.style || 'lower';
  const o = {opacity: out};
  if (style === 'postcard') {
    return (
      <div style={{position: 'absolute', right: 110, bottom: 130, width: 560, padding: '26px 30px', background: '#FBF8F0', borderRadius: 6, boxShadow: '0 24px 50px rgba(0,0,0,0.5)', transform: `rotate(${3 - 3 * (1 - p)}deg) translateY(${(1 - p) * 80}px)`, ...o}}>
        <Sfx name="whoosh-soft" at={8} volume={0.3} />
        <div style={{position: 'absolute', right: 22, top: 20, width: 92, height: 110, border: `3px dashed ${COURSE.colorDeep}`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><L.Plane size={44} color={COURSE.colorDeep} /></div>
        <div style={{fontFamily: F.body, fontStyle: 'italic', fontWeight: 600, fontSize: 28, color: '#6B5B3E'}}>Greetings from</div>
        <div style={{fontFamily: F.head, fontWeight: 900, fontSize: 60, lineHeight: 1.05, color: COURSE.colorDeep, maxWidth: 400, whiteSpace: 'normal'}}>{title}</div>
        {tag ? <div style={{marginTop: 12, fontFamily: F.mono, fontSize: 22, letterSpacing: '0.12em', color: '#333'}}>{tag}</div> : null}
      </div>
    );
  }
  if (style === 'stamp') {
    const k = ramp(frame, 8, 6);
    return (
      <div style={{position: 'absolute', right: 150, bottom: 150, transform: `rotate(-9deg) scale(${1.6 - 0.6 * k})`, opacity: k * out, padding: '22px 34px', border: `7px double ${COURSE.color}`, borderRadius: 26, color: COURSE.color, textAlign: 'center', background: 'rgba(0,0,0,0.25)', mixBlendMode: 'screen'}}>
        <Sfx name="impact" at={12} volume={0.35} />
        <div style={{fontFamily: F.mono, fontWeight: 700, fontSize: 22, letterSpacing: '0.3em'}}>ARRIVED</div>
        <div style={{fontFamily: F.head, fontWeight: 900, fontSize: 64, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'normal', maxWidth: 640}}>{title}</div>
        {tag ? <div style={{fontFamily: F.mono, fontWeight: 700, fontSize: 22, letterSpacing: '0.2em', marginTop: 8}}>{tag}</div> : null}
      </div>
    );
  }
  if (style === 'pass') {
    return (
      <div style={{position: 'absolute', left: 110, bottom: 120, display: 'flex', borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 50px rgba(0,0,0,0.55)', transform: `translateX(${(1 - p) * -120}px)`, opacity: Math.min(1, p * 2) * out}}>
        <Sfx name="whoosh" at={8} volume={0.3} />
        <div style={{background: COURSE.colorDeep, padding: '22px 30px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6}}>
          <L.Plane size={40} color="#FFFFFF" />
          <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 18, letterSpacing: '0.2em', color: '#FFFFFF'}}>BOARDING</span>
        </div>
        <div style={{background: '#FBFBF8', padding: '18px 34px', display: 'flex', flexDirection: 'column', gap: 4, borderRight: '3px dashed #BBB'}}>
          <span style={{fontFamily: F.mono, fontSize: 18, letterSpacing: '0.2em', color: '#777'}}>DESTINATION</span>
          <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 54, color: '#111', whiteSpace: 'nowrap'}}>{title}</span>
          {tag ? <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 20, letterSpacing: '0.14em', color: COURSE.colorDeep}}>{tag}</span> : null}
        </div>
        <div style={{background: '#FBFBF8', padding: '18px 22px', display: 'flex', gap: 3, alignItems: 'stretch'}}>
          {Array.from({length: 22}, (_, i) => <div key={i} style={{width: random(`bc${i}`) > 0.5 ? 5 : 2, background: '#111'}} />)}
        </div>
      </div>
    );
  }
  if (style === 'pin') {
    return (
      <div style={{position: 'absolute', left: 120, top: 200, display: 'flex', alignItems: 'flex-start', gap: 0, ...pop(p, -60), opacity: Math.min(1, p * 2) * out}}>
        <Sfx name="pop" at={8} volume={0.35} />
        <div style={{width: 96, height: 96, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: COURSE.color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 24px rgba(0,0,0,0.5)'}}>
          <div style={{width: 34, height: 34, borderRadius: '50%', background: '#FFFFFF'}} />
        </div>
        <div style={{marginLeft: 18, marginTop: 10, padding: '14px 24px', background: 'rgba(10,10,10,0.82)', borderLeft: `6px solid ${COURSE.color}`, display: 'flex', flexDirection: 'column', gap: 4}}>
          <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 50, color: '#FFFFFF', whiteSpace: 'nowrap'}}>{title}</span>
          {tag ? <span style={{fontFamily: F.mono, fontSize: 22, letterSpacing: '0.14em', color: COURSE.cyan}}>{tag}</span> : null}
        </div>
      </div>
    );
  }
  if (style === 'ticket') {
    return (
      <div style={{position: 'absolute', right: 120, bottom: 140, display: 'flex', transform: `rotate(-2deg) translateY(${(1 - p) * 90}px)`, opacity: Math.min(1, p * 2) * out, filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.55))'}}>
        <Sfx name="click" at={8} volume={0.35} />
        <div style={{background: COURSE.colorDeep, padding: '24px 34px', borderRadius: '16px 0 0 16px', display: 'flex', flexDirection: 'column', gap: 6}}>
          <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 20, letterSpacing: '0.24em', color: 'rgba(255,255,255,0.8)'}}>ADMIT ONE</span>
          <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 54, color: '#FFFFFF', whiteSpace: 'nowrap'}}>{title}</span>
        </div>
        <div style={{background: '#F6EBD3', padding: '20px 30px', borderRadius: '0 16px 16px 0', borderLeft: '4px dashed rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', gap: 12}}>
          <L.Ticket size={40} color={COURSE.colorDeep} />
          <span style={{fontFamily: F.mono, fontWeight: 800, fontSize: 28, color: '#222', whiteSpace: 'nowrap'}}>{tag || 'ENTRY'}</span>
        </div>
      </div>
    );
  }
  if (style === 'countdown') {
    const n = (/(\d+)/.exec(tag) || [])[1];
    return (
      <div style={{position: 'absolute', left: 110, bottom: 120, display: 'flex', alignItems: 'flex-end', gap: 26, opacity: out}}>
        <Sfx name="impact" at={8} volume={0.3} />
        {n ? <div style={{fontFamily: F.head, fontWeight: 900, fontSize: 260, lineHeight: 0.8, color: COURSE.color, transform: `scale(${0.6 + 0.4 * p})`, transformOrigin: 'bottom left', textShadow: '0 12px 40px rgba(0,0,0,0.6)'}}>{n}</div> : null}
        <div style={{display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 18, ...pop(sp(frame, 14), 30)}}>
          <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 70, lineHeight: 1, color: '#FFFFFF', textShadow: '0 6px 24px rgba(0,0,0,0.6)', whiteSpace: 'nowrap'}}>{title}</span>
          {tag && !n ? <span style={{fontFamily: F.mono, fontSize: 24, letterSpacing: '0.14em', color: COURSE.cyan}}>{tag}</span> : tag.replace(/#?\d+\s*(OF\s*\d+)?\s*·?\s*/i, '') ? <span style={{fontFamily: F.mono, fontSize: 24, letterSpacing: '0.14em', color: COURSE.cyan}}>{tag.replace(/#?\d+\s*(OF\s*\d+)?\s*·?\s*/i, '')}</span> : null}
        </div>
      </div>
    );
  }
  // lower third (default)
  return (
    <div style={{position: 'absolute', left: 100, bottom: 120, display: 'flex', flexDirection: 'column', gap: 0, transform: `translateX(${(1 - p) * -60}px)`, opacity: Math.min(1, p * 2) * out}}>
      <Sfx name="whoosh-soft" at={8} volume={0.3} />
      {tag ? <span style={{alignSelf: 'flex-start', padding: '6px 16px', background: COURSE.colorDeep, fontFamily: F.mono, fontWeight: 700, fontSize: 22, letterSpacing: '0.14em', color: '#FFFFFF'}}>{tag}</span> : null}
      <div style={{display: 'flex', alignItems: 'stretch'}}>
        <div style={{width: 10, background: COURSE.color}} />
        <span style={{padding: '12px 26px', background: 'rgba(10,10,10,0.8)', fontFamily: F.head, fontWeight: 800, fontSize: 58, color: '#FFFFFF', whiteSpace: 'nowrap'}}>{title}</span>
      </div>
    </div>
  );
};

export const FootageView: TV = ({g, dur, ctx}) => {
  const shots = (g.items || []).length ? g.items : [{label: g.title, value: '', detail: '', tone: 'neutral' as Tone}];
  const n = shots.length;
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {shots.map((it, i) => {
        const from = Math.round((dur * i) / n);
        const to = Math.round((dur * (i + 1)) / n);
        const slot = (it as Item & {slot?: string}).slot;
        return (
          <Sequence key={i} from={from} durationInFrames={Math.max(1, to - from + (i < n - 1 ? 6 : 0))} name={`shot-${slot || i}`}>
            <Shot it={it} file={slot ? ctx.footage?.[slot] : undefined} len={to - from} i={i} />
          </Sequence>
        );
      })}
      <PlaceLabel g={g} dur={dur} />
      {g.stamp ? <div style={{position: 'absolute', right: 70, bottom: 70, padding: '8px 16px', background: 'rgba(10,10,10,0.75)', fontFamily: F.mono, fontWeight: 700, fontSize: 22, letterSpacing: '0.14em', color: '#FFFFFF'}}>{g.stamp}</div> : null}
    </AbsoluteFill>
  );
};

/* ================================================================== maps and routes */

// The studio map (studio/src/components/worldmap.json) is a Robinson projection, 1600 x 800.
const ROB_X = [1, 0.9986, 0.9954, 0.99, 0.9822, 0.973, 0.96, 0.9427, 0.9216, 0.8962, 0.8679, 0.835, 0.7986, 0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322];
const ROB_Y = [0, 0.062, 0.124, 0.186, 0.248, 0.31, 0.372, 0.434, 0.4958, 0.5571, 0.6176, 0.6769, 0.7346, 0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1];
const lerpTab = (tab: number[], a: number) => {
  const i = Math.min(17, Math.floor(a / 5));
  return tab[i] + (tab[i + 1] - tab[i]) * ((a - i * 5) / 5);
};
/** lat, lon (degrees) -> map coordinates. */
export const project = (lat: number, lon: number): [number, number] => {
  const a = Math.min(90, Math.abs(lat));
  return [799 + 304 * 0.8487 * lerpTab(ROB_X, a) * ((lon * Math.PI) / 180), 461 - 313 * 1.3523 * lerpTab(ROB_Y, a) * Math.sign(lat)];
};
const coordsOf = (s: string): [number, number] | null => {
  const m = /(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/.exec(s || '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
};
const isCountry = (n: string) => MAP.countries.some((c) => c.name === n);
type Pt = {label: string; value: string; x: number; y: number; country: boolean; tone: Tone};
const pointsOf = (items: Item[]): Pt[] =>
  items.flatMap((it) => {
    const c = coordsOf(it.detail);
    if (c) {
      const [x, y] = project(c[0], c[1]);
      return [{label: it.label, value: it.value, x, y, country: false, tone: it.tone}];
    }
    if (isCountry(it.label)) {
      const [x, y] = centroid(it.label);
      return [{label: it.label, value: it.value, x, y, country: true, tone: it.tone}];
    }
    return [];
  });

type Pal = {sea: string; land: string; border: string; grid: string; tint: string; pin: string; text: string; glow?: boolean; halftone?: boolean};
const PAL: Record<string, () => Pal> = {
  zoom: () => ({sea: '#0B0B0B', land: '#232323', border: '#3A3A3A', grid: 'rgba(255,255,255,0.04)', tint: COURSE.color, pin: COURSE.cyan, text: '#FFFFFF'}),
  atlas: () => ({sea: '#E9DFC8', land: '#D8C7A0', border: '#6B5B3E', grid: 'rgba(107,91,62,0.18)', tint: COURSE.colorDeep, pin: COURSE.colorDeep, text: '#3A2E1A'}),
  flat: () => ({sea: C.bg1, land: C.fill2, border: C.bg1, grid: 'transparent', tint: COURSE.color, pin: COURSE.cyan, text: C.text}),
  satellite: () => ({sea: '#020B18', land: '#0A1C33', border: '#2F8FD8', grid: 'rgba(63,169,245,0.08)', tint: COURSE.cyan, pin: COURSE.cyan, text: '#CFE9FF', glow: true}),
  ink: () => ({sea: '#FAFAF7', land: '#FAFAF7', border: '#111111', grid: 'rgba(0,0,0,0.06)', tint: '#111111', pin: COURSE.colorDeep, text: '#111111', halftone: true}),
};
const ROUTE_PAL: Record<string, string> = {flight: 'satellite', train: 'flat', road: 'atlas', dotted: 'atlas'};

/** Camera that starts on the whole world and flies to fit the points. */
const useCam = (pts: Pt[], W: number, H: number, t0: number) => {
  const frame = useCurrentFrame();
  let cam = {x: MAP.w / 2, y: MAP.h / 2 + 40, z: W / MAP.w};
  if (!pts.length) return cam;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const bw = Math.max(pts.some((p) => !p.country) ? 60 : 240, Math.max(...xs) - Math.min(...xs) + 160);
  const bh = Math.max(pts.some((p) => !p.country) ? 40 : 150, Math.max(...ys) - Math.min(...ys) + 140);
  const target = {x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, z: Math.min(14, Math.max(W / MAP.w, Math.min(W / bw, H / bh)))};
  const k = ramp(frame, t0 + 8, 46);
  cam = {x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k, z: cam.z * Math.pow(target.z / cam.z, k)};
  return cam;
};

const MapBase: React.FC<{pal: Pal; cam: {x: number; y: number; z: number}; W: number; H: number; tinted: string[]; tp: number; children?: React.ReactNode}> = ({pal, cam, W, H, tinted, tp, children}) => (
  <div style={{position: 'absolute', inset: 0, background: pal.sea, overflow: 'hidden'}}>
    <div style={{position: 'absolute', left: 0, top: 0, width: MAP.w, height: MAP.h, transformOrigin: '0 0', transform: `translate(${W / 2}px, ${H / 2}px) scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`}}>
      <svg width={MAP.w} height={MAP.h} style={{overflow: 'visible', filter: pal.glow ? `drop-shadow(0 0 ${3 / cam.z}px ${pal.border})` : undefined}}>
        <defs><pattern id="tht" width={6} height={6} patternUnits="userSpaceOnUse"><circle cx={3} cy={3} r={1.3} fill="#111" /></pattern></defs>
        {Array.from({length: 13}).map((_, i) => <line key={`v${i}`} x1={(MAP.w / 12) * i} y1={0} x2={(MAP.w / 12) * i} y2={MAP.h} stroke={pal.grid} strokeWidth={1 / cam.z} />)}
        {Array.from({length: 7}).map((_, i) => <line key={`h${i}`} x1={0} y1={(MAP.h / 6) * i} x2={MAP.w} y2={(MAP.h / 6) * i} stroke={pal.grid} strokeWidth={1 / cam.z} />)}
        {MAP.countries.map((c) => <path key={c.name} d={c.d} fill={pal.halftone ? 'url(#tht)' : pal.land} fillOpacity={pal.halftone ? 0.35 : 1} stroke={pal.border} strokeWidth={0.8 / cam.z} />)}
        {tinted.map((n) => {
          const c = MAP.countries.find((k) => k.name === n);
          return c ? <path key={`t-${n}`} d={c.d} fill={pal.tint} fillOpacity={0.6 * tp} stroke={pal.tint} strokeWidth={1.4 / cam.z} /> : null;
        })}
      </svg>
      <div style={{position: 'absolute', left: 0, top: 0, width: MAP.w, height: MAP.h}}>{children}</div>
    </div>
  </div>
);

/** A pin with its label, kept the same size on screen whatever the zoom. */
const Pin: React.FC<{p: Pt; z: number; k: number; color: string; dark: boolean; dy: number}> = ({p, z, k, color, dark, dy}) => (
  <div style={{position: 'absolute', left: p.x, top: p.y, transform: `scale(${1 / z})`, transformOrigin: '0 0', opacity: k}}>
    <div style={{position: 'absolute', left: -13, top: -13, width: 26, height: 26, borderRadius: '50%', background: color, border: '4px solid #FFFFFF', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', transform: `scale(${0.5 + 0.5 * k})`}} />
    <div style={{position: 'absolute', left: 0, top: dy, transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', whiteSpace: 'nowrap', background: dark ? 'rgba(10,10,10,0.85)' : '#FFFFFF', border: `2px solid ${color}`, fontFamily: F.head, fontWeight: 800, fontSize: 34, color: dark ? '#FFFFFF' : '#111111'}}>
      {p.label}
      {p.value ? <span style={{fontFamily: F.mono, fontWeight: 600, fontSize: 24, color}}>{p.value}</span> : null}
    </div>
  </div>
);

const MapFrame: React.FC<{style: string; W: number; H: number; label: string; pal: Pal; children: React.ReactNode}> = ({style, W, H, label, pal, children}) => {
  const frame = useCurrentFrame();
  const p = sp(frame, 0);
  const box: Record<string, React.CSSProperties> = {
    zoom: {border: `1.5px solid ${C.line}`, boxShadow: C.shadow},
    atlas: {padding: 22, background: '#F1E8D3', border: '2px solid #6B5B3E', boxShadow: '0 24px 60px rgba(0,0,0,0.5)'},
    flat: {borderRadius: 30, overflow: 'hidden', boxShadow: C.shadow, border: `1.5px solid ${C.line}`},
    satellite: {borderRadius: 20, overflow: 'hidden', boxShadow: `0 0 70px rgba(47,143,216,0.35), ${C.shadow}`, border: '1.5px solid rgba(63,169,245,0.4)'},
    ink: {padding: 16, background: '#FAFAF7', border: '3px solid #111'},
  };
  return (
    <div style={{position: 'absolute', left: (1920 - W) / 2, top: (1080 - H) / 2 + 30, opacity: Math.min(1, p * 2), transform: `scale(${0.97 + 0.03 * p})`, ...box[style]}}>
      <div style={{position: 'relative', width: W, height: H, overflow: 'hidden'}}>
        {children}
        {label ? <div style={{position: 'absolute', left: 28, top: 24, padding: '8px 18px', background: pal.text === '#FFFFFF' || pal.glow ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)', fontFamily: style === 'atlas' ? F.head : F.mono, fontStyle: style === 'atlas' ? 'italic' : 'normal', fontWeight: 700, fontSize: style === 'atlas' ? 32 : 24, letterSpacing: style === 'atlas' ? 0 : '0.14em', color: pal.text, textTransform: style === 'atlas' ? 'none' : 'uppercase'}}>{label}</div> : null}
      </div>
    </div>
  );
};

export const TravelMap: TV = ({g, at}) => {
  const frame = useCurrentFrame();
  const style = PAL[g.style || ''] ? g.style! : 'zoom';
  const pal = PAL[style]();
  const W = 1700;
  const H = 880;
  const pts = pointsOf(g.items).slice(0, 10);
  const cam = useCam(pts, W, H, at[0] ?? 0);
  const t0 = (at[0] ?? 0) + 54;
  const dark = style === 'zoom' || style === 'satellite' || style === 'flat';
  return (
    <MapFrame style={style} W={W} H={H} label={g.title} pal={pal}>
      <Sfx name="whoosh" at={(at[0] ?? 0) + 8} volume={0.3} />
      <MapBase pal={pal} cam={cam} W={W} H={H} tinted={pts.filter((p) => p.country).map((p) => p.label)} tp={fadeIn(frame, t0 - 20, 20)}>
        {pts.map((p, j) => <Pin key={j} p={p} z={cam.z} k={fadeIn(frame, Math.max(itemAt(at, j), t0 + j * 8), 10)} color={p.tone && p.tone !== 'neutral' ? toneOf(p as unknown as Item) : pal.pin} dark={dark} dy={j % 2 ? 56 : -56} />)}
      </MapBase>
    </MapFrame>
  );
};

const ICON_OF: Record<string, L.LucideIcon> = {flight: L.Plane, train: L.TrainFront, road: L.Car, dotted: L.Footprints};
export const RouteView: TV = ({g, at}) => {
  const frame = useCurrentFrame();
  const style = ICON_OF[g.style || ''] ? g.style! : /TRAIN|RAIL/i.test(g.kicker) ? 'train' : /ROAD|CAR|DRIVE|BUS/i.test(g.kicker) ? 'road' : 'flight';
  const pal = PAL[ROUTE_PAL[style]]();
  const W = 1700;
  const H = 880;
  const pts = pointsOf(g.items).slice(0, 8);
  const cam = useCam(pts, W, H, at[0] ?? 0);
  const t0 = (at[0] ?? 0) + 54;
  const per = Math.max(18, Math.min(40, ((at[at.length - 1] ?? t0) - t0 + 60) / Math.max(1, pts.length - 1)));
  const Icon = ICON_OF[style];
  const z = cam.z;
  const seg = (a: Pt, b: Pt, i: number) => {
    const k = ramp(frame, t0 + i * per, per);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const bend = style === 'flight' ? 0.35 : style === 'road' ? 0.12 * (i % 2 ? 1 : -1) : style === 'dotted' ? 0.2 : 0;
    const cx = mx - ((b.y - a.y) / (d || 1)) * d * bend;
    const cy = my + ((b.x - a.x) / (d || 1)) * d * bend - (style === 'flight' ? d * 0.15 : 0);
    const path = `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
    // a point along the curve, for the moving icon
    const q = (t: number) => [(1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * b.x, (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * b.y];
    const [ix, iy] = q(k);
    const len = d * 1.3;
    const stroke = {flight: {w: 3, dash: `${8 / z} ${8 / z}`}, train: {w: 7, dash: ''}, road: {w: 6, dash: ''}, dotted: {w: 4, dash: `${2 / z} ${10 / z}`}}[style]!;
    return (
      <React.Fragment key={i}>
        {style === 'train' ? <path d={path} fill="none" stroke="#FFFFFF" strokeWidth={13 / z} strokeOpacity={0.9} strokeDasharray={`${len * k} ${len}`} /> : null}
        <path d={path} fill="none" stroke={style === 'dotted' ? COURSE.colorDeep : pal.tint} strokeWidth={stroke.w / z} strokeLinecap="round" strokeDasharray={stroke.dash || `${len * k} ${len}`} strokeDashoffset={0} opacity={stroke.dash ? Math.min(1, k * 3) : 1} style={stroke.dash ? {clipPath: undefined} : undefined} />
        {k > 0 && k < 1 ? <foreignObject x={ix - 22 / z} y={iy - 22 / z} width={44 / z} height={44 / z} style={{overflow: 'visible'}}><div style={{width: 44, height: 44, transform: `scale(${1 / z})`, transformOrigin: '0 0', borderRadius: '50%', background: pal.tint, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Icon size={26} color="#FFFFFF" /></div></foreignObject> : null}
      </React.Fragment>
    );
  };
  const dark = ROUTE_PAL[style] !== 'atlas';
  return (
    <MapFrame style={ROUTE_PAL[style]} W={W} H={H} label={[g.kicker, g.title].filter(Boolean).join(' · ')} pal={pal}>
      <Sfx name="whoosh" at={(at[0] ?? 0) + 8} volume={0.3} />
      <MapBase pal={pal} cam={cam} W={W} H={H} tinted={[]} tp={0}>
        <svg width={MAP.w} height={MAP.h} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
          {pts.slice(1).map((b, i) => seg(pts[i], b, i))}
          {style === 'dotted' && pts.length ? (() => {
            const e = pts[pts.length - 1];
            const k = ramp(frame, t0 + (pts.length - 1) * per, 10);
            return <g opacity={k} stroke={COURSE.colorDeep} strokeWidth={6 / z}><line x1={e.x - 14 / z} y1={e.y - 14 / z} x2={e.x + 14 / z} y2={e.y + 14 / z} /><line x1={e.x + 14 / z} y1={e.y - 14 / z} x2={e.x - 14 / z} y2={e.y + 14 / z} /></g>;
          })() : null}
        </svg>
        {pts.map((p, j) => <Pin key={j} p={{...p, value: ''}} z={z} k={fadeIn(frame, t0 + Math.max(0, j - 0.5) * per, 10)} color={pal.pin} dark={dark} dy={j % 2 ? 56 : -56} />)}
        {pts.slice(1).map((b, i) => {
          const a = pts[i];
          const v = g.items.filter((it) => coordsOf(it.detail) || isCountry(it.label))[i]?.value;
          if (!v) return null;
          return (
            <div key={`v${i}`} style={{position: 'absolute', left: (a.x + b.x) / 2, top: (a.y + b.y) / 2, transform: `scale(${1 / z})`, transformOrigin: '0 0', opacity: fadeIn(frame, t0 + (i + 0.6) * per, 10)}}>
              <div style={{transform: 'translate(-50%, -50%)', padding: '4px 12px', borderRadius: 20, background: pal.tint, fontFamily: F.mono, fontWeight: 700, fontSize: 20, color: '#FFFFFF', whiteSpace: 'nowrap'}}>{v}</div>
            </div>
          );
        })}
      </MapBase>
    </MapFrame>
  );
};

/* ================================================================== weather */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const months = (g: Graphic) => {
  const its = g.items.slice(0, 12);
  return MONTHS.map((m, i) => its[i] || {label: m, value: '', detail: '', tone: 'neutral' as Tone});
};
const sky = (it: Item): L.LucideIcon => {
  const t = parseFloat(it.value);
  const rain = parseFloat(it.detail);
  if (Number.isFinite(t) && t < 4) return L.Snowflake;
  if (Number.isFinite(rain) && rain >= 100) return L.CloudRain;
  if (Number.isFinite(rain) && rain >= 50) return L.CloudSun;
  return L.Sun;
};
const SEASON: [Tone, string][] = [['good', 'BEST'], ['warn', 'SHOULDER'], ['bad', 'AVOID']];
const Legend: React.FC<{p: number}> = ({p}) => (
  <div style={{display: 'flex', gap: 30, opacity: p}}>
    {SEASON.map(([t, l]) => <span key={t} style={{display: 'flex', alignItems: 'center', gap: 10, fontFamily: F.mono, fontWeight: 700, fontSize: 22, letterSpacing: '0.14em', color: C.muted}}><span style={{width: 22, height: 22, background: TONE[t]}} />{l}</span>)}
  </div>
);

export const WeatherView: TV = ({g, at}) => {
  const frame = useCurrentFrame();
  const ms = months(g);
  const style = g.style || 'chart';
  const t0 = (at[0] ?? 0) + 10;
  const temps = ms.map((m) => parseFloat(m.value)).filter(Number.isFinite);
  const hi = Math.max(10, ...temps);
  const lo = Math.min(0, ...temps);
  if (style === 'calendar') {
    return (
      <AbsoluteFill style={{padding: '150px 140px 110px', display: 'flex', flexDirection: 'column', gap: 36}}>
        <Sfx name="pop" at={t0} volume={0.3} />
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}><Head g={g} at={at[0] ?? 0} /><Legend p={fadeIn(frame, t0 + 30, 12)} /></div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 22, flex: 1}}>
          {ms.map((m, i) => {
            const k = sp(frame, t0 + i * 3);
            const Icon = sky(m);
            const col = m.tone && m.tone !== 'neutral' ? TONE[m.tone] : C.fill2;
            return (
              <div key={i} style={{background: C.card, border: `3px solid ${col}`, borderRadius: 18, padding: '18px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden', ...pop(k, 24)}}>
                <div style={{position: 'absolute', inset: 0, background: col, opacity: 0.16}} />
                <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 26, letterSpacing: '0.14em', color: C.text}}>{m.label.toUpperCase()}</span>
                <Icon size={58} color={col === C.fill2 ? C.muted : col} strokeWidth={1.8} />
                <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 54, color: C.text}}>{m.value ? `${m.value}°` : '–'}</span>
                {m.tone === 'good' ? <span style={{position: 'absolute', right: 14, top: 14, padding: '4px 10px', border: `3px solid ${TONE.good}`, color: TONE.good, fontFamily: F.mono, fontWeight: 800, fontSize: 18, transform: 'rotate(8deg)'}}>BEST</span> : null}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }
  if (style === 'app') {
    const best = ms.filter((m) => m.tone === 'good').map((m) => m.label);
    return (
      <AbsoluteFill>
        <Sfx name="click" at={t0} volume={0.3} />
        <div style={{position: 'absolute', left: 150, top: 300, width: 760, display: 'flex', flexDirection: 'column', gap: 30}}>
          <Head g={g} at={at[0] ?? 0} size={72} />
          {best.length ? <div style={{...pop(sp(frame, t0 + 40)), display: 'flex', alignItems: 'center', gap: 18}}><L.Sun size={64} color={TONE.good} /><span style={{fontFamily: F.head, fontWeight: 900, fontSize: 64, color: TONE.good}}>{best.length > 2 ? `${best[0]} – ${best[best.length - 1]}` : best.join(', ')}</span></div> : null}
          <Legend p={fadeIn(frame, t0 + 50, 12)} />
        </div>
        <div style={{position: 'absolute', right: 230, top: 90, width: 520, height: 920, borderRadius: 64, background: '#111', border: '4px solid #2A2A2A', boxShadow: C.shadow, padding: '70px 34px 34px', transform: `translateY(${(1 - sp(frame, at[0] ?? 0)) * 200}px)`}}>
          <div style={{position: 'absolute', left: '50%', top: 22, width: 130, height: 30, marginLeft: -65, borderRadius: 16, background: '#000'}} />
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            {ms.map((m, i) => {
              const Icon = sky(m);
              const v = parseFloat(m.value);
              const w = Number.isFinite(v) ? ((v - lo) / (hi - lo)) * 100 : 0;
              const k = fadeIn(frame, t0 + i * 3, 8);
              return (
                <div key={i} style={{display: 'flex', alignItems: 'center', gap: 16, padding: '6px 10px', borderRadius: 12, background: m.tone === 'good' ? 'rgba(53,201,134,0.14)' : 'transparent', opacity: k}}>
                  <span style={{width: 64, fontFamily: F.body, fontWeight: 700, fontSize: 26, color: '#FFFFFF'}}>{m.label}</span>
                  <Icon size={32} color={m.tone && m.tone !== 'neutral' ? TONE[m.tone] : '#BBBBBB'} />
                  <div style={{flex: 1, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.1)'}}><div style={{width: `${w * k}%`, height: '100%', borderRadius: 5, background: `linear-gradient(90deg, ${COURSE.cyan}, ${C.amber}, ${C.red})`}} /></div>
                  <span style={{width: 64, textAlign: 'right', fontFamily: F.mono, fontWeight: 700, fontSize: 26, color: '#FFFFFF'}}>{m.value ? `${m.value}°` : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  // chart: monthly bars coloured by season, rain under each month
  const H = 470;
  return (
    <AbsoluteFill style={{padding: '150px 150px 90px', display: 'flex', flexDirection: 'column', gap: 30}}>
      <Sfx name="whoosh-soft" at={t0} volume={0.3} />
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}><Head g={g} at={at[0] ?? 0} /><Legend p={fadeIn(frame, t0 + 40, 12)} /></div>
      <div style={{display: 'flex', alignItems: 'flex-end', gap: 26, height: H + 160, borderBottom: `2px solid ${C.line}`, paddingBottom: 10}}>
        {ms.map((m, i) => {
          const v = parseFloat(m.value);
          const k = ramp(frame, t0 + i * 3, 20);
          const h = Number.isFinite(v) ? Math.max(14, ((v - lo) / (hi - lo)) * H) : 14;
          const col = m.tone && m.tone !== 'neutral' ? TONE[m.tone] : '#5A5A5A';
          return (
            <div key={i} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10}}>
              <span style={{fontFamily: F.mono, fontWeight: 800, fontSize: 30, color: C.text, opacity: k}}>{m.value ? `${m.value}°` : ''}</span>
              <div style={{width: '100%', height: h * k, background: col, borderRadius: '10px 10px 0 0'}} />
            </div>
          );
        })}
      </div>
      <div style={{display: 'flex', gap: 26}}>
        {ms.map((m, i) => (
          <div key={i} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: fadeIn(frame, t0 + i * 3, 10)}}>
            <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 26, letterSpacing: '0.1em', color: C.text}}>{m.label.toUpperCase()}</span>
            {m.detail ? <span style={{display: 'flex', alignItems: 'center', gap: 4, fontFamily: F.mono, fontSize: 20, color: COURSE.cyan}}><L.CloudRain size={20} color={COURSE.cyan} />{parseFloat(m.detail) || m.detail}</span> : null}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================== price tiers */

/** "Stay $15 · Food $10" -> [["Stay", "$15", 15], ...] */
const parts = (detail: string) =>
  String(detail || '').split(/\s*[·|,;]\s*/).map((s) => {
    const m = /^(.*?)\s*([^\s\d]*\s?\d[\d,.]*\s*[^\s\d]*)$/.exec(s.trim());
    return m ? [m[1].trim(), m[2].trim(), parseFloat(m[2].replace(/[^\d.]/g, '')) || 0] as [string, string, number] : null;
  }).filter((x): x is [string, string, number] => Boolean(x && x[0]));
const SEG = () => [COURSE.color, COURSE.cyan, C.amber, C.green, C.purple, '#8A8A8A'];

export const TiersView: TV = ({g, at}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 4);
  const style = g.style || 'columns';
  const t0 = (at[0] ?? 0) + 8;
  if (style === 'receipt') {
    return (
      <AbsoluteFill style={{padding: '140px 120px 80px', display: 'flex', flexDirection: 'column', gap: 34}}>
        <Head g={g} at={at[0] ?? 0} />
        <div style={{display: 'flex', gap: 46, justifyContent: 'center', alignItems: 'flex-start'}}>
          {its.map((it, j) => {
            const k = sp(frame, Math.max(itemAt(at, j), t0 + j * 10));
            const ps = parts(it.detail);
            return (
              <div key={j} style={{width: 470, ...pop(k, -120), filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.5))'}}>
                <Sfx name="tick" at={Math.max(itemAt(at, j), t0 + j * 10)} volume={0.3} />
                <div style={{background: '#FBFBF6', padding: '30px 34px 26px', fontFamily: F.mono, color: '#222', display: 'flex', flexDirection: 'column', gap: 12}}>
                  <div style={{textAlign: 'center', fontWeight: 800, fontSize: 30, letterSpacing: '0.14em'}}>{it.label.toUpperCase()}</div>
                  <div style={{borderTop: '2px dashed #999'}} />
                  {(ps.length ? ps : [[it.detail, '', 0] as [string, string, number]]).map(([n, v], i) => <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: 26, whiteSpace: 'normal', gap: 16}}><span>{n}</span><span>{v}</span></div>)}
                  <div style={{borderTop: '2px dashed #999'}} />
                  <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 36, color: COURSE.colorDeep}}><span>TOTAL</span><span>{it.value}</span></div>
                </div>
                <svg width={470} height={22} style={{display: 'block'}}><path d={`M0,0 ${Array.from({length: 24}, (_, i) => `L${i * 20 + 10},20 L${i * 20 + 20},0`).join(' ')} Z`} fill="#FBFBF6" /></svg>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }
  if (style === 'tags') {
    return (
      <AbsoluteFill style={{padding: '140px 120px 80px', display: 'flex', flexDirection: 'column', gap: 10}}>
        <Head g={g} at={at[0] ?? 0} />
        <div style={{display: 'flex', gap: 70, justifyContent: 'center', marginTop: 20}}>
          {its.map((it, j) => {
            const t = Math.max(itemAt(at, j), t0 + j * 10);
            const k = sp(frame, t, 8);
            const swing = Math.sin((frame - t) / 8) * 6 * Math.exp(-(frame - t) / 40);
            const col = it.tone && it.tone !== 'neutral' ? toneOf(it) : [COURSE.color, COURSE.cyan, C.amber, C.green][j % 4];
            return (
              <div key={j} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: Math.min(1, k * 2), transform: `translateY(${(1 - k) * -300}px) rotate(${swing}deg)`, transformOrigin: 'top center'}}>
                <Sfx name="pop" at={t} volume={0.3} />
                <div style={{width: 3, height: 90, background: C.muted}} />
                <div style={{position: 'relative', width: 400, padding: '64px 30px 34px', background: col, clipPath: 'polygon(50% 0, 100% 14%, 100% 100%, 0 100%, 0 14%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center'}}>
                  <div style={{position: 'absolute', top: 26, left: '50%', marginLeft: -14, width: 28, height: 28, borderRadius: '50%', background: C.bg0}} />
                  <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 24, letterSpacing: '0.14em', color: '#0A0A0A'}}>{it.label.toUpperCase()}</span>
                  <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 76, lineHeight: 1, color: '#0A0A0A'}}>{it.value}</span>
                  {it.detail ? <span style={{fontFamily: F.body, fontWeight: 600, fontSize: 24, color: '#1A1A1A', whiteSpace: 'normal'}}>{it.detail}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }
  // columns with a stacked breakdown
  const totals = its.map((it) => parts(it.detail).reduce((a, x) => a + x[2], 0) || parseFloat(String(it.value).replace(/[^\d.]/g, '')) || 0);
  const max = Math.max(1, ...totals);
  return (
    <AbsoluteFill style={{padding: '140px 140px 90px', display: 'flex', flexDirection: 'column', gap: 34}}>
      <Head g={g} at={at[0] ?? 0} />
      <div style={{display: 'flex', gap: 40, alignItems: 'stretch', margin: 'auto 0'}}>
        {its.map((it, j) => {
          const t = Math.max(itemAt(at, j), t0 + j * 10);
          const k = sp(frame, t);
          const ps = parts(it.detail);
          const grow = ramp(frame, t + 6, 24);
          return (
            <div key={j} style={{flex: 1, background: C.card, border: `1.5px solid ${it.tone === 'accent' ? COURSE.cyan : C.line}`, boxShadow: C.shadow, borderRadius: 24, padding: '30px 34px', display: 'flex', flexDirection: 'column', gap: 16, ...pop(k, 40)}}>
              <Sfx name="pop" at={t} volume={0.3} />
              <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 26, letterSpacing: '0.14em', color: C.muted}}>{it.label.toUpperCase()}</span>
              <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 84, lineHeight: 1, color: j === its.length - 1 ? COURSE.color : C.text}}>{it.value}</span>
              {ps.length ? (
                <>
                  <div style={{display: 'flex', height: 26, borderRadius: 13, overflow: 'hidden', width: `${(totals[j] / max) * 100}%`, background: C.fill}}>
                    {ps.map(([, , n], i) => <div key={i} style={{width: `${(n / (totals[j] || 1)) * 100 * grow}%`, background: SEG()[i % 6]}} />)}
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                    {ps.map(([n, v], i) => <div key={i} style={{display: 'flex', alignItems: 'center', gap: 12, fontFamily: F.body, fontWeight: 600, fontSize: 28, color: C.text, opacity: fadeIn(frame, t + 10 + i * 4, 8)}}><span style={{width: 16, height: 16, borderRadius: 4, background: SEG()[i % 6]}} /><span style={{flex: 1}}>{n}</span><span style={{fontFamily: F.mono, fontWeight: 700}}>{v}</span></div>)}
                  </div>
                </>
              ) : it.detail ? <span style={{fontFamily: F.body, fontWeight: 600, fontSize: 30, color: C.muted, whiteSpace: 'normal'}}>{it.detail}</span> : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================== phrases */

export const PhrasesView: TV = ({g, at}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 6);
  const style = g.style || 'cards';
  const t0 = (at[0] ?? 0) + 8;
  const when = (j: number) => Math.max(itemAt(at, j), t0 + j * 10);
  if (style === 'bubbles') {
    return (
      <AbsoluteFill style={{padding: '140px 180px 80px', display: 'flex', flexDirection: 'column', gap: 22}}>
        <Head g={g} at={at[0] ?? 0} />
        {its.map((it, j) => {
          const k = sp(frame, when(j));
          const left = j % 2 === 0;
          return (
            <div key={j} style={{alignSelf: left ? 'flex-start' : 'flex-end', maxWidth: 1150, display: 'flex', flexDirection: 'column', alignItems: left ? 'flex-start' : 'flex-end', gap: 6, ...pop(k, 30)}}>
              <Sfx name="blip" at={when(j)} volume={0.3} />
              <div style={{padding: '18px 30px', borderRadius: left ? '30px 30px 30px 6px' : '30px 30px 6px 30px', background: left ? C.card : COURSE.colorDeep, border: `1.5px solid ${C.line}`, fontFamily: F.head, fontWeight: 800, fontSize: 48, color: '#FFFFFF', whiteSpace: 'normal'}}>{it.label}</div>
              <span style={{fontFamily: F.mono, fontSize: 24, color: COURSE.cyan}}>{[it.value && `“${it.value}”`, it.detail].filter(Boolean).join('  ·  ')}</span>
            </div>
          );
        })}
      </AbsoluteFill>
    );
  }
  if (style === 'translator') {
    const j = Math.max(0, its.findLastIndex((_, i) => frame >= when(i)));
    const it = its[j] || its[0];
    const typed = Math.floor(Math.max(0, frame - when(j)) * 1.4);
    return (
      <AbsoluteFill>
        <div style={{position: 'absolute', left: 150, top: 330, width: 700}}><Head g={{...g, title: g.title || 'Say it like a local'}} at={at[0] ?? 0} size={72} /></div>
        <div style={{position: 'absolute', right: 230, top: 90, width: 560, height: 920, borderRadius: 64, background: '#111', border: '4px solid #2A2A2A', boxShadow: C.shadow, padding: '80px 30px 30px', display: 'flex', flexDirection: 'column', gap: 20, transform: `translateY(${(1 - sp(frame, at[0] ?? 0)) * 200}px)`}}>
          <Sfx name="type" at={when(j)} volume={0.25} />
          <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: F.mono, fontWeight: 700, fontSize: 22, color: '#BBB', letterSpacing: '0.1em'}}><span>{(g.kicker || 'LOCAL').toUpperCase()}</span><L.Languages size={26} color={COURSE.cyan} /><span>YOU</span></div>
          <div style={{flex: 1, borderRadius: 26, background: '#1E1E1E', padding: 28, display: 'flex', flexDirection: 'column', gap: 14}}>
            <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 52, color: '#FFFFFF', whiteSpace: 'normal'}}>{it?.label.slice(0, typed)}</span>
            <span style={{display: 'flex', alignItems: 'center', gap: 10, fontFamily: F.mono, fontSize: 26, color: COURSE.cyan, opacity: typed > (it?.label.length || 0) ? 1 : 0}}><L.Volume2 size={28} color={COURSE.cyan} />{it?.value}</span>
          </div>
          <div style={{flex: 1, borderRadius: 26, background: COURSE.colorDeep, padding: 28, fontFamily: F.head, fontWeight: 800, fontSize: 44, color: '#FFFFFF', whiteSpace: 'normal', opacity: typed > (it?.label.length || 0) + 6 ? 1 : 0.15}}>{it?.detail}</div>
          <div style={{display: 'flex', gap: 8, justifyContent: 'center'}}>{its.map((_, i) => <span key={i} style={{width: 12, height: 12, borderRadius: 6, background: i === j ? COURSE.cyan : '#444'}} />)}</div>
        </div>
      </AbsoluteFill>
    );
  }
  // flashcards
  return (
    <AbsoluteFill style={{padding: '140px 120px 80px', display: 'flex', flexDirection: 'column', gap: 30}}>
      <Head g={g} at={at[0] ?? 0} />
      <div style={{display: 'grid', gridTemplateColumns: `repeat(${its.length > 4 ? 3 : 2}, 1fr)`, gap: 30}}>
        {its.map((it, j) => {
          const k = sp(frame, when(j));
          const flip = interpolate(k, [0, 1], [90, 0]);
          return (
            <div key={j} style={{background: C.card, border: `1.5px solid ${C.line}`, borderTop: `8px solid ${COURSE.color}`, borderRadius: 20, padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: C.shadow, transform: `perspective(1200px) rotateY(${flip}deg)`, opacity: Math.min(1, k * 2)}}>
              <Sfx name="pop" at={when(j)} volume={0.25} />
              <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 52, color: C.text, whiteSpace: 'normal'}}>{it.label}</span>
              {it.value ? <span style={{display: 'flex', alignItems: 'center', gap: 10, fontFamily: F.mono, fontWeight: 600, fontSize: 26, color: COURSE.cyan}}><L.Volume2 size={26} color={COURSE.cyan} />{it.value}</span> : null}
              {it.detail ? <span style={{fontFamily: F.body, fontWeight: 600, fontSize: 28, color: C.muted, whiteSpace: 'normal'}}>{it.detail}</span> : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================== do's and don'ts */

const isDo = (it: Item) => it.tone !== 'bad';
export const DosView: TV = ({g, at}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 8);
  const style = g.style || 'cards';
  const t0 = (at[0] ?? 0) + 8;
  const when = (j: number) => Math.max(itemAt(at, j), t0 + j * 8);
  if (style === 'signs') {
    return (
      <AbsoluteFill style={{padding: '140px 110px 80px', display: 'flex', flexDirection: 'column', gap: 30}}>
        <Head g={g} at={at[0] ?? 0} />
        <div style={{display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap'}}>
          {its.slice(0, 5).map((it, j) => {
            const k = sp(frame, when(j), 10);
            const ok = isDo(it);
            return (
              <div key={j} style={{width: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, ...pop(k, 60)}}>
                <Sfx name={ok ? 'ding' : 'nope'} at={when(j)} volume={0.25} />
                <div style={{width: 230, height: 230, borderRadius: '50%', background: ok ? C.green : '#FFFFFF', border: `20px solid ${ok ? '#FFFFFF' : C.red}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: '0 16px 30px rgba(0,0,0,0.45)'}}>
                  {ok ? <L.Check size={130} color="#FFFFFF" strokeWidth={3} /> : <><L.X size={10} color="transparent" /><div style={{position: 'absolute', width: 230, height: 20, background: C.red, transform: 'rotate(-45deg)'}} /></>}
                </div>
                <div style={{width: 8, height: 60, background: '#9A9A9A', marginTop: -22}} />
                <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 36, textAlign: 'center', color: C.text, whiteSpace: 'normal'}}>{it.label}</span>
                {it.detail ? <span style={{fontFamily: F.body, fontWeight: 600, fontSize: 24, textAlign: 'center', color: C.muted, whiteSpace: 'normal'}}>{it.detail}</span> : null}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }
  if (style === 'stamped') {
    return (
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{width: 1300, background: '#FBF8F0', padding: '50px 64px', boxShadow: '0 30px 70px rgba(0,0,0,0.55)', transform: 'rotate(-1deg)', display: 'flex', flexDirection: 'column', gap: 18, marginTop: 60}}>
          {g.kicker ? <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 24, letterSpacing: '0.2em', color: COURSE.colorDeep}}>{g.kicker.toUpperCase()}</span> : null}
          {g.title ? <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 60, color: '#111'}}>{g.title}</span> : null}
          <div style={{borderTop: '3px solid #111'}} />
          {its.slice(0, 6).map((it, j) => {
            const k = ramp(frame, when(j), 5);
            const ok = isDo(it);
            return (
              <div key={j} style={{display: 'flex', alignItems: 'center', gap: 28, opacity: fadeIn(frame, when(j) - 4, 6)}}>
                <Sfx name="impact" at={when(j)} volume={0.2} />
                <div style={{width: 76, height: 76, flexShrink: 0, border: `5px solid ${ok ? C.green : C.red}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${ok ? -6 : 6}deg) scale(${1.8 - 0.8 * k})`, opacity: k}}>
                  {ok ? <L.Check size={52} color={C.green} strokeWidth={3.5} /> : <L.X size={52} color={C.red} strokeWidth={3.5} />}
                </div>
                <div style={{display: 'flex', flexDirection: 'column'}}>
                  <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 38, color: '#111', whiteSpace: 'normal'}}>{it.label}</span>
                  {it.detail ? <span style={{fontFamily: F.body, fontWeight: 600, fontSize: 26, color: '#555', whiteSpace: 'normal'}}>{it.detail}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }
  // two columns of cards
  const dos = its.filter(isDo);
  const donts = its.filter((x) => !isDo(x));
  const col = (list: Item[], ok: boolean) => (
    <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 18}}>
      <span style={{display: 'flex', alignItems: 'center', gap: 12, fontFamily: F.mono, fontWeight: 800, fontSize: 30, letterSpacing: '0.16em', color: ok ? C.green : C.red}}>{ok ? <L.Check size={36} color={C.green} strokeWidth={3} /> : <L.X size={36} color={C.red} strokeWidth={3} />}{ok ? 'DO' : 'DON\'T'}</span>
      {list.map((it) => {
        const j = its.indexOf(it);
        const k = sp(frame, when(j));
        return (
          <div key={j} style={{background: C.card, border: `1.5px solid ${C.line}`, borderLeft: `8px solid ${ok ? C.green : C.red}`, borderRadius: 14, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 6, ...pop(k, 24)}}>
            <Sfx name="pop" at={when(j)} volume={0.25} />
            <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 36, color: C.text, whiteSpace: 'normal'}}>{it.label}</span>
            {it.detail ? <span style={{fontFamily: F.body, fontWeight: 600, fontSize: 25, color: C.muted, whiteSpace: 'normal'}}>{it.detail}</span> : null}
          </div>
        );
      })}
    </div>
  );
  return (
    <AbsoluteFill style={{padding: '140px 140px 80px', display: 'flex', flexDirection: 'column', gap: 30}}>
      <Head g={g} at={at[0] ?? 0} />
      <div style={{display: 'flex', gap: 60}}>{dos.length ? col(dos, true) : null}{donts.length ? col(donts, false) : null}</div>
    </AbsoluteFill>
  );
};

/* ================================================================== rating */

const score = (v: string) => {
  const m = /(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/.exec(v || '');
  if (!m) return 0;
  return Math.max(0, Math.min(1, Number(m[1]) / (m[2] ? Number(m[2]) : Number(m[1]) <= 5 ? 5 : 10)));
};
const BestFor: React.FC<{stamp: string; at: number}> = ({stamp, at}) => {
  const frame = useCurrentFrame();
  if (!stamp) return null;
  const k = ramp(frame, at, 6);
  const [head, ...rest] = stamp.split('·').map((s) => s.trim());
  return (
    <div style={{padding: '16px 30px', border: `6px solid ${COURSE.color}`, borderRadius: 14, color: COURSE.color, transform: `rotate(-5deg) scale(${1.6 - 0.6 * k})`, opacity: k, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <Sfx name="impact" at={at} volume={0.3} />
      <span style={{fontFamily: F.mono, fontWeight: 800, fontSize: 24, letterSpacing: '0.2em'}}>{head.toUpperCase()}</span>
      <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 42, textAlign: 'center', whiteSpace: 'normal', maxWidth: 520}}>{rest.join(' · ')}</span>
    </div>
  );
};

export const RatingView: TV = ({g, at, dur}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 6);
  const style = g.style || 'scorecard';
  const t0 = (at[0] ?? 0) + 8;
  // every score lands with its words, but all are in (and the overall counted up) before the line ends
  const room = Math.max(t0 + its.length * 4, dur - 56);
  const when = (j: number) => Math.min(Math.max(itemAt(at, j), t0 + j * 9), t0 + ((room - t0) * j) / Math.max(1, its.length));
  const end = Math.min(when(its.length) + 10, Math.max(t0, dur - 30));
  const avg = its.length ? its.reduce((a, it) => a + score(it.value), 0) / its.length : 0;
  if (style === 'stars') {
    return (
      <AbsoluteFill style={{padding: '140px 160px 80px', display: 'flex', flexDirection: 'column', gap: 26}}>
        <Head g={g} at={at[0] ?? 0} />
        <div style={{display: 'flex', gap: 80, alignItems: 'center'}}>
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 22}}>
            {its.map((it, j) => {
              const s = score(it.value) * 5;
              return (
                <div key={j} style={{display: 'flex', alignItems: 'center', gap: 30, opacity: fadeIn(frame, when(j), 8)}}>
                  <span style={{width: 520, fontFamily: F.head, fontWeight: 800, fontSize: 40, color: C.text}}>{it.label}</span>
                  <div style={{display: 'flex', gap: 10}}>
                    {Array.from({length: 5}, (_, i) => {
                      const fill = Math.max(0, Math.min(1, s - i)) * ramp(frame, when(j) + i * 3, 6);
                      return (
                        <div key={i} style={{position: 'relative', width: 64, height: 64}}>
                          <L.Star size={64} color={C.fill2} fill={C.fill} />
                          <div style={{position: 'absolute', inset: 0, width: `${fill * 100}%`, overflow: 'hidden'}}><L.Star size={64} color={C.amber} fill={C.amber} /></div>
                        </div>
                      );
                    })}
                  </div>
                  <span style={{fontFamily: F.mono, fontWeight: 800, fontSize: 34, color: C.amber}}>{it.value}</span>
                </div>
              );
            })}
          </div>
          <BestFor stamp={g.stamp} at={end} />
        </div>
      </AbsoluteFill>
    );
  }
  if (style === 'bars') {
    return (
      <AbsoluteFill style={{padding: '140px 160px 80px', display: 'flex', flexDirection: 'column', gap: 30}}>
        <Head g={g} at={at[0] ?? 0} />
        {its.map((it, j) => {
          const s = score(it.value);
          const k = ramp(frame, when(j), 22);
          const col = s >= 0.75 ? C.green : s >= 0.5 ? C.amber : C.red;
          return (
            <div key={j} style={{display: 'flex', alignItems: 'center', gap: 30, opacity: fadeIn(frame, when(j), 6)}}>
              <span style={{width: 480, fontFamily: F.head, fontWeight: 800, fontSize: 40, color: C.text}}>{it.label}</span>
              <div style={{flex: 1, height: 56, background: C.fill, borderRadius: 28, overflow: 'hidden'}}><div style={{width: `${s * 100 * k}%`, height: '100%', background: col, borderRadius: 28}} /></div>
              <span style={{width: 150, fontFamily: F.mono, fontWeight: 800, fontSize: 44, color: col}}>{it.value}</span>
            </div>
          );
        })}
        <div style={{alignSelf: 'flex-end'}}><BestFor stamp={g.stamp} at={end} /></div>
      </AbsoluteFill>
    );
  }
  // scorecard with an overall score
  const k = ramp(frame, when(Math.max(0, its.length - 1)) + 4, 22);
  return (
    <AbsoluteFill style={{padding: '140px 140px 80px', display: 'flex', flexDirection: 'row', gap: 70, alignItems: 'center'}}>
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 18}}>
        <Head g={g} at={at[0] ?? 0} size={58} />
        {its.map((it, j) => {
          const s = score(it.value);
          const p = sp(frame, when(j));
          return (
            <div key={j} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '16px 26px', background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 14, ...pop(p, 20)}}>
              <Sfx name="tick" at={when(j)} volume={0.25} />
              <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 36, color: C.text}}>{it.label}</span>
              <span style={{minWidth: 130, textAlign: 'center', padding: '6px 16px', borderRadius: 10, background: s >= 0.75 ? C.green : s >= 0.5 ? C.amber : C.red, fontFamily: F.mono, fontWeight: 800, fontSize: 36, color: '#0A0A0A'}}>{it.value}</span>
            </div>
          );
        })}
      </div>
      <div style={{width: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40}}>
        <div style={{width: 380, height: 380, borderRadius: '50%', background: `conic-gradient(${COURSE.color} ${avg * 360 * k}deg, ${C.fill} 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{width: 300, height: 300, borderRadius: '50%', background: C.bg0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
            <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 130, lineHeight: 1, color: C.text}}>{(avg * 10 * k).toFixed(1)}</span>
            <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 26, letterSpacing: '0.16em', color: C.muted}}>OUT OF 10</span>
          </div>
        </div>
        <BestFor stamp={g.stamp} at={end} />
      </div>
    </AbsoluteFill>
  );
};

/** The travel graphic for a type, or null. */
export const travelView = (type: string): TV | null =>
  ({footage: FootageView, route: RouteView, roadtrip: RoadTripView as TV, weather: WeatherView, tiers: TiersView, phrases: PhrasesView, dosdonts: DosView, rating: RatingView} as Record<string, TV>)[type] || null;
