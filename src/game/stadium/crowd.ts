import * as THREE from 'three';
import { at } from './path';
import type { SeatSpot, StandsResult } from './stands';
import type { StadiumContext, StadiumSpec } from './types';

/**
 * The crowd: one camera-facing billboard per fan, drawn in a single instanced draw call. Each fan
 * knows which group it belongs to (home / away / staff) and where it sits round the ground, so the
 * shader can make sections react differently: standing as play nears the line, jumping with arms
 * up for a try, heads in hands for a miss, and a Mexican wave that sweeps round in quiet spells.
 * Far-away fans drop the texture detail (flat shirt colour) to save fill-rate.
 */
export type CrowdUniforms = {
  uTime: { value: number };
  uRight: { value: THREE.Vector3 };
  uExcite: { value: number };
  /** cheering: x = home, y = away */
  uCheer: { value: THREE.Vector2 };
  /** dismay (heads in hands): x = home, y = away */
  uSad: { value: THREE.Vector2 };
  /** Mexican wave: x = angle of the wave front (radians), y = strength 0..1 */
  uWave: { value: THREE.Vector2 };
  uAtlas: { value: THREE.Texture };
};

const POSES = 3; // arms down, arms up, hands on head

/** Billboard atlas: 2 body shapes x 3 poses. R = shirt, G = skin, B = hair. */
function fanAtlas() {
  const c = document.createElement('canvas');
  c.width = 64 * 2 * POSES;
  c.height = 128;
  const g = c.getContext('2d')!;
  for (let pose = 0; pose < POSES; pose++)
    for (let body = 0; body < 2; body++) {
      const ox = (pose * 2 + body) * 64;
      const sw = body ? 44 : 36;
      g.fillStyle = 'rgb(255,0,0)';
      g.beginPath();
      g.roundRect(ox + 32 - sw / 2, 52, sw, 76, 10);
      g.fill();
      if (pose === 1) {
        // arms straight up, hands showing
        g.fillRect(ox + 32 - sw / 2 - 8, 14, 9, 48);
        g.fillRect(ox + 32 + sw / 2 - 1, 14, 9, 48);
        g.fillStyle = 'rgb(0,255,0)';
        g.fillRect(ox + 32 - sw / 2 - 8, 6, 9, 12);
        g.fillRect(ox + 32 + sw / 2 - 1, 6, 9, 12);
      } else if (pose === 2) {
        // elbows out, hands on the head
        g.fillRect(ox + 32 - sw / 2 - 10, 34, 9, 26);
        g.fillRect(ox + 32 + sw / 2 + 1, 34, 9, 26);
        g.fillRect(ox + 32 - sw / 2 - 6, 26, 16, 8);
        g.fillRect(ox + 32 + sw / 2 - 10, 26, 16, 8);
      } else {
        g.fillRect(ox + 32 - sw / 2 - 7, 56, 9, 40);
        g.fillRect(ox + 32 + sw / 2 - 2, 56, 9, 40);
      }
      g.fillStyle = 'rgb(0,255,0)';
      g.beginPath();
      g.ellipse(ox + 32, 38, 11, 13, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgb(0,0,255)';
      g.beginPath();
      g.ellipse(ox + 32, 30, 11, 7, 0, Math.PI, Math.PI * 2);
      g.fill();
      if (pose === 2) {
        // hands over the hair
        g.fillStyle = 'rgb(0,255,0)';
        g.fillRect(ox + 32 - 14, 22, 10, 8);
        g.fillRect(ox + 32 + 4, 22, 10, 8);
      }
    }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

let ATLAS: THREE.Texture | null = null;

/**
 * Camera-facing fan billboards. `groups` (0 home, 1 away, 2 staff/neutral) and `angles` (around
 * the ground, radians) are optional; without them everyone is a neutral home fan.
 */
export function makeCrowd(offsets: number[], colors: number[], params: number[], groups?: number[], angles?: number[]) {
  const n = offsets.length / 3;
  const base = new THREE.PlaneGeometry(0.62, 1.1);
  base.translate(0, 0.55, 0);
  const cg = new THREE.InstancedBufferGeometry();
  cg.index = base.index;
  cg.setAttribute('position', base.attributes.position);
  cg.setAttribute('uv', base.attributes.uv);
  cg.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  cg.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
  cg.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(params), 3));
  cg.setAttribute('aGroup', new THREE.InstancedBufferAttribute(new Float32Array(groups ?? new Array(n).fill(2)), 1));
  cg.setAttribute('aAngle', new THREE.InstancedBufferAttribute(new Float32Array(angles ?? new Array(n).fill(0)), 1));
  cg.instanceCount = n;
  ATLAS ??= fanAtlas();
  const uniforms: CrowdUniforms = {
    uTime: { value: 0 },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uExcite: { value: 0 },
    uCheer: { value: new THREE.Vector2() },
    uSad: { value: new THREE.Vector2() },
    uWave: { value: new THREE.Vector2() },
    uAtlas: { value: ATLAS },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float uTime; uniform float uExcite; uniform vec3 uRight;
      uniform vec2 uCheer; uniform vec2 uSad; uniform vec2 uWave;
      attribute vec3 aOffset; attribute vec3 aColor; attribute vec3 aParams; attribute float aGroup; attribute float aAngle;
      varying vec2 vUv; varying vec3 vColor; varying float vSkin; varying float vShade; varying float vFar;
      float hash(float x){ return fract(sin(x * 91.17) * 43758.5453); }
      void main() {
        float ph = aParams.x;
        float home = aGroup < 0.5 ? 1.0 : 0.0;
        float away = aGroup > 0.5 && aGroup < 1.5 ? 1.0 : 0.0;
        float cheer = home * uCheer.x + away * uCheer.y;
        float sad = home * uSad.x + away * uSad.y;
        // Mexican wave: fans near the wave front stand with arms up
        float dA = abs(mod(aAngle - uWave.x + 3.14159, 6.28318) - 3.14159);
        float wave = uWave.y * smoothstep(0.45, 0.0, dA);
        // general excitement: more fans on their feet as play nears the line
        float standX = step(0.55 - uExcite * 0.5, hash(ph * 13.0 + floor(uTime * 0.25)));
        float stand = max(max(standX * step(0.25, uExcite), cheer), wave);
        float sway = sin(uTime * (1.2 + ph) + ph * 6.28) * 0.015;
        float bob = max(0.0, sin(uTime * (2.2 + ph * 1.5) + ph * 6.2831)) * (0.03 + uExcite * 0.22);
        float jump = abs(sin(uTime * (7.0 + ph * 3.0) + ph * 6.28)) * 0.28 * cheer;
        float armsUp = max(max(step(0.5, cheer) * step(0.25, hash(ph * 7.0)), wave * step(0.2, hash(ph * 3.0))),
                           step(0.78 - uExcite * 0.5, fract(ph * 7.31 + floor(uTime * (0.4 + uExcite)) * 0.37)) * step(0.35, uExcite));
        float onHead = step(0.3, sad) * step(0.25, hash(ph * 5.0)) * (1.0 - armsUp);
        float pose = onHead > 0.5 ? 2.0 : (armsUp > 0.5 ? 1.0 : 0.0);
        vec3 world = aOffset + uRight * (position.x + sway) + vec3(0.0, position.y + bob + jump + stand * 0.3, 0.0);
        vUv = vec2((uv.x + aParams.y + pose * 2.0) / ${(POSES * 2).toFixed(1)}, uv.y);
        vColor = aColor;
        vSkin = aParams.z;
        vShade = 0.6 + 0.4 * clamp(aOffset.y / 20.0, 0.0, 1.0);
        vec4 mv = viewMatrix * vec4(world, 1.0);
        vFar = smoothstep(90.0, 140.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uAtlas;
      varying vec2 vUv; varying vec3 vColor; varying float vSkin; varying float vShade; varying float vFar;
      void main() {
        vec4 t = texture2D(uAtlas, vUv);
        if (t.a < 0.5) discard;
        vec3 skin = mix(vec3(0.95, 0.75, 0.6), vec3(0.35, 0.22, 0.14), vSkin);
        vec3 hair = vec3(0.08, 0.06, 0.05) + vSkin * 0.05;
        vec3 c = vColor * t.r + skin * t.g + hair * t.b;
        // far away: flat shirt colour (cheaper to read, no shimmer)
        c = mix(c, vColor * 0.9, vFar);
        gl_FragColor = vec4(c * vShade, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(cg, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

const BUDGET = { low: 3500, medium: 9000, high: 18000 } as const;

export interface CrowdResult {
  uniforms: CrowdUniforms;
  /** before a night kick-off: phone torches on */
  setTorches(on: boolean): void;
  update(time: number, dt: number): void;
}

/**
 * Seat the crowd from the stands' seat grid: fill from the spec and the match's importance, home
 * colours in the majority, the away fans together behind one end; flags waving in the stands,
 * banners on the stand fronts, and phone torches for night kick-offs.
 */
export function buildCrowd(group: THREE.Group, stands: StandsResult, spec: StadiumSpec, ctx: StadiumContext): CrowdResult {
  const seats = stands.seats;
  const low = ctx.quality.level === 'low';
  const fill = Math.min(1, spec.fill * (0.55 + 0.45 * ctx.importance) + 0.04);
  const budget = BUDGET[ctx.quality.level];
  const stride = Math.max(1, (seats.length * fill) / budget);
  const home = [ctx.home.primary, ctx.home.primary, ctx.home.secondary, ctx.home.primary].map((c) => new THREE.Color(c));
  const away = [ctx.away.primary, ctx.away.primary, ctx.away.secondary].map((c) => new THREE.Color(c));
  const neutrals = ['#2b3346', '#4a5366', '#6b7280', '#1f2937', '#8a8f9c', '#b33a3a', '#e8e4da'].map((c) => new THREE.Color(c));
  // the away end: the left end if it has seats, else one corner of the main stand
  const awaySide = seats.some((s) => s.side === 'endL') ? 'endL' : null;
  const isAway = (s: SeatSpot) => (awaySide ? s.side === awaySide : s.side === 'main' && s.u < 0.12);
  const offsets: number[] = [];
  const colors: number[] = [];
  const params: number[] = [];
  const groups: number[] = [];
  const angles: number[] = [];
  const fans: { x: number; y: number; z: number; away: boolean }[] = [];
  let acc = Math.random() * stride;
  for (const s of seats) {
    acc += 1;
    if (acc < stride) continue;
    acc -= stride;
    if (Math.random() > fill) continue;
    const aw = isAway(s);
    offsets.push(s.x, s.y + (s.standing ? 0.05 : -0.12), s.z);
    const pal = aw ? away : home;
    const c = (Math.random() < 0.8 ? pal[Math.floor(Math.random() * pal.length)] : neutrals[Math.floor(Math.random() * neutrals.length)]).clone();
    c.multiplyScalar(0.75 + Math.random() * 0.3);
    colors.push(c.r, c.g, c.b);
    params.push(Math.random(), Math.random() < 0.5 ? 0 : 1, Math.random());
    groups.push(aw ? 1 : 0);
    angles.push(Math.atan2(s.z, s.x));
    fans.push({ x: s.x, y: s.y, z: s.z, away: aw });
  }
  const crowd = makeCrowd(offsets, colors, params, groups, angles);
  group.add(crowd.mesh);

  // ---------------------------------------------------------------- flags waving in the stands
  const flagU = { uTime: { value: 0 } };
  if (!low && fans.length) {
    const picks = fans.filter((_, i) => i % 45 === 7);
    const geo = new THREE.PlaneGeometry(1.1, 0.7, 6, 1);
    geo.translate(0.55, 1.75, 0);
    const n = picks.length;
    const cA: number[] = [];
    const cB: number[] = [];
    const im = new THREE.InstancedBufferGeometry();
    im.index = geo.index;
    im.setAttribute('position', geo.attributes.position);
    im.setAttribute('uv', geo.attributes.uv);
    const off: number[] = [];
    picks.forEach((f) => {
      off.push(f.x, f.y, f.z, Math.atan2(-f.z, -f.x));
      const p = f.away ? ctx.away : ctx.home;
      const a = new THREE.Color(p.primary);
      const b = new THREE.Color(p.secondary);
      cA.push(a.r, a.g, a.b);
      cB.push(b.r, b.g, b.b);
    });
    im.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(off), 4));
    im.setAttribute('aA', new THREE.InstancedBufferAttribute(new Float32Array(cA), 3));
    im.setAttribute('aB', new THREE.InstancedBufferAttribute(new Float32Array(cB), 3));
    im.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: flagU,
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime; attribute vec4 aOff; attribute vec3 aA; attribute vec3 aB;
        varying vec3 vA; varying vec3 vB; varying vec2 vUv;
        void main() {
          // waved back and forth on a stick: the whole flag swings, the cloth ripples
          float swing = sin(uTime * 3.0 + aOff.x) * 0.9;
          float ang = aOff.w + 1.5708 + swing * 0.5;
          float along = position.x;
          float ripple = sin(uTime * 9.0 - along * 7.0 + aOff.z) * 0.12 * along;
          vec3 p = vec3(cos(ang) * along - sin(ang) * ripple, position.y, sin(ang) * along + cos(ang) * ripple);
          vUv = uv; vA = aA; vB = aB;
          gl_Position = projectionMatrix * viewMatrix * vec4(aOff.xyz + p, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vA; varying vec3 vB; varying vec2 vUv;
        void main() {
          vec3 c = vUv.y > 0.66 || vUv.y < 0.33 ? vA : vB;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const flags = new THREE.Mesh(im, mat);
    flags.frustumCulled = false;
    group.add(flags);
  }

  // ---------------------------------------------------------------- banners on the stand fronts
  if (!low) {
    const banners: { x: number; z: number; ang: number; away: boolean }[] = [];
    for (const run of stands.runs) {
      let next = 8 + Math.random() * 10;
      for (const p of run.path.pts) {
        if (run.tiersAt(p) === 0 || p.s < next) continue;
        next = p.s + 22 + Math.random() * 30;
        const [x, z] = at(p, -0.3);
        banners.push({ x, z, ang: Math.atan2(p.nx, p.nz), away: awaySide ? p.side === awaySide : false });
      }
    }
    const texHome = bannerTexture(ctx.home.primary, ctx.home.secondary, ctx.homeName ?? 'HOME');
    const texAway = bannerTexture(ctx.away.primary, ctx.away.secondary, ctx.awayName ?? 'AWAY');
    // one instanced draw per side's banner design
    for (const away of [false, true]) {
      const list = banners.filter((b) => b.away === away);
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(5, 1), new THREE.MeshStandardMaterial({ map: away ? texAway : texHome, roughness: 0.9, side: THREE.DoubleSide }), list.length);
      const m = new THREE.Matrix4();
      list.forEach((b, i) => {
        m.compose(new THREE.Vector3(b.x, 0.75, b.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.ang + Math.PI), new THREE.Vector3(1, 1, 1));
        im.setMatrixAt(i, m);
      });
      group.add(im);
    }
  }

  // ---------------------------------------------------------------- phone torches (night, before kick-off)
  const torchU = { uTime: { value: 0 }, uOn: { value: 0 }, uScale: { value: 1 } };
  if (fans.length && ctx.time === 'night') {
    const picks = fans.filter((_, i) => i % (low ? 9 : 4) === 1);
    const pos = new Float32Array(picks.length * 3);
    const seed = new Float32Array(picks.length);
    picks.forEach((f, i) => {
      pos.set([f.x, f.y + 1.35, f.z], i * 3);
      seed[i] = Math.random() * 100;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: torchU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSeed; uniform float uTime; uniform float uScale; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float w = 0.7 + 0.3 * sin(uTime * (3.0 + fract(aSeed) * 4.0) + aSeed);
          vA = clamp(w, 0.0, 1.0);
          gl_PointSize = uScale * 130.0 / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uOn; varying float vA;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = clamp(smoothstep(0.5, 0.0, r), 0.0, 1.0);
          a = clamp(a * a * vA * uOn, 0.0, 1.0);
          gl_FragColor = vec4(vec3(1.0, 0.98, 0.92) * a, a);
        }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    group.add(pts);
  }

  // ---------------------------------------------------------------- the Mexican wave
  let quiet = 0;
  let waveT = -1;
  let torchTarget = 0;
  return {
    uniforms: crowd.uniforms,
    setTorches(on) {
      torchTarget = on ? 1 : 0;
    },
    update(time, dt) {
      flagU.uTime.value = time;
      torchU.uTime.value = time;
      torchU.uOn.value += (torchTarget - torchU.uOn.value) * Math.min(1, dt * 2);
      torchU.uScale.value = Math.min(window.devicePixelRatio || 1, 2);
      const ex = crowd.uniforms.uExcite.value;
      const cheering = crowd.uniforms.uCheer.value.x + crowd.uniforms.uCheer.value.y > 0.05;
      quiet = ex < 0.15 && !cheering ? quiet + dt : 0;
      if (waveT < 0 && quiet > 28 && Math.random() < dt * 0.1) waveT = 0;
      if (waveT >= 0) {
        waveT += dt;
        const dur = 14;
        crowd.uniforms.uWave.value.set(waveT * 0.9, Math.min(1, waveT, (dur - waveT) * 0.8));
        if (waveT > dur || cheering || ex > 0.4) {
          waveT = -1;
          quiet = 0;
          crowd.uniforms.uWave.value.set(0, 0);
        }
      }
    },
  };
}

/** Striped home-made banner with the side's name (original designs, no crests). */
function bannerTexture(a: string, b: string, text: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 52;
  const g = c.getContext('2d')!;
  g.fillStyle = a;
  g.fillRect(0, 0, 256, 52);
  g.fillStyle = b;
  g.fillRect(0, 0, 256, 8);
  g.fillRect(0, 44, 256, 8);
  g.font = '900 30px Arial Black, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 4;
  g.strokeStyle = b;
  g.strokeText(text.toUpperCase(), 128, 27);
  g.fillStyle = '#ffffff';
  g.fillText(text.toUpperCase(), 128, 27);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
