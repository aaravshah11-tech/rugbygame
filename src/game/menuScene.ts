import { disposeScene } from './view/dispose';
import * as THREE from 'three';
import { createBall } from './model';
import type { Kit } from '../data/nations';
import { buildStadium, GLOW_TEX } from './view/stadium';
import { buildPitch } from './view/pitch';
import { PostFX } from './view/effects';
import { preset, resolveQuality } from './view/quality';
import { loadPlayerAsset, type AnimName } from './view/assets';
import { Avatar, makeTeamKit } from './view/avatar';
import { LegacyVisual, type Visual } from './view/visual';

export interface MenuSceneOptions {
  /** no camera drift, parallax or idle fidgets */
  reduceMotion?: boolean;
  /** start dark: the floodlight banks come on one by one (launch intro) */
  intro?: boolean;
}

/** The player stands here, on the pitch near the touchline. */
const SPOT = new THREE.Vector3(-30, 0, 0);
/** intro timing (seconds after construction) for each floodlight bank */
const BANK_ON = [0.12, 0.38, 0.64];

/**
 * Main menu backdrop: night match under the floodlights. A slow cinematic drift round a player
 * in the user's favourite kit, haze in the light, phone torches flickering in the stands.
 */
export class MenuScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.3, 2000);
  private post: PostFX;
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private player: Visual | null = null;
  private ball: THREE.Object3D;
  private t = 0;
  private lightsT: number;
  private banks: { sprites: THREE.Sprite[]; shaft: THREE.Mesh }[] = [];
  private torchMat: THREE.ShaderMaterial | null = null;
  // parallax: target and eased offsets (-1..1)
  private par = { x: 0, y: 0, tx: 0, ty: 0 };
  private tiltOn = false;
  private onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    // landscape: gamma is the up/down tilt, beta left/right
    const land = Math.abs((screen.orientation?.angle ?? 0) % 180) === 90;
    const lr = land ? e.beta : e.gamma;
    const ud = land ? e.gamma : e.beta - 45;
    this.par.tx = THREE.MathUtils.clamp(lr / 25, -1, 1);
    this.par.ty = THREE.MathUtils.clamp(ud / 25, -1, 1);
  };
  // idle behaviour
  private nextIdle = 3;
  private yawOff = 0;
  private yawTarget = 0;
  private toss: { t: number; dur: number } | null = null;
  private spin = 0;

  constructor(private host: HTMLElement, kit: Kit, private opts: MenuSceneOptions = {}) {
    const level = resolveQuality('auto');
    const q = { ...preset(level), crowdDensity: 0.45, shadows: true, shadowMapSize: 1024 };
    this.renderer = new THREE.WebGLRenderer({ antialias: !q.bloom, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.post = new PostFX(this.renderer, this.scene, this.camera, q);
    const stadium = buildStadium(this.scene, this.renderer, q, [kit.primary, kit.secondary, '#21e6c1', '#c6ff1a']);
    buildPitch(this.scene, this.renderer, 9, [kit.primary, kit.secondary]);
    // night haze: distance fog in the sky colour softens the far stands
    this.scene.fog = new THREE.FogExp2('#0b1024', 0.0042);
    const key = stadium.key;
    key.castShadow = true;
    key.target.position.copy(SPOT);
    key.position.set(-50, 40, 25);
    const spot = new THREE.PointLight('#fff4de', 30, 16);
    spot.position.set(-27, 4, 4);
    this.scene.add(spot);
    this.ball = createBall();
    this.ball.scale.setScalar(1.3);
    this.scene.add(this.ball);

    this.buildFloodlights(level !== 'low');
    if (level !== 'low') this.buildTorches();
    this.lightsT = opts.intro ? 0 : 99;

    void loadPlayerAsset(this.renderer).then((asset) => {
      if (this.disposed) return;
      const av: Visual = asset ? new Avatar(asset, makeTeamKit(kit), { num: 10, forward: false, skin: 1, hair: 3, scrumCap: false }) : new LegacyVisual(kit, 1, false);
      av.root.position.copy(SPOT);
      av.setShadow(true);
      av.setBase('idle');
      this.scene.add(av.root);
      this.player = av;
    });

    // Android and desktop give tilt without asking; iOS asks the first time the player is touched.
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (!opts.reduceMotion && DOE && !DOE.requestPermission) this.listenTilt();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();

    let last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.tick(dt);
      stadium.update(this.t, 0.2, this.camera);
      this.post.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- public controls
  /** End the intro now: every floodlight on. */
  lightsOn() {
    this.lightsT = 99;
  }

  /** Tap on the player: a random celebration. */
  celebrate() {
    const p = this.player;
    if (!p) return;
    const pick: AnimName[] = ['celebrate', 'celebrate', 'kick', 'pass'];
    p.trigger(pick[Math.floor(Math.random() * pick.length)], 1);
    this.yawTarget = 0;
    this.nextIdle = 4;
  }

  /** Touch-drag fallback for parallax (dx, dy are fractions of the screen). */
  dragParallax(dx: number, dy: number, release = false) {
    if (this.opts.reduceMotion || this.tiltOn) return;
    this.par.tx = release ? 0 : THREE.MathUtils.clamp(dx * 3, -1, 1);
    this.par.ty = release ? 0 : THREE.MathUtils.clamp(dy * 3, -1, 1);
  }

  /** iOS: motion access must be asked for from a tap. */
  requestTilt() {
    if (this.opts.reduceMotion || this.tiltOn) return;
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (DOE?.requestPermission)
      DOE.requestPermission()
        .then((r) => r === 'granted' && this.listenTilt())
        .catch(() => {});
  }

  private listenTilt() {
    if (this.tiltOn) return;
    this.tiltOn = true;
    window.addEventListener('deviceorientation', this.onTilt);
  }

  // ---------------------------------------------------------------- set dressing
  /** Floodlight banks along the far roof edge: lens-flare sprites and a soft beam of haze each. */
  private buildFloodlights(beams: boolean) {
    const glow = GLOW_TEX();
    const flare = new THREE.SpriteMaterial({ map: glow, color: '#fff6dd', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uOn: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uOn; varying vec2 vUv;
        void main(){
          float along = vUv.y;                         // 1 at the lamp, 0 on the pitch
          float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float a = pow(across, 1.6) * (0.2 + 0.8 * along) * 0.13 * uOn;
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.86) * a, a);
        }`,
    });
    // three banks on the far roof, behind the player as the camera sees him
    const xs = [6, 32, 58];
    xs.forEach((x) => {
      const sprites: THREE.Sprite[] = [];
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Sprite(flare.clone());
        s.position.set(x - 6 + i * 4, 18.5, -74);
        s.scale.setScalar(i % 2 ? 10 : 14);
        s.renderOrder = 3;
        this.scene.add(s);
        sprites.push(s);
      }
      // the beam: a long cone of light falling from the bank onto the pitch
      const len = 80;
      const geo = new THREE.ConeGeometry(18, len, 24, 1, true);
      geo.translate(0, -len / 2, 0);
      const shaft = new THREE.Mesh(geo, beamMat.clone());
      shaft.position.set(x, 18.5, -74);
      shaft.lookAt(x * 0.5 - 20, 0, 4);
      shaft.rotateX(-Math.PI / 2);
      shaft.visible = beams;
      shaft.renderOrder = 2;
      this.scene.add(shaft);
      this.banks.push({ sprites, shaft });
    });
  }

  /** Phone torches: small flickering lights scattered through the stands. */
  private buildTorches() {
    const N = 420;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // round the stadium bowl: a rounded rectangle just outside the boards, rising with distance
      const d = 3 + Math.random() * 26;
      const a = Math.random() * Math.PI * 2;
      const hx = 66 + d;
      const hz = 42 + d;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const k = 1 / Math.max(Math.abs(c) / hx, Math.abs(s) / hz);
      pos[i * 3] = c * k;
      pos[i * 3 + 1] = 1.8 + d * 0.62;
      pos[i * 3 + 2] = s * k;
      seed[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.torchMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uOn: { value: 1 }, uScale: { value: 1 } },
      vertexShader: `attribute float aSeed; uniform float uTime; uniform float uScale; varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // each torch fades in and out on its own slow cycle, with a little shimmer
          float cyc = 0.5 + 0.5 * sin(uTime * (0.35 + fract(aSeed) * 0.5) + aSeed);
          vA = smoothstep(0.35, 1.0, cyc) * (0.75 + 0.25 * sin(uTime * 9.0 + aSeed * 3.0));
          gl_PointSize = uScale * 180.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uOn; varying float vA;
        void main(){
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, r);
          a = a * a * vA * uOn;
          gl_FragColor = vec4(vec3(1.0, 0.98, 0.92) * a, a);
        }`,
    });
    const pts = new THREE.Points(g, this.torchMat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  // ---------------------------------------------------------------- per frame
  private tick(dt: number) {
    const rm = !!this.opts.reduceMotion;
    this.t += dt;
    this.lightsT += dt;
    const t = this.t;

    // floodlights: banks switch on one by one in the intro; exposure follows
    let on = 0;
    this.banks.forEach((b, i) => {
      const since = this.lightsT - BANK_ON[i];
      const k = since < 0 ? 0 : since < 0.06 ? 1.6 : Math.min(1, 0.85 + since * 2); // pop, then settle
      on += Math.min(1, k) / this.banks.length;
      for (const s of b.sprites) {
        const m = s.material as THREE.SpriteMaterial;
        // gentle shimmer once on
        m.opacity = k * (0.9 + 0.1 * Math.sin(t * 7 + s.position.x));
      }
      (b.shaft.material as THREE.ShaderMaterial).uniforms.uOn.value = Math.min(1, k);
    });
    this.renderer.toneMappingExposure = 0.18 + 0.82 * on;
    if (this.torchMat) {
      this.torchMat.uniforms.uTime.value = t;
      this.torchMat.uniforms.uOn.value = on;
      this.torchMat.uniforms.uScale.value = this.renderer.getPixelRatio();
    }

    // parallax eases towards the tilt / drag
    this.par.x += (this.par.tx - this.par.x) * Math.min(1, dt * 4);
    this.par.y += (this.par.ty - this.par.y) * Math.min(1, dt * 4);

    // camera: a slow cinematic sway round the player (keeps him right of the menu)
    const a = rm ? 2.45 : 2.45 + Math.sin(t * 0.06) * 0.32 + this.par.x * 0.14;
    const portrait = this.camera.aspect < 1;
    const r = portrait ? 8.5 : 6.4;
    const bob = rm ? 0 : Math.sin(t * 0.21) * 0.18;
    this.camera.position.set(SPOT.x + Math.cos(a) * r, 1.9 + bob + this.par.y * 0.35, Math.sin(a) * r);
    const look = new THREE.Vector3(SPOT.x, 1.15, 0);
    if (!portrait) {
      // keep the player on the right of the screen, behind the menu tiles
      const right = new THREE.Vector3().subVectors(look, this.camera.position).cross(new THREE.Vector3(0, 1, 0)).normalize();
      look.addScaledVector(right, -1.9);
    } else look.y = 0.3;
    this.camera.lookAt(look);

    const p = this.player;
    if (p) {
      this.idle(dt, rm);
      const toCam = Math.atan2(this.camera.position.z, this.camera.position.x - SPOT.x);
      this.yawOff += (this.yawTarget - this.yawOff) * Math.min(1, dt * 2.2);
      p.root.rotation.y = -(toCam + 0.5) + this.yawOff;
      p.update(dt);
      p.handPosition(this.ball.position);
      // ball toss: up out of the hands, spinning, and back
      if (this.toss) {
        this.toss.t += dt;
        const k = this.toss.t / this.toss.dur;
        if (k >= 1) this.toss = null;
        else this.ball.position.y += Math.sin(Math.PI * k) * 0.75;
      }
      this.ball.rotation.set(this.spin, p.root.rotation.y, 0.4);
    } else this.ball.position.set(SPOT.x, 1.1, 0);
    this.spin *= 0.97;
  }

  /** Every few seconds: toss and spin the ball, glance round at the crowd, or limber up. */
  private idle(dt: number, rm: boolean) {
    const p = this.player!;
    if (this.toss) this.spin += dt * 14;
    this.nextIdle -= dt;
    if (rm || this.nextIdle > 0 || p.busy) return;
    this.nextIdle = 3.5 + Math.random() * 3.5;
    const r = Math.random();
    if (r < 0.35) {
      this.toss = { t: 0, dur: 0.9 };
      p.trigger('catch', 0.9);
      this.yawTarget = 0;
    } else if (r < 0.7) {
      // look round at the crowd, then back
      this.yawTarget = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.5);
      setTimeout(() => (this.yawTarget = 0), 2200);
    } else {
      p.trigger(Math.random() < 0.5 ? 'sidestepL' : 'sidestepR', 0.7);
      this.yawTarget = 0;
    }
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('deviceorientation', this.onTilt);
    this.post.dispose();
    disposeScene(this.scene, this.renderer);
  }
}
