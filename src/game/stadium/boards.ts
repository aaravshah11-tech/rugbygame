import * as THREE from 'three';
import { at } from './path';
import type { StandsResult } from './stands';
import { ledTexture, tryLedTexture } from './textures';
import type { StadiumSpec } from './types';

/**
 * LED advertising: perimeter boards round the pitch and ribbons along the upper-tier fronts.
 * One scrolling texture shared by all (original made-up sponsors plus the ground's name).
 */
export function buildBoards(group: THREE.Group, spec: StadiumSpec, stands: StandsResult, tryColor = '#c6ff1a') {
  const led = ledTexture([spec.name.toUpperCase(), spec.city.toUpperCase()]);
  const boardMat = new THREE.MeshBasicMaterial({ map: led });
  boardMat.color.setScalar(1.35);
  const boards: THREE.Texture[] = [];
  const faces: { mat: THREE.MeshBasicMaterial; normal: THREE.Texture; flash: THREE.Texture }[] = [];
  const tryTex = tryLedTexture(tryColor);
  const dark = new THREE.MeshStandardMaterial({ color: '#111' });
  const mkBoard = (len: number, x: number, z: number, ry: number) => {
    const tex = led.clone();
    tex.needsUpdate = true;
    tex.repeat.set(len / 60, 1);
    boards.push(tex);
    const face = Object.assign(boardMat.clone(), { map: tex });
    const flash = tryTex.clone();
    flash.needsUpdate = true;
    flash.repeat.set(len / 30, 1);
    faces.push({ mat: face, normal: tex, flash });
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), [dark, dark, dark, dark, face, dark]);
    m.position.set(x, 0.45, z);
    m.rotation.y = ry;
    group.add(m);
  };
  // the boards sit between the pitch surround and the stands
  const bz = Math.min(40.5, Math.abs(stands.front.opp) - 1.5);
  const bx = Math.min(64, Math.abs(stands.front.endR) - 1.5);
  mkBoard(bx * 2 - 4, 0, -bz, 0);
  mkBoard(bx * 2 - 4, 0, bz, Math.PI);
  mkBoard(bz * 2 - 2, -bx, 0, Math.PI / 2);
  mkBoard(bz * 2 - 2, bx, 0, -Math.PI / 2);

  // ribbons on the fronts of the upper tiers
  const pos: number[] = [];
  const uv: number[] = [];
  for (const run of stands.runs) {
    run.tiers.forEach((t, k) => {
      if (k === 0) return;
      const { path } = run;
      const last = path.closed ? path.pts.length : path.pts.length - 1;
      for (let i = 0; i < last; i++) {
        const a = path.pts[i];
        const b = path.pts[(i + 1) % path.pts.length];
        if (run.tiersAt(a) <= k || run.tiersAt(b) <= k) continue;
        const [ax, az] = at(a, t.d - 0.36);
        const [bx2, bz2] = at(b, t.d - 0.36);
        const y0 = t.y - 1.35;
        const y1 = t.y - 0.25;
        pos.push(ax, y0, az, bx2, y0, bz2, bx2, y1, bz2, ax, y0, az, bx2, y1, bz2, ax, y1, az);
        const ua = a.s / 60;
        const ub = (i + 1 === path.pts.length ? path.length : b.s) / 60;
        uv.push(ua, 0, ub, 0, ub, 1, ua, 0, ub, 1, ua, 1);
      }
    });
  }
  if (pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.MeshBasicMaterial({ map: led, side: THREE.DoubleSide });
    m.color.setScalar(1.5);
    group.add(new THREE.Mesh(g, m));
  }
  /** scroll the adverts; while `flash` > 0 the boards shout TRY! and strobe */
  const update = (time: number, flash: number) => {
    const off = (time * 0.025) % 1;
    led.offset.x = off;
    for (const b of boards) b.offset.x = off;
    for (const f of faces) {
      const want = flash > 0 ? f.flash : f.normal;
      if (f.mat.map !== want) {
        f.mat.map = want;
        f.mat.needsUpdate = true;
      }
      if (flash > 0) {
        f.flash.offset.x = (time * 0.4) % 1;
        f.mat.color.setScalar(1 + Math.max(0, Math.sin(time * 18)) * 0.9);
      } else f.mat.color.setScalar(1.35);
    }
  };
  return { led, boards, update };
}
