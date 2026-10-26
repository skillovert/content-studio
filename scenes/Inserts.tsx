// The visual director's inserts (server/director.mjs), each drawn in the style the brand picked for its
// category (server/cutouts.mjs): reference flashes, people and quotes, source captures, keyword
// highlights, map insets, number pops, date stamps, clip players, audio players and photos. Most take
// the full screen for their moment (place "full": the scene cuts away to the theme's backdrop and the
// insert, centred and enlarged, then cuts back); one set to "over" sits on one side while the graphic
// underneath steps back (dim + soft blur). Colours
// come from the brand (COURSE, tuned per theme) and the theme palette (C), so every style stays on-brand.
import React, {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Audio, continueRender, delayRender, Easing, Img, interpolate, OffthreadVideo, random, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {MessageCircle, Phone, Repeat2, User} from 'lucide-react';
import {C, F} from '@studio/brand/theme';
import {COURSE} from '@studio/brand/course';
import {Sfx, sp, TypingSfx} from '@studio/components/ui';
import {ramp} from '@studio/components/dev';
import {GlitchBurst, GlitchText, Highlighted, SourceFlash, Stamp} from '@studio/components/news';
import {AttackBlips, Clipping, Footage, MAP, MapPin, WorldMap, centroid, fadeIn} from '@studio/components/footage';
import {Browser} from '@studio/components/pieces';
import {Ring, countUp} from './graphics';
import {Backdrop, Cut, shellCut} from './themefx';
import type {Insert} from './types';
import {f} from './types';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
/** A media address: "static:<file under studio/public>" or a URL served by Content Studio. */
const src = (u: string) => (u.startsWith('static:') ? staticFile(u.slice(7)) : u);
type V = React.FC<{x: Insert; dur: number}>;

/** 0..1: how much an insert laid over the scene is up at this frame (drives the dim of the layer below). */
export const focusAt = (frame: number, inserts: Insert[]) =>
  inserts.filter((x) => x.place === 'over').reduce((k, x) => Math.max(k, interpolate(frame, [f(x.from), f(x.from) + 6, f(x.to) - 6, f(x.to)], [0, 1, 1, 0], clamp)), 0);

/** In/out envelope of one insert (local frames). */
const useEnv = (dur: number) => {
  const frame = useCurrentFrame();
  const p = sp(frame, 0, 15);
  const out = interpolate(frame, [dur - 7, dur], [0, 1], clamp);
  return {frame, p, out, style: {opacity: Math.min(1, p * 1.8) * (1 - out), transform: `translateX(${(1 - p) * 60 + out * 40}px) scale(${0.94 + 0.06 * p})`}};
};
const fadeOnly = (dur: number) => {
  const frame = useCurrentFrame();
  return {opacity: interpolate(frame, [0, 6, dur - 7, dur], [0, 1, 1, 0], clamp)};
};

/** Camera flash: a white blink as the insert lands. */
const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 2, 7], [0, 0.32, 0], clamp);
  return o > 0 ? <AbsoluteFill style={{background: '#FFFFFF', opacity: o, pointerEvents: 'none'}} /> : null;
};

