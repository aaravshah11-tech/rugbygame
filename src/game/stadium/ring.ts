import * as THREE from 'three';
import type { SideKey } from './types';

// Rounded-rectangle bowl around the pitch.
export const A = 70; // half length to the inner corner arcs
export const BZ = 50; // half width
export const RC = 22; // corner radius

export interface RingPt {
  cx: number;
  cz: number;
  dx: number;
  dz: number;
}

/** Fixed parameterisation so every ring has the same vertex count and strips line up. */
function ringParams(): RingPt[] {
  const pts: RingPt[] = [];
  const corners: [number, number, number][] = [
    [A - RC, BZ - RC, 0],
    [-(A - RC), BZ - RC, Math.PI / 2],
    [-(A - RC), -(BZ - RC), Math.PI],
    [A - RC, -(BZ - RC), (3 * Math.PI) / 2],
  ];
  const ARC = 9;
  const STRAIGHT = [14, 10, 14, 10];
  corners.forEach(([cx, cz, a0], i) => {
    for (let k = 0; k <= ARC; k++) {
      const a = a0 + (k / ARC) * (Math.PI / 2);
      pts.push({ cx, cz, dx: Math.cos(a), dz: Math.sin(a) });
    }
    const [nx, nz] = corners[(i + 1) % 4];
    const a1 = a0 + Math.PI / 2;
    const dir = { dx: Math.cos(a1), dz: Math.sin(a1) };
    for (let k = 1; k < STRAIGHT[i]; k++) {
      const t = k / STRAIGHT[i];
      pts.push({ cx: cx + (nx - cx) * t, cz: cz + (nz - cz) * t, ...dir });
    }
  });
  return pts;
}

export const RING = ringParams();
export const ringPoint = (p: RingPt, d: number) => [p.cx + (RC + d) * p.dx, p.cz + (RC + d) * p.dz] as const;

export class StripBuilder {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  /** quad strip between ring (d0,y0) and ring (d1,y1) */
  strip(d0: number, y0: number, d1: number, y1: number, color: THREE.Color | ((i: number) => THREE.Color), uvScale = 0, mask?: (i: number) => boolean) {
    const n = RING.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = RING[i];
      if (mask && !mask(i)) continue;
      const col = typeof color === 'function' ? color(i) : color;
      const b = RING[(i + 1) % n];
      const [ax0, az0] = ringPoint(a, d0);
      const [bx0, bz0] = ringPoint(b, d0);
      const [ax1, az1] = ringPoint(a, d1);
      const [bx1, bz1] = ringPoint(b, d1);
      const seg = Math.hypot(bx0 - ax0, bz0 - az0);
      const u0 = s * uvScale;
      const u1 = (s + seg) * uvScale;
      s += seg;
      this.pos.push(ax0, y0, az0, bx0, y0, bz0, bx1, y1, bz1, ax0, y0, az0, bx1, y1, bz1, ax1, y1, az1);
      this.uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
      for (let k = 0; k < 6; k++) this.col.push(col.r, col.g, col.b);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

export interface Tier {
  d: number;
  y: number;
  rows: number;
  depth: number;
  riser: number;
}
export const LOWER: Tier = { d: 0, y: 1.3, rows: 16, depth: 0.85, riser: 0.42 };
export const UPPER: Tier = { d: 12.5, y: 12.4, rows: 16, depth: 0.9, riser: 0.56 };
export const TOP: Tier = { d: 25, y: 23.8, rows: 13, depth: 0.95, riser: 0.62 };

/** Which stand a ring segment belongs to. main = far long side (-z), opp = near long side (+z). */
export const SIDE: (SideKey | 'corners')[] = RING.map((p) => (Math.abs(p.dx) > 0.92 ? (p.dx > 0 ? 'endR' : 'endL') : Math.abs(p.dz) > 0.92 ? (p.dz < 0 ? 'main' : 'opp') : 'corners'));

