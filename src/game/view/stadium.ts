import * as THREE from 'three';
import type { QualityPreset } from './quality';

/** Original, made-up sponsor names for the LED boards. */
export const SPONSORS = ['VOLTARA', 'IRONBARK ALES', 'QUASAR MOBILE', 'ZEPHYRA AIR', 'BOLTWAVE', 'SUMMIT TYRES', 'HEXA ENERGY', 'PULSEFIT', 'TRY LINE', 'NORTHGATE BANK', 'KESTREL WATCHES'];

// Rounded-rectangle bowl around the pitch.
const A = 70; // half length to the inner corner arcs
const BZ = 50; // half width
const RC = 22; // corner radius

interface RingPt {
  cx: number;
  cz: number;
  dx: number;
  dz: number;
}

/** Fixed parameterisation so every ring has the same vertex count and strips line up. */
function ringParams(): RingPt[] {
  const pts: RingPt[] = [];
  const corners: [number, number, number][] = [
    [A - RC, BZ - RC, 0],
    [-(A - RC), BZ - RC, Math.PI / 2],
    [-(A - RC), -(BZ - RC), Math.PI],
    [A - RC, -(BZ - RC), (3 * Math.PI) / 2],
  ];
  const ARC = 9;
  const STRAIGHT = [14, 10, 14, 10];
  corners.forEach(([cx, cz, a0], i) => {
    for (let k = 0; k <= ARC; k++) {
      const a = a0 + (k / ARC) * (Math.PI / 2);
      pts.push({ cx, cz, dx: Math.cos(a), dz: Math.sin(a) });
    }
    const [nx, nz] = corners[(i + 1) % 4];
    const a1 = a0 + Math.PI / 2;
    const dir = { dx: Math.cos(a1), dz: Math.sin(a1) };
    for (let k = 1; k < STRAIGHT[i]; k++) {
      const t = k / STRAIGHT[i];
      pts.push({ cx: cx + (nx - cx) * t, cz: cz + (nz - cz) * t, ...dir });
    }
  });
  return pts;
}

const RING = ringParams();
const ringPoint = (p: RingPt, d: number) => [p.cx + (RC + d) * p.dx, p.cz + (RC + d) * p.dz] as const;

