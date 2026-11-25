import * as THREE from 'three';
import { at, type PathPt } from './path';
import { tierTop, type StandsResult } from './stands';
import { GLOW_TEX } from './textures';
import type { StadiumContext, StadiumSpec } from './types';

export interface RoofResult {
  /** lights that only matter at night: roof underside strips and floodlight lamp glows */
  nightGlow: THREE.Material[];
  glowSprites: THREE.Sprite[];
  /** floodlight glow strength 0..1 (all lamp flares are one points draw call) */
  setGlow(k: number): void;
  /** highest roof edge (for cameras and the closing lid) */
  maxY: number;
}

/**
 * Roofs over every stand that has one: a cantilevered sheet (translucent on some grounds) with a
 * fascia, rib trusses, pillars on older stands and a light strip under the front edge; a closing
 * lid over the whole pitch where the spec says so; signature roof shapes (wave, floating ring,
 * timber eaves). Then the floodlights: corner pylons and/or banks along the roof fronts.
 */
export function buildRoofs(group: THREE.Group, spec: StadiumSpec, ctx: StadiumContext, stands: StandsResult): RoofResult {
  const low = ctx.quality.level === 'low';
  const sig = spec.signature.kind;
  const opacity = spec.roofOpacity ?? 1;
  const translucent = opacity < 1;
  const sheetMat = new THREE.MeshStandardMaterial({
    color: spec.roofColor,
    map: translucent ? panelTexture() : null,
    roughness: 0.5,
    metalness: 0.35,
    side: THREE.DoubleSide,
    transparent: translucent,
    opacity,
    depthWrite: !translucent,
  });
  if (sig === 'timberRoof') sheetMat.color.set('#8a5d34');
  const fasciaMat = new THREE.MeshStandardMaterial({ color: sig === 'timberRoof' ? '#6b4526' : '#eef1f5', roughness: 0.4, metalness: 0.5 });
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.2) });
  const nightGlow: THREE.Material[] = [stripMat];
  const glowSprites: THREE.Sprite[] = [];
  /** x, y, z, world size per flare */
  const flares: number[] = [];
  const pos: number[] = [];
  const fas: number[] = [];
  const strip: number[] = [];
  const ribs: THREE.Matrix4[] = [];
  const pillars: THREE.Matrix4[] = [];
  let maxY = 0;
  const lampEvery = low ? 30 : 15;
  const glowMat = new THREE.SpriteMaterial({ map: GLOW_TEX(), color: '#fff6dd', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
  nightGlow.push(glowMat);
  const closing = Object.values(spec.stands).some((s) => s.roof === 'closing');

  for (const run of stands.runs) {
    const { path, tiers } = run;
    const roofed = (p: PathPt) => {
      const st = run.specAt(p);
      return !!st && st.roof !== 'none' && run.tiersAt(p) > 0;
    };
    // roof cross-section at a point: back edge high above the top row, front edge out over the seats
    const geo = (p: PathPt) => {
      const n = run.tiersAt(p);
      const top = tierTop(tiers[n - 1]);
      const back = tiers[n - 1].d + tiers[n - 1].rows * tiers[n - 1].depth + 0.6;
      let yB = top + 4.2;
      let yF = yB + 2.2;
      const front = tiers[0].d + (n > 1 ? 4 : 1.5);
      if (sig === 'waveRoof' || sig === 'harbour') {
        const w = Math.sin(p.s * 0.045) * 1.6;
        yB += w;
        yF += w * 1.4;
      }
      if (sig === 'floatingRoof') {
        yB += 4;
        yF += 3;
      }
      return { back, front, yB, yF };
    };
    const last = path.closed ? path.pts.length : path.pts.length - 1;
    for (let i = 0; i < last; i++) {
      const a = path.pts[i];
      const b = path.pts[(i + 1) % path.pts.length];
      if (!roofed(a) || !roofed(b)) continue;
      const ga = geo(a);
      const gb = geo(b);
      maxY = Math.max(maxY, ga.yF);
      const [abx, abz] = at(a, ga.back);
      const [bbx, bbz] = at(b, gb.back);
      const [afx, afz] = at(a, ga.front);
      const [bfx, bfz] = at(b, gb.front);
      pos.push(abx, ga.yB, abz, bbx, gb.yB, bbz, bfx, gb.yF, bfz, abx, ga.yB, abz, bfx, gb.yF, bfz, afx, ga.yF, afz);
      // fascia along the front edge
      fas.push(afx, ga.yF - 1.3, afz, bfx, gb.yF - 1.3, bfz, bfx, gb.yF + 0.25, bfz, afx, ga.yF - 1.3, afz, bfx, gb.yF + 0.25, bfz, afx, ga.yF + 0.25, afz);
      // light strip under the front edge
      const [asx, asz] = at(a, ga.front + 1.2);
      const [bsx, bsz] = at(b, gb.front + 1.2);
      strip.push(asx, ga.yF - 1.4, asz, bsx, gb.yF - 1.4, bsz, bsx, gb.yF - 1.25, bsz, asx, ga.yF - 1.4, asz, bsx, gb.yF - 1.25, bsz, asx, ga.yF - 1.25, asz);
      if (sig === 'timberRoof' && !low) {
        // two more eave layers stepping down outside the bowl
        for (const [dd, dy] of [
          [3, -2.5],
          [6, -5],
        ]) {
          const [a2x, a2z] = at(a, ga.back + dd);
          const [b2x, b2z] = at(b, gb.back + dd);
          const [a3x, a3z] = at(a, ga.back + dd - 5);
          const [b3x, b3z] = at(b, gb.back + dd - 5);
          fas.push(a3x, ga.yB + dy, a3z, b3x, gb.yB + dy, b3z, b2x, gb.yB + dy - 0.8, b2z, a3x, ga.yB + dy, a3z, b2x, gb.yB + dy - 0.8, b2z, a2x, ga.yB + dy - 0.8, a2z);
        }
      }
    }
    // ribs (cantilever trusses) and pillars, spaced along the run
    let nextRib = 0;
    let nextLamp = 6;
    let nextPillar = 6;
    for (const p of path.pts) {
      if (!roofed(p)) continue;
      const g = geo(p);
      if (p.s >= nextRib && !low) {
        nextRib = p.s + 7;
        const [bx, bz] = at(p, g.back);
        const [fx, fz] = at(p, g.front);
        const bk = new THREE.Vector3(bx, g.yB + (translucent ? 0.2 : 2.4), bz);
        const fr = new THREE.Vector3(fx, g.yF + 0.3, fz);
        ribs.push(beam(bk, fr, 0.35));
        // a back stay down to the shell
        ribs.push(beam(new THREE.Vector3(bx, g.yB - 3, bz), bk, 0.3));
      }
      const st = run.specAt(p);
      if (st?.columns && p.s >= nextPillar) {
        nextPillar = p.s + 12;
        const [px, pz] = at(p, tiers[0].d + 1.2);
        pillars.push(beam(new THREE.Vector3(px, tiers[0].y, pz), new THREE.Vector3(px, g.yF - 1.3, pz), 0.28));
      }
      if (sig === 'floatingRoof' && p.s >= nextPillar) {
        nextPillar = p.s + 9;
        const [px, pz] = at(p, g.back - 1);
        pillars.push(beam(new THREE.Vector3(px, g.yB - 5, pz), new THREE.Vector3(px, g.yB, pz), 0.22));
      }
      if ((spec.lights === 'roof' || spec.lights === 'both') && p.s >= nextLamp) {
        nextLamp = p.s + lampEvery;
        const [lx, lz] = at(p, g.front + 0.6);
        flares.push(lx, g.yF - 1.1, lz, 7);
      }
    }
  }

  const mesh = (arr: number[], mat: THREE.Material) => {
    if (!arr.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    const uv: number[] = [];
    for (let i = 0; i < arr.length; i += 3) uv.push(arr[i] / 6, arr[i + 2] / 6);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, mat);
    m.castShadow = mat === sheetMat && !translucent;
    group.add(m);
  };
  mesh(pos, sheetMat);
  mesh(fas, fasciaMat);
  mesh(strip, stripMat);
  const steel = new THREE.MeshStandardMaterial({ color: sig === 'timberRoof' ? '#6b4526' : '#d5dae1', roughness: 0.45, metalness: 0.6 });
  for (const list of [ribs, pillars]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    group.add(im);
  }

  if (closing) {
    // the closing roof, shut: a translucent lid on two long trusses spanning the bowl
    const h = maxY + 7;
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(190, 140), new THREE.MeshStandardMaterial({ color: spec.roofColor, map: panelTexture(), roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    lid.rotation.x = Math.PI / 2;
    lid.position.y = h;
    group.add(lid);
    for (const z of [-24, 24]) {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(200, 3, 1.4), steel);
      truss.position.set(0, h + 1.6, z);
      group.add(truss);
    }
    // lighting rigs under the lid
    for (let x = -50; x <= 50; x += 25)
      for (const z of [-30, 30]) {
        const rig = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 2), stripMat);
        rig.position.set(x, h - 1, z);
        group.add(rig);
      }
    maxY = h;
  }

  // corner floodlight pylons
  if (spec.lights === 'pylons' || spec.lights === 'both') {
    const towerMat = new THREE.MeshStandardMaterial({ color: '#59606e', roughness: 0.5, metalness: 0.7 });
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 5.4) });
    nightGlow.push(lampMat);
    const h = Math.max(42, maxY + 16);
    // towers + frames + lamps: three instanced draws for all pylons
    const spots = stands.pylonSpots;
    const towers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1.4, 1, 8), towerMat, spots.length);
    const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(14, 7, 0.8), towerMat, spots.length);
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 2.4, 0.3), lampMat, spots.length * 8);
    const head = new THREE.Object3D();
    const lamp = new THREE.Object3D();
    head.add(lamp);
    spots.forEach(([x, z], k) => {
      towers.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
      head.position.set(x, h + 3, z);
      head.lookAt(0, 0, 0);
      head.updateMatrixWorld(true);
      frames.setMatrixAt(k, head.matrixWorld);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) {
          lamp.position.set(-5 + i * 3.35, -1.6 + j * 3.2, 0.5);
          lamp.updateMatrixWorld(true);
          lamps.setMatrixAt(k * 8 + i * 2 + j, lamp.matrixWorld);
        }
      const gp = head.position.clone().add(new THREE.Vector3(-x, -h, -z).normalize().multiplyScalar(2));
      flares.push(gp.x, gp.y, gp.z, 36);
    });
    group.add(towers, frames, lamps);
  }
  // all flares in one draw call: points sized in world units, additive glow texture
  const flareU = { uMap: { value: GLOW_TEX() }, uOpacity: { value: 0.9 }, uScale: { value: 1 } };
  if (flares.length) {
    const n = flares.length / 4;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set(flares.slice(i * 4, i * 4 + 3), i * 3);
      size[i] = flares[i * 4 + 3];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: flareU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSize; uniform float uScale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uScale * aSize * 220.0 / max(-mv.z, 1.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uMap; uniform float uOpacity;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(1.0, 0.97, 0.88) * t.a * uOpacity, t.a * uOpacity); }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.onBeforeRender = (r) => (flareU.uScale.value = r.getPixelRatio() * (r.domElement.height / r.getPixelRatio()) / 390);
    group.add(pts);
  }
  void glowMat;
  return {
    nightGlow,
    glowSprites,
    maxY,
    setGlow(k: number) {
      flareU.uOpacity.value = 0.9 * k;
    },
  };
}

/** A unit box stretched between two points (for ribs, stays and pillars). */
function beam(a: THREE.Vector3, b: THREE.Vector3, thick: number) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(thick, len, thick));
}

/** Polycarbonate / glass roof panels. */
function panelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(80,90,105,0.55)';
  g.fillRect(0, 0, 64, 3);
  g.fillRect(0, 0, 3, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
