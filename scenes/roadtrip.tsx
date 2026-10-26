// Road trips and itineraries inside a region (the Remote Documentary kit): an illustrated map made
// from the plan, never real road data. Stops come in order with "lat, lon" (or are laid out in order
// when they have none); the road between them is drawn as a winding road, the key areas along the
// way (hills, lakes, food, viewpoints...) appear as the car passes them, and the distance runs up.
//   items  stops: label = place, detail = "lat, lon", value = "62 km · 50 min" from the previous stop
//   lines  key areas: "Name | lat, lon | kind | note" (kind: hills, lake, river, forest, city, food,
//          fuel, view, sight, rest, stay)
//   stamp  the road's name for its shield ("M-2"), kicker / title the heading
// Styles: atlas (paper road atlas), nav (navigation app), journal (sketch in a travel notebook),
// transit (a metro-style line diagram of the itinerary).
import React from 'react';
import {AbsoluteFill, Easing, interpolate, random, useCurrentFrame} from 'remotion';
import * as L from 'lucide-react';
import {C, F} from '@studio/brand/theme';
import {COURSE} from '@studio/brand/course';
import {Sfx, sp} from '@studio/components/ui';
import {ramp} from '@studio/components/dev';
import {fadeIn} from '@studio/components/footage';
import type {Graphic} from './types';

