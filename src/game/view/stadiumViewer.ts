import * as THREE from 'three';
import { nationById } from '../../data/nations';
import { buildStadium, type StadiumSpec, type StadiumView, type StadiumWeather, type TimeOfDay } from '../stadium/index';
import { preset, resolveQuality, type QualitySetting } from './quality';
import { disposeScene } from './dispose';

/**
 * The Stadiums gallery: one ground at a time on a slow orbit. Drag to orbit, pinch-free zoom with
 * vertical drag; change time of day and weather. Each change rebuilds the ground in a fresh scene.
 */
export class StadiumViewerScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.5, 3000);
  private view: StadiumView | null = null;
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private yaw = -2.2;
  private pitch = 0.5;
  private dist = 1.45;
  private auto = true;
  private t = 0;

  constructor(private host: HTMLElement, private quality: QualitySetting) {
    const q = preset(resolveQuality(quality));
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(q.pixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    let last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      if (this.auto) this.yaw += dt * 0.06;
      const v = this.view;
      if (!v) return;
      const R = v.bounds.radius * 1.5 * this.dist;
      this.camera.position.set(Math.cos(this.yaw) * Math.cos(this.pitch) * R, Math.sin(this.pitch) * R + 4, Math.sin(this.yaw) * Math.cos(this.pitch) * R);
      this.camera.lookAt(0, 4, 0);
      v.update(this.t, 0.15 + 0.1 * Math.sin(this.t * 0.3), this.camera);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Build a ground (replacing the one on show). */
  show(spec: StadiumSpec, time: TimeOfDay, weather: StadiumWeather) {
    this.clear();
    const kit = nationById(spec.id).kit;
    const away = spec.id === 'NZL' ? nationById('ENG').kit : nationById('NZL').kit;
    const q = preset(resolveQuality(this.quality));
    this.view = buildStadium(
      this.scene,
      this.renderer,
      spec,
      { quality: q, home: { primary: kit.primary, secondary: kit.secondary }, away: { primary: away.primary, secondary: away.secondary }, time, weather, importance: 0.85, homeName: spec.id, awayName: 'AWAY' },
      q.pitchPxPerMetre,
      [kit.primary, kit.primary],
    );
    this.view.setTorches(time === 'night');
  }

  /** Drag: dx, dy in pixels. */
  drag(dx: number, dy: number) {
    this.auto = false;
    this.yaw += dx * 0.006;
    this.pitch = Math.max(0.05, Math.min(1.35, this.pitch + dy * 0.004));
  }

  zoom(f: number) {
    this.dist = Math.max(0.35, Math.min(2.2, this.dist * f));
  }

  resumeAuto() {
    this.auto = true;
  }

  private clear() {
    // throw away the old ground's GPU resources but keep the renderer
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    (this.scene.environment as THREE.Texture | null)?.dispose();
    this.scene = new THREE.Scene();
    this.view = null;
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
