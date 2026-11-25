import * as THREE from 'three';
import type { SideKey } from './types';

/**
 * Stands are swept along a path round the pitch. Each point has an outward normal (away from the
 * pitch), the side it belongs to and its distance along the path. Offsetting a point by d along
 * its normal and lifting it by y gives a point of the stand's cross-section.
 */
export interface PathPt {
  x: number;
  z: number;
  nx: number;
  nz: number;
  side: SideKey | 'corner';
  /** arc length from the start of the path (at d = 0) */
  s: number;
}
export interface Path {
  pts: PathPt[];
  closed: boolean;
  length: number;
}

const sideOf = (nx: number, nz: number): SideKey | 'corner' => (Math.abs(nx) > 0.92 ? (nx > 0 ? 'endR' : 'endL') : Math.abs(nz) > 0.92 ? (nz < 0 ? 'main' : 'opp') : 'corner');

/** Closed rounded rectangle: straights at x = +-hx, z = +-hz, corner radius r. */
export function roundedRect(hx: number, hz: number, r: number, step: number): Path {
  const pts: PathPt[] = [];
  const corners: [number, number, number][] = [
    [hx - r, hz - r, 0],
    [-(hx - r), hz - r, Math.PI / 2],
    [-(hx - r), -(hz - r), Math.PI],
    [hx - r, -(hz - r), (3 * Math.PI) / 2],
  ];
  const arcN = Math.max(4, Math.round((r * Math.PI) / 2 / step));
  corners.forEach(([cx, cz, a0], i) => {
    for (let k = 0; k < arcN; k++) {
      const a = a0 + (k / arcN) * (Math.PI / 2);
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      pts.push({ x: cx + r * nx, z: cz + r * nz, nx, nz, side: sideOf(nx, nz), s: 0 });
    }
    const [ncx, ncz] = corners[(i + 1) % 4];
    const a1 = a0 + Math.PI / 2;
    const nx = Math.cos(a1);
    const nz = Math.sin(a1);
    const sx = cx + r * nx;
    const sz = cz + r * nz;
    const ex = ncx + r * nx;
    const ez = ncz + r * nz;
    const len = Math.hypot(ex - sx, ez - sz);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) pts.push({ x: sx + ((ex - sx) * k) / n, z: sz + ((ez - sz) * k) / n, nx, nz, side: sideOf(nx, nz), s: 0 });
  });
  return measure({ pts, closed: true, length: 0 });
}

/** Open straight path from (x0,z0) to (x1,z1) with a fixed outward normal. */
export function straight(x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, side: SideKey, step: number): Path {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / step));
  const pts: PathPt[] = [];
  for (let k = 0; k <= n; k++) pts.push({ x: x0 + ((x1 - x0) * k) / n, z: z0 + ((z1 - z0) * k) / n, nx, nz, side, s: 0 });
  return measure({ pts, closed: false, length: 0 });
}

/** Quarter arc joining two stands at a corner (closed corners on grounds with separate stands). */
export function cornerArc(cx: number, cz: number, r: number, a0: number, step: number): Path {
  const n = Math.max(3, Math.round((r * Math.PI) / 2 / step));
  const pts: PathPt[] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (k / n) * (Math.PI / 2);
    pts.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a), side: 'corner', s: 0 });
  }
  return measure({ pts, closed: false, length: 0 });
}

function measure(p: Path): Path {
  let s = 0;
  p.pts.forEach((pt, i) => {
    if (i > 0) s += Math.hypot(pt.x - p.pts[i - 1].x, pt.z - p.pts[i - 1].z);
    pt.s = s;
  });
  if (p.closed) s += Math.hypot(p.pts[0].x - p.pts[p.pts.length - 1].x, p.pts[0].z - p.pts[p.pts.length - 1].z);
  p.length = s;
  return p;
}

/** Point of the cross-section: offset d outward, height y. */
export const at = (p: PathPt, d: number): [number, number] => [p.x + p.nx * d, p.z + p.nz * d];

/**
 * Collects triangles with vertex colours and UVs. `strip` sweeps one cross-section edge
 * (d0,y0)->(d1,y1) along a path; segments where `color` returns null are skipped.
 */
export class Mesher {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];

  quad(a: number[], b: number[], c: number[], d: number[], col: THREE.Color, uv: number[] = [0, 0, 1, 0, 1, 1, 0, 1]) {
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    this.uv.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]);
    for (let k = 0; k < 6; k++) this.col.push(col.r, col.g, col.b);
  }

  /**
   * @param v0,v1 texture v at the two edges; u runs with the path length divided by `uScale`
   */
  strip(path: Path, d0: number, y0: number, d1: number, y1: number, color: (p: PathPt, i: number) => THREE.Color | null, v0 = 0, v1 = 1, uScale = 0) {
    const n = path.pts.length;
    const last = path.closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = path.pts[i];
      const b = path.pts[(i + 1) % n];
      const col = color(a, i);
      if (!col) continue;
      const [ax0, az0] = at(a, d0);
      const [bx0, bz0] = at(b, d0);
      const [ax1, az1] = at(a, d1);
      const [bx1, bz1] = at(b, d1);
      const ua = uScale ? a.s / uScale : 0;
      const ub = uScale ? (i + 1 === n ? path.length : b.s) / uScale : 1;
      this.quad([ax0, y0, az0], [bx0, y0, bz0], [bx1, y1, bz1], [ax1, y1, az1], col, [ua, v0, ub, v0, ub, v1, ua, v1]);
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

  get empty() {
    return this.pos.length === 0;
  }
}
