// The scene library: one view per graphic type, drawn on the 1920x1080 design canvas in the
// News look of N01 (brand/reference/inner-scenes-*.jpg). Shared pieces come from the studio
// (`@studio/...`), so the preview and N01 stay one look.
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import * as L from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {C, F} from '@studio/brand/theme';
import {COURSE} from '@studio/brand/course';
import {At, Card, Chip, Col, IconTile, Mark, Row, Sfx, Title, popStyle, sp} from '@studio/components/ui';
import {ramp, Terminal, Tag} from '@studio/components/dev';
import {Gauge, GlitchBurst, GlitchText, Highlighted, SourceFlash, Stamp} from '@studio/components/news';
import {AttackBlips, Clipping, Footage, MAP, MapPin, WorldMap, centroid, fadeIn} from '@studio/components/footage';
import {NewsBadge, Speaker} from '@studio/components/pieces';
import {Img, staticFile} from 'remotion';
import {BRAND, hasPhoto, initials, logoFile} from './brand';
import type {Graphic, Item, Tone} from './types';
import {TravelMap, travelView} from './travel';
import type {TravelCtx} from './travel';

export type View = {g: Graphic; at: number[]; dur: number; ctx: {plan: {title: string; asOf: string}; playlist: string; label: string; cause: string} & TravelCtx};

const TONE: Record<Tone, string> = {neutral: '#6A6A6A', bad: C.red, good: C.green, warn: C.amber, accent: COURSE.cyan};
const toneOf = (it: Item, fallback: Tone = 'bad') => TONE[it.tone || fallback] ?? TONE[fallback];
const shown = (frame: number, at: number[], j: number) => frame >= (at[j] ?? at[at.length - 1] ?? 0) - 1;
const pIn = (frame: number, at: number[], j: number, d = 0) => sp(frame, (at[j] ?? 0) + d, 15);

// Icons picked from the words, so a plan never needs icon names.
const ICONS: [RegExp, LucideIcon][] = [
  [/found|discover|research|scan/i, L.Radar], [/report|disclos/i, L.ShieldAlert], [/leak/i, L.Ban], [/patch|fix|update|upgrade|repair/i, L.Wrench],
  [/exploit|attack|hack|breach|in the wild/i, L.Skull], [/server|host|vps|runtime/i, L.Server], [/attacker|laptop|pc/i, L.Laptop],
  [/password|key|credential|token/i, L.KeyRound], [/backup|restore/i, L.DatabaseBackup], [/web|site|internet|online|browser/i, L.Globe],
  [/bug|cve|vuln/i, L.Bug], [/lock|encrypt|secure/i, L.Lock], [/warn|alert|risk|danger/i, L.TriangleAlert], [/user|people|customer|citizen/i, L.Users],
  [/bank|company|business|organi[sz]ation|sector/i, L.Building2], [/phone|mobile|sim|app\b/i, L.Smartphone], [/cloud/i, L.Cloud],
  [/chip|cpu|ai\b|model/i, L.Cpu], [/data|database|record/i, L.Database], [/code|php|script|program/i, L.Code], [/shell|terminal|command/i, L.Terminal],
  [/mail|email|phish/i, L.Mail], [/card|payment|money|wallet|pay\b/i, L.CreditCard], [/wifi|network|telecom|internet/i, L.Wifi],
  [/news|media|press/i, L.Newspaper], [/law|court|rule|regulat|pta|sbp|govern/i, L.Landmark], [/time|hour|deadline|clock/i, L.Clock],
  [/staging|test/i, L.FlaskConical], [/comment|ask/i, L.MessageCircle], [/check|verify/i, L.Search], [/shield|protect|waf/i, L.ShieldCheck],
];
export const iconFor = (text: string, fallback: LucideIcon = L.Zap): LucideIcon => ICONS.find(([re]) => re.test(text))?.[1] ?? fallback;

/** Small maroon kicker + big title, as in the reference ("TIMELINE / 2026"). A "STEP n" kicker becomes a step badge. */
const Head: React.FC<{kicker: string; title: string; at: number}> = ({kicker, title, at}) => {
  const frame = useCurrentFrame();
  const p = sp(frame, at, 14);
  if (!kicker && !title) return null;
  const step = /^STEP\s*(\d+)/i.exec(kicker);
  if (step) {
    const n = +step[1];
    const col = n >= 4 ? C.red : n === 3 ? C.amber : C.green;
    return (
      <Row gap={22} style={{...popStyle(p, 20)}}>
        <div style={{padding: '8px 18px', background: col, color: '#0A0A0A', fontFamily: F.mono, fontWeight: 700, fontSize: 34, letterSpacing: '0.14em'}}>STEP {n}</div>
        <Title size={70} style={{textAlign: 'left'}}>{title}</Title>
      </Row>
    );
  }
  return (
    <Col gap={10} style={{...popStyle(p, 20)}}>
      {kicker ? <div style={{fontFamily: F.mono, fontWeight: 600, fontSize: 26, letterSpacing: '0.14em', color: '#FFFFFF', padding: '6px 16px', background: COURSE.colorDeep, textTransform: 'uppercase'}}>{kicker}</div> : null}
      {title ? <Title size={72}>{title}</Title> : null}
    </Col>
  );
};

