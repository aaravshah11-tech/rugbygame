import * as THREE from 'three';
import { at } from './path';
import { tierBack, tierTop, type StandsResult } from './stands';
import type { StadiumSpec, TimeOfDay } from './types';

/**
 * Stand shadows across the pitch by day, baked once per match: rasterise the stands (and roofs)
 * into a height field, then for every texel of the pitch area walk towards the sun and see whether
 * a stand is in the way. The result is drawn as one soft dark overlay - no extra shadow maps, so it
 * costs nothing per frame.
 */
export function bakeStandShadows(group: THREE.Group, spec: StadiumSpec, stands: StandsResult, sunDir: THREE.Vector3, time: TimeOfDay, low: boolean) {
  if (time === 'night') return;
  // height field: 1 m cells
  const HX = 150;
  const HZ = 130;
  const W = HX * 2;
  const D = HZ * 2;
  const hf = new Float32Array(W * D);
  const put = (x: number, z: number, h: number) => {
    const i = Math.floor(x + HX);
    const j = Math.floor(z + HZ);
    if (i < 0 || j < 0 || i >= W || j >= D) return;
    const k = j * W + i;
    if (h > hf[k]) hf[k] = h;
  };
  for (const run of stands.runs) {
    for (const p of run.path.pts) {
      const n = run.tiersAt(p);
      if (!n) continue;
      const st = run.specAt(p);
      const top = tierTop(run.tiers[n - 1]);
      const back = tierBack(run.tiers[n - 1]);
      const roofed = st && st.roof !== 'none';
      const roofY = top + 5;
      for (let d = 0; d <= back + 1; d += 0.8) {
        // seating height at this depth (rows rise towards the back), or the roof above it
        let h = 1.2;
        for (const t of run.tiers.slice(0, n)) if (d >= t.d) h = Math.max(h, t.y + Math.min(t.rows, (d - t.d) / t.depth) * t.riser);
        if (roofed && d >= run.tiers[0].d + 2) h = roofY;
        const [x, z] = at(p, d);
        put(x, z, h);
      }
    }
  }
  // shadow mask over the pitch and its surround
  const PX = 80;
  const PZ = 56;
  const res = low ? 1.5 : 1;
  const mw = Math.round((PX * 2) / res);
  const mh = Math.round((PZ * 2) / res);
  const toSun = sunDir.clone().negate();
  const horiz = Math.hypot(toSun.x, toSun.z) || 1;
  const sx = toSun.x / horiz;
  const sz = toSun.z / horiz;
  const tanEl = toSun.y / horiz;
  const maxH = 60;
  const c = document.createElement('canvas');
  c.width = mw;
  c.height = mh;
  const g = c.getContext('2d')!;
  const img = g.createImageData(mw, mh);
  for (let j = 0; j < mh; j++)
    for (let i = 0; i < mw; i++) {
      const x0 = -PX + (i + 0.5) * res;
      const z0 = -PZ + (j + 0.5) * res;
      let shade = 0;
      for (let t = 1; t < 260; t += 1.5) {
        const ray = t * tanEl;
        if (ray > maxH) break;
        const xi = Math.floor(x0 + sx * t + HX);
        const zi = Math.floor(z0 + sz * t + HZ);
        if (xi < 0 || zi < 0 || xi >= W || zi >= D) break;
        if (hf[zi * W + xi] > ray) {
          shade = 1;
          break;
        }
      }
      const o = (j * mw + i) * 4;
      img.data[o + 3] = shade * 255;
    }
  g.putImageData(img, 0, 0);
  // soften the edge (penumbra)
  const soft = document.createElement('canvas');
  soft.width = mw;
  soft.height = mh;
  const sg = soft.getContext('2d')!;
  sg.filter = `blur(${time === 'golden' ? 2.5 : 1.5}px)`;
  sg.drawImage(c, 0, 0);
  const tex = new THREE.CanvasTexture(soft);
  const mat = new THREE.MeshBasicMaterial({
    color: time === 'golden' ? '#1a2240' : '#101a2a',
    alphaMap: tex,
    transparent: true,
    opacity: time === 'golden' ? 0.3 : 0.36,
    depthWrite: false,
  });
  // alphaMap reads the green channel: copy alpha there
  const data = sg.getImageData(0, 0, mw, mh);
  for (let k = 0; k < data.data.length; k += 4) data.data[k] = data.data[k + 1] = data.data[k + 2] = data.data[k + 3];
  sg.putImageData(data, 0, 0);
  tex.needsUpdate = true;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(PX * 2, PZ * 2), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.018;
  plane.renderOrder = 1;
  group.add(plane);
  void spec;
}
