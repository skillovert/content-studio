import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {Mic} from 'lucide-react';
import {C, F} from '../brand/theme';
import {COURSE} from '../brand/course';

/**
 * NEWS by Aqsa Jamil thumbnail (1920x1080, Full HD), from the owner's reference
 * (public/brand/ref-ds-thumbnail-style.png, 642x359 = 1/3 scale):
 *  - brand red canvas #8E1B1F
 *  - top-left black label "BREAKING NEWS" (+ outlined kind label, e.g. EXPLAINED)
 *  - top-right cyan dot + category (CYBERSECURITY), language badge under it (mic + اردو)
 *  - huge white title on the left: jargon line in Geist, then the title in the language's own
 *    script (Urdu in Noto Nastaliq)
 *  - presenter photo (smaller) bottom-left under the labels, AQSA JAMIL label on it; no rings
 *  - title + Urdu line in the middle, large black square with the key visual on the right
 *  - scan lines lower right and an optional court-style stamp (e.g. MUST WATCH / HELP OTHERS)
 */
export const NewsThumb: React.FC<{
  kicker?: string;
  category: string;
  title: string;
  mini: string;
  lang: string;
  titleSize?: number;
  miniSize?: number;
  stamp?: [string, string];
  children: React.ReactNode;
}> = ({kicker = 'EXPLAINED', category, title, mini, lang, titleSize = 150, miniSize = 76, stamp, children}) => {
  const L = LANG[lang] ?? LANG['en-US'];
  const X = 470; // text column, just right of the presenter
  return (
    <AbsoluteFill style={{background: COURSE.thumbBg}}>
      <AbsoluteFill style={{background: 'radial-gradient(1200px 800px at 45% 55%, rgba(255,255,255,0.05), transparent 70%)'}} />
      {/* scan lines, lower right, fading in from the left/top */}
      <div style={{position: 'absolute', right: 0, bottom: 0, width: 1100, height: 460, backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 3px, transparent 3px 9px)', WebkitMaskImage: 'radial-gradient(130% 120% at 100% 100%, #000 35%, transparent 75%)', maskImage: 'radial-gradient(130% 120% at 100% 100%, #000 35%, transparent 75%)'}} />
      {/* presenter: smaller, bottom-left, under the labels; AQSA JAMIL label on the photo */}
      <div style={{position: 'absolute', left: -160, top: 250, width: 820, height: 900, background: 'radial-gradient(closest-side, rgba(10,10,10,0.42), transparent)'}} />
      <Img src={staticFile(COURSE.photo)} style={{position: 'absolute', left: 0, bottom: 0, height: 840, filter: 'drop-shadow(0 0 26px rgba(0,0,0,0.45))'}} />
      <div style={{position: 'absolute', left: 70, bottom: 64, padding: '12px 22px', background: '#0A0A0A', color: '#FFFFFF', fontFamily: F.mono, fontWeight: 600, fontSize: 38, letterSpacing: '0.12em', lineHeight: 1}}>{COURSE.trainer.toUpperCase()}</div>
      <div style={{position: 'absolute', left: 100, top: 82, display: 'flex', gap: 16}}>
        <div style={{padding: '12px 22px', background: '#0A0A0A', color: '#FFFFFF', fontFamily: F.mono, fontWeight: 600, fontSize: 40, letterSpacing: '0.1em', lineHeight: 1}}>BREAKING NEWS</div>
        {kicker ? <div style={{padding: '10px 20px', border: '3px solid #0A0A0A', color: '#0A0A0A', fontFamily: F.mono, fontWeight: 700, fontSize: 36, letterSpacing: '0.1em', lineHeight: 1, display: 'flex', alignItems: 'center'}}>{kicker}</div> : null}
      </div>
      <div style={{position: 'absolute', right: 100, top: 96, display: 'flex', alignItems: 'center', gap: 16, fontFamily: F.mono, fontWeight: 600, fontSize: 40, letterSpacing: '0.1em', color: '#FFFFFF', lineHeight: 1}}>
        <span style={{width: 22, height: 22, borderRadius: 11, background: COURSE.cyan}} />
        {category.toUpperCase()}
      </div>
      <div style={{position: 'absolute', right: 100, top: 160, height: 62, padding: '0 20px', border: '3px solid rgba(255,255,255,0.85)', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 12, fontFamily: L.badgeFont ?? F.body, fontWeight: 700, fontSize: L.badgeSize * 1.6}}>
        <Mic size={30} strokeWidth={2.6} />
        <span style={{direction: L.rtl ? 'rtl' : 'ltr', marginTop: L.badgeFont === F.urdu ? -12 : 0, lineHeight: 1}}>{L.badge}</span>
      </div>
      <div style={{position: 'absolute', left: X - 6, top: 300, fontFamily: F.head, fontWeight: 800, fontSize: titleSize, letterSpacing: '-0.045em', lineHeight: 1, color: '#FFFFFF', whiteSpace: 'nowrap'}}>{title}</div>
      <div style={{position: 'absolute', left: X, top: 460, width: 740, fontFamily: L.font, fontWeight: 700, fontSize: miniSize, lineHeight: 1.85, color: '#FFFFFF', direction: L.rtl ? 'rtl' : 'ltr', textAlign: L.rtl ? 'right' : 'left', whiteSpace: 'pre-line'}}>{underlined(mini)}</div>
      {/* key visual: bigger now that the photo is smaller */}
      <div style={{position: 'absolute', left: 1240, top: 250, width: 580, height: 580, background: '#0A0A0A', overflow: 'hidden'}}>
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: 'translateY(-34px) scale(1.15)'}}>{children}</AbsoluteFill>
      </div>
      {stamp ? <CourtStamp line1={stamp[0]} line2={stamp[1]} /> : null}
    </AbsoluteFill>
  );
};

