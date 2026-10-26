import React, {createContext, useContext} from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {LucideIcon} from 'lucide-react';
import {C, F} from '../brand/theme';

/* ---------- timing helpers ---------- */

export type Segment = {cue: string; vo: string; from: number; duration: number};
export type Scene = {id: string; from: number; duration: number; cta?: boolean; segments: Segment[]};

/** Frame (scene-local) at which segment i starts, plus an optional delay. */
export const at = (scene: Scene, i: number, delay = 0) => (scene.segments[i]?.from ?? 0) + delay;

/** 0 → 1 spring that starts at `start` (scene-local frames). */
export const useIn = (start: number, damping = 18, mass = 0.7) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - start, fps, config: {damping, mass, stiffness: 120}});
};

/** Pure (non-hook) spring, safe inside conditionals. */
export const sp = (frame: number, start: number, damping = 18, mass = 0.7) =>
  spring({frame: frame - start, fps: 30, config: {damping, mass, stiffness: 120}});

/** Linear 0 → 1 between two frames, eased. */
export const useRamp = (start: number, len: number, ease = Easing.inOut(Easing.cubic)) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + len], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
};

/** Style for elements that pop in: fade + rise + slight scale. */
export const popStyle = (p: number, rise = 40): React.CSSProperties => ({
  opacity: Math.min(1, p * 1.4),
  transform: `translateY(${(1 - p) * rise}px) scale(${0.86 + 0.14 * p})`,
});

/* ---------- sound ---------- */

export const SfxEnabled = createContext(true);
/** Overall SFX level (final renders with a voice track use < 1 so the voice stays on top). */
export const SfxGain = createContext(1);

export type SfxName =
  | 'whoosh'
  | 'whoosh-soft'
  | 'pop'
  | 'pop-low'
  | 'click'
  | 'type'
  | 'ding'
  | 'success'
  | 'nope'
  | 'toggle'
  | 'riser'
  | 'impact'
  | 'alert'
  | 'tick'
  | 'tock'
  | 'glitch'
  | 'blip';

export const Sfx: React.FC<{name: SfxName; at: number; volume?: number}> = ({name, at: from, volume = 0.6}) => {
  const enabled = useContext(SfxEnabled);
  const gain = useContext(SfxGain);
  if (!enabled) return null;
  return (
    <Sequence from={Math.max(0, Math.round(from))} durationInFrames={75} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume * gain} />
    </Sequence>
  );
};

/** Keyboard ticks while `chars` characters are typed starting at `from`. */
export const TypingSfx: React.FC<{from: number; chars: number; speed: number}> = ({from, chars, speed}) => {
  const frames = Math.ceil(chars / speed);
  const ticks = [];
  for (let f = 0; f < frames; f += 3) ticks.push(<Sfx key={f} name="type" at={from + f} volume={0.35} />);
  return <>{ticks}</>;
};

/** Soft clock tick-tock while something progresses (bars filling, waiting): `frames` long from `from`. */
export const TickTock: React.FC<{from: number; frames: number; every?: number; volume?: number}> = ({from, frames, every = 6, volume = 0.22}) => {
  const ticks = [];
  for (let f = 0, i = 0; f < frames; f += every, i++) ticks.push(<Sfx key={f} name={i % 2 ? 'tock' : 'tick'} at={from + f} volume={volume} />);
  return <>{ticks}</>;
};

/* ---------- background ---------- */

const grain = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;

export const Grain: React.FC<{opacity?: number}> = ({opacity = 0.09}) => {
  const frame = useCurrentFrame();
  // jump the texture every 2 frames for a subtle film-grain shimmer
  const k = Math.floor(frame / 2);
  const x = (k * 73) % 300;
  const y = (k * 151) % 300;
  return (
    <AbsoluteFill
      style={{backgroundImage: grain, backgroundPosition: `${x}px ${y}px`, opacity, mixBlendMode: 'overlay', pointerEvents: 'none'}}
    />
  );
};

/** Plain white canvas, as in the owner's reference (no grid, no grain, no glow patches). */
export const Background: React.FC = () => <AbsoluteFill style={{backgroundColor: C.bg0}} />;

/* ---------- building blocks ---------- */

export const Center: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
  <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', ...style}}>{children}</AbsoluteFill>
);

export const Row: React.FC<{children: React.ReactNode; gap?: number; style?: React.CSSProperties}> = ({
  children,
  gap = 40,
  style,
}) => <div style={{display: 'flex', alignItems: 'center', gap, ...style}}>{children}</div>;

export const Col: React.FC<{children: React.ReactNode; gap?: number; style?: React.CSSProperties}> = ({
  children,
  gap = 24,
  style,
}) => <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap, ...style}}>{children}</div>;

export const Card: React.FC<{children: React.ReactNode; style?: React.CSSProperties; glow?: string}> = ({
  children,
  style,
  glow,
}) => (
  <div
    style={{
      position: 'relative',
      background: C.card,
      border: `1.5px solid ${glow ? `${glow}88` : C.line}`,
      borderRadius: 32,
      boxShadow: glow ? `0 0 0 4px ${glow}14, 0 0 56px ${glow}2e, ${C.shadow}` : C.shadow,
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);

/** Rounded "grainy green" tile with an icon inside. */
export const IconTile: React.FC<{
  icon: LucideIcon;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  solid?: boolean;
}> = ({icon: Icon, size = 120, color = C.green, style, solid = true}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: solid
        ? `radial-gradient(circle at 30% 25%, ${color}, ${shade(color)} 85%)`
        : `${color}14`,
      border: solid ? 'none' : `2px solid ${color}55`,
      boxShadow: solid ? `0 14px 34px ${color}33, inset 0 2px 0 rgba(255,255,255,0.25)` : 'none',
      flexShrink: 0,
      ...style,
    }}
  >
    {solid ? <Grain opacity={0.25} /> : null}
    <Icon size={size * 0.5} color={solid ? C.onSolid : color} strokeWidth={2.2} style={{position: 'relative'}} />
  </div>
);