type P = {x: number; y: number};
type Stop = P & {label: string; value: string; km: number | null; min: number | null};
type Area = P & {name: string; kind: string; note: string; frac: number; ax?: number; ay?: number};
type Props = {g: Graphic; at: number[]; dur: number};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const coords = (s: string): [number, number] | null => {
  const m = /(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/.exec(s || '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
};
const kmOf = (v: string) => {
  const m = /(\d+(?:[.,]\d+)?)\s*km/i.exec(v || '');
  return m ? Number(m[1].replace(',', '.')) : null;
};
const minOf = (v: string) => {
  const h = /(\d+(?:\.\d+)?)\s*h/i.exec(v || '');
  const m = /(\d+)\s*(?:min|m\b)/i.exec(v || '');
  return h || m ? Math.round((h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0)) : null;
};
const clock = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m` : `${Math.round(min)} min`);
const KIND_ICON: Record<string, React.FC<{size?: number; color?: string; strokeWidth?: number}>> = {
  hills: L.Mountain, mountain: L.Mountain, lake: L.Droplets, river: L.Waves, sea: L.Waves, forest: L.Trees, park: L.Trees, city: L.Building2, town: L.Building2,
  food: L.Utensils, fuel: L.Fuel, view: L.Camera, sight: L.Landmark, rest: L.Coffee, stay: L.Bed, camp: L.Tent,
};
const iconOf = (kind: string) => KIND_ICON[kind] || L.MapPin;
/** True when the theme's text is light, i.e. the canvas is dark. */
const darkTheme = () => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(C.text || '');
  return m ? (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / 3 > 128 : true;
};
const KIND_COLOR: Record<string, string> = {hills: '#8B6B3E', mountain: '#8B6B3E', lake: '#2F8FD8', river: '#2F8FD8', sea: '#2F8FD8', forest: '#2E8B57', park: '#2E8B57', city: '#6B6B6B', town: '#6B6B6B'};

// the map's own box on the 1920x1080 frame (the right side keeps the itinerary panel)
const BOX = {x: 80, y: 128, w: 1250, h: 862};

type Side = 'up' | 'down' | 'left' | 'right';
type Box = {x: number; y: number; w: number; h: number};

/** A point at a share of a polyline. */
const pointAt = (pts: P[], f: number) => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const d = f * cum[cum.length - 1];
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const t = (d - cum[i - 1]) / Math.max(0.001, cum[i] - cum[i - 1]);
  return {x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t};
};

/**
 * Stops, areas and the winding road, fitted into the box. The drawing follows the plan's geography
 * loosely: stops keep their order and general direction but are spread along the road (half by
 * distance, half evenly) so labels have room, and every key area sits beside the road where it is
 * passed, on the side it lies.
 */
export function layout(g: Graphic, box: Box = BOX, wiggle = true) {
  const raw = (g.items || []).slice(0, 9).map((it) => ({it, c: coords(it.detail)}));
  const areaRaw = (g.lines || []).slice(0, 8).map((s) => {
    const [name = '', where = '', kind = '', note = ''] = String(s).split('|').map((x) => x.trim());
    return {name, c: coords(where), kind: kind.toLowerCase(), note};
  }).filter((a) => a.name);
  const n = raw.length;
  const pad = 130;
  const inner = {x: box.x + pad, y: box.y + pad * 0.8, w: box.w - pad * 2, h: box.h - pad * 1.6};
  // geography: a local flat projection of the stops, fitted to the box (a little stretched to fill it)
  const known = raw.map((r) => r.c).filter(Boolean) as [number, number][];
  const lat0 = known.length ? (known.reduce((a, c) => a + c[0], 0) / known.length) * (Math.PI / 180) : 0;
  const XY = (c: [number, number]) => ({x: c[1] * Math.cos(lat0), y: -c[0]});
  let fit: (q: P) => P = (q) => q;
  if (known.length >= 2) {
    const qs = known.map(XY);
    const x0 = Math.min(...qs.map((q) => q.x));
    const x1 = Math.max(...qs.map((q) => q.x));
    const y0 = Math.min(...qs.map((q) => q.y));
    const y1 = Math.max(...qs.map((q) => q.y));
    let sx = inner.w / Math.max(1e-6, x1 - x0);
    let sy = inner.h / Math.max(1e-6, y1 - y0);
    // keep the shape: never stretch one way more than 1.8 times the other
    if (sx > sy * 1.8) sx = sy * 1.8;
    if (sy > sx * 1.8) sy = sx * 1.8;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    fit = (q) => ({x: inner.x + inner.w / 2 + (q.x - cx) * sx, y: inner.y + inner.h / 2 + (q.y - cy) * sy});
  }
  const diag = (j: number): P => ({x: inner.x + (inner.w * j) / Math.max(1, n - 1), y: inner.y + inner.h - inner.h * 0.75 * (j / Math.max(1, n - 1)) - (j % 2 ? 60 : 0)});
  let geo: (P | null)[] = raw.map((r) => (r.c && known.length >= 2 ? fit(XY(r.c)) : null));
  if (geo.every((p) => !p)) geo = raw.map((_, j) => diag(j));
  geo = geo.map((p, j) => {
    if (p) return p;
    const a = geo.slice(0, j).reverse().findIndex(Boolean);
    const b = geo.slice(j + 1).findIndex(Boolean);
    const pa = a >= 0 ? (geo[j - 1 - a] as P) : null;
    const pb = b >= 0 ? (geo[j + 1 + b] as P) : null;
    if (pa && pb) {
      const t = (a + 1) / (a + b + 2);
      return {x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t};
    }
    return diag(j);
  });
  const skeleton = geo as P[];
  // distances and times from the plan (each stop's value is its leg)
  const legsKm = raw.map((r, j) => (j ? kmOf(r.it.value) : 0));
  const legsMin = raw.map((r, j) => (j ? minOf(r.it.value) : 0));
  const hasKm = legsKm.slice(1).some((x) => x !== null);
  const hasMin = legsMin.slice(1).some((x) => x !== null);
  let kmSum = 0;
  let minSum = 0;
  const kmCum = legsKm.map((k) => (kmSum += k || 0));
  const minCum = legsMin.map((k) => (minSum += k || 0));
  // spread the stops along their own line: half by distance, half evenly
  const pts = n > 2 ? skeleton.map((p, j) => (j === 0 || j === n - 1 ? p : pointAt(skeleton, 0.5 * (hasKm && kmSum ? kmCum[j] / kmSum : j / (n - 1)) + 0.5 * (j / (n - 1))))) : skeleton;
  const seed = g.title || 'trip';
  // the road: each leg bends a little, the same way every render
  const road: P[] = [];
  const at: number[] = [];
  pts.forEach((B, j) => {
    const A = pts[j - 1];
    if (!A) {
      at.push(0);
      road.push(B);
      return;
    }
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const nx = -(B.y - A.y) / len;
    const ny = (B.x - A.x) / len;
    const amp = wiggle ? Math.min(70, len * (0.05 + 0.06 * random(`${seed}-a${j}`))) : 0;
    const k = 1 + Math.floor(random(`${seed}-k${j}`) * 2.5);
    const ph = random(`${seed}-p${j}`) * Math.PI * 2;
    const steps = Math.max(12, Math.round(len / 12));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const env = Math.sin(Math.PI * t);
      const w = wiggle ? Math.sin(t * Math.PI * k + ph) * amp * env + Math.sin(t * Math.PI * 9 + ph) * Math.min(6, len * 0.01) * env : 0;
      road.push({x: A.x + (B.x - A.x) * t + nx * w, y: A.y + (B.y - A.y) * t + ny * w});
    }
    at.push(road.length - 1);
  });
  const cum = [0];
  for (let i = 1; i < road.length; i++) cum.push(cum[i - 1] + Math.hypot(road[i].x - road[i - 1].x, road[i].y - road[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  const fracs = at.map((i) => cum[i] / total);
  const stops: Stop[] = raw.map((r, j) => ({...pts[j], label: r.it.label, value: j ? r.it.value : '', km: hasKm ? kmCum[j] : null, min: hasMin ? minCum[j] : null}));
  // key areas: beside the road where it passes them, on their own side of it
  const nearestOn = (line: P[], p: P) => {
    let best = 0;
    let d = Infinity;
    line.forEach((q, i) => {
      const e = Math.hypot(q.x - p.x, q.y - p.y);
      if (e < d) (d = e), (best = i);
    });
    return best;
  };
  const skCum = [0];
  for (let i = 1; i < skeleton.length; i++) skCum.push(skCum[i - 1] + Math.hypot(skeleton[i].x - skeleton[i - 1].x, skeleton[i].y - skeleton[i - 1].y));
  const used: number[] = [];
  const placed: P[] = [];
  const areas: Area[] = areaRaw.map((a, j) => {
    let f: number;
    let side = j % 2 ? 1 : -1;
    if (a.c && known.length >= 2) {
      // where along the stops' line it lies, and on which side
      const q = fit(XY(a.c));
      let bestF = 0;
      let bestD = Infinity;
      let bestS = side;
      for (let i = 1; i < skeleton.length; i++) {
        const A = skeleton[i - 1];
        const B = skeleton[i];
        const vx = B.x - A.x;
        const vy = B.y - A.y;
        const L2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((q.x - A.x) * vx + (q.y - A.y) * vy) / L2));
        const px = A.x + vx * t;
        const py = A.y + vy * t;
        const dd = Math.hypot(q.x - px, q.y - py);
        if (dd < bestD) (bestD = dd), (bestF = (skCum[i - 1] + Math.sqrt(L2) * t) / (skCum[skCum.length - 1] || 1)), (bestS = vx * (q.y - A.y) - vy * (q.x - A.x) > 0 ? 1 : -1);
      }
      // map the share on the stops' line to the same leg share on the road
      let leg = 1;
      while (leg < skeleton.length - 1 && skCum[leg] / skCum[skCum.length - 1] < bestF) leg++;
      const a0 = skCum[leg - 1] / skCum[skCum.length - 1];
      const a1 = skCum[leg] / skCum[skCum.length - 1];
      const t = (bestF - a0) / Math.max(1e-6, a1 - a0);
      f = fracs[leg - 1] + (fracs[leg] - fracs[leg - 1]) * t;
      if (bestD > 4) side = bestS;
    } else f = (j + 1) / (areaRaw.length + 1);
    // two areas at the same spot go to opposite sides
    if (used.some((u) => Math.abs(u - f) < 0.05)) side = -side;
    used.push(f);
    const i = Math.min(road.length - 2, Math.max(0, nearestOn(road, pointAt(road, f))));
    const A = road[Math.max(0, i - 3)];
    const B = road[Math.min(road.length - 1, i + 3)];
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const nx = -(B.y - A.y) / len;
    const ny = (B.x - A.x) / len;
    const keep = (q: P) => ({x: Math.max(box.x + 50, Math.min(box.x + box.w - 50, q.x)), y: Math.max(box.y + 50, Math.min(box.y + box.h - 50, q.y))});
    // beside the road, clear of the areas already placed: the other side, then further out
    const tries = [[side, 130], [-side, 130], [side, 240], [-side, 240], [side, 350], [-side, 350]];
    let p = keep({x: road[i].x + nx * 130 * side, y: road[i].y + ny * 130 * side});
    const w = Math.max(a.name.length * 16, Math.min(300, a.note.length * 10)) + 50;
    // room for the label on the side away from the road, inside the map
    const room = (q: P) => {
      const hx = Math.abs(q.x - road[i].x) >= Math.abs(q.y - road[i].y);
      if (hx) return q.x < road[i].x ? q.x - w > box.x + 8 : q.x + w < box.x + box.w - 8;
      return q.y < road[i].y ? q.y - 110 > box.y : q.y + 110 < box.y + box.h;
    };
    for (const [sd, dist] of [...tries.filter(([sd2, d2]) => room(keep({x: road[i].x + nx * d2 * sd2, y: road[i].y + ny * d2 * sd2}))), ...tries]) {
      const q = keep({x: road[i].x + nx * dist * sd, y: road[i].y + ny * dist * sd});
      // clear of the other areas (room for both labels) and of the stops
      if (!placed.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 190) && !pts.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 110)) {
        p = q;
        break;
      }
    }
    placed.push(p);
    return {...p, name: a.name, kind: a.kind, note: a.note, frac: f, ax: p.x, ay: p.y};
  });
  // spread the areas: they push away from each other, the stops and the road, held near their spot
  for (let it = 0; it < 80; it++) {
    for (const a of areas) {
      let fx = (a.ax - a.x) * 0.04;
      let fy = (a.ay - a.y) * 0.04;
      const push = (o: P, r: number, k: number) => {
        const dx = a.x - o.x;
        const dy = a.y - o.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < r) (fx += (dx / d) * (r - d) * k), (fy += (dy / d) * (r - d) * k);
      };
      for (const o of areas) if (o !== a) push(o, 230, 0.25);
      for (const o of pts) push(o, 210, 0.3);
      for (let i = 0; i < road.length; i += 3) push(road[i], 100, 0.15);
      a.x = Math.max(box.x + 165, Math.min(box.x + box.w - 165, a.x + fx)); // room for a label centred under it
      a.y = Math.max(box.y + 60, Math.min(box.y + box.h - 60, a.y + fy));
    }
  }
  return {road, cum, total, stops, fracs, areas, totalKm: hasKm ? kmSum : null, totalMin: hasMin ? minSum : null, seed, ...placeLabels(stops, areas, road, box)};
}

/** Label sides that keep labels off each other, off the pins, off the road and inside the map. */
function placeLabels(stops: Stop[], areas: Area[], road: P[], box: Box) {
  type R = {x0: number; y0: number; x1: number; y1: number};
  type Lab = {x: number; y: number; w: number; h: number; order: Side[]; gap: number};
  const over = (a: R, b: R) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const outside = (r: R) => r.x0 < box.x + 8 || r.x1 > box.x + box.w - 8 || r.y0 < box.y + 8 || r.y1 > box.y + box.h - 8;
  const onRoad = (r: R) => road.reduce((n, q, i) => n + (i % 2 === 0 && q.x > r.x0 && q.x < r.x1 && q.y > r.y0 && q.y < r.y1 ? 1 : 0), 0);
  // the pins and icons themselves
  const marks: R[] = [...stops.map((s) => ({x0: s.x - 24, y0: s.y - 24, x1: s.x + 24, y1: s.y + 24})), ...areas.map((a) => ({x0: a.x - 32, y0: a.y - 32, x1: a.x + 32, y1: a.y + 32}))];
  const rect = (l: Lab, side: Side): R =>
    side === 'up' ? {x0: l.x - l.w / 2, y0: l.y - l.gap - l.h, x1: l.x + l.w / 2, y1: l.y - l.gap}
      : side === 'down' ? {x0: l.x - l.w / 2, y0: l.y + l.gap, x1: l.x + l.w / 2, y1: l.y + l.gap + l.h}
        : side === 'right' ? {x0: l.x + l.gap, y0: l.y - l.h / 2, x1: l.x + l.gap + l.w, y1: l.y + l.h / 2}
          : {x0: l.x - l.gap - l.w, y0: l.y - l.h / 2, x1: l.x - l.gap, y1: l.y + l.h / 2};
  const labs: Lab[] = [
    ...stops.map((s, j): Lab => ({x: s.x, y: s.y, w: s.label.length * 19 + (s.km ? 110 : 0) + 40, h: 54, order: j % 2 ? ['down', 'up', 'right', 'left'] : ['up', 'down', 'right', 'left'], gap: 26})),
    ...areas.map((a): Lab => {
      // an area's label points away from the road first
      const q = road.reduce((b, p) => (Math.hypot(p.x - a.x, p.y - a.y) < Math.hypot(b.x - a.x, b.y - a.y) ? p : b), road[0]);
      const order: Side[] = Math.abs(a.x - q.x) >= Math.abs(a.y - q.y) ? (a.x < q.x ? ['left', 'down', 'up', 'right'] : ['right', 'down', 'up', 'left']) : a.y < q.y ? ['up', 'right', 'left', 'down'] : ['down', 'right', 'left', 'up'];
      return {x: a.x, y: a.y, w: Math.max(a.name.length * 16, Math.min(300, a.note.length * 10)) + 10, h: a.note ? 62 : 36, order, gap: 38};
    }),
  ];
  const sides: Side[] = labs.map((l) => l.order[0]);
  const cost = (k: number, side: Side) => {
    const r = rect(labs[k], side);
    let c = labs[k].order.indexOf(side) * 3 + (outside(r) ? 300 : 0) + onRoad(r) * 12;
    for (const m of marks) if (over(r, m)) c += 100;
    labs.forEach((o, j) => j !== k && over(r, rect(o, sides[j])) && (c += 100));
    return c;
  };
  // settle: every label takes its best side given the others, a few rounds
  for (let round = 0; round < 4; round++) {
    let moved = false;
    labs.forEach((l, k) => {
      const best = l.order.reduce((b, side) => (cost(k, side) < cost(k, b) ? side : b), sides[k]);
      if (best !== sides[k]) (sides[k] = best), (moved = true);
    });
    if (!moved) break;
  }
  return {stopSides: sides.slice(0, stops.length), areaSides: sides.slice(stops.length)};
}

const pathOf = (pts: P[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
/** Where the car is at a share of the road, and which way it faces (degrees). */
function along(road: P[], cum: number[], s: number) {
  const d = s * cum[cum.length - 1];
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = road[i - 1];
  const b = road[i] || a;
  const t = (d - cum[i - 1]) / Math.max(0.001, cum[i] - cum[i - 1]);
  return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, deg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI};
}
/** The odometer at a share of the road: piecewise between the stops' distances. */
const kmAt = (stops: Stop[], fracs: number[], s: number) => {
  if (stops[0]?.km === null || stops.length < 2) return null;
  let j = 1;
  while (j < fracs.length - 1 && fracs[j] < s) j++;
  const t = (s - fracs[j - 1]) / Math.max(0.0001, fracs[j] - fracs[j - 1]);
  return (stops[j - 1].km || 0) + ((stops[j].km || 0) - (stops[j - 1].km || 0)) * Math.max(0, Math.min(1, t));
};

/** The drive's timing: starts after the heading, ends a second before the line does. */
function useDrive(at: number[], dur: number) {
  const frame = useCurrentFrame();
  const t0 = (at[0] ?? 0) + 24;
  const t1 = Math.max(t0 + 60, dur - 36);
  const ease = Easing.inOut(Easing.cubic);
  const s = interpolate(frame, [t0, t1], [0, 1], {...clamp, easing: ease});
  /** The frame the car reaches a share of the road. */
  const when = (f: number) => {
    let lo = t0;
    let hi = t1;
    for (let i = 0; i < 18; i++) {
      const m = (lo + hi) / 2;
      if (interpolate(m, [t0, t1], [0, 1], {...clamp, easing: ease}) < f) lo = m;
      else hi = m;
    }
    return Math.round(hi);
  };
  return {frame, s, t0, t1, when};
}

// ---------------------------------------------------------------- pieces shared by the styles

const Shield: React.FC<{text: string; x: number; y: number; k: number; bg: string; fg: string}> = ({text, x, y, k, bg, fg}) =>
  text ? (
    <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * k})`, opacity: k, padding: '6px 16px', borderRadius: 10, background: bg, border: `3px solid ${fg}`, boxShadow: '0 6px 16px rgba(0,0,0,0.35)', fontFamily: F.mono, fontWeight: 800, fontSize: 24, color: fg, whiteSpace: 'nowrap'}}>{text}</div>
  ) : null;

