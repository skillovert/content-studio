import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import type {LucideIcon} from 'lucide-react';
import {C, F} from '../brand/theme';
import {Card, Sfx, TypingSfx} from './ui';

/* Dev/tech building blocks: terminals, editors with syntax colours, network
   nodes, packets on wires, file trees and meters. Shared by every lesson from L02. */

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** 0 → 1 between two frames (eased), for use outside hooks. */
export const ramp = (frame: number, start: number, len: number, ease = Easing.inOut(Easing.cubic)) =>
  interpolate(frame, [start, start + Math.max(1, len)], [0, 1], {...clamp, easing: ease});

/* ---------- syntax colouring ---------- */

export type Lang = 'js' | 'html' | 'md' | 'http' | 'yaml' | 'shell' | 'plain';

const KW = /^(const|let|var|if|else|return|function|export|import|from|async|await|new|true|false|null)$/;

const tokenColor = (tok: string, lang: Lang): string => {
  if (lang === 'js') {
    if (/^\/\//.test(tok)) return C.muted;
    if (/^['"`]/.test(tok)) return C.amber;
    if (KW.test(tok)) return C.purple;
    if (/^\d/.test(tok)) return C.amber;
    if (/^[A-Za-z_]\w*$/.test(tok)) return C.text;
    return C.muted;
  }
  if (lang === 'html') {
    if (/^<!--/.test(tok)) return C.muted;
    if (/^<\/?[\w-]+/.test(tok) || tok === '>' || tok === '/>') return C.blue;
    if (/^"/.test(tok)) return C.amber;
    if (/^[\w-]+=$/.test(tok)) return C.mint;
    return C.text;
  }
  return C.text;
};

const splitJs = (s: string) => s.match(/(\/\/.*$|'[^']*'?|"[^"]*"?|`[^`]*`?|\d+(?:\.\d+)?|[A-Za-z_]\w*|\s+|.)/g) ?? [];
const splitHtml = (s: string) => s.match(/(<!--.*?(?:-->|$)|<\/?[\w-]+|\/?>|"[^"]*"?|[\w-]+=|\s+|[^<>"\s]+|.)/g) ?? [];

/** Colour one line of code. Returns spans. */
export const colorLine = (text: string, lang: Lang): React.ReactNode => {
  if (lang === 'js') return splitJs(text).map((t, i) => <span key={i} style={{color: tokenColor(t, 'js')}}>{t}</span>);
  if (lang === 'html') return splitHtml(text).map((t, i) => <span key={i} style={{color: tokenColor(t, 'html')}}>{t}</span>);
  if (lang === 'md') {
    if (/^#{1,6} /.test(text)) {
      const m = text.match(/^(#{1,6} )(.*)$/)!;
      return (
        <>
          <span style={{color: C.green}}>{m[1]}</span>
          <span style={{color: C.text, fontWeight: 700}}>{m[2]}</span>
        </>
      );
    }
    if (/^```/.test(text)) return <span style={{color: C.muted}}>{text}</span>;
    if (/^---$/.test(text)) return <span style={{color: C.muted}}>{text}</span>;
    const parts = text.split(/(\[[^\]]*\]\([^)]*\)|\*\*[^*]+\*\*|^\s*[-*] |^\s*\d+\. |`[^`]+`)/g);
    return parts.map((t, i) => {
      if (/^\[/.test(t)) return <span key={i} style={{color: C.blue}}>{t}</span>;
      if (/^\*\*/.test(t)) return <span key={i} style={{color: C.text, fontWeight: 700}}>{t}</span>;
      if (/^\s*([-*]|\d+\.) $/.test(t)) return <span key={i} style={{color: C.green}}>{t}</span>;
      if (/^`/.test(t)) return <span key={i} style={{color: C.amber}}>{t}</span>;
      return <span key={i} style={{color: C.text}}>{t}</span>;
    });
  }
  if (lang === 'yaml') {
    const m = text.match(/^(\s*[\w-]+)(:)(.*)$/);
    if (!m) return <span style={{color: C.muted}}>{text}</span>;
    return (
      <>
        <span style={{color: C.mint}}>{m[1]}</span>
        <span style={{color: C.muted}}>{m[2]}</span>
        <span style={{color: C.amber}}>{m[3]}</span>
      </>
    );
  }
  if (lang === 'http') {
    const status = text.match(/^(HTTP\/[\d.]+ )(\d{3})( .*)?$/);
    if (status) {
      const ok = status[2].startsWith('2');
      return (
        <>
          <span style={{color: C.muted}}>{status[1]}</span>
          <span style={{color: ok ? C.green : status[2].startsWith('3') ? C.amber : C.red, fontWeight: 700}}>{status[2]}</span>
          <span style={{color: C.text}}>{status[3]}</span>
        </>
      );
    }
    const req = text.match(/^(GET|POST|HEAD|PUT|DELETE)( )(\S+)( .*)?$/);
    if (req)
      return (
        <>
          <span style={{color: C.purple, fontWeight: 700}}>{req[1]}</span>
          {req[2]}
          <span style={{color: C.amber}}>{req[3]}</span>
          <span style={{color: C.muted}}>{req[4]}</span>
        </>
      );
    const h = text.match(/^([\w-]+)(:)(.*)$/);
    if (h)
      return (
        <>
          <span style={{color: C.mint}}>{h[1]}</span>
          <span style={{color: C.muted}}>{h[2]}</span>
          <span style={{color: C.text}}>{h[3]}</span>
        </>
      );
    return <span style={{color: C.text}}>{text}</span>;
  }
  if (lang === 'shell') {
    return text.split(/(\s-{1,2}[\w-]+|"[^"]*"?|'[^']*'?|https?:\/\/\S+)/g).map((t, i) => (
      <span
        key={i}
        style={{color: /^\s-/.test(t) ? C.purple : /^["']/.test(t) ? C.amber : /^https?:/.test(t) ? C.blue : i === 0 ? C.text : C.text}}
      >
        {t}
      </span>
    ));
  }
  return <span style={{color: C.text}}>{text}</span>;
};

/* ---------- window chrome shared by editor + terminal ---------- */

const WindowBar: React.FC<{title: string; icon?: LucideIcon; tabs?: string[]; active?: number}> = ({title, icon: Icon, tabs, active = 0}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: `1.5px solid ${C.line}`, background: C.inset}}>
    {[C.red, C.amber, C.green].map((c) => (
      <div key={c} style={{width: 15, height: 15, borderRadius: 8, background: c, opacity: 0.85}} />
    ))}
    {(tabs ?? [title]).map((t, i) => (
      <div
        key={t}
        style={{
          marginLeft: i === 0 ? 16 : 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: F.mono,
          fontSize: 24,
          color: i === active ? C.mint : C.muted,
          padding: '5px 16px',
          borderRadius: 9,
          background: i === active ? `rgba(${C.mintRgb},0.10)` : 'transparent',
        }}
      >
        {Icon && i === active ? <Icon size={22} /> : null}
        {t}
      </div>
    ))}
  </div>
);

/* ---------- code editor ---------- */

export type EdLine = {text: string; at: number; hl?: number; dim?: boolean; bad?: number};

/**
 * Editor with line numbers and syntax colour. Each line types from `at`
 * (scene-local frame). `hl` is the frame a green highlight bar sweeps in;
 * `bad` does the same in red.
 */
export const Editor: React.FC<{
  file: string;
  lang: Lang;
  lines: EdLine[];
  width?: number;
  fontSize?: number;
  speed?: number;
  sfx?: boolean;
  icon?: LucideIcon;
  tabs?: string[];
  style?: React.CSSProperties;
  glow?: string;
}> = ({file, lang, lines, width = 1100, fontSize = 34, speed = 2.2, sfx = true, icon, tabs, style, glow}) => {
  const frame = useCurrentFrame();
  const lh = fontSize * 1.6;
  return (
    <Card style={{width, padding: 0, background: C.card, ...style}} glow={glow}>
      <WindowBar title={file} icon={icon} tabs={tabs} active={tabs ? tabs.indexOf(file) : 0} />
      <div style={{padding: '22px 0 26px', fontFamily: F.mono, fontSize, lineHeight: `${lh}px`}}>
        {lines.map((l, i) => {
          const n = Math.max(0, Math.min(l.text.length, Math.floor((frame - l.at) * speed)));
          const done = n >= l.text.length;
          const typing = frame >= l.at && !done;
          const hl = l.hl !== undefined ? ramp(frame, l.hl, 8) : 0;
          const bad = l.bad !== undefined ? ramp(frame, l.bad, 8) : 0;
          const col = bad > 0 ? C.red : C.green;
          const k = Math.max(hl, bad);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 26,
                height: lh,
                opacity: frame < l.at ? 0 : l.dim ? 0.4 : 1,
                background: k ? `${col}${Math.round(0x26 * k).toString(16).padStart(2, '0')}` : undefined,
                boxShadow: k ? `inset 5px 0 0 ${col}` : undefined,
                padding: '0 30px 0 22px',
              }}
            >
              <span style={{color: C.muted, opacity: 0.45, width: 34, textAlign: 'right', flexShrink: 0}}>{i + 1}</span>
              <span style={{whiteSpace: 'pre'}}>
                {colorLine(l.text.slice(0, n), lang)}
                {typing || (frame >= l.at && frame < l.at + l.text.length / speed + 14 && Math.floor(frame / 7) % 2 === 0) ? (
                  <span style={{color: C.green}}>▍</span>
                ) : null}
              </span>
              {sfx && l.text.length > 0 ? <TypingSfx from={l.at} chars={l.text.length} speed={speed} /> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- terminal ---------- */

export type TermLine = {text: string; at: number; kind?: 'cmd' | 'out' | 'ok' | 'err' | 'note'; lang?: Lang; hl?: number};

/** Terminal: `cmd` lines type after a "$" prompt, output lines snap in. */
export const Terminal: React.FC<{
  lines: TermLine[];
  title?: string;
  width?: number;
  fontSize?: number;
  speed?: number;
  height?: number;
  style?: React.CSSProperties;
  glow?: string;
}> = ({lines, title = 'terminal', width = 1200, fontSize = 30, speed = 2.6, height, style, glow}) => {
  const frame = useCurrentFrame();
  const lh = fontSize * 1.55;
  const visible = lines.filter((l) => frame >= l.at);
  const maxRows = height ? Math.floor((height - 110) / lh) : 999;
  const shown = visible.slice(Math.max(0, visible.length - maxRows));
  return (
    <Card style={{width, height, padding: 0, background: C.card, ...style}} glow={glow}>
      <WindowBar title={title} />
      <div style={{padding: '20px 30px', fontFamily: F.mono, fontSize, lineHeight: `${lh}px`}}>
        {shown.map((l, i) => {
          const kind = l.kind ?? 'out';
          const hl = l.hl !== undefined ? ramp(frame, l.hl, 8) : 0;
          if (kind === 'cmd') {
            const n = Math.max(0, Math.min(l.text.length, Math.floor((frame - l.at) * speed)));
            const typing = n < l.text.length;
            return (
              <div key={i} style={{whiteSpace: 'pre', minHeight: lh}}>
                <TypingSfx from={l.at} chars={l.text.length} speed={speed} />
                <span style={{color: C.green, fontWeight: 700}}>$ </span>
                {colorLine(l.text.slice(0, n), l.lang ?? 'shell')}
                {typing || Math.floor(frame / 8) % 2 === 0 ? <span style={{color: C.green}}>{typing ? '▍' : ''}</span> : null}
              </div>
            );
          }
          const col = kind === 'ok' ? C.green : kind === 'err' ? C.red : kind === 'note' ? C.muted : undefined;
          return (
            <div
              key={i}
              style={{
                whiteSpace: 'pre',
                minHeight: lh,
                color: col,
                background: hl ? `rgba(${C.greenRgb},${0.16 * hl})` : undefined,
                boxShadow: hl ? `inset 4px 0 0 rgba(${C.greenRgb},${hl})` : undefined,
                margin: '0 -30px',
                padding: '0 30px',
                opacity: interpolate(frame - l.at, [0, 4], [0, 1], clamp),
              }}
            >
              {col ? l.text : colorLine(l.text, l.lang ?? 'http')}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- network diagram ---------- */

/** A machine in a network diagram: icon tile + mono label. */
export const NetNode: React.FC<{
  x: number;
  y: number;
  icon: LucideIcon;
  label: string;
  color?: string;
  p?: number;
  size?: number;
  active?: number;
  sub?: string;
}> = ({x, y, icon: Icon, label, color = C.green, p = 1, size = 150, active = 0, sub}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * p})`,
      opacity: Math.min(1, p * 1.5),
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 14,
    }}
  >
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: `linear-gradient(160deg, ${color}33, ${color}0d)`,
        border: `2.5px solid ${color}`,
        boxShadow: `0 0 ${20 + 50 * active}px ${color}${active > 0.05 ? '88' : '33'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={size * 0.5} color={color} strokeWidth={2} />
    </div>
    <div style={{fontFamily: F.mono, fontSize: 30, color: C.text, fontWeight: 600, whiteSpace: 'nowrap'}}>{label}</div>
    {sub ? <div style={{fontFamily: F.mono, fontSize: 22, color: C.muted, marginTop: -8, whiteSpace: 'nowrap'}}>{sub}</div> : null}
  </div>
);

/** Straight connection with flowing dashes. */
export const Wire: React.FC<{x1: number; y1: number; x2: number; y2: number; p?: number; color?: string; flow?: boolean}> = ({
  x1,
  y1,
  x2,
  y2,
  p = 1,
  color = C.green,
  flow = true,
}) => {
  const frame = useCurrentFrame();
  const len = Math.hypot(x2 - x1, y2 - y1);
  return (
    <svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}} width={1} height={1}>
      <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * p} y2={y1 + (y2 - y1) * p} stroke={`${color}44`} strokeWidth={6} strokeLinecap="round" />
      {flow ? (
        <line
          x1={x1}
          y1={y1}
          x2={x1 + (x2 - x1) * p}
          y2={y1 + (y2 - y1) * p}
          stroke={color}
          strokeWidth={3}
          strokeDasharray="6 22"
          strokeDashoffset={-frame * 2}
          opacity={0.7 * p}
          strokeLinecap="round"
        />
      ) : null}
      <circle cx={x1} cy={y1} r={6 * p} fill={color} />
      <circle cx={x1 + (x2 - x1) * p} cy={y1 + (y2 - y1) * p} r={len ? 6 * p : 0} fill={color} />
    </svg>
  );
};

/** A labelled packet that travels from (x1,y1) to (x2,y2) between frames t0 and t1. */
export const Packet: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t0: number;
  t1: number;
  label: string;
  color?: string;
  icon?: LucideIcon;
  stay?: boolean;
  sfx?: boolean;
  size?: number;
}> = ({x1, y1, x2, y2, t0, t1, label, color = C.green, icon: Icon, stay = false, sfx = true, size = 28}) => {
  const frame = useCurrentFrame();
  if (frame < t0 - 1) return null;
  const k = ramp(frame, t0, t1 - t0, Easing.inOut(Easing.quad));
  if (!stay && frame > t1 + 10) return null;
  const fade = stay ? 1 : interpolate(frame, [t1, t1 + 10], [1, 0], clamp);
  const x = x1 + (x2 - x1) * k;
  const y = y1 + (y2 - y1) * k;
  return (
    <>
      {sfx ? <Sfx name="whoosh" at={t0} volume={0.22} /> : null}
      {sfx ? <Sfx name="pop-low" at={t1} volume={0.35} /> : null}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          transform: `translate(-50%, -50%) scale(${interpolate(frame - t0, [0, 6], [0.6, 1], clamp)})`,
          opacity: interpolate(frame - t0, [0, 4], [0, 1], clamp) * fade,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: `${size * 0.35}px ${size * 0.7}px`,
          borderRadius: 14,
          background: C.card,
          border: `2.5px solid ${color}`,
          boxShadow: `0 0 24px ${color}33, ${C.shadow}`,
          fontFamily: F.mono,
          fontSize: size,
          fontWeight: 600,
          color,
          whiteSpace: 'nowrap',
        }}
      >
        {Icon ? <Icon size={size * 1.1} /> : null}
        {label}
      </div>
    </>
  );
};

/* ---------- file tree ---------- */

export type TreeRow = {name: string; depth: number; icon: LucideIcon; at: number; hl?: number; color?: string; note?: string};

export const FileTree: React.FC<{rows: TreeRow[]; width?: number; fontSize?: number; title?: string; style?: React.CSSProperties}> = ({
  rows,
  width = 560,
  fontSize = 30,
  title = 'EXPLORER',
  style,
}) => {
  const frame = useCurrentFrame();
  return (
    <Card style={{width, padding: 0, background: C.card, ...style}}>
      <div style={{padding: '16px 24px', borderBottom: `1.5px solid ${C.line}`, fontFamily: F.mono, fontSize: 20, letterSpacing: '0.12em', color: C.muted}}>{title}</div>
      <div style={{padding: '14px 0'}}>
        {rows.map((r, i) => {
          const p = ramp(frame, r.at, 6);
          const hl = r.hl !== undefined ? ramp(frame, r.hl, 8) : 0;
          const col = r.color ?? C.text;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                height: fontSize * 1.75,
                padding: `0 20px 0 ${24 + r.depth * 34}px`,
                fontFamily: F.mono,
                fontSize,
                color: hl > 0.5 ? C.green : col,
                opacity: p,
                transform: `translateX(${(1 - p) * -20}px)`,
                background: hl ? `rgba(${C.greenRgb},${0.16 * hl})` : undefined,
                boxShadow: hl ? `inset 4px 0 0 rgba(${C.greenRgb},${hl})` : undefined,
              }}
            >
              <r.icon size={fontSize * 0.95} color={hl > 0.5 ? C.green : r.depth === 0 ? C.amber : C.muted} />
              <span style={{whiteSpace: 'nowrap'}}>{r.name}</span>
              {r.note ? <span style={{marginLeft: 'auto', fontSize: fontSize * 0.7, color: C.mint, opacity: hl}}>{r.note}</span> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- meters ---------- */

/** Horizontal bar with a counting number, e.g. tokens or KB. */
export const Meter: React.FC<{
  label: string;
  value: number;
  max: number;
  p: number;
  color?: string;
  unit?: string;
  width?: number;
  icon?: LucideIcon;
  labelWidth?: number;
}> = ({label, value, max, p, color = C.green, unit = '', width = 900, icon: Icon, labelWidth = 260}) => {
  const frame = useCurrentFrame();
  const v = Math.round(value * p);
  // soft tick-tock while the bar fills (a one-frame mount plays one short tick)
  const ticking = p > 0.02 && p < 0.98 && frame % 6 === 0;
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 24, width}}>
      {ticking ? <Sfx name={frame % 12 === 0 ? 'tick' : 'tock'} at={frame} volume={0.2} /> : null}
      <div style={{display: 'flex', alignItems: 'center', gap: 12, width: labelWidth, flexShrink: 0, fontFamily: F.mono, fontSize: 32, color}}>
        {Icon ? <Icon size={34} /> : null}
        {label}
      </div>
      <div style={{flex: 1, height: 44, borderRadius: 12, background: C.fill, overflow: 'hidden', border: `1.5px solid ${C.line}`}}>
        <div style={{width: `${(value / max) * 100 * p}%`, height: '100%', background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow: `0 0 18px ${color}44`}} />
      </div>
      <div style={{width: 190, flexShrink: 0, textAlign: 'right', fontFamily: F.mono, fontSize: 34, fontWeight: 700, color: C.text}}>
        {v.toLocaleString('en-US')}
        <span style={{fontSize: 24, color: C.muted}}>{unit}</span>
      </div>
    </div>
  );
};

/** Small mono label used to annotate diagrams ("Accept", "200 OK"). */
export const Tag: React.FC<{children: React.ReactNode; color?: string; size?: number; style?: React.CSSProperties; solid?: boolean}> = ({
  children,
  color = C.green,
  size = 26,
  style,
  solid,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: F.mono,
      fontSize: size,
      fontWeight: 600,
      color: solid ? C.onSolid : color,
      background: solid ? color : `${color}1c`,
      border: `2px solid ${color}88`,
      padding: `${size * 0.2}px ${size * 0.5}px`,
      borderRadius: 10,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </span>
);
