import React from 'react';
import {AbsoluteFill, Easing, random, useCurrentFrame} from 'remotion';
import {C, F} from '../brand/theme';
import {COURSE} from '../brand/course';
import {Sfx, sp} from './ui';
import {ramp} from './dev';
import {GlitchBurst, Highlighted} from './news';
import world from './worldmap.json';

/* "Footage" look for news explainers: a monitor frame with REC + timecode, scanlines,
   film noise and vignette; newspaper-style web clippings; and a projected world map
   (src/components/worldmap.json, from tools/worldmap.mjs) with a moving camera, pins and arcs. */

const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0');

/** Monitor/footage frame of w x h. Children are laid out inside it (absolute positioning). */
export const Footage: React.FC<{at: number; w: number; h: number; label: string; children: React.ReactNode; bg?: string}> = ({at: t0, w, h, label, children, bg = '#0E0E0E'}) => {
  const frame = useCurrentFrame();
  if (frame < t0 - 1) return null;
  const f = Math.max(0, frame - t0);
  const p = sp(frame, t0, 16);
  const tc = `${pad2(f / 1800)}:${pad2((f / 30) % 60)}:${pad2(f % 30)}`;
  const corner = (r: number, b: number): React.CSSProperties => ({
    position: 'absolute',
    width: 46,
    height: 46,
    [b ? 'bottom' : 'top']: 22,
    [r ? 'right' : 'left']: 22,
    borderColor: 'rgba(255,255,255,0.7)',
    borderStyle: 'solid',
    borderWidth: `${b ? 0 : 3}px ${r ? 3 : 0}px ${b ? 3 : 0}px ${r ? 0 : 3}px`,
  });
  return (
    <div style={{width: w, height: h, position: 'relative', overflow: 'hidden', background: bg, border: `1.5px solid ${C.line}`, boxShadow: C.shadow, opacity: Math.min(1, p * 2), transform: `scale(${0.97 + 0.03 * p})`}}>
      <Sfx name="blip" at={t0 + 1} volume={0.3} />
      {children}
      <AbsoluteFill style={{backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 4px)', pointerEvents: 'none'}} />
      <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0, opacity: 0.05, mixBlendMode: 'screen', pointerEvents: 'none'}}>
        <filter id={`n-${label}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={frame % 9} />
        </filter>
        <rect width={w} height={h} filter={`url(#n-${label})`} />
      </svg>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)', pointerEvents: 'none'}} />
      <div style={corner(0, 0)} />
      <div style={corner(1, 0)} />
      <div style={corner(0, 1)} />
      <div style={corner(1, 1)} />
      <div style={{position: 'absolute', left: 84, top: 34, display: 'flex', alignItems: 'center', gap: 12, fontFamily: F.mono, fontSize: 24, letterSpacing: '0.12em', color: '#FFFFFF'}}>
        <span style={{width: 16, height: 16, borderRadius: 8, background: C.red, opacity: Math.floor(frame / 12) % 2 ? 0.25 : 1}} />
        {label}
      </div>
      <div style={{position: 'absolute', right: 84, top: 34, fontFamily: F.mono, fontSize: 24, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.8)'}}>{tc}</div>
      <GlitchBurst at={t0} len={4} seed={label} strength={0.5} sound={false} />
    </div>
  );
};

/** Web-article clipping on white (outlet, date, headline with a highlighter sweep, faint body). */
export const Clipping: React.FC<{outlet: string; date: string; headline: string; marks?: string[]; hlAt: number; width?: number; accent?: string; section?: string; size?: number}> = ({
  outlet,
  date,
  headline,
  marks = [],
  hlAt,
  width = 760,
  accent = '#111111',
  section = 'SECURITY',
  size = 44,
}) => (
  <div style={{width, background: '#F3F2EE', color: '#111111', padding: '30px 38px 34px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: 16}}>
    <div style={{display: 'flex', alignItems: 'center', gap: 14, borderBottom: '2px solid #111111', paddingBottom: 12}}>
      <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 34, letterSpacing: '-0.02em', color: accent}}>{outlet}</span>
      <span style={{marginLeft: 'auto', fontFamily: F.mono, fontSize: 20, color: '#666666'}}>{date}</span>
    </div>
    <span style={{alignSelf: 'flex-start', fontFamily: F.mono, fontSize: 18, fontWeight: 700, letterSpacing: '0.14em', color: '#FFFFFF', background: COURSE.colorDeep, padding: '3px 10px'}}>{section}</span>
    <div style={{fontFamily: F.head, fontWeight: 800, fontSize: size, lineHeight: 1.18, letterSpacing: '-0.02em', whiteSpace: 'normal'}}>
      <Highlighted text={headline} marks={marks} hlAt={hlAt} color="#FFE14D" base="#111111" />
    </div>
    {[0.96, 0.9, 0.62].map((wd, i) => (
      <div key={i} style={{height: 12, width: `${wd * 100}%`, background: '#D6D4CE', borderRadius: 3}} />
    ))}
  </div>
);

/* ---------------- world map ---------------- */

export type Cam = {x: number; y: number; z: number};
export const MAP = world as {w: number; h: number; countries: {name: string; d: string; c: [number, number]}[]};
export const centroid = (name: string): [number, number] => MAP.countries.find((c) => c.name === name)?.c ?? [0, 0];

/** Ease between camera keys [frame, cam] (scene-local frames). */
export const camAt = (frame: number, keys: [number, Cam][]): Cam => {
  let cam = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t, k] = keys[i];
    const k0 = cam;
    const p = ramp(frame, t, 40);
    cam = {x: k0.x + (k.x - k0.x) * p, y: k0.y + (k.y - k0.y) * p, z: k0.z * Math.pow(k.z / k0.z, p)};
  }
  return cam;
};

