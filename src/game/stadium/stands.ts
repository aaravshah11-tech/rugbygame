import * as THREE from 'three';
import { at, Mesher, roundedRect, straight, type Path, type PathPt } from './path';
import { claddingTexture, seatMap } from './textures';
import { SIDES, type CapacityTier, type SideKey, type StadiumContext, type StadiumSpec, type StandSpec } from './types';

/** One tier of seating in cross-section: front edge at (d, y), rows going back and up. */
export interface TierGeo {
  d: number;
  y: number;
  rows: number;
  depth: number;
  riser: number;
  terrace: boolean;
}
export const tierBack = (t: TierGeo) => t.d + t.rows * t.depth;
export const tierTop = (t: TierGeo) => t.y + t.rows * t.riser;

/** A stand (or the whole bowl) swept along one path. */
export interface StandRun {
  path: Path;
  /** the stand spec for each path point's side (bowls mix sides along one path) */
  specAt: (p: PathPt) => StandSpec | null;
  /** tier profile (shared along the run) */
  tiers: TierGeo[];
  /** tiers present at a path point */
  tiersAt: (p: PathPt) => number;
  backD: number;
  topY: number;
}

/** A seat the crowd can fill. */
export interface SeatSpot {
  x: number;
  y: number;
  z: number;
  side: SideKey | 'corner';
  /** 0..1 position along its run (used to group away fans) */
  u: number;
  standing: boolean;
}

export interface StandsResult {
  runs: StandRun[];
  seats: SeatSpot[];
  /** fronts of the stands nearest the pitch, for pitchside dressing */
  front: { main: number; opp: number; endL: number; endR: number };
  /** where corner floodlight pylons can stand */
  pylonSpots: [number, number][];
  /** objects that only light up at night (roof underside strips, box windows) */
  nightGlow: THREE.Material[];
}

const ROWS: Record<CapacityTier, number> = { club: 10, medium: 13, large: 16, national: 16 };
const RAKE: Record<CapacityTier, number> = { club: 21, medium: 24, large: 28, national: 31 };
const SETBACK: Record<CapacityTier, number> = { club: 5, medium: 6, large: 8, national: 10 };

/** Cross-section of a stand: tiers stacked back and up, upper tiers overhanging the one below. */
export function profile(st: StandSpec, cap: CapacityTier, tierCount = st.tiers): TierGeo[] {
  const rake = st.rake ?? RAKE[cap];
  const rows0 = st.rows ?? ROWS[cap];
  const out: TierGeo[] = [];
  for (let k = 0; k < tierCount; k++) {
    if (st.terrace && k === 0) {
      const depth = 0.42;
      out.push({ d: 0, y: 0.9, rows: Math.round(rows0 * 1.7), depth, riser: depth * Math.tan(((rake - 4) * Math.PI) / 180), terrace: true });
      continue;
    }
    const depth = 0.82 + k * 0.05;
    const riser = depth * Math.tan(((rake + k * 4) * Math.PI) / 180);
    const rows = k === 0 ? rows0 : Math.max(8, Math.round(rows0 * (k === 1 ? 0.95 : 0.78)));
    if (k === 0) {
      out.push({ d: 0, y: 1.2, rows, depth, riser, terrace: false });
      continue;
    }
    const prev = out[k - 1];
    const boxes = !!st.boxes && k === 1;
    const overhang = boxes ? 4.5 : 3;
    out.push({ d: tierBack(prev) - overhang, y: tierTop(prev) + (boxes ? 4.6 : 3.3), rows, depth, riser, terrace: false });
  }
  return out;
}

/** Lay the stands out round the pitch: one bowl path, or four separate straight stands. */
export function layoutRuns(spec: StadiumSpec, step: number): StandRun[] {
  const cap = spec.tier;
  const track = spec.track ? 9 : 0;
  const sb = SETBACK[cap] + track;
  if (spec.layout === 'bowl') {
    const main = spec.stands.main;
    const tiers = profile(main, cap, Math.max(...SIDES.map((s) => spec.stands[s].tiers)));
    const cornerT = spec.corners === 'closed' ? Math.min(...SIDES.map((s) => spec.stands[s].tiers).filter((t) => t > 0)) : 0;
    const path = roundedRect(60 + sb + 2, 35 + sb + 4, 18 + track, step);
    const specAt = (p: PathPt) => (p.side === 'corner' ? (cornerT ? { ...main, tiers: cornerT, tunnel: false, boxes: false } : null) : spec.stands[p.side].tiers ? spec.stands[p.side] : null);
    return [finishRun(path, tiers, specAt, (p) => specAt(p)?.tiers ?? 0)];
  }
  // separate stands, squared off; closed corners run the long stands right to the end-stand fronts
  const fz = 35 + sb;
  const fx = 60 + sb;
  const runs: StandRun[] = [];
  const longX = spec.corners === 'closed' ? fx : 62;
  const endZ = spec.corners === 'closed' ? fz : 38;
  const def: [SideKey, Path][] = [
    ['main', straight(-longX, -fz, longX, -fz, 0, -1, 'main', step)],
    ['opp', straight(longX, fz, -longX, fz, 0, 1, 'opp', step)],
    ['endL', straight(-fx, endZ, -fx, -endZ, -1, 0, 'endL', step)],
    ['endR', straight(fx, -endZ, fx, endZ, 1, 0, 'endR', step)],
  ];
  for (const [side, path] of def) {
    const st = spec.stands[side];
    if (!st.tiers) continue;
    const tiers = profile(st, cap);
    runs.push(finishRun(path, tiers, () => st, () => st.tiers));
  }
  return runs;
}