/** Where a label goes beside its point: the side, and how far. */
const sideStyle = (side: Side, gap: number, k: number): React.CSSProperties =>
  side === 'up' ? {left: 0, top: -gap, transform: `translate(-50%, calc(-100% + ${(1 - k) * 12}px))`, textAlign: 'center'}
    : side === 'down' ? {left: 0, top: gap, transform: `translate(-50%, ${(1 - k) * 12}px)`, textAlign: 'center'}
      : side === 'right' ? {left: gap, top: 0, transform: `translate(${(1 - k) * -12}px, -50%)`}
        : {left: -gap, top: 0, transform: `translate(calc(-100% + ${(1 - k) * 12}px), -50%)`, textAlign: 'right'};

const AreaMark: React.FC<{a: Area; k: number; dark: boolean; sketch?: boolean; side?: Side}> = ({a, k, dark, sketch, side = 'right'}) => {
  const Icon = iconOf(a.kind);
  const col = KIND_COLOR[a.kind] || COURSE.colorDeep;
  const big = ['hills', 'mountain', 'lake', 'forest', 'park', 'city', 'town', 'river', 'sea'].includes(a.kind);
  return (
    <div style={{position: 'absolute', left: a.x, top: a.y, opacity: Math.min(1, k * 1.5)}}>
      {big ? <div style={{position: 'absolute', left: -90, top: -90, width: 180, height: 180, borderRadius: '50%', background: col, opacity: (sketch ? 0.12 : 0.18) * k, border: `3px dashed ${col}`, transform: `scale(${0.6 + 0.4 * k})`}} /> : null}
      <div style={{position: 'absolute', left: -28, top: -28, width: 56, height: 56, borderRadius: '50%', background: dark ? '#0E1116' : '#FFFFFF', border: `4px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.4 + 0.6 * k})`, boxShadow: sketch ? 'none' : '0 6px 14px rgba(0,0,0,0.3)'}}>
        <Icon size={28} color={col} strokeWidth={2.5} />
      </div>
      <div style={{position: 'absolute', whiteSpace: 'nowrap', ...sideStyle(side, 38, k)}}>
        <div style={{fontFamily: sketch ? F.head : F.head, fontStyle: sketch ? 'italic' : 'normal', fontWeight: 800, fontSize: 28, color: dark ? '#FFFFFF' : '#1A1A1A', textShadow: dark ? '0 2px 8px #000' : '0 0 6px rgba(255,255,255,0.9)'}}>{a.name}</div>
        {a.note ? <div style={{fontFamily: F.body, fontWeight: 600, fontSize: 20, color: dark ? '#B8C2CC' : '#4A4A4A', width: Math.min(300, Math.max(a.name.length * 16, a.note.length * 10)), whiteSpace: 'normal', display: 'inline-block'}}>{a.note}</div> : null}
      </div>
    </div>
  );
};