/**
 * Projected world map filling w x h with the camera point centred. `tint(name)` colours a country;
 * `children(z)` draws pins/arcs in map coordinates (counter-scale with 1/z to keep sizes).
 */
export const WorldMap: React.FC<{w: number; h: number; cam: Cam; tint?: (name: string) => {c: string; o: number} | undefined; children?: (z: number) => React.ReactNode}> = ({w, h, cam, tint, children}) => (
  <div style={{position: 'absolute', left: 0, top: 0, width: MAP.w, height: MAP.h, transformOrigin: '0 0', transform: `translate(${w / 2}px, ${h / 2}px) scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`}}>
    <svg width={MAP.w} height={MAP.h} style={{overflow: 'visible'}}>
      {Array.from({length: 13}).map((_, i) => (
        <line key={`v${i}`} x1={(MAP.w / 12) * i} y1={0} x2={(MAP.w / 12) * i} y2={MAP.h} stroke="rgba(255,255,255,0.04)" strokeWidth={1 / cam.z} />
      ))}
      {Array.from({length: 7}).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={(MAP.h / 6) * i} x2={MAP.w} y2={(MAP.h / 6) * i} stroke="rgba(255,255,255,0.04)" strokeWidth={1 / cam.z} />
      ))}
      {MAP.countries.map((c) => (
        <path key={c.name} d={c.d} fill="#2A2A2A" stroke="#0E0E0E" strokeWidth={0.8 / cam.z} />
      ))}
      {MAP.countries.map((c) => {
        const t = tint?.(c.name);
        return t && t.o > 0.01 ? <path key={`t-${c.name}`} d={c.d} fill={t.c} fillOpacity={t.o} stroke={t.c} strokeOpacity={Math.min(1, t.o * 1.4)} strokeWidth={1 / cam.z} /> : null;
      })}
    </svg>
    {children ? <div style={{position: 'absolute', left: 0, top: 0, width: MAP.w, height: MAP.h}}>{children(cam.z)}</div> : null}
  </div>
);

