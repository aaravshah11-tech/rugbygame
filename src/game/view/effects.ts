import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLOW_TEX } from './stadium';
import type { QualityPreset } from './quality';

// ------------------------------------------------------------------ post-processing
export class PostFX {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, q: QualityPreset) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.configure(q);
  }

  configure(q: QualityPreset) {
    this.renderer.setPixelRatio(q.pixelRatio);
    if (!q.bloom) {
      this.composer?.dispose();
      this.composer = null;
      this.bloom = null;
      return;
    }
    if (this.composer) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.composer?.dispose();
  }
}

// ------------------------------------------------------------------ particles (dust puffs + confetti)
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  r: number;
  g: number;
  b: number;
  kind: 0 | 1; // 0 dust, 1 confetti
}

export class Particles {
  private ps: Particle[] = [];
  private geo = new THREE.BufferGeometry();
  private points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;

  constructor(scene: THREE.Scene, private cap = 700, private scale = 1) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: { uScale: { value: 300 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float soft = smoothstep(0.5, 0.15, r); gl_FragColor = vec4(vC, vA * soft); }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  dust(x: number, z: number, strength = 1) {
    const n = Math.round(26 * strength * this.scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.5 * strength;
      const green = Math.random() < 0.55;
      this.add({
        x: x + Math.cos(a) * 0.3, y: 0.15, z: z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * s, vy: 0.8 + Math.random() * 2, vz: Math.sin(a) * s,
        life: 0, max: 0.7 + Math.random() * 0.6, size: 0.25 + Math.random() * 0.35,
        r: green ? 0.32 : 0.55, g: green ? 0.5 : 0.45, b: green ? 0.2 : 0.3, kind: 0,
      });
    }
  }

  confetti(x: number, z: number, colors: string[]) {
    const cs = colors.map((c) => new THREE.Color(c));
    const n = Math.round(260 * this.scale);
    for (let i = 0; i < n; i++) {
      const c = cs[i % cs.length];
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 6;
      this.add({
        x, y: 1 + Math.random(), z,
        vx: Math.cos(a) * s, vy: 7 + Math.random() * 7, vz: Math.sin(a) * s,
        life: 0, max: 2.5 + Math.random() * 1.5, size: 0.12 + Math.random() * 0.1,
        r: c.r, g: c.g, b: c.b, kind: 1,
      });
    }
  }

  private add(p: Particle) {
    if (this.ps.length >= this.cap) this.ps.shift();
    this.ps.push(p);
  }

  update(dt: number) {
    let n = 0;
    this.ps = this.ps.filter((p) => (p.life += dt) < p.max);
    for (const p of this.ps) {
      if (p.kind === 0) {
        p.vx *= 1 - dt * 2.5;
        p.vz *= 1 - dt * 2.5;
        p.vy -= 2.5 * dt;
        p.size += dt * 0.6;
      } else {
        p.vx *= 1 - dt * 1.2;
        p.vz *= 1 - dt * 1.2;
        p.vy = Math.max(p.vy - 9.8 * dt, -1.6);
        p.x += Math.sin(p.life * 9 + p.r * 10) * dt * 0.8;
      }
      p.x += p.vx * dt;
      p.y = Math.max(0.05, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const t = p.life / p.max;
      this.pos.set([p.x, p.y, p.z], n * 3);
      this.col.set([p.r, p.g, p.b], n * 3);
      this.size[n] = p.size;
      this.alpha[n] = p.kind === 0 ? (1 - t) * 0.55 : t > 0.8 ? (1 - t) * 5 : 1;
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'color', 'aSize', 'aAlpha']) (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
  }

  setViewportHeight(px: number, fov: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = px / (2 * Math.tan((fov * Math.PI) / 360));
  }
}

// ------------------------------------------------------------------ ball glow + trail
export class BallFx {
  readonly glow: THREE.Sprite;
  private trail: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private N = 22;
  private positions: Float32Array;
  private alphas: Float32Array;

  constructor(scene: THREE.Scene) {
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX(), color: '#ffffff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.scale.setScalar(1.1);
    scene.add(this.glow);
    this.positions = new Float32Array(this.N * 2 * 3);
    this.alphas = new Float32Array(this.N * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    const idx: number[] = [];
    for (let i = 0; i < this.N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    this.trail = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: `attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0, 1.0, 0.95) * 1.6, vA * 0.55); }`,
      }),
    );
    this.trail.frustumCulled = false;
    scene.add(this.trail);
  }

  update(ball: THREE.Vector3, flying: boolean, camera: THREE.Camera, time: number) {
    this.glow.position.copy(ball);
    const mat = this.glow.material as THREE.SpriteMaterial;
    mat.opacity += ((flying ? 0.95 : 0.35) - mat.opacity) * 0.2;
    this.glow.scale.setScalar(flying ? 1.3 : 0.8 + Math.sin(time * 4) * 0.06);
    if (flying) this.pts.unshift(ball.clone());
    else if (this.pts.length) this.pts.pop();
    if (this.pts.length > this.N) this.pts.length = this.N;
    const camPos = camera.position;
    const side = new THREE.Vector3();
    for (let i = 0; i < this.N; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)] ?? ball;
      const q = this.pts[Math.min(i + 1, this.pts.length - 1)] ?? p;
      const dir = new THREE.Vector3().subVectors(p, q);
      const toCam = new THREE.Vector3().subVectors(camPos, p);
      side.crossVectors(dir, toCam).normalize();
      const w = 0.09 * (1 - i / this.N);
      this.positions.set([p.x + side.x * w, p.y + side.y * w, p.z + side.z * w, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w], i * 6);
      const a = i < this.pts.length ? 1 - i / this.N : 0;
      this.alphas[i * 2] = this.alphas[i * 2 + 1] = a;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ selected player indicator
export class Selector {
  readonly ring: THREE.Mesh;
  readonly arrow: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private arrowMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const rg = g.createRadialGradient(64, 64, 30, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,0)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    rg.addColorStop(0.75, 'rgba(255,255,255,1)');
    rg.addColorStop(0.85, 'rgba(255,255,255,0.5)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    this.ringMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const geo = new THREE.PlaneGeometry(2.2, 2.2);
    geo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(geo, this.ringMat);
    this.ring.renderOrder = 2;
    scene.add(this.ring);
    const cone = new THREE.ConeGeometry(0.17, 0.36, 4);
    cone.rotateX(Math.PI);
    this.arrowMat = new THREE.MeshStandardMaterial({ color: '#c6ff1a', emissive: '#c6ff1a', emissiveIntensity: 1.2, roughness: 0.4 });
    this.arrow = new THREE.Mesh(cone, this.arrowMat);
    scene.add(this.arrow);
  }

  setColor(hex: string) {
    this.ringMat.color.set(hex).multiplyScalar(1.6);
    this.arrowMat.color.set(hex);
    this.arrowMat.emissive.set(hex);
  }

  place(x: number, z: number, headY: number, time: number, visible: boolean) {
    this.ring.visible = this.arrow.visible = visible;
    if (!visible) return;
    this.ring.position.set(x, 0.03, z);
    this.ring.scale.setScalar(1 + Math.sin(time * 6) * 0.05);
    this.arrow.position.set(x, headY + 0.55 + Math.sin(time * 5) * 0.08, z);
    this.arrow.rotation.y = time * 2;
  }
}