const StopPin: React.FC<{s: Stop; k: number; color: string; dark: boolean; side: Side; end: boolean; sketch?: boolean}> = ({s, k, color, dark, side, end, sketch}) => (
  <div style={{position: 'absolute', left: s.x, top: s.y}}>
    <div style={{position: 'absolute', left: end ? -20 : -14, top: end ? -20 : -14, width: end ? 40 : 28, height: end ? 40 : 28, borderRadius: '50%', background: sketch ? 'transparent' : color, border: sketch ? `4px solid ${color}` : '5px solid #FFFFFF', boxShadow: sketch ? 'none' : '0 4px 12px rgba(0,0,0,0.45)', transform: `scale(${0.3 + 0.7 * k})`}} />
    <div style={{position: 'absolute', ...sideStyle(side, 26, k), textAlign: 'left', opacity: k, padding: sketch ? '2px 6px' : '8px 18px', whiteSpace: 'nowrap', background: sketch ? 'transparent' : dark ? 'rgba(10,12,16,0.92)' : '#FFFFFF', border: sketch ? 'none' : `2px solid ${color}`, borderRadius: sketch ? 0 : 8, fontFamily: F.head, fontStyle: sketch ? 'italic' : 'normal', fontWeight: 800, fontSize: end ? 36 : 30, color: dark ? '#FFFFFF' : '#141414', textDecoration: sketch ? `underline 4px ${color}` : 'none'}}>
      {s.label}
      {s.km !== null && s.km > 0 ? <span style={{marginLeft: 12, fontFamily: F.mono, fontWeight: 700, fontSize: 22, color}}>{Math.round(s.km)} km</span> : null}
    </div>
  </div>
);