/** Mini title: text inside [[...]] gets a thick yellow underline (e.g. the "fix" part). */
const underlined = (t: string) =>
  t.split(/(\[\[.*?\]\])/).map((part, i) =>
    part.startsWith('[[') ? (
      <span key={i} style={{textDecoration: 'underline', textDecorationColor: INK, textDecorationThickness: 9, textUnderlineOffset: 26, textDecorationSkipInk: 'none'}}>{part.slice(2, -2)}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );

/** Rubber "court" stamp: double border, distressed ink, slight tilt. Slammed on the visual box's bottom-right corner. */
const INK = '#FFD400'; // warning yellow: most urgent + readable ink on the brand red
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
        <div style={{fontFamily: F.head, fontWeight: 900, fontSize: 50, letterSpacing: '0.06em', lineHeight: 1}}>{line1}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', marginTop: 8}}>
          <span style={{width: 40, height: 3, background: INK}} />
          <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 30, letterSpacing: '0.22em'}}>{line2}</span>
          <span style={{width: 40, height: 3, background: INK}} />
        </div>
      </div>
    </div>
  </div>
);

/** Per-language badge text (in that language) and font for the mini title. */
export const LANG: Record<string, {badge: string; font: string; badgeSize: number; badgeFont?: string; rtl?: boolean}> = {
  'ur-Latn': {badge: 'اردو', font: F.urdu, badgeFont: F.urdu, badgeSize: 21, rtl: true},
  'en-US': {badge: 'English', font: F.body, badgeSize: 20},
  'en-GB': {badge: 'English (UK)', font: F.body, badgeSize: 20},
  'en-AU': {badge: 'English (AU)', font: F.body, badgeSize: 20},
  de: {badge: 'Deutsch', font: F.body, badgeSize: 20},
  es: {badge: 'Español', font: F.body, badgeSize: 20},
  fr: {badge: 'Français', font: F.body, badgeSize: 20},
  it: {badge: 'Italiano', font: F.body, badgeSize: 20},
  'pt-BR': {badge: 'Português', font: F.body, badgeSize: 20},
  tr: {badge: 'Türkçe', font: F.body, badgeSize: 20},
  id: {badge: 'Indonesia', font: F.body, badgeSize: 20},
  hi: {badge: 'हिन्दी', font: F.body, badgeSize: 21},
  bn: {badge: 'বাংলা', font: F.bengali, badgeFont: F.bengali, badgeSize: 21},
  ar: {badge: 'العربية', font: F.arabic, badgeFont: F.arabic, badgeSize: 21, rtl: true},
  ps: {badge: 'پښتو', font: F.arabic, badgeFont: F.arabic, badgeSize: 21, rtl: true},
};

/** Small white "window" card used inside thumbnail graphic boxes. */
export const ThumbCard: React.FC<{file: string; children: React.ReactNode; width?: number; style?: React.CSSProperties}> = ({file, children, width = 420, style}) => (
  <div style={{width, background: '#FFFFFF', borderRadius: 16, boxShadow: '0 12px 30px rgba(10,30,60,0.12)', overflow: 'hidden', ...style}}>
    <div style={{display: 'flex', alignItems: 'center', gap: 9, padding: '13px 18px', borderBottom: `1.5px solid ${C.line}`}}>
      {[C.red, C.amber, C.green].map((c) => (
        <div key={c} style={{width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.85}} />
      ))}
      <span style={{marginLeft: 10, fontFamily: F.mono, fontSize: 20, color: C.mint}}>{file}</span>
    </div>
    <div style={{padding: '18px 22px', fontFamily: F.mono, fontSize: 27, lineHeight: 1.55, color: C.text}}>{children}</div>
  </div>
);