const Tag: React.FC<{text: string; color?: string}> = ({text, color = COURSE.colorDeep}) => (
  <span style={{alignSelf: 'flex-start', padding: '6px 14px', background: color, color: '#FFFFFF', fontFamily: F.mono, fontWeight: 700, fontSize: 22, letterSpacing: '0.14em'}}>{text}</span>
);
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const Avatar: React.FC<{photo?: string; name?: string; size: number; ring?: string}> = ({photo, name, size, ring = COURSE.color}) => (
  <div style={{width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: `4px solid ${ring}`, background: `linear-gradient(150deg, ${COURSE.colorDeep}, ${C.bg2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
    {photo ? <Img src={src(photo)} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : <span style={{fontFamily: F.head, fontWeight: 900, fontSize: size * 0.36, color: '#FFFFFF'}}>{initials(name)}</span>}
  </div>
);
const Lines: React.FC<{widths: number[]; color?: string; h?: number}> = ({widths, color = '#D6D4CE', h = 12}) => (
  <>{widths.map((w, i) => <div key={i} style={{height: h, width: `${w * 100}%`, background: color, borderRadius: 3}} />)}</>
);

/* ------------------------------------------------------------------ references */

const RefSlam: V = ({x, dur}) => {
  const {style} = useEnv(dur);
  return (
    <div style={{position: 'absolute', left: 900, top: 170, display: 'flex', flexDirection: 'column', gap: 16, ...style}}>
      <Sfx name="whoosh" at={0} volume={0.3} />
      <Sfx name="impact" at={2} volume={0.25} />
      <Tag text="REFERENCE" />
      <div style={{transform: 'rotate(-1.5deg)'}}>
        <Clipping outlet={x.outlet || ''} date={x.date || ''} headline={x.headline || ''} hlAt={10} width={860} size={46} section="SOURCE" />
      </div>
      {x.url ? <div style={{fontFamily: F.mono, fontSize: 22, color: C.muted, letterSpacing: '0.04em'}}>{x.url}</div> : null}
    </div>
  );
};

const RefBrowser: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const words = (x.headline || '').split(' ');
  const marks = words.filter((w) => w.length > 6).slice(0, 2);
  return (
    <div style={{position: 'absolute', left: 840, top: 180, transform: `${style.transform} scale(0.86)`, transformOrigin: 'top left', opacity: style.opacity}}>
      <Sfx name="click" at={2} volume={0.3} />
      <Browser url={x.url || ''} typeAt={2} width={1100} height={640} speed={2.4}>
        <div style={{padding: '36px 46px', display: 'flex', flexDirection: 'column', gap: 18}}>
          <div style={{fontFamily: F.mono, fontSize: 24, color: COURSE.color, letterSpacing: '0.12em'}}>{(x.outlet || '').toUpperCase()} · {x.date}</div>
          <div style={{fontFamily: F.head, fontWeight: 800, fontSize: 56, lineHeight: 1.15, color: C.text, whiteSpace: 'normal', opacity: fadeIn(frame, 14, 10)}}>
            <Highlighted text={x.headline || ''} marks={marks} hlAt={22} />
          </div>
          <Lines widths={[0.95, 0.88, 0.7]} color={C.fill2} h={16} />
        </div>
      </Browser>
    </div>
  );
};

const RefTorn: V = ({x, dur}) => {
  const {style} = useEnv(dur);
  const edge = Array.from({length: 24}, (_, i) => `${(i / 23) * 100}% ${i % 2 ? 0 : 2.4}%`).join(', ');
  const bottom = Array.from({length: 24}, (_, i) => `${100 - (i / 23) * 100}% ${i % 2 ? 100 : 97.2}%`).join(', ');
  const tape = (left: number, rot: number): React.CSSProperties => ({position: 'absolute', top: -18, left, width: 150, height: 44, background: 'rgba(245,235,200,0.78)', transform: `rotate(${rot}deg)`, boxShadow: '0 2px 6px rgba(0,0,0,0.25)'});
  return (
    <div style={{position: 'absolute', left: 930, top: 210, ...style}}>
      <Sfx name="whoosh-soft" at={0} volume={0.35} />
      <div style={{position: 'relative', transform: 'rotate(-3deg)'}}>
        <div style={{clipPath: `polygon(${edge}, ${bottom})`, filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.5))'}}>
          <Clipping outlet={x.outlet || ''} date={x.date || ''} headline={x.headline || ''} hlAt={12} width={820} size={44} section="CUTTING" accent={COURSE.colorDeep} />
        </div>
        <div style={tape(40, -8)} />
        <div style={tape(640, 7)} />
      </div>
    </div>
  );
};

const RefStack: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const back = (x.others || []).slice(0, 3);
  return (
    <div style={{position: 'absolute', left: 900, top: 190, ...style}}>
      <Sfx name="whoosh" at={0} volume={0.3} />
      {back.map((o, i) => {
        const k = ramp(frame, 2 + i * 4, 14);
        return (
          <div key={i} style={{position: 'absolute', left: 0, top: 0, transform: `translate(${(i + 1) * 46 * k}px, ${(i + 1) * 30 * k}px) rotate(${(i % 2 ? 4 : -5) * k}deg) scale(0.92)`, opacity: 0.8 * k, filter: 'brightness(0.75)'}}>
            <Clipping outlet={o.outlet || ''} date={o.date || ''} headline={o.headline || ''} hlAt={999} width={800} size={38} section="ALSO" />
          </div>
        );
      })}
      <div style={{position: 'relative', transform: `rotate(-1deg) translateY(${(1 - ramp(frame, 10, 12)) * -30}px)`}}>
        <Sfx name="impact" at={12} volume={0.25} />
        <Clipping outlet={x.outlet || ''} date={x.date || ''} headline={x.headline || ''} hlAt={22} width={820} size={44} section="SOURCE" />
      </div>
    </div>
  );
};

const RefGlitch: V = ({x, dur}) => {
  const {style} = useEnv(dur);
  return (
    <div style={{position: 'absolute', left: 820, top: 230, opacity: style.opacity}}>
      <SourceFlash at={0} source={x.outlet || ''} date={x.date || ''} quote={x.headline || ''} marks={(x.headline || '').split(' ').filter((w) => w.length > 6).slice(0, 2)} width={1000} kind="REFERENCE" />
    </div>
  );
};

/* ------------------------------------------------------------------ people and quotes */

const QPortrait: V = ({x, dur}) => {
  const {style} = useEnv(dur);
  return (
    <div style={{position: 'absolute', left: 860, top: 200, width: 960, padding: '44px 50px', background: C.card, border: `1.5px solid ${C.line}`, boxShadow: C.shadow, display: 'flex', gap: 40, ...style}}>
      <Sfx name="pop" at={2} volume={0.35} />
      <Avatar photo={x.photo} name={x.speaker} size={190} />
      <div style={{display: 'flex', flexDirection: 'column', gap: 18, whiteSpace: 'normal'}}>
        <div style={{fontFamily: F.head, fontWeight: 800, fontSize: 46, color: C.text}}>{x.speaker}</div>
        <div style={{fontFamily: F.mono, fontSize: 22, color: C.muted, letterSpacing: '0.08em'}}>{[x.outlet, x.date].filter(Boolean).join(' · ').toUpperCase()}</div>
        <div style={{fontFamily: F.body, fontSize: 36, lineHeight: 1.45, color: C.text}}>“<Highlighted text={x.text || ''} marks={x.marks || []} hlAt={18} />”</div>
      </div>
    </div>
  );
};

const QPull: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  return (
    <div style={{position: 'absolute', left: 880, top: 170, width: 940, whiteSpace: 'normal', ...style}}>
      <Sfx name="whoosh-soft" at={0} volume={0.3} />
      <div style={{fontFamily: F.head, fontWeight: 900, fontSize: 260, lineHeight: 0.7, color: COURSE.color, transform: `scale(${0.6 + 0.4 * sp(frame, 0, 12)})`, transformOrigin: 'left top'}}>“</div>
      <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 54, lineHeight: 1.22, color: C.text, letterSpacing: '-0.01em', marginTop: -40}}>
        <Highlighted text={x.text || ''} marks={x.marks || []} hlAt={16} />
      </div>
      <div style={{marginTop: 30, display: 'flex', alignItems: 'center', gap: 18}}>
        <div style={{width: 80 * ramp(frame, 10, 14), height: 4, background: COURSE.color}} />
        <span style={{fontFamily: F.mono, fontSize: 26, color: C.muted, letterSpacing: '0.1em'}}>{(x.speaker || '').toUpperCase()}{x.outlet ? ` · ${x.outlet.toUpperCase()}` : ''}</span>
      </div>
    </div>
  );
};

const QSocial: V = ({x, dur}) => {
  const {style} = useEnv(dur);
  const icon = {size: 30, color: C.muted, strokeWidth: 1.8};
  return (
    <div style={{position: 'absolute', left: 980, top: 190, width: 800, padding: '34px 40px', borderRadius: 26, background: C.card, border: `1.5px solid ${C.line}`, boxShadow: C.shadow, display: 'flex', flexDirection: 'column', gap: 22, whiteSpace: 'normal', ...style}}>
      <Sfx name="pop" at={2} volume={0.35} />
      <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
        <Avatar photo={x.photo} name={x.speaker} size={86} ring={C.line} />
        <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 34, color: C.text}}>{x.speaker}</span>
          <span style={{fontFamily: F.body, fontSize: 24, color: C.muted}}>Statement{x.outlet ? ` · via ${x.outlet}` : ''}</span>
        </div>
      </div>
      <div style={{fontFamily: F.body, fontSize: 36, lineHeight: 1.45, color: C.text}}>
        <Highlighted text={x.text || ''} marks={x.marks || []} hlAt={16} />
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 40, borderTop: `1.5px solid ${C.line}`, paddingTop: 18}}>
        <span style={{fontFamily: F.mono, fontSize: 22, color: C.muted}}>{x.date}</span>
        <span style={{flex: 1}} />
        <MessageCircle {...icon} />
        <Repeat2 {...icon} />
      </div>
    </div>
  );
};

const QLower: V = ({x, dur}) => {
  const frame = useCurrentFrame();
  const bar = ramp(frame, 0, 12);
  const text = x.text || '';
  const n = Math.floor(Math.max(0, frame - 12) * 1.6);
  const out = interpolate(frame, [dur - 7, dur], [1, 0], clamp);
  return (
    <div style={{position: 'absolute', left: 100, bottom: 150, width: 1500, opacity: out, whiteSpace: 'normal'}}>
      <Sfx name="whoosh-soft" at={0} volume={0.3} />
      <div style={{display: 'flex', alignItems: 'stretch', transform: `translateX(${(1 - bar) * -80}px)`, opacity: bar}}>
        <div style={{width: 12, background: COURSE.color}} />
        <div style={{background: 'rgba(10,10,10,0.88)', padding: '14px 26px', display: 'flex', gap: 22, alignItems: 'baseline'}}>
          <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 40, color: '#FFFFFF'}}>{x.speaker}</span>
          <span style={{fontFamily: F.mono, fontSize: 22, color: COURSE.cyan, letterSpacing: '0.1em'}}>{[x.outlet, x.date].filter(Boolean).join(' · ').toUpperCase()}</span>
        </div>
      </div>
      <div style={{marginTop: 10, marginLeft: 12, background: 'rgba(10,10,10,0.72)', padding: '16px 26px', fontFamily: F.body, fontSize: 36, lineHeight: 1.4, color: '#FFFFFF', opacity: fadeIn(frame, 10, 8)}}>
        “{text.slice(0, n)}{n < text.length ? <span style={{color: COURSE.cyan}}>▍</span> : '”'}
      </div>
    </div>
  );
};

const QSplit: V = ({x, dur}) => {
  const {frame} = useEnv(dur);
  const k = ramp(frame, 0, 14);
  const o = fadeOnly(dur);
  return (
    <AbsoluteFill style={{...o, flexDirection: 'row'}}>
      <Sfx name="whoosh" at={0} volume={0.3} />
      <div style={{width: '42%', height: '100%', transform: `translateX(${(k - 1) * 100}%)`, background: `linear-gradient(160deg, ${COURSE.colorDeep}, ${C.bg0})`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
        {x.photo ? <Img src={src(x.photo)} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(0.4) contrast(1.1)'}} /> : <User size={420} color="rgba(255,255,255,0.35)" strokeWidth={1} />}
      </div>
      <div style={{flex: 1, background: C.bg0, transform: `translateX(${(1 - k) * 100}%)`, padding: '0 110px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34, whiteSpace: 'normal'}}>
        <span style={{fontFamily: F.mono, fontSize: 26, color: COURSE.cyan, letterSpacing: '0.14em'}}>{(x.speaker || '').toUpperCase()}</span>
        <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 58, lineHeight: 1.22, color: C.text}}>“<Highlighted text={x.text || ''} marks={x.marks || []} hlAt={18} />”</div>
        <span style={{fontFamily: F.mono, fontSize: 22, color: C.muted, letterSpacing: '0.08em'}}>{[x.outlet, x.date].filter(Boolean).join(' · ').toUpperCase()}</span>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ source capture */

/** A white document page: outlet header, body lines, the key line (headline) somewhere in it. */
const Page: React.FC<{x: Insert; key_: (node: React.ReactNode) => React.ReactNode; w?: number}> = ({x, key_, w = 860}) => (
  <div style={{width: w, background: '#F6F5F1', color: '#111111', padding: '34px 44px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.55)', whiteSpace: 'normal'}}>
    <div style={{display: 'flex', borderBottom: '2px solid #111', paddingBottom: 10, fontFamily: F.mono, fontSize: 20, letterSpacing: '0.1em'}}>
      <b>{(x.outlet || '').toUpperCase()}</b>
      <span style={{marginLeft: 'auto', color: '#666'}}>{x.date}</span>
    </div>
    <Lines widths={[0.96, 0.92, 0.6]} />
    {key_(<div style={{fontFamily: F.head, fontWeight: 800, fontSize: 38, lineHeight: 1.2}}>{x.headline}</div>)}
    <Lines widths={[0.94, 0.97, 0.9, 0.82, 0.5]} />
  </div>
);

const DocMarker: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const p = ramp(frame, 12, 16, Easing.out(Easing.cubic));
  return (
    <div style={{position: 'absolute', left: 920, top: 170, transform: `${style.transform} rotate(1deg)`, opacity: style.opacity}}>
      <Sfx name="whoosh-soft" at={0} volume={0.3} />
      <Page x={x} key_={(n) => <div style={{backgroundImage: `linear-gradient(${COURSE.cyan}, ${COURSE.cyan})`, backgroundRepeat: 'no-repeat', backgroundSize: `${p * 100}% 100%`, padding: '4px 8px', margin: '0 -8px'}}>{n}</div>} />
    </div>
  );
};

const DocLens: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const k = ramp(frame, 10, 18);
  const page = <Page x={x} key_={(n) => n} />;
  return (
    <div style={{position: 'absolute', left: 900, top: 160, ...style}}>
      <Sfx name="whoosh-soft" at={10} volume={0.3} />
      <div style={{filter: `brightness(${1 - 0.45 * k}) blur(${1.5 * k}px)`}}>{page}</div>
      <div style={{position: 'absolute', left: 260 - 200, top: 200 - 200 + (1 - k) * 160, width: 400, height: 400, borderRadius: '50%', overflow: 'hidden', border: `8px solid ${COURSE.color}`, boxShadow: '0 20px 50px rgba(0,0,0,0.6)', opacity: k}}>
        <div style={{position: 'absolute', left: -260 * 1.8 + 200, top: -200 * 1.8 + 200, transform: 'scale(1.8)', transformOrigin: '0 0'}}>{page}</div>
      </div>
      <div style={{position: 'absolute', left: 260 + 120, top: 200 + 120 + (1 - k) * 160, width: 26, height: 150, background: COURSE.colorDeep, borderRadius: 13, transform: 'rotate(-45deg)', transformOrigin: 'top center', opacity: k}} />
    </div>
  );
};

const DocCircle: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const d = ramp(frame, 12, 18, Easing.out(Easing.cubic));
  const a = ramp(frame, 26, 10);
  return (
    <div style={{position: 'absolute', left: 900, top: 170, ...style}}>
      <Page x={x} key_={(n) => <div style={{position: 'relative'}}>{n}
        <svg style={{position: 'absolute', left: -30, top: -26, overflow: 'visible'}} width={10} height={10}>
          <ellipse cx={420} cy={66} rx={430} ry={78} fill="none" stroke={COURSE.color} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - d} transform="rotate(-2 420 66)" />
          <path d="M 880 230 Q 930 170 860 120" fill="none" stroke={COURSE.color} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - a} />
        </svg>
      </div>} />
      <Sfx name="tick" at={12} volume={0.35} />
    </div>
  );
};

const DocRedact: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const r = ramp(frame, 14, 14);
  const bars = [0.9, 0.7, 0.95, 0.6, 0.85, 0.75];
  return (
    <div style={{position: 'absolute', left: 920, top: 170, ...style}}>
      <Sfx name="click" at={14} volume={0.35} />
      <div style={{width: 860, background: '#F6F5F1', color: '#111', padding: '34px 44px', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.55)', whiteSpace: 'normal'}}>
        <div style={{display: 'flex', borderBottom: '2px solid #111', paddingBottom: 10, fontFamily: F.mono, fontSize: 20, letterSpacing: '0.1em'}}><b>{(x.outlet || '').toUpperCase()}</b><span style={{marginLeft: 'auto', color: '#666'}}>{x.date}</span></div>
        {bars.slice(0, 3).map((w, i) => <div key={i} style={{height: 26, width: `${w * 100}%`, background: '#111'}} />)}
        <div style={{position: 'relative', fontFamily: F.head, fontWeight: 800, fontSize: 38, lineHeight: 1.2}}>
          {x.headline}
          <div style={{position: 'absolute', inset: '-4px -8px', background: '#111', transform: `scaleX(${1 - r})`, transformOrigin: 'right'}} />
        </div>
        {bars.slice(3).map((w, i) => <div key={i} style={{height: 26, width: `${w * 100}%`, background: '#111'}} />)}
        <span style={{alignSelf: 'flex-end', fontFamily: F.mono, fontWeight: 700, fontSize: 22, color: COURSE.colorDeep, border: `3px solid ${COURSE.colorDeep}`, padding: '4px 12px', transform: 'rotate(-4deg)'}}>KEY LINE</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ keywords */

const kwBox = (dur: number) => {
  const {frame, style} = useEnv(dur);
  return {frame, style: {...style, position: 'absolute' as const, left: 940, top: 380, width: 900, display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start', gap: 18}};
};
const kwSize = (t = '') => Math.min(130, Math.floor(1500 / Math.max(6, t.length)));
const KwText: React.FC<{t: string; style?: React.CSSProperties}> = ({t, style}) => <div style={{fontFamily: F.head, fontWeight: 900, fontSize: kwSize(t), lineHeight: 1.05, letterSpacing: '-0.03em', color: C.text, ...style}}>{t}</div>;
const KwSub: React.FC<{t?: string}> = ({t}) => (t ? <span style={{fontFamily: F.mono, fontSize: 24, color: C.muted, letterSpacing: '0.14em'}}>{t}</span> : null);

const KwMarker: V = ({x, dur}) => {
  const {frame, style} = kwBox(dur);
  const p = ramp(frame, 6, 12, Easing.out(Easing.cubic));
  return (
    <div style={style}>
      <Sfx name="whoosh-soft" at={4} volume={0.3} />
      <KwSub t={x.sub} />
      <div style={{position: 'relative'}}>
        <div style={{position: 'absolute', left: -16, right: -16, top: '18%', bottom: '8%', background: COURSE.color, transform: `scaleX(${p}) skewX(-8deg)`, transformOrigin: 'left'}} />
        <KwText t={x.text || ''} style={{position: 'relative', color: p > 0.5 ? '#FFFFFF' : C.text}} />
      </div>
    </div>
  );
};
const KwUnderline: V = ({x, dur}) => {
  const {frame, style} = kwBox(dur);
  return (
    <div style={style}>
      <KwText t={x.text || ''} />
      <div style={{height: 10, width: `${ramp(frame, 6, 14) * 100}%`, background: COURSE.cyan, borderRadius: 5}} />
      <KwSub t={x.sub} />
      <Sfx name="tick" at={6} volume={0.3} />
    </div>
  );
};
const KwBox: V = ({x, dur}) => {
  const {frame, style} = kwBox(dur);
  const d = ramp(frame, 4, 16);
  return (
    <div style={style}>
      <div style={{position: 'relative', padding: '24px 40px'}}>
        <svg style={{position: 'absolute', inset: 0, overflow: 'visible'}} width="100%" height="100%">
          <rect x={0} y={0} width="100%" height="100%" fill="none" stroke={COURSE.color} strokeWidth={6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - d} />
        </svg>
        {[[-12, -12], [null, -12], [-12, null], [null, null]].map(([l, t], i) => (
          <div key={i} style={{position: 'absolute', width: 24, height: 24, background: COURSE.cyan, ...(l === null ? {right: -12} : {left: l}), ...(t === null ? {bottom: -12} : {top: t}), opacity: d}} />
        ))}
        <KwText t={x.text || ''} />
      </div>
      <KwSub t={x.sub} />
      <Sfx name="blip" at={4} volume={0.3} />
    </div>
  );
};
const KwType: V = ({x, dur}) => {
  const {frame, style} = kwBox(dur);
  const t = x.text || '';
  const n = Math.min(t.length, Math.floor(Math.max(0, frame - 4) / 2));
  return (
    <div style={style}>
      <KwSub t={x.sub} />
      <KwText t={t.slice(0, n)} style={{fontFamily: F.mono, letterSpacing: '-0.01em', minHeight: kwSize(t)}} />
      <TypingSfx from={4} chars={t.length} speed={0.5} />
      <div style={{width: 18, height: kwSize(t) * 0.9, background: COURSE.cyan, opacity: Math.floor(frame / 8) % 2 ? 0.2 : 1, position: 'relative', top: -kwSize(t) - 18, left: n * kwSize(t) * 0.6 + 10}} />
    </div>
  );
};
const KwGlitch: V = ({x, dur}) => {
  const {style} = kwBox(dur);
  return (
    <div style={{...style, transform: undefined}}>
      <KwSub t={x.sub} />
      <GlitchText at={0} size={kwSize(x.text)} settle={12}>{x.text}</GlitchText>
      <GlitchBurst at={0} len={4} seed={x.text || 'k'} strength={0.4} sound={false} />
    </div>
  );
};

/* ------------------------------------------------------------------ maps */

type Pal = {sea: string; land: string; border: string; grid: string; tint: string; pin: string; glow?: boolean; halftone?: boolean};
const PALETTES: Record<string, () => Pal> = {
  atlas: () => ({sea: '#E9DFC8', land: '#D8C7A0', border: '#6B5B3E', grid: 'rgba(107,91,62,0.18)', tint: COURSE.colorDeep, pin: COURSE.colorDeep}),
  flat: () => ({sea: C.bg1, land: C.fill2, border: C.bg1, grid: 'transparent', tint: COURSE.color, pin: COURSE.cyan}),
  satellite: () => ({sea: '#020B18', land: '#0A1C33', border: '#2F8FD8', grid: 'rgba(63,169,245,0.08)', tint: COURSE.cyan, pin: COURSE.cyan, glow: true}),
  ink: () => ({sea: '#FAFAF7', land: '#FAFAF7', border: '#111111', grid: 'rgba(0,0,0,0.06)', tint: '#111111', pin: COURSE.colorDeep, halftone: true}),
};

const useMapCam = (names: string[], W: number, H: number) => {
  const frame = useCurrentFrame();
  const pts = names.map(centroid);
  let cam = {x: MAP.w / 2, y: MAP.h / 2 + 40, z: W / MAP.w};
  if (pts.length) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const bw = Math.max(240, Math.max(...xs) - Math.min(...xs) + 220);
    const bh = Math.max(150, Math.max(...ys) - Math.min(...ys) + 200);
    const target = {x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, z: Math.min(3, Math.max(W / MAP.w, Math.min(W / bw, H / bh)))};
    const k = ramp(frame, 6, 30);
    cam = {x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k, z: cam.z * Math.pow(target.z / cam.z, k)};
  }
  return cam;
};
const placeNames = (x: Insert) => (!x.places?.length || x.places[0] === '*' ? [] : (x.places || []).filter((n) => MAP.countries.some((c) => c.name === n)));
const short = (n: string) => (n === 'United States of America' ? 'USA' : n);

/** The world map in a palette, with the named countries tinted and pinned. */
const PaletteMap: React.FC<{x: Insert; pal: Pal; W: number; H: number}> = ({x, pal, W, H}) => {
  const frame = useCurrentFrame();
  const names = placeNames(x);
  const cam = useMapCam(names, W, H);
  const tp = fadeIn(frame, 10, 20);
  const world = !names.length;
  return (
    <div style={{position: 'absolute', inset: 0, background: pal.sea, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: MAP.w, height: MAP.h, transformOrigin: '0 0', transform: `translate(${W / 2}px, ${H / 2}px) scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`}}>
        <svg width={MAP.w} height={MAP.h} style={{overflow: 'visible', filter: pal.glow ? `drop-shadow(0 0 ${3 / cam.z}px ${pal.border})` : undefined}}>
          <defs>
            <pattern id="ht" width={6} height={6} patternUnits="userSpaceOnUse"><circle cx={3} cy={3} r={1.3} fill="#111" /></pattern>
          </defs>
          {Array.from({length: 13}).map((_, i) => <line key={`v${i}`} x1={(MAP.w / 12) * i} y1={0} x2={(MAP.w / 12) * i} y2={MAP.h} stroke={pal.grid} strokeWidth={1 / cam.z} />)}
          {Array.from({length: 7}).map((_, i) => <line key={`h${i}`} x1={0} y1={(MAP.h / 6) * i} x2={MAP.w} y2={(MAP.h / 6) * i} stroke={pal.grid} strokeWidth={1 / cam.z} />)}
          {MAP.countries.map((c) => <path key={c.name} d={c.d} fill={pal.halftone ? 'url(#ht)' : pal.land} fillOpacity={pal.halftone ? 0.35 : 1} stroke={pal.border} strokeWidth={(pal.glow ? 0.6 : 0.8) / cam.z} />)}
          {(world ? MAP.countries.filter((_, i) => i % 5 === 0).map((c) => c.name) : names).map((n) => {
            const c = MAP.countries.find((k) => k.name === n)!;
            return <path key={`t-${n}`} d={c.d} fill={pal.halftone ? '#111' : pal.tint} fillOpacity={(pal.halftone ? 0.85 : 0.65) * tp * (world ? 0.6 : 1)} stroke={pal.tint} strokeWidth={1.2 / cam.z} />;
          })}
          {pal.glow ? names.flatMap((n) => Array.from({length: 7}, (_, i) => {
            const [cx, cy] = centroid(n);
            return <circle key={`${n}-${i}`} cx={cx + (random(`${n}x${i}`) - 0.5) * 40} cy={cy + (random(`${n}y${i}`) - 0.5) * 30} r={1.6 / cam.z * (1 + random(`${n}r${i}`))} fill="#FFE9A8" opacity={tp * (0.5 + 0.5 * Math.sin(frame / 6 + i))} />;
          })) : null}
        </svg>
        <div style={{position: 'absolute', left: 0, top: 0, width: MAP.w, height: MAP.h}}>
          {names.slice(0, 5).map((n, j) => {
            const [px, py] = centroid(n);
            return <MapPin key={n} x={px} y={py} z={cam.z} p={fadeIn(frame, 24 + j * 5, 10)} lp={fadeIn(frame, 27 + j * 5, 10)} label={short(n)} dy={j % 2 ? 60 : -60} size={14} color={pal.pin} />;
          })}
        </div>
      </div>
    </div>
  );
};

const MapTactical: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const W = 1000;
  const H = 600;
  const names = placeNames(x);
  const cam = useMapCam(names, W, H);
  const tintP = fadeIn(frame, 10, 20);
  return (
    <div style={{position: 'absolute', left: 840, top: 170, ...style}}>
      <Sfx name="whoosh" at={0} volume={0.3} />
      <Footage at={0} w={W} h={H} label={x.label || 'MAP'}>
        <WorldMap w={W} h={H} cam={cam} tint={(n) => (names.includes(n) && tintP > 0 ? {c: C.red, o: tintP * 0.7} : undefined)}>
          {(z) => (
            <>
              <AttackBlips t0={2} z={z} n={names.length ? 16 : 36} names={names.length ? names : undefined} />
              {names.slice(0, 5).map((n, j) => {
                const [px, py] = centroid(n);
                return <MapPin key={n} x={px} y={py} z={z} p={fadeIn(frame, 24 + j * 5, 10)} lp={fadeIn(frame, 27 + j * 5, 10)} label={short(n)} dy={j % 2 ? 60 : -60} size={14} />;
              })}
            </>
          )}
        </WorldMap>
      </Footage>
    </div>
  );
};

const mapCard = (id: string): V => ({x, dur}) => {
  const {style} = useEnv(dur);
  const pal = PALETTES[id]();
  const W = 1000;
  const H = 600;
  const frame: Record<string, React.CSSProperties> = {
    atlas: {background: '#F1E8D3', padding: 22, border: '2px solid #6B5B3E', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', transform: 'rotate(-1deg)'},
    flat: {borderRadius: 28, overflow: 'hidden', boxShadow: C.shadow, border: `1.5px solid ${C.line}`},
    satellite: {borderRadius: 18, overflow: 'hidden', boxShadow: `0 0 60px rgba(47,143,216,0.35), ${C.shadow}`, border: '1.5px solid rgba(63,169,245,0.4)'},
    ink: {background: '#FAFAF7', padding: 16, border: '3px solid #111', boxShadow: '0 24px 60px rgba(0,0,0,0.5)'},
  };
  const label: Record<string, React.CSSProperties> = {
    atlas: {fontFamily: F.head, fontStyle: 'italic', fontWeight: 700, fontSize: 30, color: '#4A3D27'},
    flat: {fontFamily: F.head, fontWeight: 800, fontSize: 28, color: C.text},
    satellite: {fontFamily: F.mono, fontSize: 22, letterSpacing: '0.16em', color: '#8CCBFF'},
    ink: {fontFamily: F.head, fontWeight: 900, fontSize: 30, color: '#111', textTransform: 'uppercase'},
  };
  return (
    <div style={{position: 'absolute', left: 840, top: 160, ...style}}>
      <Sfx name="whoosh-soft" at={0} volume={0.3} />
      <div style={frame[id]}>
        <div style={{position: 'relative', width: W, height: H}}>
          <PaletteMap x={x} pal={pal} W={W} H={H} />
          <div style={{position: 'absolute', left: 26, top: 22, padding: id === 'flat' ? '8px 16px' : 0, borderRadius: 12, background: id === 'flat' ? 'rgba(0,0,0,0.35)' : 'transparent', ...label[id]}}>{x.label || 'MAP'}</div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ stat, date (one look each) */

const Stat: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const value = x.value || '';
  const pct = /%$/.test(value) ? Math.min(1, parseFloat(value) / 100) : 0;
  const c = ramp(frame, 4, 26);
  const big = <div style={{fontFamily: F.head, fontWeight: 900, fontSize: pct ? 110 : 200, lineHeight: 1, color: COURSE.cyan, letterSpacing: '-0.03em'}}>{countUp(value, c)}</div>;
  return (
    <div style={{position: 'absolute', left: 1020, top: 200, width: 760, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '40px 30px', background: C.card, border: `1.5px solid ${C.line}`, boxShadow: C.shadow, ...style}}>
      <Sfx name="pop" at={2} volume={0.4} />
      {pct ? <Ring share={pct} p={c} size={320} color={COURSE.cyan}>{big}</Ring> : big}
      {x.label ? <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 48, color: C.text, textAlign: 'center', whiteSpace: 'normal'}}>{x.label}</div> : null}
      {x.source ? <div style={{fontFamily: F.mono, fontSize: 22, color: C.muted, letterSpacing: '0.1em'}}>SOURCE · {x.source.toUpperCase()}</div> : null}
    </div>
  );
};

const DateStamp: V = ({x, dur}) => {
  const {style} = useEnv(dur);
  return (
    <div style={{position: 'absolute', left: 1180, top: 300, ...style, transform: undefined}}>
      <Stamp at={2} text={x.text || ''} sub={x.sub} color={C.amber} size={96} rotate={-6} />
    </div>
  );
};

/* ------------------------------------------------------------------ clip players */

/** What plays inside a player: the creator's clip (muted, under the voice), or the source's page scrolling. */
const ClipContent: React.FC<{x: Insert; w: number; h: number; dur: number}> = ({x, w, h, dur}) => {
  const frame = useCurrentFrame();
  if (x.kind === 'clip' && x.url) return <OffthreadVideo src={src(x.url)} muted startFrom={x.start ? f(x.start) : undefined} playbackRate={x.speed || 1} style={{width: w, height: h, objectFit: 'cover'}} />;
  const scroll = ramp(frame, 30, dur - 30) * 60;
  const s = Math.min(w / 1100, h / 700);
  return (
    <div style={{width: w, height: h, background: C.bg0, overflow: 'hidden', position: 'relative'}}>
      <div style={{position: 'absolute', left: (w - 1100 * s) / 2, top: (h - 660 * s) / 2, transform: `scale(${s})`, transformOrigin: 'top left'}}>
        <Browser url={x.url || ''} typeAt={4} width={1100} height={660} speed={2.2}>
          <div style={{padding: '34px 44px', transform: `translateY(${-scroll}px)`, display: 'flex', flexDirection: 'column', gap: 18}}>
            <div style={{fontFamily: F.mono, fontSize: 22, color: C.muted, letterSpacing: '0.1em'}}>{(x.outlet || '').toUpperCase()} · {x.date}</div>
            <div style={{fontFamily: F.head, fontWeight: 800, fontSize: 52, lineHeight: 1.15, color: C.text, whiteSpace: 'normal', opacity: fadeIn(frame, 16, 10)}}>{x.headline}</div>
            <Lines widths={[0.95, 0.88, 0.92, 0.6, 0.85]} color={C.fill2} h={16} />
          </div>
        </Browser>
      </div>
    </div>
  );
};
const clipLabel = (x: Insert) => (x.kind === 'clip' ? x.label || 'CLIP' : `FOOTAGE · ${(x.outlet || '').toUpperCase()}`).slice(0, 40);
const Scan: React.FC<{o?: number}> = ({o = 0.06}) => <AbsoluteFill style={{backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,${o}) 0 2px, transparent 2px 4px)`, pointerEvents: 'none'}} />;

const ClipRec: V = ({x, dur}) => {
  const {style} = useEnv(dur);
  return (
    <div style={{position: 'absolute', left: 820, top: 160, ...style}}>
      <Footage at={0} w={1020} h={640} label={clipLabel(x)}>{x.kind === 'clip' ? <ClipContent x={x} w={1020} h={640} dur={dur} /> : <div style={{paddingTop: 90}}><ClipContent x={x} w={1020} h={550} dur={dur} /></div>}</Footage>
    </div>
  );
};

const ClipTv: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const on = ramp(frame, 2, 8);
  return (
    <div style={{position: 'absolute', left: 860, top: 150, ...style}}>
      <Sfx name="glitch" at={2} volume={0.25} />
      <div style={{width: 980, padding: '40px 200px 40px 40px', borderRadius: 36, background: 'linear-gradient(160deg, #6A4A2C, #3B2814)', boxShadow: '0 30px 70px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.15)', position: 'relative'}}>
        <div style={{width: 740, height: 520, borderRadius: '42px / 34px', overflow: 'hidden', position: 'relative', background: '#000', boxShadow: 'inset 0 0 60px rgba(0,0,0,0.9)'}}>
          <div style={{transform: `scaleY(${0.02 + 0.98 * on})`, filter: 'contrast(1.15) saturate(1.25) sepia(0.15)', height: '100%'}}><ClipContent x={x} w={740} h={520} dur={dur} /></div>
          <Scan o={0.08} />
          <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, transparent 50%, rgba(0,0,0,0.65) 100%)'}} />
          <div style={{position: 'absolute', left: 24, bottom: 18, fontFamily: F.mono, fontSize: 20, color: '#E8FFE8', textShadow: '0 0 8px #7CFF7C'}}>{clipLabel(x)}</div>
        </div>
        {[0, 1].map((i) => <div key={i} style={{position: 'absolute', right: 70, top: 90 + i * 130, width: 74, height: 74, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #CFC5B5, #5A4E3E)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)'}} />)}
        <div style={{position: 'absolute', right: 56, bottom: 60, width: 100, height: 120, backgroundImage: 'repeating-linear-gradient(0deg, #2A1C0E 0 6px, transparent 6px 12px)'}} />
      </div>
    </div>
  );
};

const ClipPhone: V = ({x, dur}) => {
  const {style} = useEnv(dur);
  return (
    <div style={{position: 'absolute', left: 1240, top: 70, ...style}}>
      <Sfx name="pop-low" at={2} volume={0.3} />
      <div style={{width: 440, height: 900, borderRadius: 64, padding: 18, background: '#111', border: '3px solid #2A2A2A', boxShadow: C.shadow}}>
        <div style={{width: '100%', height: '100%', borderRadius: 48, overflow: 'hidden', position: 'relative', background: '#000'}}>
          <ClipContent x={x} w={404} h={864} dur={dur} />
          <div style={{position: 'absolute', left: '50%', top: 14, width: 120, height: 32, marginLeft: -60, borderRadius: 16, background: '#000'}} />
          <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, padding: '60px 24px 30px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', fontFamily: F.body, fontWeight: 700, fontSize: 26, color: '#FFF', whiteSpace: 'normal'}}>{x.kind === 'clip' ? x.label : x.outlet}</div>
        </div>
      </div>
    </div>
  );
};

const ClipProjector: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const flick = 0.85 + 0.15 * random(`pf-${Math.floor(frame / 2)}`);
  const jitter = (random(`pj-${frame}`) - 0.5) * 3;
  const holes = Array.from({length: 9});
  return (
    <div style={{position: 'absolute', left: 820, top: 170, ...style}}>
      <Sfx name="tick" at={0} volume={0.2} />
      <div style={{position: 'relative', width: 1020, height: 620, background: '#0B0906', padding: '0 70px', boxShadow: '0 30px 70px rgba(0,0,0,0.6)'}}>
        {[0, 1].map((side) => (
          <div key={side} style={{position: 'absolute', top: 0, bottom: 0, [side ? 'right' : 'left']: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', transform: `translateY(${(frame * 6) % 68}px)`}}>
            {holes.map((_, i) => <div key={i} style={{width: 34, height: 44, borderRadius: 6, background: '#E8DCC0', opacity: 0.85}} />)}
          </div>
        ))}
        <div style={{width: 880, height: 620, overflow: 'hidden', position: 'relative', transform: `translateY(${jitter}px)`, filter: `sepia(0.55) contrast(1.15) brightness(${flick})`}}>
          <ClipContent x={x} w={880} h={620} dur={dur} />
          <svg width={880} height={620} style={{position: 'absolute', inset: 0, opacity: 0.12, mixBlendMode: 'screen'}}>
            <filter id="pg"><feTurbulence type="fractalNoise" baseFrequency="0.8" seed={frame % 7} /></filter>
            <rect width={880} height={620} filter="url(#pg)" />
          </svg>
          <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(255,240,200,0.12), transparent 45%, rgba(0,0,0,0.7) 100%)'}} />
          <div style={{position: 'absolute', left: 300 + random(`ln-${Math.floor(frame / 5)}`) * 300, top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.25)'}} />
        </div>
      </div>
      <div style={{marginTop: 12, fontFamily: F.mono, fontSize: 22, letterSpacing: '0.14em', color: C.muted}}>{clipLabel(x)}</div>
    </div>
  );
};

const ClipMonitor: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  return (
    <div style={{position: 'absolute', left: 830, top: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', ...style}}>
      <div style={{width: 1000, padding: 16, borderRadius: 18, background: '#16181B', border: '2px solid #2B2F35', boxShadow: C.shadow}}>
        <div style={{width: 968, height: 545, position: 'relative', overflow: 'hidden', borderRadius: 6}}>
          <ClipContent x={x} w={968} h={545} dur={dur} />
          <div style={{position: 'absolute', left: 22, top: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', background: COURSE.colorDeep, fontFamily: F.mono, fontWeight: 700, fontSize: 22, color: '#FFF', letterSpacing: '0.12em'}}>
            <span style={{width: 12, height: 12, borderRadius: 6, background: '#FFF', opacity: Math.floor(frame / 15) % 2 ? 0.3 : 1}} />{x.kind === 'clip' ? 'CLIP' : 'LIVE'}
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex'}}>
            <div style={{background: COURSE.color, padding: '10px 18px', fontFamily: F.mono, fontWeight: 700, fontSize: 22, color: '#FFF'}}>{x.kind === 'clip' ? 'YOURS' : 'SOURCE'}</div>
            <div style={{flex: 1, background: 'rgba(10,10,10,0.85)', padding: '10px 18px', fontFamily: F.body, fontWeight: 600, fontSize: 24, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden'}}>{x.kind === 'clip' ? x.label : `${x.outlet} · ${x.headline}`}</div>
          </div>
        </div>
      </div>
      <div style={{width: 140, height: 50, background: 'linear-gradient(#2B2F35, #16181B)'}} />
      <div style={{width: 340, height: 16, borderRadius: 8, background: '#2B2F35'}} />
    </div>
  );
};

/* ------------------------------------------------------------------ audio players */

/** Level bars that move while the clip plays (decorative; the sound itself plays from the file). */
const Bars: React.FC<{n: number; h: number; color: string; w?: number; gap?: number; seed: string}> = ({n, h, color, w = 10, gap = 6, seed}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{display: 'flex', alignItems: 'center', gap, height: h}}>
      {Array.from({length: n}, (_, i) => {
        const v = 0.15 + 0.85 * Math.abs(Math.sin(frame / 3.1 + i * 0.7) * random(`${seed}-${i}-${Math.floor(frame / 3)}`));
        return <div key={i} style={{width: w, height: h * v, background: color, borderRadius: w / 2}} />;
      })}
    </div>
  );
};
const AudioSrc: React.FC<{x: Insert}> = ({x}) => (x.url ? <Audio src={src(x.url)} /> : null);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const AudioPhone: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const ring = Math.sin(frame / 2) * 6 * (1 - ramp(frame, 0, 14));
  return (
    <div style={{position: 'absolute', left: 860, top: 250, width: 940, padding: '40px 50px', background: C.card, border: `1.5px solid ${C.line}`, boxShadow: C.shadow, display: 'flex', alignItems: 'center', gap: 46, ...style}}>
      <AudioSrc x={x} />
      <div style={{width: 200, height: 200, borderRadius: '50%', background: COURSE.colorDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${ring}deg)`, flexShrink: 0}}>
        <Phone size={110} color="#FFFFFF" strokeWidth={1.6} />
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 16, flex: 1}}>
        <span style={{fontFamily: F.mono, fontSize: 24, color: COURSE.cyan, letterSpacing: '0.16em'}}>PHONE LINE · {clock(frame / 30)}</span>
        <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 44, color: C.text, whiteSpace: 'normal'}}>{x.label}</span>
        <div style={{position: 'relative', height: 70, display: 'flex', alignItems: 'center'}}>
          <div style={{position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: C.line}} />
          <Bars n={34} h={70} w={8} gap={9} color={COURSE.color} seed={x.name || 'p'} />
        </div>
      </div>
    </div>
  );
};

const AudioRadio: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const needle = 120 + 260 * ramp(frame, 0, 20);
  return (
    <div style={{position: 'absolute', left: 900, top: 220, width: 880, height: 520, borderRadius: 40, background: 'linear-gradient(170deg, #7A5534, #4A3220)', boxShadow: '0 30px 70px rgba(0,0,0,0.6)', padding: 40, display: 'flex', gap: 40, ...style}}>
      <AudioSrc x={x} />
      <div style={{width: 380, height: '100%', borderRadius: 24, background: 'radial-gradient(circle, #2A1D12 1.5px, transparent 2px) 0 0 / 18px 18px, #1E140C', transform: `scale(${1 + 0.008 * Math.sin(frame)})`}} />
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 26}}>
        <div style={{position: 'relative', height: 110, borderRadius: 12, background: '#F0DDB0', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.35)'}}>
          {Array.from({length: 21}, (_, i) => <div key={i} style={{position: 'absolute', left: 20 + i * 18, top: 18, width: 2, height: i % 5 ? 20 : 36, background: '#4A3220'}} />)}
          <div style={{position: 'absolute', left: needle, top: 8, width: 4, height: 94, background: COURSE.colorDeep}} />
        </div>
        <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 38, color: '#F7EAD0', whiteSpace: 'normal'}}>{x.label}</span>
        <div style={{display: 'flex', gap: 30, marginTop: 'auto'}}>
          {[0, 1].map((i) => <div key={i} style={{width: 90, height: 90, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #E8D9B8, #6E5536)'}} />)}
        </div>
      </div>
    </div>
  );
};

const AudioStudio: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const p = Math.min(1, frame / Math.max(1, dur - 10));
  return (
    <div style={{position: 'absolute', left: 860, top: 300, width: 960, padding: '36px 44px', background: C.card, border: `1.5px solid ${C.line}`, boxShadow: C.shadow, display: 'flex', flexDirection: 'column', gap: 22, ...style}}>
      <AudioSrc x={x} />
      <div style={{display: 'flex', alignItems: 'baseline', gap: 18}}>
        <Tag text="AUDIO" />
        <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 40, color: C.text}}>{x.label}</span>
      </div>
      <div style={{position: 'relative'}}>
        <Bars n={60} h={120} w={8} gap={6} color={COURSE.cyan} seed={x.name || 's'} />
        <div style={{position: 'absolute', top: 0, bottom: 0, left: `${p * 100}%`, width: 3, background: COURSE.color}} />
      </div>
    </div>
  );
};

const AudioVoicemail: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const p = Math.min(1, frame / Math.max(1, dur - 10));
  return (
    <div style={{position: 'absolute', left: 1180, top: 120, width: 560, height: 820, borderRadius: 54, padding: 40, background: '#111', border: '3px solid #2A2A2A', boxShadow: C.shadow, display: 'flex', flexDirection: 'column', gap: 30, ...style}}>
      <AudioSrc x={x} />
      <span style={{fontFamily: F.head, fontWeight: 800, fontSize: 44, color: '#FFF'}}>Voicemail</span>
      <div style={{display: 'flex', alignItems: 'center', gap: 22, padding: 24, borderRadius: 24, background: '#1E1E1E'}}>
        <Avatar name={x.label} size={90} ring="#333" />
        <span style={{fontFamily: F.body, fontWeight: 600, fontSize: 30, color: '#FFF', whiteSpace: 'normal'}}>{x.label}</span>
      </div>
      <Bars n={24} h={90} w={9} gap={9} color={COURSE.cyan} seed={x.name || 'v'} />
      <div style={{height: 8, borderRadius: 4, background: '#333'}}><div style={{width: `${p * 100}%`, height: '100%', borderRadius: 4, background: COURSE.color}} /></div>
      <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: F.mono, fontSize: 24, color: '#AAA'}}><span>{clock(frame / 30)}</span><span>{clock(dur / 30)}</span></div>
    </div>
  );
};

const AudioCassette: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const reel = (left: number) => (
    <div style={{position: 'absolute', left, top: 170, width: 160, height: 160, borderRadius: '50%', background: '#1A1A1A', border: '10px solid #E8E2D4', transform: `rotate(${frame * 9}deg)`}}>
      {[0, 60, 120].map((a) => <div key={a} style={{position: 'absolute', left: 66, top: 0, width: 8, height: 140, background: '#E8E2D4', transform: `rotate(${a}deg)`}} />)}
    </div>
  );
  return (
    <div style={{position: 'absolute', left: 900, top: 230, width: 880, height: 540, borderRadius: 30, background: '#2B2B2B', border: '3px solid #444', boxShadow: C.shadow, ...style}}>
      <AudioSrc x={x} />
      <div style={{position: 'absolute', left: 60, right: 60, top: 40, height: 100, borderRadius: 10, background: '#F4EFE3', borderTop: `18px solid ${COURSE.color}`, display: 'flex', alignItems: 'center', padding: '0 26px', fontFamily: F.body, fontStyle: 'italic', fontWeight: 600, fontSize: 32, color: '#222'}}>{x.label}</div>
      <div style={{position: 'absolute', left: 160, right: 160, top: 190, height: 120, borderRadius: 14, background: '#111'}} />
      {reel(200)}
      {reel(520)}
      <div style={{position: 'absolute', left: 220, right: 220, bottom: 40, height: 60, borderRadius: '10px 10px 0 0', background: '#3A3A3A'}} />
    </div>
  );
};

/* ------------------------------------------------------------------ photos */

const Pic: React.FC<{x: Insert; w: number; h: number; style?: React.CSSProperties}> = ({x, w, h, style}) =>
  x.url ? <Img src={src(x.url)} style={{width: w, height: h, objectFit: 'cover', objectPosition: 'center 20%', display: 'block', ...style}} /> : <div style={{width: w, height: h, background: `linear-gradient(150deg, ${COURSE.colorDeep}, ${C.bg2})`, ...style}} />;

const PhotoPolaroid: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const dev = ramp(frame, 4, 30);
  return (
    <div style={{position: 'absolute', left: 1080, top: 150, transform: `${style.transform} rotate(${3 - 2 * dev}deg)`, opacity: style.opacity}}>
      <Sfx name="click" at={2} volume={0.35} />
      <div style={{background: '#FBFBF8', padding: '26px 26px 110px', boxShadow: '0 26px 60px rgba(0,0,0,0.55)', position: 'relative'}}>
        <Pic x={x} w={600} h={600} style={{filter: `brightness(${0.4 + 0.6 * dev}) saturate(${0.5 + 0.5 * dev})`}} />
        <div style={{position: 'absolute', left: 30, right: 30, bottom: 30, fontFamily: F.body, fontStyle: 'italic', fontWeight: 600, fontSize: 36, color: '#222', textAlign: 'center'}}>{x.label}</div>
        <div style={{position: 'absolute', left: '50%', top: -14, width: 34, height: 34, marginLeft: -17, borderRadius: '50%', background: COURSE.color, boxShadow: '0 4px 8px rgba(0,0,0,0.4)'}} />
      </div>
    </div>
  );
};
const PhotoFrame: V = ({x, dur}) => {
  const {style} = useEnv(dur);
  return (
    <div style={{position: 'absolute', left: 860, top: 160, ...style}}>
      <div style={{border: `1.5px solid ${C.line}`, boxShadow: C.shadow}}>
        <Pic x={x} w={960} h={600} />
        <div style={{display: 'flex'}}>
          <div style={{width: 12, background: COURSE.color}} />
          <div style={{flex: 1, background: C.card, padding: '14px 22px', fontFamily: F.head, fontWeight: 700, fontSize: 32, color: C.text}}>{x.label}</div>
        </div>
      </div>
    </div>
  );
};
const PhotoKenBurns: V = ({x, dur}) => {
  const frame = useCurrentFrame();
  const o = fadeOnly(dur);
  const k = frame / Math.max(1, dur);
  return (
    <AbsoluteFill style={{...o, overflow: 'hidden', background: '#000'}}>
      <div style={{width: '100%', height: '100%', transform: `scale(${1.05 + 0.1 * k}) translate(${-2 * k}%, ${-1.5 * k}%)`}}><Pic x={x} w={1920} h={1080} /></div>
      <AbsoluteFill style={{background: 'linear-gradient(transparent 60%, rgba(0,0,0,0.75))'}} />
      <div style={{position: 'absolute', left: 120, bottom: 150, display: 'flex', alignItems: 'stretch'}}>
        <div style={{width: 10, background: COURSE.color}} />
        <div style={{padding: '10px 22px', fontFamily: F.head, fontWeight: 800, fontSize: 40, color: '#FFF', background: 'rgba(10,10,10,0.6)'}}>{x.label}</div>
      </div>
    </AbsoluteFill>
  );
};
const PhotoBoard: V = ({x, dur}) => {
  const {frame, style} = useEnv(dur);
  const s = ramp(frame, 14, 14);
  return (
    <div style={{position: 'absolute', left: 840, top: 150, width: 1000, height: 680, background: '#A9784A', backgroundImage: 'radial-gradient(rgba(0,0,0,0.12) 1.5px, transparent 2px)', backgroundSize: '9px 9px', border: '18px solid #5B3A1E', boxShadow: C.shadow, ...style}}>
      <div style={{position: 'absolute', left: 70, top: 60, background: '#FBFBF8', padding: 16, transform: 'rotate(-3deg)', boxShadow: '0 12px 26px rgba(0,0,0,0.45)'}}><Pic x={x} w={460} h={360} /></div>
      <svg style={{position: 'absolute', inset: 0}} width={964} height={644}><line x1={300} y1={70} x2={300 + (640 - 300) * s} y2={70 + (410 - 70) * s} stroke={COURSE.color} strokeWidth={4} /></svg>
      <div style={{position: 'absolute', left: 600, top: 400, width: 310, padding: '30px 20px 18px', background: '#FFF6C9', transform: 'rotate(4deg)', fontFamily: F.body, fontWeight: 700, fontSize: 30, color: '#222', whiteSpace: 'normal', opacity: s, boxShadow: '0 10px 20px rgba(0,0,0,0.4)'}}>{x.label}</div>
      {[[300, 70], [640, 410]].map(([l, t], i) => <div key={i} style={{position: 'absolute', left: l - 14, top: t - 14, width: 28, height: 28, borderRadius: '50%', background: COURSE.colorDeep, boxShadow: '0 3px 6px rgba(0,0,0,0.5)'}} />)}
    </div>
  );
};

/* ------------------------------------------------------------------ registry */

const STYLES: Record<string, Record<string, V>> = {
  ref: {slam: RefSlam, browser: RefBrowser, torn: RefTorn, stack: RefStack, glitch: RefGlitch},
  quote: {portrait: QPortrait, pull: QPull, social: QSocial, lower: QLower, split: QSplit},
  doc: {marker: DocMarker, lens: DocLens, circle: DocCircle, redact: DocRedact},
  keyword: {marker: KwMarker, underline: KwUnderline, box: KwBox, type: KwType, glitch: KwGlitch},
  place: {tactical: MapTactical, atlas: mapCard('atlas'), flat: mapCard('flat'), satellite: mapCard('satellite'), ink: mapCard('ink')},
  stat: {default: Stat},
  date: {default: DateStamp},
  footage: {rec: ClipRec, tv: ClipTv, phone: ClipPhone, projector: ClipProjector, monitor: ClipMonitor},
  audio: {phone: AudioPhone, radio: AudioRadio, studio: AudioStudio, voicemail: AudioVoicemail, cassette: AudioCassette},
  photo: {polaroid: PhotoPolaroid, frame: PhotoFrame, kenburns: PhotoKenBurns, board: PhotoBoard},
};
STYLES.clip = STYLES.footage;

/** The view for an insert: its brand style, else the first style of its kind. */
export const viewFor = (x: Insert): V | null => {
  const set = STYLES[x.kind];
  if (!set) return null;
  return (x.style && set[x.style]) || Object.values(set)[0];
};

// Where a full-screen insert is centred and how big it may grow (clear of the chrome labels).
const FIT = {left: 110, right: 1810, top: 140, bottom: 950, max: 1.45};

/**
 * A full-screen moment: the theme's canvas covers the scene and the insert (drawn for one side of the
 * frame) is measured once, then centred and enlarged. Its layout boxes are used, not its animated
 * transforms, so every frame lands in the same place.
 */
const FullScreen: React.FC<{dur: number; children: React.ReactNode}> = ({dur, children}) => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<string | null>(null);
  const [handle] = useState(() => delayRender('Fitting a full-screen insert'));
  useLayoutEffect(() => {
    const el = ref.current;
    let box = null as null | {l: number; t: number; r: number; b: number};
    for (const c of Array.from(el?.children || []) as HTMLElement[]) {
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      if (!w || !h || (w >= 1900 && h >= 1060)) continue; // sound-only and full-frame layers stay as they are
      const [l, t] = [c.offsetLeft, c.offsetTop];
      box = box ? {l: Math.min(box.l, l), t: Math.min(box.t, t), r: Math.max(box.r, l + w), b: Math.max(box.b, t + h)} : {l, t, r: l + w, b: t + h};
    }
    if (box) {
      const k = Math.min(FIT.max, (FIT.right - FIT.left) / (box.r - box.l), (FIT.bottom - FIT.top) / (box.b - box.t));
      const cx = (FIT.left + FIT.right) / 2 - k * (box.l + box.r) / 2;
      const cy = (FIT.top + FIT.bottom) / 2 - k * (box.t + box.b) / 2;
      setFit(`translate(${cx}px, ${cy}px) scale(${k})`);
    } else setFit('none');
    continueRender(handle);
  }, [handle]);
  const o = interpolate(frame, [0, 3, dur - 5, dur], [0, 1, 1, 0], clamp);
  return (
    <>
      <AbsoluteFill style={{background: C.bg0, opacity: o}}><Backdrop /></AbsoluteFill>
      <div ref={ref} style={{position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: fit || 'none', opacity: fit ? 1 : 0}}>{children}</div>
      {shellCut() ? <GlitchBurst at={0} len={6} seed="full" strength={0.6} /> : <Cut />}
    </>
  );
};

export const Inserts: React.FC<{inserts: Insert[]}> = ({inserts}) => (
  <>
    {inserts.map((x, i) => {
      const View = viewFor(x);
      const dur = Math.max(30, f(x.to) - f(x.from));
      if (!View) return null;
      const flash = ['ref', 'footage', 'doc'].includes(x.kind) ? <Flash /> : null;
      return (
        <Sequence key={i} from={f(x.from)} durationInFrames={dur} name={`insert-${x.kind}-${x.style || ''}-${x.place || 'full'}`}>
          {x.place === 'over' ? <>{flash}<View x={x} dur={dur} /></> : <FullScreen dur={dur}><View x={x} dur={dur} /></FullScreen>}
          {x.place === 'over' ? null : flash}
        </Sequence>
      );
    })}
  </>
);
