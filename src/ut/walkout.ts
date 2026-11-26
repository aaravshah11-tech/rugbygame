import * as THREE from 'three';
import type { Kit } from '../data/nations';
import { disposeScene } from '../game/view/dispose';
import { loadPlayerAsset } from '../game/view/assets';
import { Avatar, makeTeamKit } from '../game/view/avatar';
import { LegacyVisual, type Visual } from '../game/view/visual';
import { GLOW_TEX } from '../game/stadium/textures';

/**
 * The walkout for a big pull: night stadium, floodlights, smoke and flares in the colour of the
 * card, and the player walking out of the tunnel towards the camera before the card reveal.
 */
export class WalkoutScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private av: Visual | null = null;
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private t = 0;
  private smoke: THREE.Sprite[] = [];
  private flares: THREE.PointLight[] = [];
  private beams: THREE.Mesh[] = [];

  constructor(private host: HTMLElement, kit: Kit, glow: string, private onArrive: () => void, opts: { num: number; size?: number; forward: boolean }) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#04060d');
    host.appendChild(this.renderer.domElement);
    const glowCol = new THREE.Color(glow);
    this.scene.fog = new THREE.Fog('#05070f', 14, 60);

    // pitch and tunnel
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#16391f', roughness: 0.95 }));
    pitch.rotation.x = -Math.PI / 2;
    this.scene.add(pitch);
    const tunnel = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 2), new THREE.MeshStandardMaterial({ color: '#0a0c12', roughness: 0.6 }));
    tunnel.position.set(0, 1.7, -14);
    this.scene.add(tunnel);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.6), new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(0.9) }));
    mouth.position.set(0, 1.3, -12.98);
    this.scene.add(mouth);
    // stands: dark tiers with a scatter of phone lights
    const standMat = new THREE.MeshStandardMaterial({ color: '#0b0e18', roughness: 0.9 });
    for (const side of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 4), standMat);
      st.position.set(side * 20, 6, -18);
      st.rotation.y = side * 0.5;
      this.scene.add(st);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(60, 18, 2), standMat);
    back.position.set(0, 9, -24);
    this.scene.add(back);
    const dots = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 900; i++) pts.push((Math.random() - 0.5) * 60, 2 + Math.random() * 16, -22.8 + Math.random() * 0.5);
    dots.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.Points(dots, new THREE.PointsMaterial({ color: '#fff7d6', size: 0.12, transparent: true, opacity: 0.8 })));
    // floodlight glows
    const glowTex = GLOW_TEX();
    for (const x of [-22, -8, 8, 22]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fff3d0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(x, 20, -26);
      s.scale.set(8, 8, 1);
      this.scene.add(s);
    }
    // light beams sweeping the pitch in the card's colour
    for (let i = 0; i < 4; i++) {
      const g = new THREE.ConeGeometry(2.6, 30, 24, 1, true);
      g.translate(0, -15, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.position.set((i - 1.5) * 9, 22, -20);
      this.scene.add(m);
      this.beams.push(m);
    }
    // smoke and flares either side of the walkway
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i % 3 === 0 ? glowCol : new THREE.Color('#9aa3b5'), transparent: true, opacity: 0.25, depthWrite: false }));
      const side = i % 2 ? 1 : -1;
      s.position.set(side * (2.2 + Math.random() * 2), 0.6 + Math.random(), -12 + Math.random() * 12);
      s.scale.setScalar(2.5 + Math.random() * 2);
      this.scene.add(s);
      this.smoke.push(s);
    }
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(glowCol, 6, 9, 2);
      l.position.set(i % 2 ? 2.6 : -2.6, 0.6, -10 + Math.floor(i / 2) * 6);
      this.scene.add(l);
      this.flares.push(l);
    }
    this.scene.add(new THREE.HemisphereLight('#8fa6ff', '#0b120b', 0.9));
    const key = new THREE.SpotLight('#ffffff', 60, 40, 0.5, 0.6, 1.5);
    key.position.set(0, 14, 6);
    key.target.position.set(0, 0, -2);
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(glowCol, 2.2);
    rim.position.set(0, 4, -10);
    this.scene.add(rim);

    this.camera.position.set(0, 1.25, 5.2);
    this.camera.lookAt(0, 1.2, -4);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();

    void loadPlayerAsset(this.renderer).then((asset) => {
      if (this.disposed) return;
      const av: Visual = asset ? new Avatar(asset, makeTeamKit(kit), { num: opts.num, forward: opts.forward, skin: 1 + (opts.num % 4), hair: opts.num % 5, scrumCap: false, size: opts.size }) : new LegacyVisual(kit, 1, opts.forward);
      av.setBase('walk', 0.9);
      av.root.position.set(0, 0, -12.5);
      av.root.rotation.y = 0;
      this.scene.add(av.root);
      this.av = av;
    });

    let last = performance.now();
    let arrived = false;
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      const av = this.av;
      if (av) {
        const z = av.root.position.z;
        if (z < -0.6) {
          av.root.position.z = Math.min(-0.6, z + dt * 2.4);
        } else if (!arrived) {
          arrived = true;
          av.setBase('idle');
          av.trigger('celebrate');
          this.onArrive();
        }
        av.update(dt);
        // camera eases back and drops as he comes towards it
        const k = Math.min(1, (z + 12.5) / 12);
        this.camera.position.set(Math.sin(this.t * 0.4) * 0.3, 1.1 + k * 0.15, 5.2 - k * 1.4);
        this.camera.lookAt(0, 1.15, av.root.position.z - 1);
      }
      this.smoke.forEach((s, i) => {
        s.position.y += dt * (0.15 + (i % 4) * 0.05);
        if (s.position.y > 3.5) s.position.y = 0.5;
        (s.material as THREE.SpriteMaterial).opacity = 0.18 + 0.1 * Math.sin(this.t * 2 + i);
      });
      this.flares.forEach((l, i) => (l.intensity = 5 + Math.sin(this.t * 13 + i * 2) * 2 + Math.random() * 1.5));
      this.beams.forEach((b, i) => (b.rotation.z = Math.sin(this.t * 0.7 + i) * 0.35));
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    disposeScene(this.scene, this.renderer);
  }
}
