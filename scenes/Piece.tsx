// One graphic of an edited video's timeline (Travel Video Editing kit), rendered on its own so the editor can
// play it (server/pieces.mjs): a plan graphic full screen, a cutout (reference flash, quote, map inset...)
// full screen or laid over the footage with a see-through background, or the creator's own clip or photo
// inside a cutout frame. Same scene library, brand and theme as the preview, so the final matches.
import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {C} from '@studio/brand/theme';
import {SfxEnabled, SfxGain} from '@studio/components/ui';
import {SceneShell} from '@studio/components/pieces';
import {Backdrop, Lens, ScreenFx, shellCut} from './themefx';
import {FULL, GraphicView, HIDE_CHROME} from './graphics';
import {Inserts} from './Inserts';
import type {PieceProps} from './types';
import {FPS} from './types';

/** What a piece draws, for d frames (also used inside the edited video's final, scenes/Edit.tsx). */
export const PieceBody: React.FC<{piece: PieceProps['piece']; alpha: boolean; d: number; playlist: string}> = ({piece, alpha, d, playlist}) => {
  const ctx = {plan: {title: '', asOf: ''}, playlist, label: '', cause: '', footage: {}};
  if (piece.graphic) {
    const g = piece.graphic;
    const n = Math.max(1, g.items.length);
    // the items come in one after another over the first two thirds of the graphic
    const at = Array.from({length: n}, (_, j) => 6 + Math.round((j * Math.max(0, d * 0.66 - 6)) / n));
    const view = <GraphicView g={g} at={at} dur={d} ctx={ctx} />;
    return (
      <AbsoluteFill style={{background: C.bg0}}>
        <Lens>
          <Backdrop />
          {HIDE_CHROME.has(g.type) ? view : <SceneShell duration={d} fast whoosh={shellCut()} fit={FULL.has(g.type) ? {x: 0, y: 0, s: 1} : undefined}>{view}</SceneShell>}
          <ScreenFx />
        </Lens>
      </AbsoluteFill>
    );
  }
  if (piece.insert) {
    return (
      <AbsoluteFill style={{background: alpha ? 'transparent' : C.bg0}}>
        {alpha ? null : <Backdrop />}
        <Inserts inserts={[{...piece.insert, from: 0, to: d / FPS}]} />
      </AbsoluteFill>
    );
  }
  return null;
};

export const Piece: React.FC<PieceProps> = ({piece, playlist, alpha}) => {
  const {durationInFrames: d} = useVideoConfig();
  return (
    <SfxEnabled.Provider value>
      <SfxGain.Provider value={1}>
        <AbsoluteFill style={{whiteSpace: 'nowrap', background: alpha ? 'transparent' : C.bg0}}>
          <PieceBody piece={piece} alpha={alpha} d={d} playlist={playlist} />
        </AbsoluteFill>
      </SfxGain.Provider>
    </SfxEnabled.Provider>
  );
};