const shade = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.55);
  const g = Math.round(((n >> 8) & 255) * 0.55);
  const b = Math.round((n & 255) * 0.55);
  return `rgb(${r},${g},${b})`;
};

/** Jargon pill. Mono by default because it's usually a code token. */
export const Chip: React.FC<{
  children: React.ReactNode;
  color?: string;
  size?: number;
  mono?: boolean;
  icon?: LucideIcon;
  solid?: boolean;
  style?: React.CSSProperties;
}> = ({children, color = C.green, size = 40, mono = true, icon: Icon, solid, style}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: size * 0.35,
      padding: `${size * 0.28}px ${size * 0.6}px`,
      borderRadius: 999,
      fontFamily: mono ? F.mono : F.head,
      fontWeight: 600,
      fontSize: size,
      letterSpacing: mono ? '-0.01em' : '-0.02em',
      color: solid ? C.onSolid : color,
      background: solid ? color : `${color}14`,
      border: `2px solid ${color}${solid ? '' : '55'}`,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {Icon ? <Icon size={size * 1.05} strokeWidth={2.4} /> : null}
    {children}
  </div>
);

export const Title: React.FC<{children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties}> = ({
  children,
  size = 96,
  color = C.text,
  style,
}) => (
  <div
    style={{
      fontFamily: F.head,
      fontWeight: 700,
      fontSize: size,
      letterSpacing: '-0.04em',
      lineHeight: 1.02,
      color,
      textAlign: 'center',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Label: React.FC<{children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties}> = ({
  children,
  size = 30,
  color = C.muted,
  style,
}) => (
  <div style={{fontFamily: F.body, fontWeight: 500, fontSize: size, color, letterSpacing: '0.01em', ...style}}>
    {children}
  </div>
);

/** Small round status mark (check / cross) that pops in. */
export const Mark: React.FC<{ok: boolean; p: number; size?: number; style?: React.CSSProperties}> = ({
  ok,
  p,
  size = 64,
  style,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: ok ? C.green : C.red,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transform: `scale(${p}) rotate(${(1 - p) * -90}deg)`,
      boxShadow: `0 10px 26px ${ok ? C.green : C.red}44`,
      flexShrink: 0,
      ...style,
    }}
  >
    <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke={C.onSolid} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round">
      {ok ? <path d="M4 12.5l5 5L20 6.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
    </svg>
  </div>
);

/** Yes/No toggle switch. `on` is 0..1 (animated). */
export const Toggle: React.FC<{on: number; scale?: number}> = ({on, scale = 1}) => {
  const w = 132 * scale;
  const h = 68 * scale;
  const k = h - 14 * scale;
  const col = on > 0.5 ? C.green : C.red;
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 18 * scale}}>
      <div
        style={{
          width: w,
          height: h,
          borderRadius: h,
          background: `${col}1f`,
          border: `2px solid ${col}`,
          position: 'relative',
          transition: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 5 * scale,
            left: 5 * scale + on * (w - k - 14 * scale),
            width: k,
            height: k,
            borderRadius: '50%',
            background: col,
            boxShadow: `0 6px 16px ${col}55`,
          }}
        />
      </div>
      <div style={{fontFamily: F.mono, fontWeight: 700, fontSize: 40 * scale, color: col, width: 80 * scale}}>
        {on > 0.5 ? 'yes' : 'no'}
      </div>
    </div>
  );
};

/** Animated arrow/line between two points (SVG, absolute in parent). */
export const Arrow: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  p: number;
  color?: string;
  width?: number;
  dashed?: boolean;
  curve?: number;
}> = ({x1, y1, x2, y2, p, color = C.green, width = 5, dashed, curve = 0}) => {
  const mx = (x1 + x2) / 2 + curve;
  const my = (y1 + y2) / 2 - Math.abs(curve) * 0.3;
  const d = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
  const len = Math.hypot(x2 - x1, y2 - y1) * 1.15 + Math.abs(curve);
  const angle = Math.atan2(y2 - my, x2 - mx);
  const ah = 22;
  return (
    <svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}} width={1} height={1}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dashed ? '14 14' : `${len}`}
        strokeDashoffset={dashed ? -p * 200 : len * (1 - p)}
        opacity={dashed ? Math.min(1, p * 3) : 1}
      />
      {p > 0.92 ? (
        <path
          d={`M${x2},${y2} L${x2 - ah * Math.cos(angle - 0.45)},${y2 - ah * Math.sin(angle - 0.45)} M${x2},${y2} L${
            x2 - ah * Math.cos(angle + 0.45)
          },${y2 - ah * Math.sin(angle + 0.45)}`}
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          fill="none"
        />
      ) : null}
    </svg>
  );
};

/** Absolutely positioned box centered on (x, y). */
export const At: React.FC<{x: number; y: number; children: React.ReactNode; style?: React.CSSProperties}> = ({
  x,
  y,
  children,
  style,
}) => (
  <div style={{position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', ...style}}>
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>{children}</div>
  </div>
);
