import * as THREE from 'three';
import { makeCrowd } from './crowd';
import type { StandsResult } from './stands';
import type { StadiumContext, StadiumSpec } from './types';
import { flagTexture } from '../../sponsors/textures';

export interface PitchsideResult {
  /** wind for the flags (m/s, x and z) */
  setWind(x: number, z: number): void;
  update(time: number, camera: THREE.Camera): void;
}

/**
 * Around the pitch: corner / 22 m / halfway flags that flutter in the match wind, photographers
 * behind the dead-ball lines, ball kids in hi-vis on the touchlines, a TV gantry under the main
 * stand roof and, on big occasions, an inflatable tunnel from the players' tunnel to the pitch.
 */
export function buildPitchside(group: THREE.Group, spec: StadiumSpec, ctx: StadiumContext, stands: StandsResult | null): PitchsideResult {
  const low = ctx.quality.level === 'low';

  // ---------------------------------------------------------------- flags
  const flagU = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(2, 0) }, uColor: { value: new THREE.Color(ctx.home.primary) }, uMap: { value: (ctx.sponsors ? flagTexture(ctx.sponsors.flags) : null) as THREE.Texture | null }, uUseMap: { value: ctx.sponsors ? 1 : 0 } };
  const flagMat = new THREE.ShaderMaterial({
    uniforms: flagU,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform vec2 uWind;
      varying float vShade; varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        // cloth hangs from the pole (x = 0) and streams downwind; ripples run along it
        float along = clamp(p.x / 0.55, 0.0, 1.0);
        float strength = clamp(length(uWind) / 8.0, 0.15, 1.0);
        float wave = sin(uTime * (5.0 + strength * 6.0) - p.x * 9.0 + instanceMatrix[3].x) * 0.09 * along * (0.4 + strength);
        vec2 dir = length(uWind) > 0.01 ? normalize(uWind) : vec2(1.0, 0.0);
        vec3 world = (instanceMatrix * vec4(0.0, p.y, 0.0, 1.0)).xyz;
        world.x += dir.x * p.x * strength + (-dir.y) * wave;
        world.z += dir.y * p.x * strength + dir.x * wave;
        world.y -= along * (1.0 - strength) * 0.25;
        vShade = 0.8 + 0.2 * sin(uTime * 7.0 - p.x * 9.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform sampler2D uMap; uniform float uUseMap; varying float vShade; varying vec2 vUv;
      void main() {
        vec3 c = uUseMap > 0.5 ? texture2D(uMap, vUv).rgb : uColor;
        gl_FragColor = vec4(c * vShade, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const flagGeo = new THREE.PlaneGeometry(0.55, 0.4, 6, 1);
  flagGeo.translate(0.275, 1.38, 0);
  const flagSpots: [number, number][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const x of [50, 60, 28, 0]) if (!(x === 0 && sx < 0)) flagSpots.push([sx * x, sz * 35.6]);
  const flags = new THREE.InstancedMesh(flagGeo, flagMat, flagSpots.length);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), new THREE.MeshStandardMaterial({ color: '#f4f4f0' }), flagSpots.length);
  flagSpots.forEach(([x, z], i) => {
    flags.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z));
    poles.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.8, z));
  });
  flags.frustumCulled = false;
  group.add(flags, poles);

  // ---------------------------------------------------------------- people pitchside (billboards)
  let peopleU: { uTime: { value: number }; uRight: { value: THREE.Vector3 } } | null = null;
  const offsets: number[] = [];
  const colors: number[] = [];
  const params: number[] = [];
  const person = (x: number, z: number, col: string, crouch = false) => {
    offsets.push(x, crouch ? -0.35 : 0, z);
    const c = new THREE.Color(col).multiplyScalar(0.85 + Math.random() * 0.2);
    colors.push(c.r, c.g, c.b);
    params.push(Math.random(), Math.random() < 0.5 ? 0 : 1, Math.random());
  };
  const big = spec.tier !== 'club';
  // photographers crouched behind the dead-ball lines, in black with grey camera boxes
  const camBoxes: THREE.Matrix4[] = [];
  if (spec.layout !== 'fields') {
    const per = low ? 4 : big ? 9 : 5;
    for (const sx of [-1, 1])
      for (let i = 0; i < per; i++) {
        const z = -24 + (48 * (i + 0.5)) / per + (Math.random() - 0.5) * 2;
        const x = sx * 61.6;
        person(x, z, '#1a1d24', true);
        camBoxes.push(new THREE.Matrix4().compose(new THREE.Vector3(x - sx * 0.45, 0.55, z), new THREE.Quaternion(), new THREE.Vector3(0.32, 0.22, 0.22)));
      }
    // ball kids in hi-vis along both touchlines
    for (const sz of [-1, 1]) for (const x of [-40, -12, 18, 44]) person(x + (Math.random() - 0.5) * 6, sz * 38.4, '#e8f03a');
  }
  if (offsets.length) {
    const people = makeCrowd(offsets, colors, params);
    group.add(people.mesh);
    peopleU = people.uniforms;
  }
  if (camBoxes.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#3a3f48', roughness: 0.5, metalness: 0.5 }), camBoxes.length);
    camBoxes.forEach((m, i) => im.setMatrixAt(i, m));
    group.add(im);
  }

  // ---------------------------------------------------------------- TV gantry under the main roof
  if (stands && spec.layout !== 'fields' && big) {
    const main = stands.runs.find((r) => r.path.pts.some((p) => p.side === 'main' && r.tiersAt(p) > 0));
    if (main) {
      const top = main.topY;
      const g = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 2.2), new THREE.MeshStandardMaterial({ color: '#2b2f37', roughness: 0.7 }));
      g.add(deck);
      for (const x of [-5, 0, 5]) {
        const cam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: '#1b1e24', roughness: 0.4, metalness: 0.4 }));
        cam.position.set(x, 0.55, 0.3);
        g.add(cam);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: '#d0d4da' }));
      rail.position.set(0, 1, -1.1);
      g.add(rail);
      g.position.set(0, top + 2.6, stands.front.main - main.backD + 6);
      group.add(g);
    }
  }

  // ---------------------------------------------------------------- inflatable tunnel on big days
  if (stands && ctx.importance >= 0.85 && spec.layout !== 'fields' && !low) {
    const from = stands.front.main;
    const to = -35.8;
    const len = from < to ? to - from : 0;
    if (len > 2) {
      const n = Math.max(3, Math.round(len / 1.4));
      const home = new THREE.MeshStandardMaterial({ color: ctx.home.primary, roughness: 0.55 });
      const trim = new THREE.MeshStandardMaterial({ color: ctx.home.secondary, roughness: 0.55 });
      const arch = new THREE.TorusGeometry(2.1, 0.32, 8, 18, Math.PI);
      for (const [mat, odd] of [[home, 0], [trim, 1]] as const) {
        const idx = Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === odd);
        const im = new THREE.InstancedMesh(arch, mat, idx.length);
        idx.forEach((i, k) => im.setMatrixAt(k, new THREE.Matrix4().makeTranslation(0, 0, from + 0.4 + (i * (len - 0.4)) / (n - 1))));
        group.add(im);
      }
    }
  }

  const right = new THREE.Vector3();
  return {
    setWind(x, z) {
      flagU.uWind.value.set(x, z);
    },
    update(time, camera) {
      flagU.uTime.value = time;
      if (peopleU) {
        peopleU.uTime.value = time;
        camera.getWorldDirection(right);
        right.set(-right.z, 0, right.x).normalize();
        peopleU.uRight.value.copy(right);
      }
    },
  };
}
