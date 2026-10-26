import React from 'react';
import {AbsoluteFill, Easing, interpolate, random, useCurrentFrame} from 'remotion';
import {C, F} from '../brand/theme';
import {COURSE} from '../brand/course';
import {Sfx, sp} from './ui';
import {ramp} from './dev';

/* News building blocks (NEWS by Aqsa Jamil): glitch bursts, source flashes, stamps, step
   badges, gauges, the opening stinger and the newsroom backdrop. Shared by every news video. */

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Text with a marker highlight that sweeps across `marks` (substrings) from frame `hlAt`. */
export const Highlighted: React.FC<{text: string; marks: string[]; hlAt: number; color?: string; base?: string}> = ({text, marks, hlAt, color = COURSE.cyan, base = C.text}) => {
  const frame = useCurrentFrame();
  if (!marks.length) return <>{text}</>;
  const re = new RegExp(`(${marks.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  let k = 0;
  return (
    <>
      {text.split(re).map((part, i) => {
        if (!marks.includes(part)) return <span key={i}>{part}</span>;
        const p = ramp(frame, hlAt + k++ * 22, 20, Easing.out(Easing.cubic));
        return (
          <span
            key={i}
            style={{
              backgroundImage: `linear-gradient(${color}, ${color})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${p * 100}% 86%`,
              backgroundPosition: '0 60%',
              fontWeight: 700,
              color: p > 0.45 ? '#0A0A0A' : base,
              padding: '0 4px',
              margin: '0 -4px',
            }}
          >
            {part}
          </span>
        );
      })}
    </>
  );
};

/**
 * Digital glitch burst over the whole frame: displaced colour slices (brand red, cyan, white),
 * black tear lines and a scanline flicker, for `len` frames from `at`.
 */
export const GlitchBurst: React.FC<{at: number; len?: number; seed?: string; strength?: number; sound?: boolean}> = ({at: t0, len = 8, seed = 'g', strength = 1, sound = true}) => {
  const frame = useCurrentFrame();
  const f = frame - t0;
  if (f < 0 || f > len) return sound && f < 0 && f > -2 ? null : sound && f === 0 ? <Sfx name="glitch" at={t0} volume={0.35 * strength} /> : null;
  const k = 1 - f / (len + 1);
  const bars = Array.from({length: 9}).map((_, i) => {
    const r = (n: string) => random(`${seed}-${t0}-${f}-${i}-${n}`);
    return {
      y: r('y') * 1080,
      h: 6 + r('h') * 70,
      x: (r('x') - 0.5) * 300,
      w: 300 + r('w') * 1500,
      c: [COURSE.colorDeep, COURSE.cyan, '#FFFFFF', '#000000'][Math.floor(r('c') * 4)],
      o: 0.35 + 0.5 * r('o'),
    };
  });
  return (
    <AbsoluteFill style={{pointerEvents: 'none', overflow: 'hidden'}}>
      {sound && f === 0 ? <Sfx name="glitch" at={t0} volume={0.35 * strength} /> : null}
      {bars.map((b, i) => (
        <div key={i} style={{position: 'absolute', left: b.x + (i % 2 ? 960 - b.w / 2 : 0), top: b.y, width: b.w, height: b.h, background: b.c, opacity: b.o * k * strength, mixBlendMode: b.c === '#000000' ? 'normal' : 'screen'}} />
      ))}
      <AbsoluteFill style={{backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 5px)', opacity: k * strength}} />
    </AbsoluteFill>
  );
};

/** Content jitter for a glitch burst (apply as transform on the glitched layer). */
export const glitchShift = (frame: number, t0: number, len = 8, seed = 'g') => {
  const f = frame - t0;
  if (f < 0 || f > len) return 'none';
  const k = 1 - f / (len + 1);
  const dx = (random(`${seed}-dx-${t0}-${f}`) - 0.5) * 60 * k;
  const sk = (random(`${seed}-sk-${t0}-${f}`) - 0.5) * 10 * k;
  return `translateX(${dx}px) skewX(${sk}deg)`;
};

/** Big text with an RGB-split (red/cyan) shadow that jitters, settling after `settle` frames. */
export const GlitchText: React.FC<{children: React.ReactNode; at: number; size: number; settle?: number; style?: React.CSSProperties}> = ({children, at: t0, size, settle = 10, style}) => {
  const frame = useCurrentFrame();
  const f = frame - t0;
  const k = interpolate(f, [0, settle], [1, 0], clamp); // fully still once settled
  const jx = (random(`gt-${Math.floor(frame / 2)}`) - 0.5) * size * 0.12 * k;
  const jy = (random(`gty-${Math.floor(frame / 2)}`) - 0.5) * size * 0.04 * k;
  return (
    <div
      style={{
        fontFamily: F.head,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '-0.035em',
        color: '#FFFFFF',
        textShadow: `${jx + size * 0.03 * k}px ${jy}px 0 rgba(208,53,59,${0.9 * Math.min(1, k * 3)}), ${-jx - size * 0.03 * k}px ${-jy}px 0 rgba(52,214,224,${0.9 * Math.min(1, k * 3)})`,
        transform: `translateX(${jx * 0.5}px)`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/**
 * Source flash: a news clipping shown like a footage insert. Glitches in, source name in big
 * letters with an RGB split, date + "SOURCE" label, then the quoted line with a cyan marker
 * sweep over the key words. Text only (no screenshots).
 */
export const SourceFlash: React.FC<{
  at: number;
  source: string;
  date: string;
  quote: string;
  marks?: string[];
  kind?: string;
  width?: number;
  tilt?: number;
}> = ({at: t0, source, date, quote, marks = [], kind = 'SOURCE', width = 1440, tilt = -1}) => {
  const frame = useCurrentFrame();
  if (frame < t0 - 1) return null;
  const p = sp(frame, t0, 16);
  const push = 1 + 0.012 * ramp(frame, t0, 240, Easing.linear); // slow, barely-there push-in
  const bar = ramp(frame, t0 + 2, 12, Easing.out(Easing.cubic));
  const q = ramp(frame, t0 + 6, 12);
  return (
    <>
      <Sfx name="blip" at={t0 + 2} volume={0.4} />
      <div style={{width, transform: `rotate(${tilt * 0.5 * p}deg) scale(${(0.96 + 0.04 * p) * push})`, opacity: Math.min(1, p * 2)}}>
        <div style={{position: 'relative', background: '#111111', border: `1.5px solid ${C.line}`, boxShadow: C.shadow, overflow: 'hidden'}}>
          <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: COURSE.color, transform: `scaleY(${bar})`, transformOrigin: 'top'}} />
          <div style={{padding: '40px 60px 48px 70px', display: 'flex', flexDirection: 'column', gap: 26}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
              <span style={{padding: '6px 14px', background: COURSE.colorDeep, color: '#FFFFFF', fontFamily: F.mono, fontWeight: 600, fontSize: 22, letterSpacing: '0.14em'}}>{kind}</span>
              <span style={{fontFamily: F.mono, fontSize: 24, color: C.muted, letterSpacing: '0.08em'}}>{date}</span>
              <span style={{marginLeft: 'auto', width: 12, height: 12, borderRadius: 6, background: COURSE.cyan}} />
            </div>
            <GlitchText at={t0} size={84}>
              {source}
            </GlitchText>
            <div style={{display: 'flex', gap: 24, opacity: q, transform: `translateY(${(1 - q) * 14}px)`}}>
              <div style={{fontFamily: F.head, fontSize: 90, lineHeight: 0.8, color: COURSE.color, fontWeight: 900}}>“</div>
              <div style={{fontFamily: F.body, fontSize: 40, lineHeight: 1.5, color: '#D9D9D9', whiteSpace: 'normal'}}>
                <Highlighted text={quote} marks={marks} hlAt={t0 + 16} />
              </div>
            </div>
          </div>
          <AbsoluteFill style={{backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 5px)', pointerEvents: 'none'}} />
        </div>
      </div>
      <GlitchBurst at={t0} len={4} seed={source} strength={0.6} sound={false} />
    </>
  );
};

/** Rubber stamp that slams in (PATCHED / EXPLOITED / LEAKED). */
export const Stamp: React.FC<{at: number; text: string; color?: string; size?: number; rotate?: number; sub?: string}> = ({at: t0, text, color = C.red, size = 64, rotate = -8, sub}) => {
  const frame = useCurrentFrame();
  if (frame < t0 - 1) return null;
  const p = interpolate(frame, [t0, t0 + 6], [0, 1], {...clamp, easing: Easing.in(Easing.quad)});
  return (
    <div
      style={{
        transform: `rotate(${rotate}deg) scale(${2.2 - 1.2 * p})`,
        opacity: p,
        border: `${size * 0.09}px solid ${color}`,
        borderRadius: size * 0.12,
        padding: `${size * 0.12}px ${size * 0.4}px`,
        color,
        fontFamily: F.head,
        fontWeight: 900,
        fontSize: size,
        letterSpacing: '0.08em',
        lineHeight: 1.05,
        textAlign: 'center',
        background: 'rgba(10,10,10,0.85)',
        whiteSpace: 'nowrap',
      }}
    >
      <Sfx name="impact" at={t0 + 5} volume={0.4} />
      {text}
      {sub ? <div style={{fontSize: size * 0.4, letterSpacing: '0.04em', fontWeight: 700}}>{sub}</div> : null}
    </div>
  );
};

/** "STEP n" badge + short jargon title, for the fix section. */
export const StepBadge: React.FC<{n: number; title: string; p?: number; color?: string}> = ({n, title, p = 1, color = C.green}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 22, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * -40}px)`}}>
    <div style={{padding: '10px 20px', background: color, color: '#0A0A0A', fontFamily: F.mono, fontWeight: 700, fontSize: 32, letterSpacing: '0.12em'}}>STEP {n}</div>
    <div style={{fontFamily: F.head, fontWeight: 800, fontSize: 64, letterSpacing: '-0.03em', color: C.text}}>{title}</div>
  </div>
);

