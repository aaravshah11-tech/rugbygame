import * as THREE from 'three';
import { at } from './path';
import type { StandsResult } from './stands';
import { ledTexture, tryLedTexture } from './textures';
import { boardStrip, takeoverTexture, tryBoardTexture } from '../../sponsors/textures';
import type { StadiumContext, StadiumSpec } from './types';

/**
 * LED advertising: perimeter boards round the pitch and ribbons along the upper-tier fronts.
 * One scrolling texture shared by all (original made-up sponsors plus the ground's name).
 */
export function buildBoards(group: THREE.Group, spec: StadiumSpec, stands: StandsResult, tryColor = '#c6ff1a', ctx?: StadiumContext) {
  const sp = ctx?.sponsors ?? null;
  const low = ctx?.quality.level === 'low';
  // the running order: real sponsors, or the made-up ones with the ground's name
  const strip = sp ? boardStrip(sp.boards, low) : null;
  const led = strip ? strip.texture : ledTexture([spec.name.toUpperCase(), spec.city.toUpperCase()]);
  const panels = strip ? strip.panels : 0;
  const take = sp && !low ? takeoverTexture(low, panels) : null;
  const tryTex = sp ? tryBoardTexture(sp.title, low) : tryLedTexture(tryColor);
  const glow = ctx?.time === 'night' ? 1.45 : ctx?.time === 'golden' ? 1.25 : 1.1;
  const U = {
    uStrip: { value: led },
    uTake: { value: (take?.texture ?? led) as THREE.Texture },
    uTry: { value: tryTex },
    uOff: { value: 0 },
    uWipe: { value: 0 },
    uShine: { value: -1 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uGlow: { value: glow },
  };
  const boards: THREE.Texture[] = [];
  const faces: { mat: THREE.ShaderMaterial }[] = [];
  const dark = new THREE.MeshStandardMaterial({ color: '#111' });
  /** panel width in metres on the perimeter boards (0.9 m high, 4:1 panels) */
  const PANEL_M = 3.6;
  const faceMat = (len: number) =>
    new THREE.ShaderMaterial({
      uniforms: { ...U, uRep: { value: sp ? len / PANEL_M / panels : len / 60 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D uStrip; uniform sampler2D uTake; uniform sampler2D uTry;
        uniform float uRep; uniform float uOff; uniform float uWipe; uniform float uShine; uniform float uFlash; uniform float uTime; uniform float uGlow;
        varying vec2 vUv;
        void main() {
          vec2 su = vec2(vUv.x * uRep + uOff, vUv.y);
          vec3 c = texture2D(uStrip, su).rgb;
          // full-width takeover wipes in from the left
          vec3 t = texture2D(uTake, vec2(vUv.x * uRep, vUv.y)).rgb;
          float w = smoothstep(uWipe - 0.015, uWipe, vUv.x);
          c = mix(t, c, w);
          // the wipe edge itself glows
          c += vec3(1.0) * (1.0 - smoothstep(0.0, 0.02, abs(vUv.x - uWipe))) * step(0.001, uWipe) * step(uWipe, 0.999) * 0.8;
          // shine sweep across a takeover
          float sh = 1.0 - smoothstep(0.0, 0.06, abs(vUv.x - uShine + (vUv.y - 0.5) * 0.04));
          c += sh * 0.55;
          // try celebration: scrolling TRY! panels, strobing
          if (uFlash > 0.0) {
            vec3 f = texture2D(uTry, vec2(vUv.x * uRep * 2.0 - uTime * 0.5, vUv.y)).rgb;
            c = f * (1.0 + 0.6 * max(0.0, sin(uTime * 18.0)));
          }
          gl_FragColor = vec4(c * uGlow, 1.0);
          #include <colorspace_fragment>
        }`,
    });
  const wet = ctx?.weather === 'rain' && !low;
  const reflMat = (len: number) =>
    new THREE.ShaderMaterial({
      uniforms: { ...U, uRep: { value: sp ? len / PANEL_M / panels : len / 60 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D uStrip; uniform float uRep; uniform float uOff; uniform float uGlow; uniform float uFlash; uniform sampler2D uTry; uniform float uTime;
        varying vec2 vUv;
        void main() {
          // the board mirrored in the wet grass, rippled and fading away from the board
          float ripple = sin(vUv.x * 300.0 + vUv.y * 40.0) * 0.004;
          vec2 su = vec2(vUv.x * uRep + uOff + ripple, 1.0 - min(vUv.y * 2.4, 1.0));
          vec3 c = uFlash > 0.0 ? texture2D(uTry, vec2(vUv.x * uRep * 2.0 - uTime * 0.5, su.y)).rgb : texture2D(uStrip, su).rgb;
          float a = pow(1.0 - vUv.y, 2.2) * 0.32;
          gl_FragColor = vec4(c * uGlow * a, a);
          #include <colorspace_fragment>
        }`,
    });
  const mkBoard = (len: number, x: number, z: number, ry: number) => {
    const face = faceMat(len);
    faces.push({ mat: face });
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), [dark, dark, dark, dark, face, dark]);
    m.position.set(x, 0.45, z);
    m.rotation.y = ry;
    group.add(m);
    if (wet) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.4), reflMat(len));
      r.rotation.set(-Math.PI / 2, 0, 0);
      const g = new THREE.Group();
      r.position.set(0, 0.025, 1.3);
      g.add(r);
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      group.add(g);
    }
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
  /** scroll the strip; every ~20 s a brand takes over the whole board (wipe in, shine, wipe out);
   *  while `flash` > 0 the boards celebrate a try */
  let cycleBrand = 0;
  let lastCycle = -1;
  const update = (time: number, flash: number) => {
    U.uTime.value = time;
    U.uOff.value = (time * (sp ? 0.012 : 0.025)) % 1;
    U.uFlash.value = flash;
    led.offset.x = U.uOff.value; // the stand ribbons scroll with the boards
    if (take && sp) {
      const T = 22;
      const k = time % T;
      const cyc = Math.floor(time / T);
      if (cyc !== lastCycle) {
        lastCycle = cyc;
        take.show(sp.featured[cycleBrand++ % sp.featured.length]);
      }
      // 0-14 s scroll, 14-15 wipe in, 15-20 hold with a shine, 20-21 wipe out
      U.uWipe.value = k < 14 ? 0 : k < 15 ? k - 14 : k < 20 ? 1 : k < 21 ? 1 - (k - 20) : 0;
      U.uShine.value = k > 15.3 && k < 17.3 ? (k - 15.3) / 1.6 - 0.1 : -1;
    }
  };
  return { led, boards, update };
}
