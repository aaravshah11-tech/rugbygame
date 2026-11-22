import * as THREE from 'three';
import type { Kit } from '../../data/nations';
import { loadPlayerAsset, type AnimName } from './assets';
import { Avatar, makeTeamKit } from './avatar';
import { LegacyVisual, type Visual } from './visual';
import { GLOW_TEX } from './stadium';

/** Debug turntable: all 15 players of a team, slowly rotating. */
export class SquadViewerScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private group = new THREE.Group();
  private players: { av: Visual; spin: THREE.Group }[] = [];
  private raf = 0;
  private ro: ResizeObserver;
  private anim: AnimName = 'idle';
  private disposed = false;
  status = 'loading';

  constructor(private host: HTMLElement, private onStatus: (s: string) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#0d1322');
    this.scene.add(new THREE.HemisphereLight('#cfdcff', '#2a3a2a', 1.4));
    const key = new THREE.DirectionalLight('#fff3e0', 2.6);
    key.position.set(6, 12, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -14, right: 14, top: 8, bottom: -8 });
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9fd8ff', 1.2);
    rim.position.set(-8, 6, -10);
    this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: '#2f6b2c', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor, this.group);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX(), color: '#c6ff1a', transparent: true, opacity: 0.08, depthWrite: false }));
    glow.scale.set(40, 14, 1);
    glow.position.set(0, 2, -6);
    this.scene.add(glow);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    let last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const p of this.players) {
        if (!(import.meta.env.DEV && new URLSearchParams(location.search).has('still'))) p.spin.rotation.y += dt * 0.45;
        p.av.update(dt);
      }
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // fit two rows of players: 8 forwards behind, 7 backs in front
    const fitW = 14.5;
    const dist = fitW / 2 / Math.tan((this.camera.fov * Math.PI) / 360) / this.camera.aspect;
    this.camera.position.set(0, Math.max(5, dist * 0.32), Math.max(9, dist * 0.95));
    this.camera.lookAt(0, 1.1, -0.8);
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('close')) {
      // dev: face close-up of the front-row centre player
      this.camera.position.set(0.4, 1.75, 3.2);
      this.camera.lookAt(0, 1.6, 1.4);
    }
    this.camera.updateProjectionMatrix();
  }

  async showTeam(kit: Kit) {
    const asset = await loadPlayerAsset(this.renderer);
    if (this.disposed) return;
    this.status = asset ? `Model: rugby_player.glb · ${asset.clips.size} animations` : 'GLB failed to load — showing fallback models';
    this.onStatus(this.status);
    for (const p of this.players) this.group.remove(p.spin);
    this.players = [];
    const team = asset ? makeTeamKit(kit) : null;
    for (let i = 0; i < 15; i++) {
      const num = i + 1;
      const forward = num <= 8;
      const av: Visual =
        asset && team
          ? new Avatar(asset, team, { num, forward, skin: (i * 7) % 5, hair: (i * 5) % 6, scrumCap: [2, 4, 6, 7].includes(num) })
          : new LegacyVisual(kit, i % 5, forward);
      const spin = new THREE.Group();
      const row = forward ? 0 : 1;
      const idx = forward ? i : i - 8;
      const n = forward ? 8 : 7;
      spin.position.set((idx - (n - 1) / 2) * 1.75, 0, row ? 1.4 : -2.2);
      spin.rotation.y = import.meta.env.DEV && new URLSearchParams(location.search).has('close') ? -Math.PI / 2 : -Math.PI / 2 + idx * 0.5; // avatar local +x is forward; start facing the camera, staggered
      spin.add(av.root);
      av.setShadow(true);
      this.group.add(spin);
      this.players.push({ av, spin });
    }
    this.play(this.anim);
  }

  play(anim: AnimName) {
    this.anim = anim;
    const looping: AnimName[] = ['idle', 'walk', 'run', 'celebrate', 'bind', 'lying'];
    for (const { av } of this.players) {
      if (looping.includes(anim)) av.setBase(anim, 1);
      else {
        av.setBase('idle');
        av.trigger(anim);
      }
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