/** Pulsing dot at map point (x, y) with an optional label card offset by (dx, dy) screen px. */
export const MapPin: React.FC<{x: number; y: number; z: number; p: number; color?: string; label?: string; value?: string; dx?: number; dy?: number; lp?: number; size?: number}> = ({
  x,
  y,
  z,
  p,
  color = C.red,
  label,
  value,
  dx = 0,
  dy = -70,
  lp = 1,
  size = 18,
}) => {
  const frame = useCurrentFrame();
  if (p <= 0.001) return null;
  const pulse = (frame % 40) / 40;
  const show = label || value;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: 0, height: 0, transform: `scale(${1 / z})`}}>
      <div style={{position: 'absolute', left: -size * 1.6, top: -size * 1.6, width: size * 3.2, height: size * 3.2, borderRadius: '50%', border: `3px solid ${color}`, transform: `scale(${0.3 + pulse})`, opacity: (1 - pulse) * p}} />
      <div style={{position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, borderRadius: '50%', background: color, boxShadow: `0 0 18px ${color}`, transform: `scale(${p})`}} />
      {show && lp > 0.01 ? (
        <>
          <svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}} width={1} height={1}>
            <line x1={0} y1={0} x2={dx * lp} y2={dy * lp} stroke="rgba(255,255,255,0.7)" strokeWidth={2} />
          </svg>
          <div style={{position: 'absolute', left: dx, top: dy, transform: `translate(-50%,-50%) scale(${lp})`, display: 'flex', alignItems: 'center', gap: 10, background: '#0A0A0A', border: `2px solid ${color}`, padding: '6px 14px', whiteSpace: 'nowrap'}}>
            {label ? <span style={{fontFamily: F.head, fontWeight: 700, fontSize: 28, color: '#FFFFFF'}}>{label}</span> : null}
            {value ? <span style={{fontFamily: F.mono, fontWeight: 800, fontSize: 30, color}}>{value}</span> : null}
          </div>
        </>
      ) : null}
    </div>
  );
};

/** Curved arc from a to b in map coordinates, drawn by p, with a dot travelling along it. */
export const MapArc: React.FC<{a: [number, number]; b: [number, number]; z: number; p: number; color?: string; bend?: number}> = ({a, b, z, p, color = C.red, bend = 0.3}) => {
  const frame = useCurrentFrame();
  if (p <= 0.001) return null;
  const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const cx = mx;
  const cy = my - len * bend;
  const d = `M${a[0]},${a[1]} Q${cx},${cy} ${b[0]},${b[1]}`;
  const t = (frame % 45) / 45;
  const q = (u: number) => [(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * cx + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * cy + u * u * b[1]];
  const [px, py] = q(t * p);
  return (
    <svg width={MAP.w} height={MAP.h} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
      <path d={d} stroke={color} strokeWidth={3 / z} fill="none" pathLength={1} strokeDasharray={`${p} 1`} opacity={0.9} />
      {p > 0.98 ? <circle cx={px} cy={py} r={5 / z} fill="#FFFFFF" /> : null}
    </svg>
  );
};

/** Scattered attack blips on the map (deterministic), appearing from t0. */
export const AttackBlips: React.FC<{t0: number; z: number; n?: number; names?: string[]; color?: string}> = ({t0, z, n = 40, names, color = C.red}) => {
  const frame = useCurrentFrame();
  const pool = (names ? MAP.countries.filter((c) => names.includes(c.name)) : MAP.countries).filter((c) => c.c[0] > 0);
  return (
    <>
      {Array.from({length: n}).map((_, i) => {
        const c = pool[Math.floor(random(`blip-${i}`) * pool.length)];
        const start = t0 + random(`bs-${i}`) * 60;
        const life = ((frame - start) % 50) / 50;
        if (frame < start) return null;
        const jx = (random(`bx-${i}`) - 0.5) * 30;
        const jy = (random(`by-${i}`) - 0.5) * 20;
        return (
          <div key={i} style={{position: 'absolute', left: c.c[0] + jx, top: c.c[1] + jy, width: 0, height: 0, transform: `scale(${1 / z})`}}>
            <div style={{position: 'absolute', left: -14, top: -14, width: 28, height: 28, borderRadius: '50%', border: `2px solid ${color}`, transform: `scale(${0.2 + life})`, opacity: 1 - life}} />
            <div style={{position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: '50%', background: color}} />
          </div>
        );
      })}
    </>
  );
};

export const fadeIn = (frame: number, t: number, len = 14) => ramp(frame, t, len, Easing.out(Easing.cubic));
