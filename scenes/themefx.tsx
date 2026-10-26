// What a theme adds around the graphics (server/themes.mjs): the canvas texture behind them, the
// screen effect over everything (old TV glass, film grain, letterbox), and the cut between beats.
import React from 'react';
import {AbsoluteFill, interpolate, random, useCurrentFrame} from 'remotion';
import {C} from '@studio/brand/theme';
import {COURSE} from '@studio/brand/course';
import {Sfx} from '@studio/components/ui';
import {GlitchBurst} from '@studio/components/news';
import {THEME} from './brand';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Animated paper or film grain (SVG noise, new seed every 2 frames). */
const Noise: React.FC<{opacity: number; blend?: React.CSSProperties['mixBlendMode']; freq?: number; id: string}> = ({opacity, blend = 'multiply', freq = 0.85, id}) => {
  const frame = useCurrentFrame();
  return (
    <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, opacity, mixBlendMode: blend, pointerEvents: 'none'}}>
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} seed={Math.floor(frame / 2) % 50} />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width={1920} height={1080} filter={`url(#${id})`} />
    </svg>
  );
};

/** The canvas behind the graphics. */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const b = THEME?.backdrop || {kind: 'grid', glow: 0.22, vignette: 0.6};
  const glow = `radial-gradient(900px 600px at 85% 15%, rgba(${COURSE.colorRgb},${b.glow ?? 0.2}), transparent 70%)`;
  const vignette = `radial-gradient(1200px 700px at 50% 50%, transparent 55%, rgba(0,0,0,${b.vignette ?? 0.5}) 100%)`;
  if (b.kind === 'paper') {
    const cols = b.columns || 6;
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        {/* column rules and a double rule under the masthead area, like a printed page */}
        {Array.from({length: cols - 1}).map((_, i) => (
          <div key={i} style={{position: 'absolute', top: 120, bottom: 70, left: 120 + ((1920 - 240) / cols) * (i + 1), width: 1, background: C.line}} />
        ))}
        <div style={{position: 'absolute', left: 120, right: 120, top: 104, height: 4, borderTop: `2px solid ${C.text}`, borderBottom: `1px solid ${C.text}`, opacity: 0.55}} />
        {b.halftone ? (
          <AbsoluteFill style={{backgroundImage: `radial-gradient(${C.text} 1.3px, transparent 1.6px)`, backgroundSize: '9px 9px', opacity: 0.09, WebkitMaskImage: 'radial-gradient(70% 60% at 100% 100%, #000, transparent 70%)', maskImage: 'radial-gradient(70% 60% at 100% 100%, #000, transparent 70%)'}} />
        ) : null}
        <Noise opacity={b.grain ?? 0.2} id="paper" freq={0.9} />
        <AbsoluteFill style={{background: `radial-gradient(1300px 800px at 50% 50%, transparent 60%, rgba(60,40,10,${b.vignette ?? 0.12}) 100%)`}} />
      </AbsoluteFill>
    );
  }
  const grid = b.light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.035)';
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {b.kind === 'plain' ? null : (
        <AbsoluteFill style={{backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`, backgroundSize: '64px 64px', backgroundPosition: `${(frame * 0.2) % 64}px 0px`}} />
      )}
      <AbsoluteFill style={{background: `${glow}, ${vignette}`}} />
    </AbsoluteFill>
  );
};

/** Wraps the whole picture for effects that change its colours (old TV colour fringing, warm grade). */
export const Lens: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  const e = THEME?.effect || {};
  const filters: string[] = [];
  if (e.fringe) filters.push('url(#fringe)');
  if (e.warm) filters.push(`sepia(${e.warm}) saturate(${1 - e.warm * 0.6})`);
  const flicker = e.flicker ? 1 - e.flicker * random(`fl-${frame}`) : 1;
  return (
    <AbsoluteFill style={{filter: filters.join(' ') || undefined, opacity: flicker, transform: e.curve ? 'scale(1.012)' : undefined}}>
      {e.fringe ? (
        <svg width={0} height={0} style={{position: 'absolute'}}>
          <filter id="fringe" x="0" y="0" width="100%" height="100%">
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feOffset in="r" dx={e.fringe} dy="0" result="r2" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
            <feOffset in="gb" dx={-e.fringe} dy="0" result="gb2" />
            <feBlend in="r2" in2="gb2" mode="screen" />
          </filter>
        </svg>
      ) : null}
      {children}
    </AbsoluteFill>
  );
};

/** Over everything: old TV glass (scan lines, rolling bar, curved vignette), film grain, letterbox. */
export const ScreenFx: React.FC = () => {
  const frame = useCurrentFrame();
  const e = THEME?.effect || {};
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {e.grain ? <Noise opacity={e.grain} blend="overlay" id="film" freq={1.1} /> : null}
      {e.crt ? (
        <>
          <AbsoluteFill style={{backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,${e.scanlines ?? 0.2}) 0 2px, transparent 2px 4px)`}} />
          {e.roll ? <div style={{position: 'absolute', left: 0, right: 0, height: 160, top: ((frame * 6) % 1400) - 200, background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.015), transparent)'}} /> : null}
          {/* curved glass: dark rounded edges and a soft reflection */}
          <AbsoluteFill style={{borderRadius: 70, boxShadow: `inset 0 0 ${180 * (e.curve ?? 1)}px rgba(0,0,0,0.85), inset 0 0 0 26px #050605`}} />
          <AbsoluteFill style={{background: 'radial-gradient(900px 420px at 30% 18%, rgba(255,255,255,0.05), transparent 70%)'}} />
        </>
      ) : null}
      {e.letterbox ? (
        <>
          <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: e.letterbox, background: '#000'}} />
          <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: e.letterbox, background: '#000'}} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