/** Semicircle severity gauge 0..10 (CVSS), needle sweeps to `value`. */
export const Gauge: React.FC<{value: number; p: number; size?: number; label?: string}> = ({value, p, size = 420, label = 'CVSS'}) => {
  const v = value * p;
  const r = size * 0.4;
  const cx = size / 2;
  const cy = size * 0.52;
  const arc = (a0: number, a1: number) => {
    const P = (a: number) => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
    const [x0, y0] = P(a0);
    const [x1, y1] = P(a1);
    return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
  };
  const bands: [number, number, string][] = [
    [0, 0.4, C.green],
    [0.4, 0.7, C.amber],
    [0.7, 0.9, '#FF8A3D'],
    [0.9, 1, C.red],
  ];
  const ang = Math.PI * (1 - v / 10);
  return (
    <div style={{position: 'relative', width: size, height: size * 0.82}}>
      <svg width={size} height={size * 0.68} style={{overflow: 'visible'}}>
        {bands.map(([a, b, c]) => (
          <path key={a} d={arc(a + 0.005, b - 0.005)} stroke={c} strokeWidth={size * 0.07} fill="none" opacity={0.9} />
        ))}
        <line x1={cx} y1={cy} x2={cx + r * 0.86 * Math.cos(ang)} y2={cy - r * 0.86 * Math.sin(ang)} stroke={C.text} strokeWidth={size * 0.022} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={size * 0.035} fill={C.text} />
      </svg>
      <div style={{position: 'absolute', left: 0, right: 0, top: cy + size * 0.03, textAlign: 'center', fontFamily: F.mono, fontWeight: 800, fontSize: size * 0.16, color: v > 8.9 ? C.red : C.text, lineHeight: 1}}>
        {v.toFixed(1)}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: cy + size * 0.21, textAlign: 'center', fontFamily: F.mono, fontSize: size * 0.055, color: C.muted}}>{label}</div>
    </div>
  );
};

