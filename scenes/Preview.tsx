// The whole video, built from the plan: one beat per voice-over line (its graphic), the News
// chrome, the bed and (for the preview) burnt-in captions in place of the voice.
import React from 'react';
import {AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, F} from '@studio/brand/theme';
import {COURSE} from '@studio/brand/course';
import {SfxEnabled, SfxGain} from '@studio/components/ui';
import {SceneShell} from '@studio/components/pieces';
import {Backdrop, Cut, Lens, ScreenFx, shellCut} from './themefx';
import {THEME} from './brand';
import {NewsBadge} from '@studio/components/pieces';
import {autoGraphic} from './auto';
import {FULL, GraphicView, HIDE_CHROME} from './graphics';
import {focusAt, Inserts} from './Inserts';
import {FaceShift, FaceSlots, faceLines} from './Faces';
import type {Graphic, Plan, PreviewProps} from './types';
import {f} from './types';

export type Beat = {g: Graphic; from: number; to: number; at: number[]; scene: number};

/** Lines → beats. A "continue" line keeps the previous graphic and reveals its next items. */
export function beatsOf(plan: Plan): Beat[] {
  const out: Beat[] = [];
  plan.scenes.forEach((s, si) => {
    const sceneBeats: {g: Graphic; starts: number[]}[] = [];
    s.lines.forEach((l, i) => {
      const g = l.graphic && l.graphic.type ? l.graphic : autoGraphic(plan, s, i);
      if (g.type === 'continue' && sceneBeats.length) sceneBeats[sceneBeats.length - 1].starts.push(f(l.start));
      else sceneBeats.push({g: g.type === 'continue' ? autoGraphic(plan, s, 0) : g, starts: [f(l.start)]});
    });
    sceneBeats.forEach((b, i) => {
      const from = i === 0 ? f(s.start) : b.starts[0] - 4;
      const to = i < sceneBeats.length - 1 ? sceneBeats[i + 1].starts[0] - 4 : f(s.end);
      const n = Math.max(1, b.g.items.length);
      const k = b.starts.length - 1;
      // items spread over the line(s) of the beat, local to the beat's start
      const at = Array.from({length: n}, (_, j) => b.starts[Math.min(k, Math.floor((j * (k + 1)) / n))] - from + (k ? 0 : 6));
      out.push({g: b.g, from, to: Math.max(from + 15, to), at, scene: si});
    });
  });
  return out;
}

