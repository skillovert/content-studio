// Sample thumbnail from the plan, in the N01 thumbnail layout (studio/src/components/thumb.tsx):
// top-left the News label then the lead Cause (outlined); top-right cyan dot + playlist name and
// the language badge; presenter bottom-left; jargon title + Urdu "threat + fix" line; black key
// visual box on the right; factual court stamp.
import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {Mic} from 'lucide-react';
import {C, F} from '@studio/brand/theme';
import {COURSE} from '@studio/brand/course';
import {IconTile} from '@studio/components/ui';
import {LANG} from '@studio/components/thumb';
import {iconFor, Person} from './graphics';
import {BRAND, hasPhoto, isLight} from './brand';
import type {PreviewProps} from './types';

const INK = '#FFD400';

const underlined = (t: string) =>
  t.split(/(\[\[.*?\]\])/).map((part, i) =>
    part.startsWith('[[') ? (
      <span key={i} style={{textDecoration: 'underline', textDecorationColor: INK, textDecorationThickness: 9, textUnderlineOffset: 26, textDecorationSkipInk: 'none'}}>{part.slice(2, -2)}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );

export const Thumb: React.FC<PreviewProps> = ({plan, playlist, label, cause, lang}) => {
  const L = LANG[lang] ?? {badge: lang.toUpperCase(), font: F.body, badgeSize: 20};
  const t = plan.thumbnail;
  const title = t.jargonTitle || plan.title.split(':')[0];
  // fitted to the text column (x 470 to 1230); plan checks keep titles to 16 characters
  const titleSize = Math.min(150, Math.floor(760 / Math.max(3, title.length * 0.58)));
  const mini = lineFor(t, lang);
  const longest = Math.max(1, ...mini.replace(/\[\[|\]\]/g, '').split('\n').map((l) => l.trim().length));
  const miniSize = Math.min(76, Math.floor(740 / (longest * (L.rtl ? 0.42 : 0.55))));
  const [s1, s2] = (t.stamp || '').split('·').map((s) => s.trim());
  const Icon = iconFor(`${t.keyVisual} ${title}`, iconFor(plan.card.topic[0] || ''));
  const X = 470;
  return (
    <AbsoluteFill style={{background: COURSE.thumbBg}}>
      <AbsoluteFill style={{background: 'radial-gradient(1200px 800px at 45% 55%, rgba(255,255,255,0.05), transparent 70%)'}} />
      <div style={{position: 'absolute', right: 0, bottom: 0, width: 1100, height: 460, backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 3px, transparent 3px 9px)', WebkitMaskImage: 'radial-gradient(130% 120% at 100% 100%, #000 35%, transparent 75%)', maskImage: 'radial-gradient(130% 120% at 100% 100%, #000 35%, transparent 75%)'}} />
      <div style={{position: 'absolute', left: -160, top: 250, width: 820, height: 900, background: 'radial-gradient(closest-side, rgba(10,10,10,0.42), transparent)'}} />
      {hasPhoto(BRAND) ? <Img src={staticFile(COURSE.photo)} style={{position: 'absolute', left: 0, bottom: 0, height: 840, filter: 'drop-shadow(0 0 26px rgba(0,0,0,0.45))'}} /> : <div style={{position: 'absolute', left: 0, bottom: 0}}><Person height={840} color="#FFFFFF" /></div>}
      <div style={{position: 'absolute', left: 70, bottom: 64, padding: '12px 22px', background: '#0A0A0A', color: '#FFFFFF', fontFamily: F.mono, fontWeight: 600, fontSize: 38, letterSpacing: '0.12em', lineHeight: 1}}>{COURSE.trainer.toUpperCase()}</div>
      <div style={{position: 'absolute', left: 100, top: 82, display: 'flex', gap: 16}}>
        {label ? <div style={{padding: '12px 22px', background: '#0A0A0A', color: '#FFFFFF', fontFamily: F.mono, fontWeight: 600, fontSize: 40, letterSpacing: '0.1em', lineHeight: 1}}>{label.toUpperCase()}</div> : null}
        {cause ? <div style={{padding: '10px 20px', border: '3px solid #0A0A0A', color: '#0A0A0A', fontFamily: F.mono, fontWeight: 700, fontSize: 36, letterSpacing: '0.1em', lineHeight: 1, display: 'flex', alignItems: 'center'}}>{cause.toUpperCase()}</div> : null}
      </div>
      <div style={{position: 'absolute', right: 100, top: 96, display: 'flex', alignItems: 'center', gap: 16, fontFamily: F.mono, fontWeight: 600, fontSize: 40, letterSpacing: '0.1em', color: '#FFFFFF', lineHeight: 1}}>
        <span style={{width: 22, height: 22, borderRadius: 11, background: COURSE.cyan}} />
        {playlist.toUpperCase()}
      </div>
      <div style={{position: 'absolute', right: 100, top: 160, height: 62, padding: '0 20px', border: '3px solid rgba(255,255,255,0.85)', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 12, fontFamily: L.badgeFont ?? F.body, fontWeight: 700, fontSize: L.badgeSize * 1.6}}>
        <Mic size={30} strokeWidth={2.6} />
        <span style={{direction: L.rtl ? 'rtl' : 'ltr', marginTop: L.badgeFont === F.urdu ? -12 : 0, lineHeight: 1}}>{L.badge}</span>
      </div>
      <div style={{position: 'absolute', left: X - 6, top: 300, fontFamily: F.head, fontWeight: 800, fontSize: titleSize, letterSpacing: '-0.045em', lineHeight: 1, color: '#FFFFFF', whiteSpace: 'nowrap'}}>{title}</div>
      <div style={{position: 'absolute', left: X, top: 460, width: 740, fontFamily: L.font, fontWeight: 700, fontSize: miniSize, lineHeight: L.rtl ? 1.85 : 1.25, color: '#FFFFFF', direction: L.rtl ? 'rtl' : 'ltr', textAlign: L.rtl ? 'right' : 'left', whiteSpace: 'pre-line'}}>{underlined(mini || '')}</div>
      <div style={{position: 'absolute', left: 1240, top: 250, width: 580, height: 580, background: BOX(), overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34}}>
        <IconTile icon={Icon} size={250} color={C.red} />
        <div style={{maxWidth: 480, padding: '12px 20px', border: `3px solid ${C.red}`, fontFamily: F.mono, fontWeight: 700, fontSize: 34, lineHeight: 1.3, color: lightBox() ? C.red : '#FF8F91', textAlign: 'center', whiteSpace: 'normal'}}>{shortVisual(t.keyVisual, title)}</div>
      </div>
      {s1 ? <CourtStamp line1={s1} line2={s2 || ''} /> : null}
    </AbsoluteFill>
  );
};

/** The "threat + fix" line in the thumbnail's language: a dub's own line, else the Urdu line for
 * Urdu (script and Roman both show the Nastaliq line, like N01), else the Roman line. */
const lineFor = (t: PreviewProps['plan']['thumbnail'], lang: string) =>
  t.lines?.find((l) => l.lang === lang)?.text || (lang.startsWith('ur') ? t.urduLine : '') || '';

/** Key-visual box: the brand's chosen colour, else its canvas colour (white for a light scheme). */
const BOX = () => BRAND?.thumbBox || (isLight() ? C.card : COURSE.black);
const lightBox = () => {
  const hex = BOX().replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};

/** The key-visual caption: the plan's own words, cut to a few. */
const shortVisual = (text: string, fallback: string) => {
  const words = (text || fallback).replace(/[.;:].*$/, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(' ');
};

const CourtStamp: React.FC<{line1: string; line2: string}> = ({line1, line2}) => (
  <div style={{position: 'absolute', left: 1640, top: 880, width: 'max-content', whiteSpace: 'nowrap', transform: 'translate(-50%, -50%) rotate(-8deg)'}}>
    <svg width={0} height={0} style={{position: 'absolute'}}>
      <filter id="stamp-ink">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.75" result="m" />
        <feComposite in="SourceGraphic" in2="m" operator="in" />
      </filter>
    </svg>
    <div style={{filter: 'url(#stamp-ink) drop-shadow(0 0 18px rgba(255,212,0,0.35)) drop-shadow(0 6px 10px rgba(0,0,0,0.35))', border: `8px solid ${INK}`, padding: 8}}>
      <div style={{border: `3px solid ${INK}`, padding: '12px 30px 14px', textAlign: 'center', color: INK}}>
        <div style={{fontFamily: F.head, fontWeight: 900, fontSize: 50, letterSpacing: '0.06em', lineHeight: 1}}>{line1.toUpperCase()}</div>
        {line2 ? (
          <div style={{display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', marginTop: 8}}>
            <span style={{width: 40, height: 3, background: INK}} />
            <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 30, letterSpacing: '0.22em'}}>{line2.toUpperCase()}</span>
            <span style={{width: 40, height: 3, background: INK}} />
          </div>
        ) : null}
      </div>
    </div>
  </div>
);