/** The cut at the start of a beat, in the theme's manner (glitch cuts stay inside SceneShell). */
export const Cut: React.FC = () => {
  const frame = useCurrentFrame();
  const t = THEME?.transition || 'glitch';
  if (t === 'page') {
    // a sheet of paper sweeps across, revealing the new page
    const x = interpolate(frame, [0, 10], [0, 2100], clamp);
    if (frame > 11) return null;
    return (
      <AbsoluteFill style={{pointerEvents: 'none', overflow: 'hidden'}}>
        <Sfx name="whoosh-soft" at={0} volume={0.25} />
        <div style={{position: 'absolute', top: 0, bottom: 0, left: x - 2100, width: 2100, background: C.bg1, boxShadow: '30px 0 40px rgba(40,30,10,0.25)'}} />
      </AbsoluteFill>
    );
  }
  if (t === 'tv') {
    // channel switch: a burst of static and a squash of the picture line
    if (frame > 7) return null;
    const o = interpolate(frame, [0, 2, 7], [1, 0.8, 0], clamp);
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <Sfx name="glitch" at={0} volume={0.3} />
        <Noise opacity={o} blend="normal" id={`static-${frame}`} freq={1.6} />
        <div style={{position: 'absolute', left: 0, right: 0, top: 540 - 3, height: 6, background: '#FFFFFF', opacity: o * 0.8, boxShadow: '0 0 30px #FFFFFF'}} />
      </AbsoluteFill>
    );
  }
  if (t === 'dissolve') {
    // a soft dip through black
    const o = interpolate(frame, [0, 4, 12], [0.55, 0.35, 0], clamp);
    return o > 0 ? <AbsoluteFill style={{background: '#000', opacity: o, pointerEvents: 'none'}} /> : null;
  }
  if (t === 'glitch') return null;
  return null; // slide: SceneShell's own quick slide-in
};

/** SceneShell's built-in glitch + whoosh belong to the glitch cut only. */
export const shellCut = () => (THEME?.transition || 'glitch') === 'glitch';
export {GlitchBurst};