/** Top-left: News label then the lead Cause; top-right: cyan dot + playlist name (owner rule, 24 Oct 2026). */
const Chrome: React.FC<{label: string; cause: string; playlist: string; hide: [number, number][]; speech: [number, number][]}> = ({label, cause, playlist, hide, speech}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const lb = THEME?.effect?.letterbox || 0; // keep the labels inside the picture, clear of letterbox bars
  const show = hide.reduce((acc, [a, b]) => Math.min(acc, interpolate(frame, [a - 8, a, b - 4, b + 8], [1, 0, 0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})), 1);
  const level = speech.reduce((acc, [a, b]) => Math.max(acc, interpolate(frame, [a - 4, a + 6, b - 6, b + 6], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})), 0);
  return (
    <AbsoluteFill style={{pointerEvents: 'none', opacity: show}}>
      <div style={{position: 'absolute', left: 0, top: lb, height: 5, width: `${(frame / durationInFrames) * 100}%`, background: COURSE.color}} />
      <div style={{position: 'absolute', left: 64, top: lb ? lb + 22 : 40, display: 'flex', alignItems: 'center', gap: 14}}>
        {label ? <NewsBadge text={label} size={24} /> : null}
        {cause ? <div style={{padding: '6px 14px', border: `2px solid ${C.text}`, color: C.text, fontFamily: F.mono, fontWeight: 600, fontSize: 22, letterSpacing: '0.12em'}}>{cause.toUpperCase()}</div> : null}
      </div>
      <div style={{position: 'absolute', right: 64, top: lb ? lb + 30 : 48, display: 'flex', alignItems: 'center', gap: 12, fontFamily: F.mono, fontWeight: 600, fontSize: 24, letterSpacing: '0.12em', color: C.text}}>
        <span style={{width: 13, height: 13, borderRadius: 7, background: COURSE.cyan, boxShadow: `0 0 ${6 + 8 * level}px ${COURSE.cyan}`}} />
        {playlist.toUpperCase()}
      </div>
      <div style={{position: 'absolute', left: 64, bottom: lb ? lb + 22 : 34, display: 'flex', alignItems: 'center', gap: 16}}>
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

/** Burnt-in voice-over text (preview only, until the voice is recorded). Jargon in "quotes" shows in cyan. */
const Captions: React.FC<{lines: {from: number; to: number; vo: string}[]; aside: [number, number][]}> = ({lines, aside}) => {
  const frame = useCurrentFrame();
  const cur = lines.find((l) => frame >= l.from && frame < l.to);
  if (!cur) return null;
  const parts = cur.vo.split(/("[^"]+")/);
  // over the title card the logo sits bottom-left, so the text moves right
  const right = aside.some(([a, b]) => frame >= a && frame < b);
  return (
    <div style={{position: 'absolute', left: right ? 760 : 360, right: right ? 100 : 360, bottom: 96, display: 'flex', justifyContent: right ? 'flex-end' : 'center'}}>
      <div style={{background: 'rgba(10,10,10,0.82)', padding: '10px 22px', fontFamily: F.body, fontWeight: 600, fontSize: 34, lineHeight: 1.35, color: '#FFFFFF', textAlign: 'center', whiteSpace: 'normal', borderRadius: 6}}>
        {parts.map((p, i) => (p.startsWith('"') ? <span key={i} style={{color: COURSE.cyan}}>{p.slice(1, -1)}</span> : <span key={i}>{p}</span>))}
      </div>
    </div>
  );
};

/** The plan's graphics, stepping back (dim + soft blur) while a director's insert is up. */
const Stage: React.FC<{children: React.ReactNode; inserts: PreviewProps['inserts']}> = ({children, inserts}) => {
  const frame = useCurrentFrame();
  const k = focusAt(frame, inserts || []);
  return <AbsoluteFill style={{opacity: 1 - 0.6 * k, filter: k > 0.02 ? `blur(${3 * k}px)` : undefined, transform: `translateX(${-120 * k}px) scale(${1 - 0.06 * k})`}}>{children}</AbsoluteFill>;
};

export const Preview: React.FC<PreviewProps> = ({plan, playlist, label, cause, bed, fx, captions, inserts = [], voice, footage, cameras}) => {
  const {durationInFrames} = useVideoConfig();
  const beats = beatsOf(plan);
  const lines = plan.scenes.flatMap((s) => s.lines.map((l) => ({from: f(l.start), to: f(l.end), vo: l.vo})));
  const ctx = {plan, playlist, label, cause, footage};
  const faces = faceLines(plan);
  return (
    <SfxEnabled.Provider value>
      <SfxGain.Provider value={fx}>
        <AbsoluteFill style={{whiteSpace: 'nowrap', background: C.bg0}}>
          <Lens>
          <Backdrop />
          {bed ? (
            <Audio loop src={staticFile(bed)} volume={(fr) => interpolate(fr, [0, 30, durationInFrames - 60, durationInFrames], [0, COURSE.bedVolume * fx, COURSE.bedVolume * fx, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
          ) : null}
          {voice ? <Audio src={voice} /> : null}
          <FaceShift lines={faces}>
          <Stage inserts={inserts}>
          {beats.map((b, i) => (
            <Sequence key={i} from={b.from} durationInFrames={b.to - b.from} name={`${plan.scenes[b.scene].kind}-${b.g.type}`}>
              {HIDE_CHROME.has(b.g.type) ? (
                <GraphicView g={b.g} at={b.at} dur={b.to - b.from} ctx={ctx} />
              ) : (
                <SceneShell duration={b.to - b.from} fast whoosh={shellCut()} fit={FULL.has(b.g.type) ? {x: 0, y: 0, s: 1} : undefined}>
                  <GraphicView g={b.g} at={b.at} dur={b.to - b.from} ctx={ctx} />
                </SceneShell>
              )}
              {i > 0 ? <Cut /> : null}
            </Sequence>
          ))}
          </Stage>
          <Inserts inserts={inserts} />
          </FaceShift>
          <FaceSlots lines={faces} cameras={cameras} />
          <Chrome label={label} cause={cause} playlist={playlist} hide={beats.filter((b) => HIDE_CHROME.has(b.g.type)).map((b) => [b.from, b.to])} speech={lines.map((l) => [l.from, l.to])} />
          {captions ? <Captions lines={lines} aside={beats.filter((b) => HIDE_CHROME.has(b.g.type)).map((b) => [b.from, b.to])} /> : null}
          <ScreenFx />
          </Lens>
        </AbsoluteFill>
      </SfxGain.Provider>
    </SfxEnabled.Provider>
  );
};
