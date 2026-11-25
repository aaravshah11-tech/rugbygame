import * as THREE from 'three';
import type { Kit } from '../../data/nations';
import { disposeScene } from './dispose';
import { loadPlayerAsset } from './assets';
import { Avatar, makeTeamKit } from './avatar';
import { LegacyVisual, type Visual } from './visual';
import { GLOW_TEX } from './stadium';

/**
 * One player on a slow turntable, showing a team's kit. Transparent, so the page's glass and
 * gradient show round him; cheap enough to sit on a menu screen (no shadows, capped pixel ratio).
 */
export class KitPreviewScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  private spin = new THREE.Group();
  private av: Visual | null = null;
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private kitKey = '';
  private halo: THREE.Sprite;

  constructor(private host: HTMLElement, private still = false) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#cfdcff', '#1d2a1d', 1.5));
    const key = new THREE.DirectionalLight('#fff3e0', 2.4);
    key.position.set(3, 6, 5);
    const rim = new THREE.DirectionalLight('#9fd8ff', 1.6);
    rim.position.set(-4, 3, -5);
    this.scene.add(key, rim, this.spin);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX(), color: '#c6ff1a', transparent: true, opacity: 0.22, depthWrite: false }));
    this.halo.scale.set(3.4, 1.0, 1);
    this.halo.position.set(0, 0.05, 0);
    this.scene.add(this.halo);
    this.camera.position.set(0, 1.1, 4.4);
    this.camera.lookAt(0, 0.95, 0);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    let last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!this.still) this.spin.rotation.y += dt * 0.6;
      this.av?.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Dress the player in this kit (rebuilt only when the kit changes). */
  async showKit(kit: Kit, accent: string) {
    const k = JSON.stringify(kit);
    (this.halo.material as THREE.SpriteMaterial).color.set(accent);
    if (k === this.kitKey) return;
    this.kitKey = k;
    const asset = await loadPlayerAsset(this.renderer);
    if (this.disposed || this.kitKey !== k) return;
    if (this.av) this.spin.remove(this.av.root);
    const av: Visual = asset ? new Avatar(asset, makeTeamKit(kit), { num: 10, forward: false, skin: 1, hair: 3, scrumCap: false }) : new LegacyVisual(kit, 1, false);
    av.setBase('idle');
    this.spin.add(av.root);
    this.av = av;
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