class StripBuilder {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  /** quad strip between ring (d0,y0) and ring (d1,y1) */
  strip(d0: number, y0: number, d1: number, y1: number, color: THREE.Color, uvScale = 0) {
    const n = RING.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = RING[i];
      const b = RING[(i + 1) % n];
      const [ax0, az0] = ringPoint(a, d0);
      const [bx0, bz0] = ringPoint(b, d0);
      const [ax1, az1] = ringPoint(a, d1);
      const [bx1, bz1] = ringPoint(b, d1);
      const seg = Math.hypot(bx0 - ax0, bz0 - az0);
      const u0 = s * uvScale;
      const u1 = (s + seg) * uvScale;
      s += seg;
      this.pos.push(ax0, y0, az0, bx0, y0, bz0, bx1, y1, bz1, ax0, y0, az0, bx1, y1, bz1, ax1, y1, az1);
      this.uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
      for (let k = 0; k < 6; k++) this.col.push(color.r, color.g, color.b);
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
}

interface Tier {
  d: number;
  y: number;
  rows: number;
  depth: number;
  riser: number;
}
const LOWER: Tier = { d: 0, y: 1.3, rows: 16, depth: 0.85, riser: 0.42 };
const UPPER: Tier = { d: 12.5, y: 12.4, rows: 16, depth: 0.9, riser: 0.56 };

function ledTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#04060b';
  g.fillRect(0, 0, 2048, 64);
  g.font = 'italic 900 38px Arial Black, Arial, sans-serif';
  g.textBaseline = 'middle';
  const colors = ['#c6ff1a', '#21e6c1', '#ffffff', '#ff3d6e', '#ffc83d'];
  let x = 16;
  let i = 0;
  while (x < 2048) {
    const w = SPONSORS[i % SPONSORS.length];
    g.fillStyle = colors[i % colors.length];
    g.fillText(w, x, 34);
    x += g.measureText(w).width + 70;
    i++;
  }
  // LED pixel grid
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 0; y < 64; y += 3) g.fillRect(0, y, 2048, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function fanAtlas() {
  // 4 cells: 2 body variants x (arms down, arms up). R = shirt, G = skin, B = hair.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  for (let cell = 0; cell < 4; cell++) {
    const ox = cell * 64;
    const up = cell >= 2;
    const wide = cell % 2 === 1;
    const sw = wide ? 44 : 36;
    // torso (shirt)
    g.fillStyle = 'rgb(255,0,0)';
    g.beginPath();
    g.roundRect(ox + 32 - sw / 2, 52, sw, 76, 10);
    g.fill();
    // arms
    if (up) {
      g.fillRect(ox + 32 - sw / 2 - 8, 14, 9, 48);
      g.fillRect(ox + 32 + sw / 2 - 1, 14, 9, 48);
      g.fillStyle = 'rgb(0,255,0)';
      g.fillRect(ox + 32 - sw / 2 - 8, 6, 9, 12);
      g.fillRect(ox + 32 + sw / 2 - 1, 6, 9, 12);
    } else {
      g.fillRect(ox + 32 - sw / 2 - 7, 56, 9, 40);
      g.fillRect(ox + 32 + sw / 2 - 2, 56, 9, 40);
    }
    // head
    g.fillStyle = 'rgb(0,255,0)';
    g.beginPath();
    g.ellipse(ox + 32, 38, 11, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgb(0,0,255)';
    g.beginPath();
    g.ellipse(ox + 32, 30, 11, 7, 0, Math.PI, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,245,1)');
  rg.addColorStop(0.15, 'rgba(255,250,225,0.8)');
  rg.addColorStop(0.45, 'rgba(255,240,200,0.18)');
  rg.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
export const GLOW_TEX = (() => {
  let t: THREE.Texture | null = null;
  return () => (t ??= glowTexture());
})();

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){
        float h = vDir.y;
        vec3 zenith = vec3(0.025,0.04,0.12);
        vec3 mid = vec3(0.09,0.11,0.28);
        vec3 horizon = vec3(0.95,0.48,0.25);
        vec3 c = mix(mid, zenith, smoothstep(0.08, 0.6, h));
        float sunDir = max(0.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(-0.6,0.0,-0.8))));
        float glow = exp(-max(h,0.0) * 9.0) * (0.35 + 0.65 * pow(sunDir, 3.0));
        c = mix(c, horizon, clamp(glow, 0.0, 1.0));
        if (h < 0.0) c = mix(horizon * 0.25, vec3(0.02,0.03,0.05), clamp(-h * 6.0, 0.0, 1.0));
        float s = step(0.9975, hash(floor(vDir * 380.0))) * smoothstep(0.2, 0.6, h);
        c += vec3(s * 0.7);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export interface StadiumView {
  key: THREE.DirectionalLight;
  update(time: number, excite: number, camera: THREE.Camera): void;
}

export function buildStadium(scene: THREE.Scene, renderer: THREE.WebGLRenderer, q: QualityPreset, crowdColors: string[]): StadiumView {
  const group = new THREE.Group();
  scene.add(group);

  // ---------- sky + image-based lighting
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMaterial());
  scene.add(sky);
  scene.background = new THREE.Color('#0b1024');
  {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial()));
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 8, 7) });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 2), lampMat);
      lamp.position.set(x * 60, 45, z * 50);
      lamp.lookAt(0, 0, 0);
      envScene.add(lamp);
    }
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: '#1f4a1d' }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -1;
    envScene.add(grass);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  // ---------- lights: hemisphere + floodlight "sun" with shadows
  scene.add(new THREE.HemisphereLight('#9fb6ff', '#25401f', 0.55));
  const key = new THREE.DirectionalLight('#fff4e2', 2.6);
  key.position.set(-35, 70, 45);
  key.castShadow = q.shadows;
  key.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
  const sc = key.shadow.camera;
  sc.left = -22;
  sc.right = 22;
  sc.top = 22;
  sc.bottom = -22;
  sc.near = 10;
  sc.far = 160;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key, key.target);
  const fill1 = new THREE.DirectionalLight('#dfe8ff', 0.9);
  fill1.position.set(50, 60, -40);
  const fill2 = new THREE.DirectionalLight('#ffe9d0', 0.6);
  fill2.position.set(40, 50, 50);
  scene.add(fill1, fill2);

  // ---------- the bowl
  const sb = new StripBuilder();
  const seatA = new THREE.Color('#1b2438');
  const seatB = new THREE.Color('#232f4a');
  const concrete = new THREE.Color('#3a4050');
  sb.strip(-0.5, 0, -0.5, LOWER.y, concrete); // pitch-side wall
  for (const tier of [LOWER, UPPER]) {
    for (let r = 0; r < tier.rows; r++) {
      const d0 = tier.d + r * tier.depth;
      const y = tier.y + r * tier.riser;
      const c = r % 2 ? seatA : seatB;
      sb.strip(d0, y, d0 + tier.depth, y, c);
      sb.strip(d0 + tier.depth, y, d0 + tier.depth, y + tier.riser, c.clone().multiplyScalar(0.8));
    }
  }
  const lowerTop = LOWER.y + LOWER.rows * LOWER.riser;
  const lowerBack = LOWER.d + LOWER.rows * LOWER.depth;
  sb.strip(lowerBack, lowerTop, lowerBack, UPPER.y - 1.4, concrete); // concourse wall
  sb.strip(UPPER.d - 0.4, UPPER.y - 1.4, lowerBack, UPPER.y - 1.4, concrete.clone().multiplyScalar(0.6)); // overhang underside
  const upperTop = UPPER.y + UPPER.rows * UPPER.riser;
  const upperBack = UPPER.d + UPPER.rows * UPPER.depth;
  sb.strip(upperBack, upperTop, upperBack + 0.5, upperTop + 4, concrete);
  const bowl = new THREE.Mesh(sb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05, side: THREE.DoubleSide }));
  group.add(bowl);

  // LED ribbon on the front of the upper tier + roof
  const led = ledTexture();
  const ribbon = new StripBuilder();
  ribbon.strip(UPPER.d - 0.4, UPPER.y - 1.4, UPPER.d - 0.4, UPPER.y, new THREE.Color(1, 1, 1), 1 / 60);
  const ribbonMat = new THREE.MeshBasicMaterial({ map: led, side: THREE.DoubleSide });
  ribbonMat.color.setScalar(1.5);
  group.add(new THREE.Mesh(ribbon.build(), ribbonMat));

  const roof = new StripBuilder();
  roof.strip(upperBack + 0.5, upperTop + 4, 2, upperTop + 7, new THREE.Color('#141a26'));
  const roofMesh = new THREE.Mesh(roof.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }));
  group.add(roofMesh);
  const roofEdge = new StripBuilder();
  roofEdge.strip(2, upperTop + 6.6, 2, upperTop + 7.1, new THREE.Color(1, 1, 1));
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.3, 2.6) });
  group.add(new THREE.Mesh(roofEdge.build(), edgeMat));

  // ---------- crowd: instanced camera-facing billboards
  const spacing = 0.72 / q.crowdDensity;
  const offsets: number[] = [];
  const colors: number[] = [];
  const params: number[] = [];
  const palette = crowdColors.map((c) => new THREE.Color(c));
  const neutrals = ['#2b3346', '#4a5366', '#6b7280', '#1f2937', '#8a8f9c', '#b33a3a'].map((c) => new THREE.Color(c));
  for (const tier of [LOWER, UPPER]) {
    for (let r = 0; r < tier.rows; r++) {
      const d = tier.d + r * tier.depth + tier.depth * 0.35;
      const y = tier.y + r * tier.riser;
      let carry = Math.random() * spacing;
      for (let i = 0; i < RING.length; i++) {
        const [ax, az] = ringPoint(RING[i], d);
        const [bx, bz] = ringPoint(RING[(i + 1) % RING.length], d);
        const seg = Math.hypot(bx - ax, bz - az);
        let s = carry;
        while (s < seg) {
          const t = s / seg;
          if (Math.random() < 0.93) {
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
  }
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
  group.add(crowd);

  // ---------- floodlight towers with glowing lamp heads
  const towerMat = new THREE.MeshStandardMaterial({ color: '#59606e', roughness: 0.5, metalness: 0.7 });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 5.4) });
  const glowMat = new THREE.SpriteMaterial({ map: GLOW_TEX(), color: '#fff6dd', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const p of [RING[4], RING[27], RING[46], RING[69]]) {
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

  const right = new THREE.Vector3();
  return {
    key,
    update(time, excite, camera) {
      crowdUniforms.uTime.value = time;
      crowdUniforms.uExcite.value = excite;
      camera.getWorldDirection(right);
      right.set(-right.z, 0, right.x).normalize();
      crowdUniforms.uRight.value.copy(right);
      const off = (time * 0.025) % 1;
      led.offset.x = off;
      for (const b of boards) b.offset.x = off;
    },
  };
}
