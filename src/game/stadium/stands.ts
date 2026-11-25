import * as THREE from 'three';
import { A, BZ, LOWER, RING, ringPoint, SIDE, StripBuilder, TOP, UPPER, type Tier } from './ring';
import { GLOW_TEX, ledTexture } from './textures';
import { makeCrowd } from './crowd';
import { SIDES, type SideKey, type StadiumContext, type StadiumSpec } from './types';

const DEFAULT_ROWS = { club: 10, medium: 13, large: 16, national: 16 } as const;

/**
 * The bowl: stands round a rounded-rectangle ring, tiers per side from the spec, roofs, crowd,
 * floodlight towers and LED boards. Returns what the per-frame update needs.
 */
export function buildRingStadium(group: THREE.Group, spec: StadiumSpec, ctx: StadiumContext) {
  const q = ctx.quality;
  const crowdColors = [ctx.home.primary, ctx.home.primary, ctx.home.secondary, ctx.home.primary, ctx.away.primary, ctx.away.secondary];
  const fill = Math.min(1, spec.fill * (0.55 + 0.45 * ctx.importance) + 0.05);
  // ---------- the stands, built from the venue description
  const lower: Tier = { ...LOWER, rows: spec.stands.main.rows ?? DEFAULT_ROWS[spec.tier] };
  const upper: Tier = { ...UPPER, d: lower.rows * lower.depth + 2.4, y: lower.y + lower.rows * lower.riser + 3.6 };
  const top: Tier = { ...TOP, d: upper.d + upper.rows * upper.depth + 2.4, y: upper.y + upper.rows * upper.riser + 3.6 };
  const tiersAll = [lower, upper, top];
  const cornerTiers = spec.corners === 'closed' ? Math.min(...SIDES.map((s) => spec.stands[s].tiers).filter((t) => t > 0)) : 0;
  const nTiers = (i: number) => (SIDE[i] === 'corners' ? cornerTiers : spec.stands[SIDE[i] as SideKey].tiers);
  const has = (k: number) => (i: number) => nTiers(i) > k;
  const seatCols = spec.seats.colors.map((c) => new THREE.Color(c));
  const seat = (r: number) => (i: number) => {
    if (spec.seats.pattern === 'mosaic') return seatCols[(i * 7 + r * 13 + ((i * r) % 5)) % seatCols.length];
    return seatCols[r % seatCols.length];
  };
  const sb = new StripBuilder();
  const concrete = new THREE.Color('#3a4050');
  sb.strip(-0.5, 0, -0.5, lower.y, concrete, 0, has(0)); // pitch-side wall
  tiersAll.forEach((tier, k) => {
    for (let r = 0; r < tier.rows; r++) {
      const d0 = tier.d + r * tier.depth;
      const y = tier.y + r * tier.riser;
      sb.strip(d0, y, d0 + tier.depth, y, seat(r), 0, has(k));
      sb.strip(d0 + tier.depth, y, d0 + tier.depth, y + tier.riser, (i) => seat(r)(i).clone().multiplyScalar(0.75), 0, has(k));
    }
    const tTop = tier.y + tier.rows * tier.riser;
    const tBack = tier.d + tier.rows * tier.depth;
    const next = tiersAll[k + 1];
    // back of this tier: concourse wall up to the next tier where there is one, a short back wall where not
    sb.strip(tBack, tTop, tBack, next ? next.y - 1.4 : tTop + 3, concrete, 0, (i) => nTiers(i) === k + 1 || (!!next && nTiers(i) > k + 1));
    if (next) sb.strip(next.d - 0.4, next.y - 1.4, tBack, next.y - 1.4, concrete.clone().multiplyScalar(0.6), 0, has(k + 1));
  });
  // grass banks / open ends where there is no stand
  if (SIDES.some((s) => spec.stands[s].bank)) {
    const bank = new THREE.Color('#2f5a26');
    sb.strip(0, 0.2, 9, 3.2, bank, 0, (i) => nTiers(i) === 0);
  }
  const bowl = new THREE.Mesh(sb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05, side: THREE.DoubleSide }));
  group.add(bowl);

  // athletics track (Rome)
  if (spec.track) {
    const tr = new StripBuilder();
    tr.strip(-11, 0.02, -1, 0.02, new THREE.Color(spec.track));
    group.add(new THREE.Mesh(tr.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  }

  // LED ribbon on the front of the upper tier
  const led = ledTexture([spec.name.toUpperCase(), spec.city.toUpperCase()]);
  const ribbon = new StripBuilder();
  ribbon.strip(upper.d - 0.4, upper.y - 1.4, upper.d - 0.4, upper.y, new THREE.Color(1, 1, 1), 1 / 60, has(1));
  const ribbonMat = new THREE.MeshBasicMaterial({ map: led, side: THREE.DoubleSide });
  ribbonMat.color.setScalar(1.5);
  group.add(new THREE.Mesh(ribbon.build(), ribbonMat));

  // roofs: over each stand at the height of its top tier; a closed roof covers everything
  const roofOpacity = spec.roofOpacity ?? 1;
  const closedRoof = SIDES.some((s) => spec.stands[s].roof === 'closing');
  const roofMat = new THREE.MeshStandardMaterial({ color: spec.roofColor, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide, transparent: roofOpacity < 1, opacity: roofOpacity, depthWrite: roofOpacity >= 1 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.3, 2.6) });
  let maxTop = 0;
  tiersAll.forEach((tier, k) => {
    const tTop = tier.y + tier.rows * tier.riser;
    const tBack = tier.d + tier.rows * tier.depth;
    const roofed = (i: number) => nTiers(i) === k + 1 && (closedRoof || (SIDE[i] === 'corners' ? spec.corners === 'closed' && SIDES.some((s) => spec.stands[s].roof !== 'none') : spec.stands[SIDE[i] as SideKey].roof !== 'none'));
    if (!RING.some((_, i) => roofed(i))) return;
    maxTop = Math.max(maxTop, tTop);
    const front = Math.max(0, tier.d - 6 - k * 2);
    const roof = new StripBuilder();
    roof.strip(tBack + 0.5, tTop + 4, front, tTop + 6.5, new THREE.Color(1, 1, 1), 0, roofed);
    group.add(new THREE.Mesh(roof.build(), roofMat));
    const edge = new StripBuilder();
    edge.strip(front, tTop + 6.1, front, tTop + 6.6, new THREE.Color(1, 1, 1), 0, roofed);
    group.add(new THREE.Mesh(edge.build(), edgeMat));
  });
  if (closedRoof) {
    // the retractable roof closed over the pitch
    const h = maxTop + 9;
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(2 * (A + 40), 2 * (BZ + 40)), new THREE.MeshStandardMaterial({ color: spec.roofColor, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
    lid.rotation.x = Math.PI / 2;
    lid.position.y = h;
    group.add(lid);
    // light rigs under the roof
    for (let x = -50; x <= 50; x += 25)
      for (const z of [-30, 30]) {
        const rig = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 3.6) }));
        rig.position.set(x, h - 1, z);
        group.add(rig);
      }
  }
  // corner masts holding the roof (Cardiff)
  if (spec.signature.kind === 'masts') {
    const mastMat = new THREE.MeshStandardMaterial({ color: '#e8ebef', roughness: 0.4, metalness: 0.6 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 95, 10), mastMat);
      m.position.set(sx * (A + 32), 47, sz * (BZ + 26));
      m.rotation.z = sx * 0.08;
      m.rotation.x = -sz * 0.08;
      group.add(m);
    }
  }

  // ---------- crowd: instanced camera-facing billboards
  const spacing = 0.72 / q.crowdDensity;
  const offsets: number[] = [];
  const colors: number[] = [];
  const params: number[] = [];
  const palette = crowdColors.map((c) => new THREE.Color(c));
  const neutrals = ['#2b3346', '#4a5366', '#6b7280', '#1f2937', '#8a8f9c', '#b33a3a'].map((c) => new THREE.Color(c));
  tiersAll.forEach((tier, k) => {
    for (let r = 0; r < tier.rows; r++) {
      const d = tier.d + r * tier.depth + tier.depth * 0.35;
      const y = tier.y + r * tier.riser;
      let carry = Math.random() * spacing;
      for (let i = 0; i < RING.length; i++) {
        if (nTiers(i) <= k) continue;
        const [ax, az] = ringPoint(RING[i], d);
        const [bx, bz] = ringPoint(RING[(i + 1) % RING.length], d);
        const seg = Math.hypot(bx - ax, bz - az);
        let s = carry;
        while (s < seg) {
          const t = s / seg;
          if (Math.random() < fill) {
            offsets.push(ax + (bx - ax) * t, y, az + (bz - az) * t);
            const team = Math.random() < 0.72;
            const c = (team ? palette[Math.floor(Math.random() * palette.length)] : neutrals[Math.floor(Math.random() * neutrals.length)]).clone();
            c.multiplyScalar(0.75 + Math.random() * 0.3);
            colors.push(c.r, c.g, c.b);
            params.push(Math.random(), Math.random() < 0.5 ? 0 : 1, Math.random());
          }
          s += spacing * (0.85 + Math.random() * 0.3);
        }
        carry = s - seg;
      }
    }
  });
  const { mesh: crowd, uniforms: crowdUniforms } = makeCrowd(offsets, colors, params);
  group.add(crowd);

  // ---------- floodlight towers with glowing lamp heads
  const towerMat = new THREE.MeshStandardMaterial({ color: '#59606e', roughness: 0.5, metalness: 0.7 });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 5.4) });
  const glowMat = new THREE.SpriteMaterial({ map: GLOW_TEX(), color: '#fff6dd', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const p of spec.lights !== 'roof' ? [RING[4], RING[27], RING[46], RING[69]] : []) {
    const [x, z] = ringPoint(p, 34);
    const h = 58;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.4, h, 8), towerMat);
    tower.position.set(x, h / 2, z);
    group.add(tower);
    const head = new THREE.Group();
    head.position.set(x, h + 3, z);
    head.lookAt(0, 0, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 0.8), towerMat);
    head.add(frame);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 0.3), lampMat);
        lamp.position.set(-5 + i * 3.35, -1.6 + j * 3.2, 0.5);
        head.add(lamp);
      }
    group.add(head);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(36);
    glow.position.copy(head.position).add(new THREE.Vector3(-x, -h, -z).normalize().multiplyScalar(2));
    group.add(glow);
  }

  // ---------- LED advertising boards around the pitch edge
  const boardMat = new THREE.MeshBasicMaterial({ map: led });
  boardMat.color.setScalar(1.35);
  const boards: THREE.Texture[] = [];
  const mkBoard = (len: number, x: number, z: number, ry: number) => {
    const tex = led.clone();
    tex.needsUpdate = true;
    tex.repeat.set(len / 60, 1);
    boards.push(tex);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), [
      new THREE.MeshStandardMaterial({ color: '#111' }),
      new THREE.MeshStandardMaterial({ color: '#111' }),
      new THREE.MeshStandardMaterial({ color: '#111' }),
      new THREE.MeshStandardMaterial({ color: '#111' }),
      Object.assign(boardMat.clone(), { map: tex }),
      new THREE.MeshStandardMaterial({ color: '#111' }),
    ]);
    m.position.set(x, 0.45, z);
    m.rotation.y = ry;
    group.add(m);
  };
  mkBoard(124, 0, -40.5, 0);
  mkBoard(124, 0, 40.5, Math.PI);
  mkBoard(76, -64, 0, Math.PI / 2);
  mkBoard(76, 64, 0, -Math.PI / 2);

  return { crowdUniforms, led, boards };
}