/** The brand's logo, or its name as a text logo when the brand has no logo file. */
export const BrandMark: React.FC<{height: number}> = ({height}) => {
  const file = logoFile(BRAND, true);
  if (file) return <Img src={staticFile(file)} style={{height, display: 'block'}} />;
  return <div style={{height, display: 'flex', alignItems: 'center', padding: `0 ${height * 0.3}px`, background: COURSE.black, color: '#FFFFFF', fontFamily: F.head, fontWeight: 800, fontSize: height * 0.5, letterSpacing: '-0.02em'}}>{COURSE.channelName}</div>;
};

/** The presenter's photo, or a quiet initials panel when the brand has no photo yet. */
export const Person: React.FC<{height: number; color?: string}> = ({height, color}) => {
  if (hasPhoto(BRAND)) return <Speaker height={height} />;
  const w = height * (920 / 1606);
  return (
    <div style={{width: w, height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(180deg, transparent, ${COURSE.colorDeep}66)`}}>
      <div style={{fontFamily: F.head, fontWeight: 900, fontSize: height * 0.22, color: color || C.text}}>{initials(COURSE.trainer)}</div>
    </div>
  );
};

/* ---------- full-frame types ---------- */

const TitleCard: React.FC<View> = ({g, dur, ctx}) => {
  const frame = useCurrentFrame();
  const lab = sp(frame, 4, 12);
  const wipe = ramp(frame, 0, 10, Easing.out(Easing.cubic));
  const out = ramp(frame, dur - 10, 10);
  const size = Math.min(210, Math.floor(1700 / Math.max(6, g.title.length * 0.58)));
  return (
    <AbsoluteFill style={{overflow: 'hidden', opacity: 1 - out}}>
      <Sfx name="riser" at={0} volume={0.3} />
      <Sfx name="impact" at={10} volume={0.55} />
      <AbsoluteFill style={{background: '#0A0A0A'}} />
      <AbsoluteFill style={{background: COURSE.colorDeep, clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`}} />
      <AbsoluteFill style={{backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 6px)'}} />
      <div style={{position: 'absolute', left: 100, top: 80, display: 'flex', gap: 16, opacity: lab}}>
        {ctx.label ? <div style={{padding: '14px 26px', background: '#0A0A0A', color: '#FFFFFF', fontFamily: F.mono, fontWeight: 600, fontSize: 40, letterSpacing: '0.14em'}}>{ctx.label.toUpperCase()}</div> : null}
        {ctx.cause ? <div style={{padding: '12px 22px', border: '3px solid #0A0A0A', color: '#0A0A0A', fontFamily: F.mono, fontWeight: 700, fontSize: 36, letterSpacing: '0.12em', display: 'flex', alignItems: 'center'}}>{ctx.cause.toUpperCase()}</div> : null}
      </div>
      <div style={{position: 'absolute', right: 100, top: 96, display: 'flex', alignItems: 'center', gap: 16, fontFamily: F.mono, fontWeight: 600, fontSize: 36, letterSpacing: '0.12em', color: '#FFFFFF', opacity: lab}}>
        <span style={{width: 20, height: 20, borderRadius: 10, background: COURSE.cyan}} />
        {ctx.playlist.toUpperCase()}
      </div>
      <div style={{position: 'absolute', left: 100, top: 360, opacity: sp(frame, 10, 14)}}>
        <GlitchText at={10} size={size} settle={20}>{g.title}</GlitchText>
        {g.kicker ? <div style={{marginTop: 34, fontFamily: F.mono, fontSize: 40, color: '#FFD9DA', opacity: ramp(frame, 26, 10)}}>{g.kicker}</div> : null}
      </div>
      <div style={{position: 'absolute', left: 100, bottom: 80, opacity: ramp(frame, 20, 10)}}>
        <BrandMark height={100} />
      </div>
      <GlitchBurst at={8} len={8} seed="stinger" />
      <GlitchBurst at={dur - 12} len={6} seed="stinger-out" strength={0.7} />
    </AbsoluteFill>
  );
};

const Presenter: React.FC<View> = ({g, at, ctx}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 30, bottom: 0, opacity: fadeIn(frame, 0, 12)}}>
        <Person height={1000} />
      </div>
      <div style={{position: 'absolute', left: 1010, top: 130, display: 'flex', flexDirection: 'column', gap: 18, ...popStyle(sp(frame, 4, 14), 20)}}>
        <div style={{alignSelf: 'flex-start'}}>
          <NewsBadge text={ctx.label || 'NEWS'} size={26} />
        </div>
        <div style={{fontFamily: F.head, fontWeight: 800, fontSize: 104, letterSpacing: '-0.04em', color: C.text, lineHeight: 1}}>{COURSE.trainer}</div>
        <div style={{fontFamily: F.body, fontWeight: 600, fontSize: 44, color: COURSE.color}}>{COURSE.role}</div>
        <Row gap={12} style={{justifyContent: 'flex-start'}}>
          {COURSE.tags.map((t) => (
            <Tag key={t} color={COURSE.cyan} size={24}>{t}</Tag>
          ))}
        </Row>
        <div style={{display: 'flex', flexDirection: 'column', gap: 16, marginTop: 40, width: 760}}>
          {g.items.map((it, j) => {
            if (!shown(frame, at, j)) return null;
            const Icon = iconFor(it.label, L.Newspaper);
            return (
              <div key={j} style={{...popStyle(pIn(frame, at, j, j * 6), 20), display: 'flex', alignItems: 'center', gap: 20, padding: '16px 24px', background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 14}}>
                <Sfx name="pop" at={(at[j] ?? 0) + j * 6} volume={0.25} />
                <IconTile icon={Icon} size={54} color={it.tone === 'good' || j === g.items.length - 1 ? C.green : COURSE.color} />
                <span style={{fontFamily: F.head, fontWeight: 700, fontSize: 40, color: C.text}}>{it.label}</span>
                <span style={{marginLeft: 'auto', fontFamily: F.mono, fontSize: 24, color: C.muted}}>{String(j + 1).padStart(2, '0')}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Help: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const typed = g.lines[0] || 'FIX';
  const n = Math.max(0, Math.min(typed.length, Math.floor((frame - 30) * 0.8)));
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 30, bottom: 0}}>
        <Person height={1000} />
      </div>
      <div style={{position: 'absolute', left: 1000, top: 300, display: 'flex', flexDirection: 'column', gap: 50}}>
        <Row gap={18} style={{justifyContent: 'flex-start'}}>
          {g.items.map((it, j) => (
            <div key={j} style={popStyle(pIn(frame, at, 0, 6 + j * 5), 20)}>
              <Sfx name="pop" at={(at[0] ?? 0) + 6 + j * 5} volume={0.25} />
              <Chip size={40} mono={false} icon={iconFor(it.label, L.Wrench)} color={/fix/i.test(it.label) ? C.green : COURSE.color} solid={/fix/i.test(it.label)}>{it.label}</Chip>
            </div>
          ))}
        </Row>
        <Row gap={20} style={{justifyContent: 'flex-start', ...popStyle(sp(frame, 26), 20)}}>
          <div style={{width: 60, height: 60, borderRadius: 30, border: `2.5px solid ${COURSE.cyan}`, color: COURSE.cyan, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.head, fontWeight: 700, fontSize: 28}}>U</div>
          <Card style={{padding: '18px 30px', borderRadius: 14, width: 760}}>
            <span style={{fontFamily: F.mono, fontSize: 38, color: C.text}}>
              <span style={{color: C.green, fontWeight: 700}}>{typed.slice(0, Math.min(n, typed.indexOf(' ') > 0 ? typed.indexOf(' ') : n))}</span>
              {typed.slice(Math.min(n, typed.indexOf(' ') > 0 ? typed.indexOf(' ') : n), n)}
              {n < typed.length ? <span style={{color: COURSE.color}}>▍</span> : null}
            </span>
          </Card>
        </Row>
        {g.kicker ? <div style={{marginLeft: 80, alignSelf: 'flex-start', opacity: ramp(frame, 50, 10)}}><Tag color={COURSE.color} size={26}>{g.kicker}</Tag></div> : null}
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<View> = () => {
  const frame = useCurrentFrame();
  const rows: [string, LucideIcon, boolean][] = [['Share', L.Share2, false], ['Like', L.ThumbsUp, false], ['Subscribe', L.Bell, true]];
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 30, bottom: 0}}>
        <Person height={1000} />
      </div>
      <div style={{position: 'absolute', left: 960, top: 260, display: 'flex', flexDirection: 'column', gap: 26, width: 760}}>
        {rows.map(([t, Icon, main], j) => (
          <div key={t} style={{...popStyle(sp(frame, 4 + j * 8), 20), display: 'flex', alignItems: 'center', gap: 22, padding: '22px 34px', borderRadius: 14, background: main ? COURSE.colorDeep : C.card, border: `1.5px solid ${main ? COURSE.color : C.line}`}}>
            <Sfx name="pop" at={4 + j * 8} volume={0.25} />
            <Icon size={44} color={main ? '#FFFFFF' : C.text} strokeWidth={2.2} />
            <span style={{fontFamily: F.head, fontWeight: 700, fontSize: 48, color: main ? '#FFFFFF' : C.text}}>{t}</span>
          </div>
        ))}
        <div style={{marginTop: 70, textAlign: 'center', fontFamily: F.mono, fontSize: 32, color: C.muted, opacity: ramp(frame, 30, 10)}}>
          {COURSE.channel} · {COURSE.site}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- staged types (drawn on the design canvas, fitted below the labels) ---------- */

const Clippings: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 4);
  return (
    <At x={960} y={540}>
      <Footage at={at[0] ?? 0} w={1700} h={940} label={g.title || 'COVERAGE'}>
        {its.map((it, j) => {
          if (!shown(frame, at, j)) return null;
          const last = j === its.length - 1;
          const p = pIn(frame, at, j, j * 10);
          const x = 120 + j * (1300 / Math.max(1, its.length));
          return (
            <div key={j} style={{position: 'absolute', left: last ? 560 : x, top: last ? 170 : 150 + (j % 2) * 120, transform: `rotate(${last ? 0 : (j % 2 ? 2 : -2.5)}deg) scale(${(last ? 1 : 0.8) * (0.92 + 0.08 * p)})`, opacity: Math.min(1, p * 1.6) * (last || j === its.length - 1 ? 1 : 0.75), filter: last ? undefined : 'brightness(0.8)'}}>
              <Sfx name="whoosh-soft" at={(at[j] ?? 0) + j * 10} volume={0.25} />
              <Clipping outlet={it.label} date={it.value} headline={it.detail} marks={g.highlights.filter((h) => it.detail.includes(h))} hlAt={(at[j] ?? 0) + j * 10 + 14} width={last ? 820 : 640} size={last ? 52 : 40} />
            </div>
          );
        })}
      </Footage>
    </At>
  );
};

