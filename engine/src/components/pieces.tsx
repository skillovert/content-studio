import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Lock, Globe} from 'lucide-react';
import {C, F} from '../brand/theme';
import {Card, Sfx, TypingSfx} from './ui';
import {GlitchBurst, glitchShift} from './news';
import {COURSE, SAFE} from '../brand/course';

/* ---------- robot character ---------- */

export const Bot: React.FC<{
  color?: string;
  size?: number;
  mood?: 'happy' | 'angry' | 'reading';
  seed?: number;
}> = ({color = C.green, size = 160, mood = 'happy', seed = 0}) => {
  const frame = useCurrentFrame();
  const blink = (frame + seed * 37) % 110 < 5 ? 0.15 : 1;
  const bob = Math.sin((frame + seed * 20) / 9) * 4;
  const look = mood === 'reading' ? Math.sin((frame + seed * 13) / 7) * 6 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" style={{overflow: 'visible', transform: `translateY(${bob}px)`}}>
      <defs>
        <radialGradient id={`bg${color.slice(1)}`} cx="35%" cy="25%" r="85%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity={0.55} />
        </radialGradient>
      </defs>
      <line x1="80" y1="30" x2="80" y2="12" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <circle cx="80" cy="10" r="8" fill={color} />
      <rect x="18" y="30" width="124" height="100" rx="34" fill={`url(#bg${color.slice(1)})`} />
      <rect x="34" y="50" width="92" height="56" rx="22" fill={C.ink} />
      {mood === 'angry' ? (
        <>
          <path d="M50 64 L72 72" stroke={color} strokeWidth="6" strokeLinecap="round" />
          <path d="M110 64 L88 72" stroke={color} strokeWidth="6" strokeLinecap="round" />
          <rect x="54" y="76" width="14" height={12 * blink} rx="5" fill={color} />
          <rect x="92" y="76" width="14" height={12 * blink} rx="5" fill={color} />
        </>
      ) : (
        <>
          <ellipse cx={62 + look} cy="76" rx="9" ry={11 * blink} fill={color} />
          <ellipse cx={98 + look} cy="76" rx="9" ry={11 * blink} fill={color} />
          {mood === 'happy' ? <path d="M68 94 Q80 102 92 94" stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" /> : null}
        </>
      )}
      <rect x="6" y="66" width="12" height="30" rx="6" fill={color} opacity={0.8} />
      <rect x="142" y="66" width="12" height="30" rx="6" fill={color} opacity={0.8} />
    </svg>
  );
};

/* ---------- code editor ---------- */

export type CodeLine = {text: string; at: number; hl?: boolean; dim?: boolean};

const colorize = (text: string) => {
  if (text.startsWith('#')) return <span style={{color: C.muted, fontStyle: 'italic'}}>{text}</span>;
  // robots.txt-ish highlighting: key: value, yes/no, *
  const m = text.match(/^([A-Za-z-]+)(:)(.*)$/);
  if (!m) return <span style={{color: C.text}}>{text}</span>;
  const val = m[3].split(/(\byes\b|\bno\b|\*|=|,)/g).map((t, i) => {
    const col = t === 'yes' ? C.green : t === 'no' ? C.red : t === '*' ? C.amber : t === '=' || t === ',' ? C.muted : C.text;
    return (
      <span key={i} style={{color: col}}>
        {t}
      </span>
    );
  });
  return (
    <>
      <span style={{color: C.mint}}>{m[1]}</span>
      <span style={{color: C.muted}}>{m[2]}</span>
      {val}
    </>
  );
};