/** The itinerary beside the map: each stop with its leg, the current one lit. */
const Panel: React.FC<{g: Graphic; stops: Stop[]; fracs: number[]; s: number; when: (f: number) => number; tone: 'paper' | 'notes'; totalKm: number | null; totalMin: number | null}> = ({g, stops, fracs, s, when, tone, totalKm, totalMin}) => {
  const frame = useCurrentFrame();
  const paper = tone === 'paper';
  const ink = paper ? C.text : '#3A2E1A';
  return (
    <div style={{position: 'absolute', left: 1370, top: 128, width: 470, display: 'flex', flexDirection: 'column', gap: 14, ...(paper ? {} : {padding: '26px 26px 30px', background: '#FFF8E6', transform: 'rotate(1.2deg)', boxShadow: '0 14px 30px rgba(0,0,0,0.3)'})}}>
      {!paper ? <div style={{position: 'absolute', left: 170, top: -16, width: 130, height: 34, background: 'rgba(214,180,90,0.75)', transform: 'rotate(-3deg)'}} /> : null}
      {g.kicker ? <span style={{alignSelf: 'flex-start', padding: '6px 14px', background: COURSE.colorDeep, color: '#FFFFFF', fontFamily: F.mono, fontWeight: 700, fontSize: 22, letterSpacing: '0.14em', textTransform: 'uppercase'}}>{g.kicker}</span> : null}
      {g.title ? <div style={{fontFamily: F.head, fontStyle: paper ? 'normal' : 'italic', fontWeight: 800, fontSize: 50, lineHeight: 1.05, color: ink, whiteSpace: 'normal'}}>{g.title}</div> : null}
      <div style={{display: 'flex', flexDirection: 'column', marginTop: 6}}>
        {stops.map((st, j) => {
          const reached = s >= fracs[j] - 0.002;
          const k = fadeIn(frame, when(Math.max(0, fracs[j] - 0.04)), 10);
          return (
            <div key={j} style={{display: 'flex', gap: 16, alignItems: 'stretch', opacity: 0.35 + 0.65 * k}}>
              <div style={{width: 24, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                <div style={{width: 22, height: 22, marginTop: 8, borderRadius: '50%', background: reached ? COURSE.color : 'transparent', border: `4px solid ${COURSE.color}`}} />
                {j < stops.length - 1 ? <div style={{flex: 1, width: 4, background: COURSE.color, opacity: 0.4}} /> : null}
              </div>
              <div style={{paddingBottom: 14}}>
                <div style={{fontFamily: F.head, fontWeight: 800, fontSize: 30, color: ink}}>{st.label}</div>
                {st.value ? <div style={{fontFamily: F.mono, fontWeight: 600, fontSize: 20, color: paper ? C.muted : '#6B5B3E'}}>+ {st.value}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
      {totalKm !== null || totalMin !== null ? (
        <div style={{marginTop: 4, paddingTop: 14, borderTop: `2px solid ${paper ? C.line : '#C9B68A'}`, display: 'flex', gap: 24, fontFamily: F.mono, fontWeight: 800, fontSize: 26, color: ink, opacity: fadeIn(frame, when(0.98), 12)}}>
          {totalKm !== null ? <span>{Math.round(totalKm)} km</span> : null}
          {totalMin !== null ? <span>{clock(totalMin)}</span> : null}
        </div>
      ) : null}
    </div>
  );
};

const Car: React.FC<{x: number; y: number; deg: number; color: string; k: number; nav?: boolean}> = ({x, y, deg, color, k, nav}) => (
  <div style={{position: 'absolute', left: x, top: y, opacity: k, transform: 'translate(-50%, -50%)'}}>
    {nav ? (
      <div style={{width: 64, height: 64, borderRadius: '50%', background: 'rgba(63,169,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{transform: `rotate(${deg + 45}deg)`}}><L.Navigation size={40} color="#FFFFFF" fill={color} strokeWidth={1.5} /></div>
      </div>
    ) : (
      <div style={{width: 58, height: 58, borderRadius: '50%', background: color, border: '4px solid #FFFFFF', boxShadow: '0 6px 16px rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <L.Car size={32} color="#FFFFFF" strokeWidth={2.4} />
      </div>
    )}
  </div>
);

/** Decorative map texture: faint minor roads and land patches (never named; not real geography). */
const Texture: React.FC<{seed: string; box: typeof BOX; road: string; patch: string[]; contour?: string}> = ({seed, box, road, patch, contour}) => (
  <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0}}>
    <defs><clipPath id={`tx-${seed.replace(/\W/g, '')}`}><rect x={box.x} y={box.y} width={box.w} height={box.h} /></clipPath></defs>
    <g clipPath={`url(#tx-${seed.replace(/\W/g, '')})`}>
    {Array.from({length: 14}, (_, i) => {
      const x = box.x + random(`${seed}-px${i}`) * box.w;
      const y = box.y + random(`${seed}-py${i}`) * box.h;
      const r = 50 + random(`${seed}-pr${i}`) * 110;
      const pts = Array.from({length: 7}, (_, j) => {
        const a = (j / 7) * Math.PI * 2;
        const rr = r * (0.7 + 0.5 * random(`${seed}-pj${i}-${j}`));
        return `${(x + Math.cos(a) * rr).toFixed(0)},${(y + Math.sin(a) * rr * 0.7).toFixed(0)}`;
      }).join(' ');
      return <polygon key={`p${i}`} points={pts} fill={patch[i % patch.length]} />;
    })}
    {contour ? Array.from({length: 3}, (_, i) => {
      const x = box.x + random(`${seed}-cx${i}`) * box.w;
      const y = box.y + random(`${seed}-cy${i}`) * box.h;
      return [1, 2, 3, 4].map((r) => <ellipse key={`c${i}-${r}`} cx={x} cy={y} rx={30 * r + 10} ry={20 * r + 6} fill="none" stroke={contour} strokeWidth={1.5} transform={`rotate(${random(`${seed}-cr${i}`) * 90} ${x} ${y})`} />);
    }) : null}
    {Array.from({length: 9}, (_, i) => {
      const x1 = box.x + random(`${seed}-rx${i}`) * box.w;
      const y1 = box.y + random(`${seed}-ry${i}`) * box.h;
      const x2 = box.x + random(`${seed}-rx2${i}`) * box.w;
      const y2 = box.y + random(`${seed}-ry2${i}`) * box.h;
      const cx = (x1 + x2) / 2 + (random(`${seed}-rc${i}`) - 0.5) * 300;
      const cy = (y1 + y2) / 2 + (random(`${seed}-rd${i}`) - 0.5) * 300;
      return <path key={`r${i}`} d={`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`} fill="none" stroke={road} strokeWidth={i % 3 ? 3 : 6} strokeLinecap="round" />;
    })}
    </g>
  </svg>
);

const Compass: React.FC<{x: number; y: number; color: string}> = ({x, y, color}) => (
  <div style={{position: 'absolute', left: x, top: y, width: 90, height: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2}}>
    <span style={{fontFamily: F.head, fontWeight: 900, fontSize: 22, color}}>N</span>
    <svg width={60} height={60} viewBox="-30 -30 60 60"><polygon points="0,-28 7,0 0,28 -7,0" fill={color} /><polygon points="0,-28 7,0 0,0" fill="#FFFFFF" opacity={0.6} /><circle r={4} fill="#FFFFFF" /></svg>
  </div>
);

// ---------------------------------------------------------------- styles

/** Paper road atlas: fields and contours, a yellow road with a casing, the road's shield, a scale. */
const AtlasTrip: React.FC<Props & {journal?: boolean}> = ({g, at, dur, journal}) => {
  const lay = layout(g);
  const {frame, s, when} = useDrive(at, dur);
  const p = sp(frame, 0);
  const car = along(lay.road, lay.cum, s);
  const d = pathOf(lay.road);
  const odo = kmAt(lay.stops, lay.fracs, s);
  const mid = lay.road[Math.floor(lay.road.length * 0.45)] || {x: 0, y: 0};
  const bg = journal ? '#E9DDBF' : '#F3EBD8';
  const roadCol = journal ? '#4A3A22' : '#F4C430';
  return (
    <AbsoluteFill style={{background: journal ? '#CDB88E' : C.bg0}}>
      <Sfx name="whoosh" at={(at[0] ?? 0) + 6} volume={0.3} />
      <div style={{position: 'absolute', left: BOX.x - 18, top: BOX.y - 18, width: BOX.w + 36, height: BOX.h + 36, background: bg, border: journal ? 'none' : '2px solid #6B5B3E', boxShadow: '0 24px 60px rgba(0,0,0,0.45)', opacity: Math.min(1, p * 2), transform: `rotate(${journal ? -0.8 : 0}deg) scale(${0.97 + 0.03 * p})`, backgroundImage: journal ? 'repeating-linear-gradient(0deg, transparent 0 46px, rgba(70,110,170,0.18) 46px 48px)' : 'none'}} />
      {journal ? null : <Texture seed={lay.seed} box={BOX} road="rgba(255,255,255,0.85)" patch={['rgba(150,190,110,0.28)', 'rgba(214,196,140,0.35)', 'rgba(120,170,100,0.22)']} contour="rgba(139,107,62,0.22)" />}
      {journal ? null : (
        <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0}}>
          {Array.from({length: 7}, (_, i) => <line key={i} x1={BOX.x + (BOX.w / 6) * i} y1={BOX.y} x2={BOX.x + (BOX.w / 6) * i} y2={BOX.y + BOX.h} stroke="rgba(107,91,62,0.12)" strokeWidth={1.5} />)}
          {Array.from({length: 5}, (_, i) => <line key={`h${i}`} x1={BOX.x} y1={BOX.y + (BOX.h / 4) * i} x2={BOX.x + BOX.w} y2={BOX.y + (BOX.h / 4) * i} stroke="rgba(107,91,62,0.12)" strokeWidth={1.5} />)}
        </svg>
      )}
      {lay.areas.map((a, j) => <AreaMark key={j} a={a} k={ramp(frame, when(Math.max(0, a.frac - 0.06)), 14)} dark={false} sketch={journal} side={lay.areaSides[j]} />)}
      <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0}}>
        {journal ? (
          <>
            <path d={d} fill="none" stroke={roadCol} strokeWidth={5} strokeDasharray="14 12" strokeLinecap="round" opacity={0.25} />
            <path d={d} fill="none" stroke={COURSE.colorDeep} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${lay.total * s} ${lay.total}`} />
          </>
        ) : (
          <>
            <path d={d} fill="none" stroke="#B89A3A" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} />
            <path d={d} fill="none" stroke="#7A5C10" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${lay.total * s} ${lay.total}`} />
            <path d={d} fill="none" stroke={roadCol} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${lay.total * s} ${lay.total}`} />
            <path d={d} fill="none" stroke={COURSE.colorDeep} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${lay.total * s} ${lay.total}`} opacity={0.85} />
          </>
        )}
      </svg>
      {journal ? null : <Shield text={g.stamp} x={mid.x} y={mid.y} k={ramp(frame, when(0.45), 10)} bg="#1F6F3A" fg="#FFFFFF" />}
      {lay.stops.map((st, j) => <StopPin key={j} s={st} k={ramp(frame, when(Math.max(0, lay.fracs[j] - 0.01)), 10)} color={COURSE.colorDeep} dark={false} side={lay.stopSides[j]} end={j === 0 || j === lay.stops.length - 1} sketch={journal} />)}
      {lay.stops.map((_, j) => <Sfx key={j} name="tick" at={when(lay.fracs[j])} volume={0.25} />)}
      <Car x={car.x} y={car.y} deg={car.deg} color={COURSE.color} k={fadeIn(frame, when(0) - 6, 8)} />
      {journal ? (
        g.stamp ? <div style={{position: 'absolute', left: BOX.x + 30, top: BOX.y + BOX.h - 60, fontFamily: F.head, fontStyle: 'italic', fontWeight: 800, fontSize: 30, color: '#4A3A22', transform: 'rotate(-2deg)'}}>via {g.stamp}</div> : null
      ) : (
        <>
          <Compass x={BOX.x + BOX.w - 110} y={BOX.y + 20} color="#6B5B3E" />
          {odo !== null ? (
            <div style={{position: 'absolute', left: BOX.x + 26, top: BOX.y + BOX.h - 86, padding: '10px 20px', background: '#1A1A1A', border: '3px solid #F4C430', borderRadius: 10, fontFamily: F.mono, fontWeight: 800, fontSize: 34, color: '#F4C430', opacity: fadeIn(frame, when(0), 10)}}>
              {String(Math.round(odo)).padStart(3, '0')} <span style={{fontSize: 20, color: '#FFFFFF'}}>KM</span>
            </div>
          ) : null}
        </>
      )}
      <Panel g={g} stops={lay.stops} fracs={lay.fracs} s={s} when={when} tone={journal ? 'notes' : 'paper'} totalKm={lay.totalKm} totalMin={lay.totalMin} />
    </AbsoluteFill>
  );
};

/** Navigation app: a dark map, the route glowing in brand colour, the next stop and what is left. */
const NavTrip: React.FC<Props> = ({g, at, dur}) => {
  const box = {x: 60, y: 120, w: 1800, h: 880};
  const lay = layout(g, {x: box.x + 380, y: box.y + 30, w: box.w - 420, h: box.h - 150}); // clear of the bottom bar
  const {frame, s, when} = useDrive(at, dur);
  const p = sp(frame, 0);
  const car = along(lay.road, lay.cum, s);
  const d = pathOf(lay.road);
  const ahead = lay.fracs.findIndex((f) => f > s + 0.001);
  const nextStop = lay.stops[ahead < 0 ? lay.stops.length - 1 : Math.max(1, ahead)];
  const odo = kmAt(lay.stops, lay.fracs, s);
  const left = lay.totalKm !== null && odo !== null ? lay.totalKm - odo : null;
  const leftMin = lay.totalMin !== null ? lay.totalMin * (1 - s) : null;
  const arrived = s >= 0.999;
  return (
    <AbsoluteFill style={{background: C.bg0}}>
      <Sfx name="whoosh" at={(at[0] ?? 0) + 6} volume={0.3} />
      <div style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: 34, overflow: 'hidden', background: '#11161D', border: '2px solid #263040', boxShadow: '0 30px 70px rgba(0,0,0,0.6)', opacity: Math.min(1, p * 2)}}>
        <div style={{position: 'absolute', left: -box.x, top: -box.y, width: 1920, height: 1080}}>
          <Texture seed={lay.seed} box={box} road="#2A3443" patch={['rgba(46,139,87,0.10)', 'rgba(47,143,216,0.08)', 'rgba(255,255,255,0.03)']} />
          {lay.areas.map((a, j) => <AreaMark key={j} a={a} k={ramp(frame, when(Math.max(0, a.frac - 0.06)), 14)} dark side={lay.areaSides[j]} />)}
          <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0}}>
            <path d={d} fill="none" stroke="#3A4556" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={COURSE.cyan} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" opacity={0.25} strokeDasharray={`${lay.total * s} ${lay.total}`} />
            <path d={d} fill="none" stroke={COURSE.cyan} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${lay.total * s} ${lay.total}`} />
          </svg>
          {lay.stops.map((st, j) => <StopPin key={j} s={st} k={ramp(frame, when(Math.max(0, lay.fracs[j] - 0.03)), 10)} color={COURSE.cyan} dark side={lay.stopSides[j]} end={j === 0 || j === lay.stops.length - 1} />)}
          <Car x={car.x} y={car.y} deg={car.deg} color={COURSE.cyan} k={fadeIn(frame, when(0) - 6, 8)} nav />
        </div>
        {/* next stop */}
        <div style={{position: 'absolute', left: 28, top: 28, width: 330, padding: '22px 24px', borderRadius: 22, background: arrived ? COURSE.colorDeep : '#1E7F4F', color: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 12px 30px rgba(0,0,0,0.45)', transform: `translateY(${(1 - sp(frame, when(0))) * -30}px)`}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 12}}>{arrived ? <L.Flag size={34} color="#FFFFFF" /> : <L.Navigation2 size={34} color="#FFFFFF" fill="#FFFFFF" />}<span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 20, letterSpacing: '0.12em'}}>{arrived ? 'ARRIVED' : 'NEXT STOP'}</span></div>
          <div style={{fontFamily: F.head, fontWeight: 900, fontSize: 40, lineHeight: 1.05, whiteSpace: 'normal'}}>{nextStop?.label}</div>
          {!arrived && nextStop?.km !== null && odo !== null ? <div style={{fontFamily: F.mono, fontWeight: 800, fontSize: 30}}>{Math.max(0, Math.round((nextStop.km || 0) - odo))} km</div> : null}
        </div>
        {/* the trip */}
        <div style={{position: 'absolute', left: 28, top: 300, width: 330, display: 'flex', flexDirection: 'column', gap: 10}}>
          {g.kicker ? <span style={{fontFamily: F.mono, fontWeight: 700, fontSize: 20, letterSpacing: '0.14em', color: COURSE.cyan, textTransform: 'uppercase'}}>{g.kicker}</span> : null}
          {g.title ? <div style={{fontFamily: F.head, fontWeight: 800, fontSize: 38, lineHeight: 1.1, color: '#FFFFFF', whiteSpace: 'normal'}}>{g.title}</div> : null}
          {g.stamp ? <span style={{alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 8, background: '#2A3443', fontFamily: F.mono, fontWeight: 700, fontSize: 20, color: '#FFFFFF'}}>via {g.stamp}</span> : null}
        </div>
        {/* what is left */}
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, background: 'rgba(14,18,24,0.96)', borderTop: '2px solid #263040', display: 'flex', alignItems: 'center', gap: 40, padding: '0 36px', fontFamily: F.mono, fontWeight: 800, color: '#FFFFFF'}}>
          {arrived ? (
            <span style={{fontSize: 34, color: '#3DDC84'}}>{[lay.totalKm !== null ? `${Math.round(lay.totalKm)} km` : '', lay.totalMin !== null ? clock(lay.totalMin) : ''].filter(Boolean).join(' · ') || 'Arrived'}</span>
          ) : (
            <>
              {leftMin !== null ? <span style={{fontSize: 40, color: '#3DDC84'}}>{clock(leftMin)}</span> : null}
              {left !== null ? <span style={{fontSize: 32}}>{Math.max(0, Math.round(left))} km left</span> : null}
            </>
          )}
          <div style={{flex: 1, height: 10, borderRadius: 5, background: '#263040', overflow: 'hidden'}}><div style={{width: `${s * 100}%`, height: '100%', background: COURSE.cyan}} /></div>
          <span style={{fontSize: 24, color: '#9AA6B2'}}>{lay.stops[lay.stops.length - 1]?.label}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Metro-style line diagram: stops as stations evenly along a line with 45-degree bends, key areas branching off it. */
const TransitTrip: React.FC<Props> = ({g, at, dur}) => {
  const geo = layout(g, {x: 110, y: 300, w: 1700, h: 620}, false);
  const {frame, s, when} = useDrive(at, dur);
  const n = geo.stops.length;
  // stations: evenly across, on three levels that follow the trip's general direction
  const ys = geo.stops.map((st) => st.y);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const level = (y: number) => (y1 - y0 < 40 ? 1 : Math.round(((y - y0) / (y1 - y0)) * 2));
  const st: P[] = geo.stops.map((x, j) => ({x: 190 + (1540 * j) / Math.max(1, n - 1), y: 500 + level(x.y) * 130}));
  const pts: P[] = [st[0]];
  const idx = [0];
  st.slice(1).forEach((b, j) => {
    const a = st[j];
    const dx = b.x - a.x;
    const dy = Math.abs(b.y - a.y);
    const flat = Math.max(0, (dx - dy) / 2);
    if (dy) pts.push({x: a.x + flat, y: a.y}, {x: b.x - flat, y: b.y});
    pts.push(b);
    idx.push(pts.length - 1);
  });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  const fr = idx.map((i) => cum[i] / total);
  const d = pathOf(pts);
  const car = along(pts, cum, s);
  // key areas: above or below the leg they belong to, spread when a leg has several
  const legOf = (f: number) => Math.max(1, Math.min(n - 1, geo.fracs.findIndex((x) => x >= f) < 0 ? n - 1 : geo.fracs.findIndex((x) => x >= f)));
  const placedA = [...geo.areas].sort((a, b) => a.frac - b.frac).map((a, j) => {
    const leg = legOf(a.frac);
    const t = Math.max(0.15, Math.min(0.85, (a.frac - geo.fracs[leg - 1]) / Math.max(1e-6, geo.fracs[leg] - geo.fracs[leg - 1])));
    const f = fr[leg - 1] + (fr[leg] - fr[leg - 1]) * t;
    return {...a, f, q: along(pts, cum, f), up: j % 2 === 0, x: 0, y: 0};
  });
  // each row (above and below the line) keeps its areas at least a label's width apart
  for (const up of [true, false]) {
    const row = placedA.filter((a) => a.up === up);
    let x = 0;
    row.forEach((a) => (a.x = x = Math.max(a.q.x - 30, x ? x + 330 : 0)));
    const over = (row[row.length - 1]?.x ?? 0) - 1560;
    if (over > 0) row.forEach((a, i) => (a.x = Math.max(110 + i * 330, a.x - over)));
    row.forEach((a) => (a.y = up ? 330 : 905));
  }
  const areas = placedA;
  const dark = darkTheme();
  return (
    <AbsoluteFill style={{background: C.bg0}}>
      <Sfx name="whoosh" at={(at[0] ?? 0) + 6} volume={0.3} />
      <div style={{position: 'absolute', left: 110, top: 130, display: 'flex', alignItems: 'center', gap: 24, opacity: fadeIn(frame, at[0] ?? 0, 10)}}>
        <div style={{minWidth: 74, height: 74, padding: '0 12px', borderRadius: 37, background: COURSE.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.head, fontWeight: 900, fontSize: 30, color: '#FFFFFF'}}>{(g.stamp || '').slice(0, 6) || <L.Route size={38} color="#FFFFFF" />}</div>
        <div>
          {g.kicker ? <div style={{fontFamily: F.mono, fontWeight: 700, fontSize: 22, letterSpacing: '0.14em', color: C.muted, textTransform: 'uppercase'}}>{g.kicker}</div> : null}
          <div style={{fontFamily: F.head, fontWeight: 900, fontSize: 60, color: C.text, lineHeight: 1.05}}>{g.title}</div>
        </div>
        {geo.totalKm !== null || geo.totalMin !== null ? <div style={{marginLeft: 30, fontFamily: F.mono, fontWeight: 800, fontSize: 30, color: COURSE.color}}>{[geo.totalKm !== null ? `${Math.round(geo.totalKm)} km` : '', geo.totalMin !== null ? clock(geo.totalMin) : ''].filter(Boolean).join(' · ')}</div> : null}
      </div>
      <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0}}>
        {areas.map((a, j) => <line key={j} x1={a.q.x} y1={a.q.y} x2={a.x} y2={a.y} stroke={KIND_COLOR[a.kind] || C.muted} strokeWidth={4} strokeDasharray="8 8" opacity={ramp(frame, when(Math.max(0, a.f - 0.06)), 12)} />)}
        <path d={d} fill="none" stroke={C.fill2} strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" />
        <path d={d} fill="none" stroke={COURSE.color} strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${total * s} ${total}`} />
      </svg>
      {areas.map((a, j) => <AreaMark key={j} a={a} k={ramp(frame, when(Math.max(0, a.f - 0.06)), 14)} dark={dark} side="right" />)}
      {geo.stops.map((x, j) => {
        const p = st[j];
        const k = ramp(frame, when(Math.max(0, fr[j] - 0.01)), 10);
        const end = j === 0 || j === n - 1;
        // labels go away from the line's next bend: below a station on the top level, else above
        const below = level(x.y) === 0 ? true : level(x.y) === 2 ? false : j % 2 === 1;
        return (
          <div key={j} style={{position: 'absolute', left: p.x, top: p.y}}>
            <Sfx name="tick" at={when(fr[j])} volume={0.25} />
            <div style={{position: 'absolute', left: end ? -26 : -20, top: end ? -26 : -20, width: end ? 52 : 40, height: end ? 52 : 40, borderRadius: '50%', background: '#FFFFFF', border: `${end ? 10 : 8}px solid ${s >= fr[j] - 0.002 ? COURSE.color : C.fill2}`}} />
            <div style={{position: 'absolute', left: 0, top: below ? 44 : -44, transform: `translate(-50%, ${below ? 0 : -100}%)`, textAlign: 'center', opacity: 0.35 + 0.65 * k, whiteSpace: 'nowrap'}}>
              <div style={{fontFamily: F.head, fontWeight: 800, fontSize: end ? 38 : 32, color: C.text}}>{x.label}</div>
              {x.value ? <div style={{fontFamily: F.mono, fontWeight: 700, fontSize: 20, color: C.muted}}>{x.value}</div> : null}
            </div>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: car.x, top: car.y, transform: 'translate(-50%, -50%)', width: 30, height: 30, borderRadius: '50%', background: '#FFFFFF', boxShadow: `0 0 0 8px ${COURSE.color}, 0 0 30px ${COURSE.color}`, opacity: fadeIn(frame, when(0) - 6, 8)}} />
    </AbsoluteFill>
  );
};


/** The road trip graphic in the brand's kept style. */
export const RoadTripView: React.FC<Props> = (props) => {
  const style = props.g.style || 'atlas';
  if (style === 'nav') return <NavTrip {...props} />;
  if (style === 'transit') return <TransitTrip {...props} />;
  return <AtlasTrip {...props} journal={style === 'journal'} />;
};