const QuoteCard: React.FC<View> = ({g, at}) => {
  const [kind, ...rest] = (g.kicker || 'QUOTE').split('·').map((s) => s.trim());
  return (
    <At x={960} y={520}>
      <SourceFlash at={at[0] ?? 0} source={g.title} kind={kind.toUpperCase()} date={rest.join(' · ').toUpperCase()} quote={g.lines[0] || ''} marks={g.highlights.filter((h) => (g.lines[0] || '').includes(h))} width={1500} />
    </At>
  );
};

const Timeline: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 6);
  const w = 1600;
  const step = w / Math.max(1, its.length);
  const x0 = 960 - w / 2 + step / 2;
  const last = its.reduce((k, _, j) => (shown(frame, at, j) ? j : k), 0);
  const lineP = interpolate(frame, [(at[0] ?? 0), (at[last] ?? 0) + 12], [0, (last + 0.5) / its.length], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill>
      <At x={960} y={170}><Head kicker="TIMELINE" title={g.title} at={at[0] ?? 0} /></At>
      <div style={{position: 'absolute', left: 960 - w / 2, top: 470, width: w, height: 6, background: C.fill2}} />
      <div style={{position: 'absolute', left: 960 - w / 2, top: 470, width: w * lineP, height: 6, background: C.red}} />
      {its.map((it, j) => {
        if (!shown(frame, at, j)) return null;
        const p = pIn(frame, at, j, 4);
        const col = toneOf(it);
        const Icon = iconFor(`${it.value} ${it.detail}`, L.Flag);
        return (
          <div key={j} style={{position: 'absolute', left: x0 + j * step, top: 473, width: 0, height: 0}}>
            <Sfx name="pop" at={(at[j] ?? 0) + 4} volume={0.3} />
            <div style={{position: 'absolute', left: -150, width: 300, top: -150, textAlign: 'center', fontFamily: F.mono, fontWeight: 700, fontSize: 44, color: it.tone === 'warn' ? C.amber : it.tone === 'good' ? C.green : it.tone === 'bad' && j === its.length - 1 ? C.red : C.text, opacity: p}}>{it.label}</div>
            <div style={{position: 'absolute', left: -48, top: -48, transform: `scale(${p})`}}>
              <IconTile icon={Icon} size={96} color={col} />
            </div>
            <div style={{position: 'absolute', left: -170, width: 340, top: 90, textAlign: 'center', ...popStyle(p, 16)}}>
              <div style={{fontFamily: F.head, fontWeight: 700, fontSize: 46, color: C.text}}>{it.value}</div>
              {it.detail ? <div style={{fontFamily: F.mono, fontSize: 24, color: C.muted, marginTop: 8, whiteSpace: 'normal'}}>{it.detail}</div> : null}
            </div>
          </div>
        );
      })}
      {g.stamp && frame >= (at[last] ?? 0) + 14 ? (
        <div style={{position: 'absolute', left: x0 + last * step - 180, top: 760}}>
          <Stamp at={(at[last] ?? 0) + 14} text={g.stamp.split('·')[0].trim()} sub={g.stamp.split('·')[1]?.trim()} color={C.amber} size={64} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const MapView: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const names = new Set(MAP.countries.map((c) => c.name));
  const its = g.items.filter((it) => names.has(it.label)).slice(0, 10);
  const W = 1700;
  const H = 940;
  const pts = its.map((it) => centroid(it.label));
  // camera: fit the named countries, or the whole world
  let cam = {x: MAP.w / 2, y: MAP.h / 2 + 40, z: W / MAP.w};
  if (pts.length) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const bw = Math.max(260, Math.max(...xs) - Math.min(...xs) + 220);
    const bh = Math.max(160, Math.max(...ys) - Math.min(...ys) + 200);
    const z = Math.min(3, Math.max(W / MAP.w, Math.min(W / bw, H / bh)));
    const target = {x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, z};
    const k = ramp(frame, (at[0] ?? 0) + 20, 40);
    cam = {x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k, z: cam.z * Math.pow(target.z / cam.z, k)};
  }
  const tintP = fadeIn(frame, (at[0] ?? 0) + 10, 30);
  return (
    <At x={960} y={540}>
      <Footage at={at[0] ?? 0} w={W} h={H} label={g.title || 'MAP'}>
        <WorldMap w={W} h={H} cam={cam} tint={(n) => {
          const it = its.find((x) => x.label === n);
          return it && tintP > 0 ? {c: toneOf(it), o: tintP * 0.7} : undefined;
        }}>
          {(z) => (
            <>
              <AttackBlips t0={(at[0] ?? 0) + 4} z={z} n={30} names={its.length ? its.map((x) => x.label) : undefined} />
              {its.map((it, j) => {
                const [x, y] = centroid(it.label);
                const t = Math.max(at[j] ?? 0, (at[0] ?? 0) + 40 + j * 9);
                return <MapPin key={it.label} x={x} y={y} z={z} p={fadeIn(frame, t, 10)} lp={fadeIn(frame, t + 3, 10)} label={it.label} value={it.value} dy={j % 2 ? 70 : -70} color={toneOf(it)} size={16} />;
              })}
            </>
          )}
        </WorldMap>
      </Footage>
    </At>
  );
};

const Bars: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 6);
  const max = Math.max(1, ...its.map((it) => parseFloat(it.value) || 0)) * 1.1;
  return (
    <At x={960} y={540}>
      <Col gap={46} style={{alignItems: 'flex-start'}}>
        <Head kicker={g.kicker} title={g.title} at={at[0] ?? 0} />
        {its.map((it, j) => {
          if (!shown(frame, at, j)) return null;
          const v = parseFloat(it.value) || 0;
          const p = fadeIn(frame, (at[j] ?? 0) + 10 + j * 8, 30);
          const col = it.tone === 'neutral' ? '#6A6A6A' : toneOf(it);
          return (
            <Row key={j} gap={30} style={{justifyContent: 'flex-start', opacity: Math.min(1, p * 3)}}>
              <span style={{width: 380, fontFamily: F.head, fontWeight: 700, fontSize: 48, color: C.text}}>{it.label}</span>
              <div style={{width: 1000, height: 66, background: C.fill, position: 'relative'}}>
                <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(v / max) * 100 * p}%`, background: col}} />
              </div>
              <span style={{width: 180, fontFamily: F.mono, fontWeight: 800, fontSize: 52, color: col === '#6A6A6A' ? C.muted : col}}>{it.value}</span>
            </Row>
          );
        })}
      </Col>
    </At>
  );
};

export const Ring: React.FC<{share: number; p: number; size: number; color: string; children: React.ReactNode}> = ({share, p, size, color, children}) => {
  const r = size * 0.4;
  const c = 2 * Math.PI * r;
  return (
    <div style={{position: 'relative', width: size, height: size}}>
      <svg width={size} height={size} style={{transform: 'rotate(-90deg)'}}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={C.fill2} strokeWidth={size * 0.13} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={size * 0.13} fill="none" strokeDasharray={`${c * share * p} ${c}`} />
      </svg>
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}>{children}</div>
    </div>
  );
};

/** "167M", "2,220,231", "71%" count up from 0 keeping the unit and separators. */
export const countUp = (value: string, p: number) => {
  const m = /^([^\d]*)([\d,.]+)(.*)$/.exec(value);
  if (!m) return value;
  const num = parseFloat(m[2].replace(/,/g, ''));
  const dec = (m[2].split('.')[1] || '').length;
  const v = num * p;
  const s = m[2].includes(',') ? Math.round(v).toLocaleString('en-US') : v.toFixed(dec);
  return `${m[1]}${s}${m[3]}`;
};

const Numbers: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 3);
  return (
    <At x={960} y={520}>
      <Col gap={40}>
        {g.title || g.kicker ? <Head kicker={g.kicker} title={g.title} at={at[0] ?? 0} /> : null}
        <Row gap={its.length > 2 ? 90 : 160} style={{alignItems: 'center'}}>
          {its.map((it, j) => {
            if (!shown(frame, at, j)) return null;
            const p = fadeIn(frame, (at[j] ?? 0) + j * 6, 36);
            const col = it.tone === 'good' ? C.green : it.tone === 'accent' ? COURSE.cyan : it.tone === 'bad' ? C.red : C.text;
            const pct = /%\s*$/.test(it.value);
            const big = (
              <span style={{fontFamily: F.mono, fontWeight: 800, fontSize: pct ? 110 : its.length > 2 ? 140 : 190, letterSpacing: '-0.04em', color: col, lineHeight: 1}}>{countUp(it.value, p)}</span>
            );
            return (
              <Col key={j} gap={18} style={popStyle(sp(frame, (at[j] ?? 0) + j * 6), 30)}>
                <Sfx name="tick" at={(at[j] ?? 0) + j * 6} volume={0.3} />
                {pct ? (
                  <Ring share={(parseFloat(it.value) || 0) / 100} p={p} size={460} color={col === C.text ? C.red : col}>
                    {big}
                    <span style={{fontFamily: F.mono, fontSize: 34, color: C.text, marginTop: 10}}>{it.label}</span>
                  </Ring>
                ) : (
                  <>
                    {big}
                    <span style={{fontFamily: F.mono, fontSize: 40, color: C.muted}}>{it.label}</span>
                  </>
                )}
                {it.detail ? <span style={{fontFamily: F.mono, fontSize: 26, color: '#6A6A6A'}}>{it.detail}</span> : null}
              </Col>
            );
          })}
        </Row>
      </Col>
    </At>
  );
};

const Stamps: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  return (
    <At x={960} y={520}>
      <Col gap={60}>
        {g.title ? <Head kicker={g.kicker} title={g.title} at={at[0] ?? 0} /> : null}
        <Row gap={140}>
          {g.items.slice(0, 3).map((it, j) => (shown(frame, at, j) ? <Stamp key={j} at={(at[j] ?? 0) + 6 + j * 14} text={it.label.toUpperCase()} sub={it.detail.toUpperCase()} color={it.tone === 'good' ? C.green : it.tone === 'warn' ? C.amber : C.red} size={110} rotate={j % 2 ? 4 : -6} /> : null))}
        </Row>
      </Col>
    </At>
  );
};

const Cards: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const groups: [string, [Item, number][]][] = [];
  g.items.slice(0, 15).forEach((it, j) => {
    const k = it.value || '';
    const grp = groups.find((x) => x[0] === k) || (groups.push([k, []]), groups[groups.length - 1]);
    grp[1].push([it, j]);
  });
  const many = g.items.length > 6;
  return (
    <At x={960} y={540}>
      <Col gap={50}>
        <Head kicker={g.kicker} title={g.title} at={at[0] ?? 0} />
        {groups.map(([name, its]) => (
          <Col key={name} gap={18} style={{alignItems: 'flex-start'}}>
            {name ? <div style={{fontFamily: F.mono, fontWeight: 700, fontSize: 24, letterSpacing: '0.14em', color: COURSE.color, opacity: shown(frame, at, its[0][1]) ? 1 : 0}}>{name.toUpperCase()}</div> : null}
            <Row gap={18} style={{flexWrap: 'wrap', justifyContent: name ? 'flex-start' : 'center', width: 1700}}>
              {its.map(([it, j]) => {
                if (!shown(frame, at, j)) return null;
                const col = toneOf(it, 'neutral');
                const Icon = iconFor(`${it.label} ${name}`, L.Box);
                return (
                  <div key={j} style={{...popStyle(pIn(frame, at, j, (j % 6) * 4), 24), display: 'flex', alignItems: 'center', gap: 16, padding: many ? '14px 22px' : '22px 30px', background: C.card, border: `1.5px solid ${it.tone === 'bad' ? `${C.red}88` : C.line}`, borderRadius: 14, minWidth: many ? 300 : 420}}>
                    <Sfx name="pop" at={(at[j] ?? 0) + (j % 6) * 4} volume={0.2} />
                    <IconTile icon={Icon} size={many ? 48 : 64} color={it.tone === 'neutral' ? '#3A3A3A' : col} />
                    <span style={{fontFamily: F.head, fontWeight: 700, fontSize: many ? 34 : 44, color: C.text}}>{it.label}</span>
                    {it.detail ? <Tag color={col === '#6A6A6A' ? COURSE.cyan : col} size={20} style={{marginLeft: 'auto'}}>{it.detail}</Tag> : it.tone === 'bad' ? <L.TriangleAlert size={30} color={C.red} style={{marginLeft: 'auto'}} /> : null}
                  </div>
                );
              })}
            </Row>
          </Col>
        ))}
      </Col>
    </At>
  );
};

const TerminalView: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const t0 = at[0] ?? 0;
  let t = t0 + 10;
  const lines = g.lines.slice(0, 9).map((raw) => {
    const kind = raw.startsWith('$ ') ? 'cmd' : raw.startsWith('# ') ? 'note' : raw.startsWith('! ') ? 'err' : raw.startsWith('+ ') ? 'ok' : 'out';
    const text = kind === 'out' ? raw : raw.slice(2);
    const line = {text, at: t, kind: kind as 'cmd' | 'out' | 'ok' | 'err' | 'note'};
    t += kind === 'cmd' ? Math.ceil(text.length / 2.6) + 10 : 6;
    return line;
  });
  return (
    <At x={960} y={520}>
      <Col gap={50}>
        <Head kicker={/^STEP/i.test(g.kicker) ? g.kicker : ''} title={g.title} at={t0} />
        <div style={popStyle(sp(frame, t0 + 4), 30)}>
          <Terminal lines={lines} title={/^STEP/i.test(g.kicker) ? 'terminal' : g.kicker || 'terminal'} width={1400} fontSize={38} />
        </div>
        <Row gap={18}>
          {g.items.map((it, j) => (shown(frame, at, j) && frame > t ? <Tag key={j} color={toneOf(it, 'accent')} size={26}>{it.label}</Tag> : null))}
        </Row>
      </Col>
    </At>
  );
};

const Flow: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 4);
  return (
    <At x={960} y={540}>
      <Col gap={70}>
        <Head kicker={g.kicker} title={g.title} at={at[0] ?? 0} />
        <Row gap={30} style={{alignItems: 'flex-start'}}>
          {its.map((it, j) => {
            if (!shown(frame, at, j)) return null;
            const p = pIn(frame, at, j, j * 10);
            const col = toneOf(it, 'neutral');
            return (
              <React.Fragment key={j}>
                {j ? <L.ArrowRight size={60} color={C.muted} style={{marginTop: 70, opacity: p}} /> : null}
                <Col gap={20} style={{width: 340, ...popStyle(p, 24)}}>
                  <Sfx name="pop" at={(at[j] ?? 0) + j * 10} volume={0.25} />
                  <IconTile icon={iconFor(`${it.label} ${it.detail}`, L.Box)} size={170} color={it.tone === 'neutral' ? '#3A3A3A' : col} />
                  <span style={{fontFamily: F.mono, fontWeight: 600, fontSize: 40, color: C.text, textAlign: 'center', whiteSpace: 'normal'}}>{it.label}</span>
                  {it.detail ? <span style={{fontFamily: F.mono, fontSize: 26, color: C.muted, textAlign: 'center', whiteSpace: 'normal'}}>{it.detail}</span> : null}
                </Col>
              </React.Fragment>
            );
          })}
        </Row>
        {g.stamp && frame >= (at[its.length - 1] ?? 0) + 20 ? <Stamp at={(at[its.length - 1] ?? 0) + 20} text={g.stamp.split('·')[0].trim()} sub={g.stamp.split('·')[1]?.trim()} color={C.red} size={70} rotate={-4} /> : null}
      </Col>
    </At>
  );
};

const GaugeView: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const [score, ...cards] = g.items;
  const v = parseFloat(score?.value || '0') || 0;
  return (
    <At x={960} y={540}>
      <Col gap={60}>
        <Head kicker={g.kicker} title={g.title} at={at[0] ?? 0} />
        <Row gap={140}>
          <Col gap={24}>
            {cards.slice(0, 3).map((it, j) => (shown(frame, at, j + 1) ? (
              <div key={j} style={{...popStyle(pIn(frame, at, j + 1, 6 + j * 8), 20), display: 'flex', alignItems: 'center', gap: 22, padding: '22px 30px', width: 640, background: C.card, border: `1.5px solid ${C.red}88`, borderRadius: 16, boxShadow: `0 0 40px ${C.red}22`}}>
                <IconTile icon={L.ShieldAlert} size={64} color={C.red} />
                <Col gap={4} style={{alignItems: 'flex-start'}}>
                  <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 40, color: C.text}}>{it.label}</span>
                  {it.detail ? <span style={{fontFamily: F.mono, fontSize: 26, color: C.muted}}>{it.detail}</span> : null}
                </Col>
              </div>
            ) : null))}
          </Col>
          {score ? (
            <Col gap={10}>
              <Gauge value={v} p={fadeIn(frame, (at[0] ?? 0) + 10, 40)} size={560} label={score.label || 'CVSS'} />
              {score.detail ? <div style={{padding: '8px 20px', background: C.red, color: '#FFFFFF', fontFamily: F.mono, fontWeight: 700, fontSize: 32, letterSpacing: '0.1em', opacity: ramp(frame, (at[0] ?? 0) + 50, 10)}}>{score.detail.toUpperCase()}</div> : null}
            </Col>
          ) : null}
        </Row>
      </Col>
    </At>
  );
};

const Table: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const head = (g.lines[0] || '').split('|').map((s) => s.trim());
  return (
    <At x={960} y={540}>
      <Col gap={50}>
        <Head kicker={g.kicker} title={g.title} at={at[0] ?? 0} />
        <Card style={{width: 1300, padding: '20px 0'}}>
          {head.some(Boolean) ? (
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', padding: '10px 50px', fontFamily: F.mono, fontSize: 28, color: C.muted, borderBottom: `1.5px solid ${C.line}`}}>
              {head.slice(0, 3).map((h, i) => <span key={i}>{h}</span>)}
            </div>
          ) : null}
          {g.items.slice(0, 7).map((it, j) => (shown(frame, at, j) ? (
            <div key={j} style={{...popStyle(pIn(frame, at, j, j * 6), 12), display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', alignItems: 'center', padding: '18px 50px', borderBottom: `1.5px solid ${C.line}`, fontFamily: F.mono, fontSize: 50}}>
              <Sfx name="tick" at={(at[j] ?? 0) + j * 6} volume={0.25} />
              <span style={{color: C.text, fontWeight: 700}}>{it.label}</span>
              <span style={{color: toneOf(it, 'good'), fontWeight: 700}}>{it.value}</span>
              <span>{it.detail ? <span style={{fontSize: 34, color: C.muted}}>{it.detail}</span> : <Mark ok={it.tone !== 'bad'} p={pIn(frame, at, j, j * 6 + 8)} size={56} />}</span>
            </div>
          ) : null))}
        </Card>
      </Col>
    </At>
  );
};

const Versions: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 9);
  return (
    <At x={960} y={540}>
      <Col gap={60}>
        <Head kicker={g.kicker} title={g.title} at={at[0] ?? 0} />
        <Row gap={22}>
          {its.map((it, j) => {
            if (!shown(frame, at, j)) return null;
            const ok = it.tone === 'good';
            const col = ok ? C.green : C.red;
            const p = pIn(frame, at, j, j * 4);
            return (
              <div key={j} style={{...popStyle(p, 30), width: 170, height: 230, border: `2.5px solid ${col}`, background: `${col}14`, borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18}}>
                <Sfx name={ok ? 'ding' : 'nope'} at={(at[j] ?? 0) + j * 4 + 6} volume={0.12} />
                <span style={{fontFamily: F.mono, fontWeight: 800, fontSize: 56, color: C.text}}>{it.label}</span>
                <Mark ok={ok} p={pIn(frame, at, j, j * 4 + 6)} size={52} />
                <span style={{fontFamily: F.mono, fontSize: 24, color: col}}>{it.detail}</span>
              </div>
            );
          })}
        </Row>
      </Col>
    </At>
  );
};

const Comment: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const t0 = at[0] ?? 0;
  const typed = g.lines[0] || '';
  const reply = g.lines[1] || '';
  const tAt = t0 + 40;
  const n = Math.max(0, Math.min(typed.length, Math.floor((frame - tAt) * 0.8)));
  const repAt = tAt + 10 + typed.length / 0.8;
  const pulse = 1 + 0.05 * Math.sin(frame / 5);
  return (
    <AbsoluteFill>
      <Sfx name="ding" at={t0 + 2} volume={0.45} />
      <At x={960} y={200}>
        <Row gap={30} style={{transform: `scale(${sp(frame, t0 + 2, 12)})`}}>
          <div style={{transform: `scale(${pulse})`}}><IconTile icon={L.MessageCircle} size={140} color={COURSE.color} /></div>
          <Col gap={12} style={{alignItems: 'flex-start'}}>
            <Title size={84} style={{textAlign: 'left'}}>Comment</Title>
            <Chip size={36} color={COURSE.color}>{g.title}</Chip>
          </Col>
        </Row>
      </At>
      <At x={960} y={470}>
        <Row gap={18} style={{flexWrap: 'wrap', justifyContent: 'center', width: 1500}}>
          {g.items.map((it, j) => (
            <div key={j} style={popStyle(sp(frame, t0 + 14 + j * 4, 13), 30)}>
              <Sfx name="pop" at={t0 + 14 + j * 4} volume={0.25} />
              <Chip size={38} mono={false} color={it.tone === 'accent' ? COURSE.color : C.text} solid={it.tone === 'accent' && frame >= tAt}>{it.label}</Chip>
            </div>
          ))}
        </Row>
      </At>
      {typed ? (
        <At x={960} y={760}>
          <Col gap={22} style={{alignItems: 'stretch', width: 1100, ...popStyle(sp(frame, tAt - 4))}}>
            <Card style={{padding: '20px 32px', borderRadius: 26}}>
              <span style={{fontFamily: F.mono, fontSize: 40, color: C.text}}>
                {typed.slice(0, n)}
                {n < typed.length ? <span style={{color: COURSE.color}}>▍</span> : null}
              </span>
            </Card>
            {reply ? (
              <Row gap={16} style={{paddingLeft: 90, justifyContent: 'flex-start', ...popStyle(sp(frame, repAt), 20)}}>
                <Card glow={C.green} style={{padding: '20px 32px', borderRadius: 26}}>
                  <Row gap={16}>
                    <Mark ok p={sp(frame, repAt)} size={44} />
                    <span style={{fontFamily: F.mono, fontSize: 36, color: C.greenDeep}}>{reply}</span>
                  </Row>
                </Card>
                <Sfx name="success" at={repAt} volume={0.35} />
              </Row>
            ) : null}
          </Col>
        </At>
      ) : null}
    </AbsoluteFill>
  );
};

const Checklist: React.FC<View> = ({g, at}) => {
  const frame = useCurrentFrame();
  const its = g.items.slice(0, 6);
  const end = (at[its.length - 1] ?? 0) + its.length * 6 + 16;
  return (
    <At x={960} y={540}>
      <Row gap={90} style={{alignItems: 'center'}}>
        <Col gap={50}>
          <Head kicker={g.kicker} title={g.title} at={at[0] ?? 0} />
          <Col gap={18} style={{width: 1000}}>
            {its.map((it, j) => {
              if (!shown(frame, at, j)) return null;
              const p = pIn(frame, at, j, j * 6);
              return (
                <div key={j} style={{...popStyle(p, 20), display: 'flex', alignItems: 'center', gap: 24, width: '100%', padding: '18px 28px', background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 14}}>
                  <Sfx name="success" at={(at[j] ?? 0) + j * 6 + 4} volume={0.15} />
                  <Mark ok p={p} size={50} />
                  <span style={{fontFamily: F.mono, fontSize: 28, color: C.muted}}>{String(j + 1).padStart(2, '0')}</span>
                  <span style={{fontFamily: F.head, fontWeight: 700, fontSize: 46, color: C.text}}>{it.label}</span>
                  <span style={{marginLeft: 'auto', width: 14, height: 14, borderRadius: 7, background: toneOf(it, 'good')}} />
                </div>
              );
            })}
          </Col>
        </Col>
        {g.stamp && frame >= end ? <Stamp at={end} text={g.stamp.split('·')[0].trim()} sub={g.stamp.split('·').slice(1).join('·').trim()} color={C.red} size={84} rotate={-8} /> : null}
      </Row>
    </At>
  );
};

/* ---------- dispatch ---------- */

export const FULL = new Set(['title', 'presenter', 'help', 'outro', 'footage', 'route', 'roadtrip', 'weather', 'tiers', 'phrases', 'dosdonts', 'rating']);
export const HIDE_CHROME = new Set(['title']);

export const GraphicView: React.FC<View> = (v) => {
  const T = travelView(v.g.type);
  if (T) return <T {...v} />;
  switch (v.g.type) {
    case 'title': return <TitleCard {...v} />;
    case 'presenter': return <Presenter {...v} />;
    case 'help': return <Help {...v} />;
    case 'outro': return <Outro {...v} />;
    case 'clippings': return <Clippings {...v} />;
    case 'quote': return <QuoteCard {...v} />;
    case 'timeline': return <Timeline {...v} />;
    case 'map': return v.g.style ? <TravelMap {...v} /> : <MapView {...v} />; // a travel plan's map has a brand style
    case 'bars': return <Bars {...v} />;
    case 'number': return <Numbers {...v} />;
    case 'stamps': return <Stamps {...v} />;
    case 'cards': return <Cards {...v} />;
    case 'terminal': return <TerminalView {...v} />;
    case 'flow': return <Flow {...v} />;
    case 'gauge': return <GaugeView {...v} />;
    case 'table': return <Table {...v} />;
    case 'versions': return <Versions {...v} />;
    case 'comment': return <Comment {...v} />;
    case 'checklist': return <Checklist {...v} />;
    default: return null;
  }
};