export const CodeEditor: React.FC<{
  file: string;
  lines: CodeLine[];
  width?: number;
  fontSize?: number;
  speed?: number;
  sfx?: boolean;
}> = ({file, lines, width = 1200, fontSize = 46, speed = 1.3, sfx = true}) => {
  const frame = useCurrentFrame();
  return (
    <Card style={{width, padding: 0}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14, padding: '22px 30px', borderBottom: `1.5px solid ${C.line}`}}>
        {[C.red, C.amber, C.green].map((c) => (
          <div key={c} style={{width: 18, height: 18, borderRadius: 9, background: c, opacity: 0.85}} />
        ))}
        <div
          style={{
            marginLeft: 20,
            fontFamily: F.mono,
            fontSize: 28,
            color: C.mint,
            padding: '6px 18px',
            borderRadius: 10,
            background: `rgba(${C.mintRgb},0.08)`,
          }}
        >
          {file}
        </div>
      </div>
      <div style={{padding: '34px 40px 40px', fontFamily: F.mono, fontSize, lineHeight: 1.65}}>
        {lines.map((l, i) => {
          const n = Math.max(0, Math.min(l.text.length, Math.floor((frame - l.at) * speed)));
          const typing = frame >= l.at && n < l.text.length;
          const shown = l.text.slice(0, n);
          const hlP = l.hl ? interpolate(frame - l.at - l.text.length / speed, [0, 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 34,
                opacity: frame < l.at ? 0.0 : l.dim ? 0.45 : 1,
                background: `rgba(${C.greenRgb},${0.12 * hlP})`,
                borderLeft: `5px solid rgba(${C.greenRgb},${hlP})`,
                margin: '0 -40px',
                padding: '0 40px 0 35px',
                minHeight: fontSize * 1.65,
              }}
            >
              <span style={{color: C.muted, opacity: 0.5, width: 30, textAlign: 'right'}}>{i + 1}</span>
              <span style={{whiteSpace: 'pre'}}>
                {colorize(shown)}
                {typing || (frame >= l.at && frame < l.at + l.text.length / speed + 20 && Math.floor(frame / 8) % 2 === 0) ? (
                  <span style={{color: C.green}}>▍</span>
                ) : null}
              </span>
              {sfx ? <TypingSfx from={l.at} chars={l.text.length} speed={speed} /> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- browser window ---------- */

export const Browser: React.FC<{
  url: string;
  typeAt?: number;
  width?: number;
  height?: number;
  children?: React.ReactNode;
  speed?: number;
}> = ({url, typeAt, width = 1100, height = 620, children, speed = 1.2}) => {
  const frame = useCurrentFrame();
  const n = typeAt === undefined ? url.length : Math.max(0, Math.min(url.length, Math.floor((frame - typeAt) * speed)));
  return (
    <Card style={{width, height, padding: 0}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14, padding: '20px 26px', borderBottom: `1.5px solid ${C.line}`}}>
        {[C.red, C.amber, C.green].map((c) => (
          <div key={c} style={{width: 16, height: 16, borderRadius: 8, background: c, opacity: 0.85}} />
        ))}
        <div
          style={{
            marginLeft: 16,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontFamily: F.mono,
            fontSize: 30,
            color: C.text,
            padding: '10px 22px',
            borderRadius: 14,
            background: C.inset,
            border: `1.5px solid ${C.line}`,
          }}
        >
          <Lock size={24} color={C.green} />
          <span>
            {url.slice(0, n)}
            {typeAt !== undefined && n < url.length && frame >= typeAt ? <span style={{color: C.green}}>▍</span> : null}
          </span>
        </div>
      </div>
      {typeAt !== undefined ? <TypingSfx from={typeAt} chars={url.length} speed={speed} /> : null}
      <div style={{position: 'relative', height: height - 90}}>{children}</div>
    </Card>
  );
};

/** Placeholder page content: abstract lines/blocks (no readable text). */
export const FakePage: React.FC<{tint?: string}> = ({tint = C.green}) => (
  <div style={{padding: 40, display: 'flex', flexDirection: 'column', gap: 22}}>
    <div style={{display: 'flex', gap: 24, alignItems: 'center'}}>
      <div style={{width: 70, height: 70, borderRadius: 20, background: `${tint}55`}} />
      <div style={{width: 340, height: 26, borderRadius: 13, background: C.fill2}} />
    </div>
    <div style={{width: '100%', height: 170, borderRadius: 22, background: `linear-gradient(120deg, ${tint}44, ${tint}11)`}} />
    {[0.9, 0.75, 0.82].map((w, i) => (
      <div key={i} style={{width: `${w * 100}%`, height: 20, borderRadius: 10, background: C.fill}} />
    ))}
  </div>
);

/* ---------- scene wrapper with transitions ---------- */

/** Per-scene placement from tools/fit_layout.py: screen position (px) of the design's top-left and its scale. */
export type Fit = {x: number; y: number; s: number};

/**
 * Wraps a scene: fade/scale transition, and places the 1920x1080 scene design on screen.
 * With `fit` (from the lesson's layout.json) the scene's real content is scaled up and centred
 * in the free area (below the bar, clear of the trainer card, away from the footer);
 * otherwise it falls back to the SAFE stage. `measure` renders the bare design at 1:1 for
 * tools/fit_layout.mjs.
 */
export const SceneShell: React.FC<{duration: number; children: React.ReactNode; whoosh?: boolean; fast?: boolean; zoom?: number; fit?: Fit; measure?: boolean; beats?: {at: number; fit?: Fit}[]}> = ({
  duration,
  children,
  whoosh = true,
  fast = false,
  zoom = 1,
  fit: sceneFit,
  measure = false,
  beats = [],
}) => {
  const frame = useCurrentFrame();
  // Per-beat placement (news): each voice segment can have its own fit; the camera eases
  // from one to the next over ~0.4 s at the segment start.
  let fit = sceneFit;
  const known = beats.filter((b) => b.fit);
  if (known.length) {
    let cur = 0;
    known.forEach((b, i) => {
      if (frame >= b.at) cur = i;
    });
    const a = known[Math.max(0, cur - 1)].fit!;
    const b = known[cur].fit!;
    const k = cur === 0 ? 1 : interpolate(frame, [known[cur].at - 3, known[cur].at + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
    fit = {x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, s: a.s + (b.s - a.s) * k};
  }
  // fast (L02+): ~0.23s cut-in and ~0.17s cut-out, no blur, so there is no dead air between scenes
  const [inLen, outLen] = fast ? [7, 5] : [14, 12];
  const inP = interpolate(frame, [0, inLen], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const outP = interpolate(frame, [duration - outLen, duration], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const opacity = inP * (1 - outP);
  const scale = fast ? 1.025 - 0.025 * inP + 0.02 * outP : 0.97 + 0.03 * inP + 0.03 * outP;
  const blur = fast ? 0 : (1 - inP) * 10 + outP * 10;
  if (measure) {
    return (
      <AbsoluteFill>
        <div style={{position: 'absolute', width: 1920, height: 1080, left: 0, top: 0}}>{children}</div>
      </AbsoluteFill>
    );
  }
  const stage = fit ?? {x: (1920 - 1920 * SAFE.scale) / 2, y: SAFE.top, s: SAFE.scale};
  return (
    <AbsoluteFill style={{opacity, filter: blur > 0.2 ? `blur(${blur}px)` : undefined, transform: fast ? `translateX(${(1 - inP) * 40 - outP * 40}px)` : undefined}}>
      {whoosh ? <Sfx name="whoosh-soft" at={0} volume={fast ? 0.2 : 0.35} /> : null}
      <div
        style={{
          position: 'absolute',
          width: 1920,
          height: 1080,
          left: stage.x,
          top: stage.y,
          transform: `scale(${stage.s})`,
          transformOrigin: 'top left',
        }}
      >
        <AbsoluteFill style={{transform: `scale(${scale * (fit ? 1 : zoom)})`}}>
          <AbsoluteFill style={{transform: glitchShift(frame, 0, 6, 'scene')}}>{children}</AbsoluteFill>
        </AbsoluteFill>
      </div>
      {whoosh ? <GlitchBurst at={0} len={6} seed={`scene-${duration}`} strength={0.75} /> : null}
    </AbsoluteFill>
  );
};

/* ---------- persistent chrome: course top bar, trainer card, progress ---------- */

/**
 * News chrome (owner's thumbnail reference carried into the video): brand-red
 * "BREAKING NEWS" label top-left, cyan dot + category top-right, the AQSA JAMIL badge
 * bottom-left with a small voice waveform, and a thin red progress line along the top edge.
 * hide: [from, to] frame ranges where the chrome steps aside (full-screen stinger).
 * speech: [from, to] frame ranges where the presenter speaks (drives the waveform).
 */
export const Chrome: React.FC<{code: string; title: string; category: string; hide?: [number, number][]; speech?: [number, number][]}> = ({
  code,
  category,
  hide = [],
  speech = [],
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const p = frame / durationInFrames;
  const show = hide.reduce(
    (acc, [a, b]) => Math.min(acc, interpolate(frame, [a - 8, a, b - 4, b + 8], [1, 0, 0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})),
    1,
  );
  const level = speech.reduce(
    (acc, [a, b]) => Math.max(acc, interpolate(frame, [a - 4, a + 6, b - 6, b + 6], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})),
    0,
  );
  return (
    <AbsoluteFill style={{pointerEvents: 'none', opacity: show}}>
      <div style={{position: 'absolute', left: 0, top: 0, height: 5, width: `${p * 100}%`, background: COURSE.color}} />
      <div style={{position: 'absolute', left: 64, top: 40, display: 'flex', alignItems: 'center', gap: 14}}>
        <div style={{padding: '8px 16px', background: COURSE.colorDeep, color: '#FFFFFF', fontFamily: F.mono, fontWeight: 600, fontSize: 24, letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 12}}>
          <span style={{width: 10, height: 10, borderRadius: 5, background: '#FFFFFF', opacity: Math.floor(frame / 15) % 2 ? 1 : 0.35}} />
          {COURSE.name.toUpperCase()}
        </div>
        <div style={{padding: '8px 14px', border: `1.5px solid ${C.line}`, color: C.muted, fontFamily: F.mono, fontSize: 22, letterSpacing: '0.1em'}}>{code}</div>
      </div>
      <div style={{position: 'absolute', right: 64, top: 48, display: 'flex', alignItems: 'center', gap: 12, fontFamily: F.mono, fontWeight: 600, fontSize: 24, letterSpacing: '0.12em', color: '#FFFFFF'}}>
        <span style={{width: 13, height: 13, borderRadius: 7, background: COURSE.cyan, boxShadow: `0 0 ${6 + 8 * level}px ${COURSE.cyan}`}} />
        {category.toUpperCase()}
      </div>
      <div style={{position: 'absolute', left: 64, bottom: 34, display: 'flex', alignItems: 'center', gap: 16}}>
        <NewsBadge text={COURSE.trainer} dot={false} />
        <svg width={90} height={30} style={{marginLeft: 6}}>
          {Array.from({length: 15}).map((_, i) => {
            const h = 3 + 24 * level * Math.abs(Math.sin(i * 1.9 + frame / 3.2) * Math.sin(frame / 5 + i));
            return <rect key={i} x={i * 6} y={15 - h / 2} width={3} height={h} rx={1.5} fill={COURSE.cyan} opacity={0.5 + 0.5 * level} />;
          })}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

/** The DS logo (public/brand/ds-logo.png: white "ds." with rainbow stripes on black). */
/** "NEWS by Aqsa Jamil" logo at `height` px (black canvas, or `onRed` for the brand-red canvas). */
export const BrandLogo: React.FC<{height: number; onRed?: boolean}> = ({height, onRed}) => (
  <Img src={staticFile(onRed ? 'brand/news-by-aqsa-jamil-onred.svg' : 'brand/news-by-aqsa-jamil.svg')} style={{height, display: 'block', flexShrink: 0}} />
);

/** Badge in the BREAKING NEWS label style (brand-red block, white mono caps, blinking dot). */
export const NewsBadge: React.FC<{text: string; size?: number; dot?: boolean}> = ({text, size = 24, dot = true}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{padding: `${size / 3}px ${size * 0.66}px`, background: COURSE.colorDeep, color: '#FFFFFF', fontFamily: F.mono, fontWeight: 600, fontSize: size, letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: size / 2, whiteSpace: 'nowrap'}}>
      {dot ? <span style={{width: size * 0.42, height: size * 0.42, borderRadius: size, background: '#FFFFFF', opacity: Math.floor(frame / 15) % 2 ? 1 : 0.35}} /> : null}
      {text.toUpperCase()}
    </div>
  );
};

/**
 * Presenter: Aqsa's cutout standing on the left (no rings), with a soft red glow behind her that
 * breathes; `level` (0..1) lifts the glow while she speaks.
 */
export const Speaker: React.FC<{height: number; level?: number}> = ({height, level = 1}) => {
  const frame = useCurrentFrame();
  const breathe = 0.5 + 0.5 * Math.sin(frame / 14);
  const w = height * (920 / 1606);
  return (
    <div style={{position: 'relative', width: w, height, flexShrink: 0}}>
      <div style={{position: 'absolute', left: -w * 0.3, right: -w * 0.3, top: height * 0.02, bottom: 0, background: `radial-gradient(closest-side at 50% 42%, rgba(${COURSE.colorRgb},${0.28 + 0.2 * breathe * level}), transparent)`}} />
      <Img src={staticFile(COURSE.photo)} style={{position: 'absolute', left: 0, bottom: 0, width: w}} />
    </div>
  );
};export {Globe};
