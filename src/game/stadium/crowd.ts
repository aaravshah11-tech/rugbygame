import * as THREE from 'three';
import { fanAtlas } from './textures';
import type { SeatSpot } from './stands';
import type { StadiumContext, StadiumSpec } from './types';

/** Camera-facing crowd billboards: one instance per spectator (offset, shirt colour, params). */
export function makeCrowd(offsets: number[], colors: number[], params: number[]) {
  const base = new THREE.PlaneGeometry(0.62, 1.1);
  base.translate(0, 0.55, 0);
  const cg = new THREE.InstancedBufferGeometry();
  cg.index = base.index;
  cg.setAttribute('position', base.attributes.position);
  cg.setAttribute('uv', base.attributes.uv);
  cg.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  cg.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
  cg.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(params), 3));
  cg.instanceCount = offsets.length / 3;
  const crowdUniforms = {
    uTime: { value: 0 },
    uExcite: { value: 0 },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uAtlas: { value: fanAtlas() },
  };
  const crowdMat = new THREE.ShaderMaterial({
    uniforms: crowdUniforms,
    vertexShader: `
      uniform float uTime; uniform float uExcite; uniform vec3 uRight;
      attribute vec3 aOffset; attribute vec3 aColor; attribute vec3 aParams;
      varying vec2 vUv; varying vec3 vColor; varying float vSkin; varying float vShade;
      void main() {
        float ph = aParams.x;
        float bob = max(0.0, sin(uTime * (2.2 + ph * 1.5) + ph * 6.2831)) * (0.03 + uExcite * 0.32);
        float up = step(0.75 - uExcite * 0.6, fract(ph * 7.31 + floor(uTime * (0.4 + uExcite)) * 0.37)) * step(0.12, uExcite);
        vec3 world = aOffset + uRight * position.x + vec3(0.0, position.y + bob, 0.0);
        vUv = vec2((uv.x + aParams.y + up * 2.0) / 4.0, uv.y);
        vColor = aColor;
        vSkin = aParams.z;
        vShade = 0.6 + 0.4 * clamp(aOffset.y / 20.0, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uAtlas;
      varying vec2 vUv; varying vec3 vColor; varying float vSkin; varying float vShade;
      void main() {
        vec4 t = texture2D(uAtlas, vUv);
        if (t.a < 0.5) discard;
        vec3 skin = mix(vec3(0.95, 0.75, 0.6), vec3(0.35, 0.22, 0.14), vSkin);
        vec3 hair = vec3(0.08, 0.06, 0.05) + vSkin * 0.05;
        vec3 c = vColor * t.r + skin * t.g + hair * t.b;
        gl_FragColor = vec4(c * vShade, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const crowd = new THREE.Mesh(cg, crowdMat);
  crowd.frustumCulled = false;
  return { mesh: crowd, uniforms: crowdUniforms };
}


const BUDGET = { low: 3500, medium: 9000, high: 18000 } as const;

/**
 * Seat the crowd: fill from the spec and the match's importance, home colours in the majority,
 * the away fans grouped together behind one end. Only as many fans as the graphics setting allows
 * (each one stands for a few real seats).
 */
export function buildCrowd(group: THREE.Group, seats: SeatSpot[], spec: StadiumSpec, ctx: StadiumContext) {
  const fill = Math.min(1, spec.fill * (0.55 + 0.45 * ctx.importance) + 0.04);
  const budget = BUDGET[ctx.quality.level];
  const stride = Math.max(1, (seats.length * fill) / budget);
  const home = [ctx.home.primary, ctx.home.primary, ctx.home.secondary, ctx.home.primary].map((c) => new THREE.Color(c));
  const away = [ctx.away.primary, ctx.away.primary, ctx.away.secondary].map((c) => new THREE.Color(c));
  const neutrals = ['#2b3346', '#4a5366', '#6b7280', '#1f2937', '#8a8f9c', '#b33a3a', '#e8e4da'].map((c) => new THREE.Color(c));
  // away end: the left end if it has seats, else one corner of the main stand
  const awaySide = seats.some((s) => s.side === 'endL') ? 'endL' : null;
  const isAway = (s: SeatSpot) => (awaySide ? s.side === awaySide : s.side === 'main' && s.u < 0.12);
  const offsets: number[] = [];
  const colors: number[] = [];
  const params: number[] = [];
  let acc = Math.random() * stride;
  for (const s of seats) {
    acc += 1;
    if (acc < stride) continue;
    acc -= stride;
    if (Math.random() > fill) continue;
    offsets.push(s.x, s.y + (s.standing ? 0.05 : -0.12), s.z);
    const pal = isAway(s) ? away : home;
    const c = (Math.random() < 0.8 ? pal[Math.floor(Math.random() * pal.length)] : neutrals[Math.floor(Math.random() * neutrals.length)]).clone();
    c.multiplyScalar(0.75 + Math.random() * 0.3);
    colors.push(c.r, c.g, c.b);
    params.push(Math.random(), Math.random() < 0.5 ? 0 : 1, Math.random());
  }
  const crowd = makeCrowd(offsets, colors, params);
  group.add(crowd.mesh);
  return crowd;
}