function finishRun(path: Path, tiers: TierGeo[], specAt: StandRun['specAt'], tiersAt: StandRun['tiersAt']): StandRun {
  const last = tiers[tiers.length - 1];
  return { path, tiers, specAt, tiersAt, backD: tierBack(last), topY: tierTop(last) };
}

/**
 * Build every stand: seating (seat-map textured treads + risers), tier fronts and undersides,
 * executive boxes, terraces with crush barriers, scaffold under temporary stands, players' tunnel
 * and dugouts, side walls and the exterior shell. Returns the seats for the crowd.
 */
export function buildStands(group: THREE.Group, spec: StadiumSpec, ctx: StadiumContext): StandsResult {
  const low = ctx.quality.level === 'low';
  const step = low ? 3.5 : 2;
  const runs = layoutRuns(spec, step);
  const seats: SeatSpot[] = [];
  const nightGlow: THREE.Material[] = [];
  const concrete = new THREE.Color('#4a5060');
  const darkConcrete = new THREE.Color('#2c313c');
  const struct = new Mesher();
  const cladTex = claddingTexture(spec.cladding.style, spec.cladding.color);
  const shell = new Mesher();
  const glassM = new Mesher();
  const barriers: THREE.Matrix4[] = [];
  const scaffold: THREE.Matrix4[] = [];

  runs.forEach((run, ri) => {
    const { path, tiers } = run;
    const has = (k: number) => (p: PathPt) => (run.tiersAt(p) > k ? concrete : null);
    // pitch-side wall in front of the lower tier
    struct.strip(path, -0.25, 0, -0.25, tiers[0].y + 0.15, (p) => (run.tiersAt(p) > 0 ? darkConcrete : null));
    struct.strip(path, -0.25, tiers[0].y + 0.15, 0, tiers[0].y + 0.15, has(0));

    tiers.forEach((t, k) => {
      const mask = (p: PathPt) => run.tiersAt(p) > k;
      // ---- seating: one seat-map texture per tier (u along the run, v = row)
      const map = seatMap(spec, path, t, k, run, low);
      const seatsM = new Mesher();
      const back = tierBack(t);
      for (let r = 0; r < t.rows; r++) {
        const d0 = t.d + r * t.depth;
        const y = t.y + r * t.riser;
        const v = 1 - (r + 0.5) / t.rows;
        const tread = new THREE.Color(1, 1, 1);
        const riser = new THREE.Color(0.62, 0.62, 0.66);
        seatsM.strip(path, d0, y, d0 + t.depth, y, (p) => (mask(p) ? tread : null), v, v, path.length);
        seatsM.strip(path, d0 + t.depth, y, d0 + t.depth, y + t.riser, (p) => (mask(p) ? riser : null), v, v, path.length);
      }
      if (!seatsM.empty) {
        const mat = new THREE.MeshStandardMaterial({ map: map.texture, vertexColors: true, roughness: 0.78, metalness: 0.02 });
        const m = new THREE.Mesh(seatsM.build(), mat);
        m.receiveShadow = true;
        group.add(m);
      }
      // seats for the crowd (every seat the seat map marks as a seat)
      collectSeats(run, t, k, map, seats);
      // crush barriers on terraces
      if (t.terrace && !low)
        for (let r = 4; r < t.rows; r += 5)
          for (let i = 0; i < path.pts.length; i += 3) {
            const p = path.pts[i];
            if (!mask(p)) continue;
            const [x, z] = at(p, t.d + r * t.depth);
            barriers.push(new THREE.Matrix4().compose(new THREE.Vector3(x, t.y + r * t.riser + 0.55, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-p.nz, p.nx) + Math.PI / 2), new THREE.Vector3(step * 2.6, 0.06, 0.06)));
          }
      // ---- tier front: a fascia on upper tiers, with the LED ribbon added by boards.ts
      if (k > 0) {
        struct.strip(path, t.d - 0.3, t.y - 1.5, t.d - 0.3, t.y + 0.25, (p) => (mask(p) ? darkConcrete : null));
        // underside (soffit), parallel to the rake
        struct.strip(path, back, tierTop(t) - 1.2, t.d - 0.3, t.y - 1.5, (p) => (mask(p) ? new THREE.Color('#353a46') : null));
      }
      // parapet at the back of each tier
      struct.strip(path, back, tierTop(t), back, tierTop(t) + 1.3, (p) => (mask(p) && run.tiersAt(p) === k + 1 ? concrete : null));
      // executive boxes: a glass band under the upper tier's overhang
      if (k === 0 && tiers[1]) {
        const boxesHere = (p: PathPt) => run.tiersAt(p) > 1 && !!run.specAt(p)?.boxes;
        glassM.strip(path, back, tierTop(t) + 0.3, back, tiers[1].y - 0.9, (p) => (boxesHere(p) ? new THREE.Color(1, 1, 1) : null), 0, 1, 6);
        struct.strip(path, back, tierTop(t), back, tierTop(t) + 0.3, (p) => (boxesHere(p) ? darkConcrete : null));
        // the box floor / concourse roof between the tiers
        struct.strip(path, back + 0.1, tiers[1].y - 0.9, t.d + t.rows * t.depth - 3, tiers[1].y - 0.9, (p) => (run.tiersAt(p) > 1 ? new THREE.Color('#3b404c') : null));
      }
    });

    // ---- scaffold under temporary stands (open steel frame, no shell)
    const temp = (p: PathPt) => !!run.specAt(p)?.temporary;
    if (path.pts.some(temp) && !low) {
      const t = tiers[0];
      for (let i = 0; i < path.pts.length; i += 2) {
        const p = path.pts[i];
        if (!temp(p) || run.tiersAt(p) === 0) continue;
        for (let r = 2; r < t.rows; r += 3) {
          const [x, z] = at(p, t.d + r * t.depth);
          const h = t.y + r * t.riser;
          scaffold.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(0.09, h, 0.09)));
        }
      }
    }

    // ---- exterior shell behind the top tier, cladded; and side walls on separate stands
    const shellD = run.backD + 0.4;
    const shellTopAt = (p: PathPt) => {
      const n = run.tiersAt(p);
      return n ? tierTop(tiers[n - 1]) + 1.3 : 0;
    };
    for (let i = 0; i < (path.closed ? path.pts.length : path.pts.length - 1); i++) {
      const a = path.pts[i];
      const b = path.pts[(i + 1) % path.pts.length];
      const h = shellTopAt(a);
      if (!h || temp(a)) continue;
      const n = run.tiersAt(a);
      const d = n ? tierBack(tiers[n - 1]) + 0.05 : shellD;
      const [ax, az] = at(a, d);
      const [bx, bz] = at(b, d);
      const ua = a.s / 8;
      const ub = (i + 1 === path.pts.length ? path.length : b.s) / 8;
      shell.quad([ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az], new THREE.Color(1, 1, 1), [ua, 0, ub, 0, ub, h / 8, ua, h / 8]);
    }
    if (!path.closed) {
      // the two ends of a separate stand: a wall following the stepped profile
      for (const end of [0, path.pts.length - 1]) {
        const p = path.pts[end];
        if (!run.tiersAt(p) || temp(p)) continue;
        const top = tierTop(tiers[run.tiersAt(p) - 1]) + 1.3;
        const [fx, fz] = at(p, -0.25);
        const [bx, bz] = at(p, tierBack(tiers[run.tiersAt(p) - 1]) + 0.05);
        const mid = tiers[0].y + 0.2;
        shell.quad([fx, 0, fz], [bx, 0, bz], [bx, top, bz], [fx, mid, fz], new THREE.Color(0.85, 0.85, 0.88), [0, 0, 2, 0, 2, top / 8, 0, mid / 8]);
      }
    }
    void ri;
  });

  // ---- players' tunnel and dugouts in the stand that has them
  const tunnelRun = runs.find((r) => r.path.pts.some((p) => p.side === 'main' && r.specAt(p)?.tunnel));
  if (tunnelRun) addTunnel(group, tunnelRun);

  // ---- meshes
  const structMesh = new THREE.Mesh(struct.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }));
  structMesh.receiveShadow = true;
  group.add(structMesh);
  if (!shell.empty) {
    const sm = new THREE.Mesh(shell.build(), new THREE.MeshStandardMaterial({ map: cladTex, vertexColors: true, roughness: spec.cladding.style === 'glass' ? 0.25 : 0.8, metalness: spec.cladding.style === 'metal' || spec.cladding.style === 'glass' ? 0.4 : 0.05, side: THREE.DoubleSide }));
    group.add(sm);
  }
  if (!glassM.empty) {
    const tex = boxWindows();
    const gm = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0.9, 0.85, 0.7), emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.6, vertexColors: true });
    nightGlow.push(gm);
    group.add(new THREE.Mesh(glassM.build(), gm));
  }
  const steel = new THREE.MeshStandardMaterial({ color: '#9aa1ab', roughness: 0.5, metalness: 0.7 });
  for (const list of [barriers, scaffold]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    group.add(im);
  }

  const cap = spec.tier;
  const track = spec.track ? 9 : 0;
  const sb = SETBACK[cap] + track;
  const front = spec.layout === 'bowl' ? { main: -(35 + sb + 4), opp: 35 + sb + 4, endL: -(60 + sb + 2), endR: 60 + sb + 2 } : { main: -(35 + sb), opp: 35 + sb, endL: -(60 + sb), endR: 60 + sb };
  const maxBack = Math.max(...runs.map((r) => r.backD), 8);
  const pylonSpots: [number, number][] = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * (Math.abs(front.endR) + maxBack * 0.6), sz * (Math.abs(front.opp) + maxBack * 0.6)] as [number, number]));
  return { runs, seats, front, pylonSpots, nightGlow };
}

