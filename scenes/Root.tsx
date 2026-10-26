import '@studio/brand/fonts';
import React from 'react';
import {Composition} from 'remotion';
import {Preview} from './Preview';
import {Thumb} from './Thumb';
import {Piece} from './Piece';
import {Edit} from './Edit';
import type {EditProps, PieceProps, PreviewProps} from './types';
import {FPS, f} from './types';

const EMPTY = {code: '', playlist: '', label: '', cause: '', lang: 'ur-Latn', bed: null, fx: 1, captions: true, plan: {title: '', asOf: '', newsLabel: '', summary: '', card: {topic: [], cause: []}, sources: [], quotes: [], scenes: [], thumbnail: {jargonTitle: '', urduLine: '', urduLineRoman: '', stamp: '', keyVisual: ''}, duration: 1}} as PreviewProps;

export const Root: React.FC = () => (
  <>
    <Composition
      id="Preview"
      component={Preview}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={30}
      defaultProps={EMPTY}
      calculateMetadata={({props}) => ({durationInFrames: Math.max(30, f(props.plan.duration))})}
    />
    <Composition
      id="Piece"
      component={Piece}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={30}
      defaultProps={{piece: {}, dur: 1, alpha: false, playlist: ''} as PieceProps}
      calculateMetadata={({props}) => ({durationInFrames: Math.max(15, f(props.dur))})}
    />
    <Composition
      id="Edit"
      component={Edit}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={30}
      defaultProps={{duration: 1, main: [], over: [], sounds: [], talk: [], playlist: ''} as EditProps}
      calculateMetadata={({props}) => ({durationInFrames: Math.max(15, f(props.duration))})}
    />
    <Composition id="Thumb" component={Thumb} fps={FPS} width={1920} height={1080} durationInFrames={1} defaultProps={EMPTY} />
  </>
);