/**
 * Opening stinger: brand-red frame, black "BREAKING NEWS" label, glitching story title, the
 * cyan-dot category and the channel logo (news thumbnail layout, animated).
 */
export const Stinger: React.FC<{title: string; sub?: string; category: string; duration: number; mark: React.ReactNode}> = ({title, sub, category, duration, mark}) => {
  const frame = useCurrentFrame();
  const lab = sp(frame, 4, 12);
  const tt = sp(frame, 10, 14);
  const out = ramp(frame, duration - 10, 10);
  const wipe = ramp(frame, 0, 10, Easing.out(Easing.cubic));
  return (
    <AbsoluteFill style={{overflow: 'hidden', opacity: 1 - out}}>
      <Sfx name="riser" at={0} volume={0.3} />
      <Sfx name="impact" at={10} volume={0.55} />
      <AbsoluteFill style={{background: '#0A0A0A'}} />
      <AbsoluteFill style={{background: COURSE.colorDeep, clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`}} />
      <AbsoluteFill style={{backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 6px)'}} />
      <div style={{position: 'absolute', left: 100, top: 80, padding: '14px 26px', background: '#0A0A0A', color: '#FFFFFF', fontFamily: F.mono, fontWeight: 600, fontSize: 40, letterSpacing: '0.14em', opacity: lab, transform: `translateY(${(1 - lab) * -20}px)`}}>BREAKING NEWS</div>
      <div style={{position: 'absolute', right: 100, top: 96, display: 'flex', alignItems: 'center', gap: 16, fontFamily: F.mono, fontWeight: 600, fontSize: 36, letterSpacing: '0.12em', color: '#FFFFFF', opacity: lab}}>
        <span style={{width: 20, height: 20, borderRadius: 10, background: COURSE.cyan}} />
        {category.toUpperCase()}
      </div>
      <div style={{position: 'absolute', left: 100, top: 360, opacity: tt}}>
        <GlitchText at={10} size={210} settle={20}>
          {title}
        </GlitchText>
        {sub ? <div style={{marginTop: 34, fontFamily: F.mono, fontSize: 40, color: '#FFD9DA', opacity: ramp(frame, 26, 10)}}>{sub}</div> : null}
      </div>
      <div style={{position: 'absolute', left: 100, bottom: 80, display: 'flex', alignItems: 'center', gap: 22, opacity: ramp(frame, 20, 10)}}>
        {mark}
      </div>
      <GlitchBurst at={8} len={8} seed="stinger" />
      <GlitchBurst at={duration - 12} len={6} seed="stinger-out" strength={0.7} />
    </AbsoluteFill>
  );
};

/** Newsroom backdrop on the black canvas: faint grid, soft red glow and a vignette. */
export const NewsBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          backgroundPosition: `${(frame * 0.2) % 64}px 0px`,
        }}
      />
      <AbsoluteFill style={{background: `radial-gradient(900px 600px at 85% 15%, rgba(142,27,31,0.22), transparent 70%), radial-gradient(1200px 700px at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)`}} />
    </AbsoluteFill>
  );
};