function collectSeats(run: StandRun, t: TierGeo, k: number, map: ReturnType<typeof seatMap>, out: SeatSpot[]) {
  const { path } = run;
  const W = map.width;
  for (let r = 0; r < t.rows; r++) {
    const d = t.d + (r + 0.45) * t.depth;
    const y = t.y + r * t.riser;
    for (let j = 0; j < W; j++) {
      if (!map.isSeat(j, r)) continue;
      const s = ((j + 0.5) / W) * path.length;
      const p = pointAt(path, s);
      if (!p || run.tiersAt(p) <= k) continue;
      const [x, z] = at(p, d);
      out.push({ x, y, z, side: p.side, u: s / path.length, standing: t.terrace });
    }
  }
}

/** The path point just before arc length s (fast enough: paths have a few hundred points). */
function pointAt(path: Path, s: number): PathPt | null {
  const pts = path.pts;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].s <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = pts[lo];
  const b = pts[(lo + 1) % pts.length];
  const seg = (lo + 1 < pts.length ? b.s : path.length) - a.s;
  const f = seg > 0 ? (s - a.s) / seg : 0;
  return { ...a, x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
}

/** Tunnel mouth in the main stand at halfway (teams walk out of it), with dugouts either side. */
function addTunnel(group: THREE.Group, run: StandRun) {
  const p = run.path.pts.reduce((best, q) => (q.side === 'main' && Math.abs(q.x) < Math.abs(best.x) ? q : best));
  const t = run.tiers[0];
  const ang = Math.atan2(p.nx, p.nz);
  const dark = new THREE.MeshStandardMaterial({ color: '#0b0d12', roughness: 1 });
  const g = new THREE.Group();
  // mouth: a dark recess through the front rows
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(5, 2.8, 4), dark);
  mouth.position.set(0, 1.4, 1.6);
  g.add(mouth);
  // seats cut away above the mouth: a concrete hood
  const hood = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 4.4), new THREE.MeshStandardMaterial({ color: '#3d4350', roughness: 0.9 }));
  hood.position.set(0, 3.05, 1.6);
  g.add(hood);
  // dugouts: low boxes with perspex roofs either side of the tunnel
  const benchMat = new THREE.MeshStandardMaterial({ color: '#1f2430', roughness: 0.7 });
  const perspex = new THREE.MeshStandardMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 });
  for (const sx of [-1, 1]) {
    const dug = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 2.2), benchMat);
    base.position.y = 0.55;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.08, 2.6), perspex);
    roof.position.set(0, 2.2, 0.1);
    const back = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2.2, 0.1), perspex);
    back.position.set(0, 1.1, 1.2);
    dug.add(base, roof, back);
    dug.position.set(sx * 13, 0, -3.2);
    g.add(dug);
  }
  g.position.set(p.x, 0, p.z);
  g.rotation.y = ang;
  void t;
  group.add(g);
}

/** Executive-box glazing: warm-lit window panes with mullions. */
function boxWindows() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b2533';
  g.fillRect(0, 0, 64, 32);
  for (let i = 0; i < 8; i++) {
    const lit = Math.random() < 0.75;
    g.fillStyle = lit ? `rgba(255,${200 + Math.random() * 40},${140 + Math.random() * 60},0.85)` : '#22303f';
    g.fillRect(i * 8 + 1, 3, 6, 26);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export type { Path, PathPt };
