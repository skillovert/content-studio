// An edited video (Travel Video Editing kit), from its timeline (server/editrender.mjs): the creator's clips and
// photos with their colour, the graphics and cutouts (the same scene library as everything else), clips over
// the picture, and every sound with its fades and the music going down under the voices. The preview plays
// the 540p working copies; the final plays full-size copies of the originals.
import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from '@studio/brand/theme';
import {SfxEnabled, SfxGain} from '@studio/components/ui';
import {Backdrop} from './themefx';
import {PieceBody} from './Piece';
import {duckAt} from '../public/mix.js';
import type {EditClip, EditGrade, EditProps, EditSound} from './types';
import {FPS, f} from './types';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const Graded: React.FC<{id: string; grade?: EditGrade | null; children: React.ReactNode}> = ({id, grade, children}) => {
  if (!grade) return <>{children}</>;
  return (
    <AbsoluteFill>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id={id} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={grade.matrix} />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={grade.table} />
            <feFuncG type="table" tableValues={grade.table} />
            <feFuncB type="table" tableValues={grade.table} />
          </feComponentTransfer>
        </filter>
      </svg>
      <AbsoluteFill style={{filter: `url(#${id}) ${grade.css}`}}>{children}</AbsoluteFill>
      {grade.vignette ? <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.85) 100%)', opacity: grade.vignette}} /> : null}
    </AbsoluteFill>
  );
};

const Picture: React.FC<{c: EditClip; id: string; playlist: string}> = ({c, id, playlist}) => {
  const frame = useCurrentFrame();
  const d = Math.max(1, f(c.dur));
  if (c.kind === 'piece' && c.piece) return <PieceBody piece={c.piece} alpha={Boolean(c.alpha)} d={d} playlist={playlist} />;
  if (c.kind === 'gap' || !c.src) return <AbsoluteFill style={{background: C.bg0}}><Backdrop /></AbsoluteFill>;
  const fit = c.fit === 'cover' ? 'cover' : 'contain';
  const push = c.kind === 'image' && c.move !== 'still' ? interpolate(frame, [0, d], [1, 1.08], clamp) : 1;
  const media = c.kind === 'video'
    ? <OffthreadVideo src={c.src} muted startFrom={f(c.trimIn || 0)} playbackRate={c.speed || 1} style={{width: '100%', height: '100%', objectFit: fit}} />
    : <Img src={c.src} style={{width: '100%', height: '100%', objectFit: fit, transform: `scale(${push})`}} />;
  return (
    <AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
      {c.fit === 'blur' && c.still ? <Img src={c.still} style={{position: 'absolute', inset: -60, width: 'calc(100% + 120px)', height: 'calc(100% + 120px)', objectFit: 'cover', filter: 'blur(40px) brightness(.6)'}} /> : null}
      <Graded id={id} grade={c.grade}>{media}</Graded>
    </AbsoluteFill>
  );
};

/** The picture steps back while a cutout sits over it (as the director's "over" inserts do). */
const StepBack: React.FC<{over: EditClip[]; children: React.ReactNode}> = ({over, children}) => {
  const frame = useCurrentFrame();
  const k = over.filter((o) => o.kind === 'piece' && o.alpha).reduce((m, o) => Math.max(m, interpolate(frame, [f(o.from), f(o.from) + 6, f(o.from + o.dur) - 6, f(o.from + o.dur)], [0, 1, 1, 0], clamp)), 0);
  return <AbsoluteFill style={{opacity: 1 - 0.6 * k, filter: k > 0.02 ? `blur(${3 * k}px)` : undefined, transform: `translateX(${-120 * k}px) scale(${1 - 0.06 * k})`}}>{children}</AbsoluteFill>;
};

const Sound: React.FC<{s: EditSound; talk: [number, number][]}> = ({s, talk}) => (
  <Audio
    src={s.src}
    startFrom={f(s.trimIn)}
    playbackRate={s.speed}
    volume={(fr) => {
      const t = fr / FPS;
      let g = s.volume;
      if (s.fadeIn && t < s.fadeIn) g *= t / s.fadeIn;
      if (s.fadeOut && t > s.dur - s.fadeOut) g *= Math.max(0, (s.dur - t) / s.fadeOut);
      return g * duckAt(s.from + t, talk, s.duck);
    }}
  />
);

export const Edit: React.FC<EditProps> = ({main, over, sounds, talk, playlist}) => {
  const {durationInFrames} = useVideoConfig();
  return (
    <SfxEnabled.Provider value>
      <SfxGain.Provider value={1}>
        <AbsoluteFill style={{whiteSpace: 'nowrap', background: '#000'}}>
          <StepBack over={over}>
            {main.map((c, i) => (
              <Sequence key={i} from={f(c.from)} durationInFrames={Math.max(1, Math.min(durationInFrames - f(c.from), f(c.dur)))} name={`main-${i}-${c.kind}`}>
                <Picture c={c} id={`g-m${i}`} playlist={playlist} />
              </Sequence>
            ))}
          </StepBack>
          {over.map((c, i) => (
            <Sequence key={i} from={f(c.from)} durationInFrames={Math.max(1, f(c.dur))} name={`over-${i}-${c.kind}`}>
              {c.pip ? (
                <div style={{position: 'absolute', right: '3%', bottom: '6%', width: '30%', aspectRatio: '16 / 9', borderRadius: 18, overflow: 'hidden', border: '4px solid rgba(255,255,255,.85)', boxShadow: '0 20px 60px rgba(0,0,0,.6)'}}>
                  <Picture c={{...c, fit: 'cover'}} id={`g-o${i}`} playlist={playlist} />
                </div>
              ) : (
                <Picture c={c} id={`g-o${i}`} playlist={playlist} />
              )}
            </Sequence>
          ))}
          {sounds.map((s, i) => (
            <Sequence key={i} from={f(s.from)} durationInFrames={Math.max(1, f(s.dur))} name={`sound-${i}`}>
              <Sound s={s} talk={talk} />
            </Sequence>
          ))}
        </AbsoluteFill>
      </SfxGain.Provider>
    </SfxEnabled.Provider>
  );
};
