import { disposeScene } from './view/dispose';
import * as THREE from 'three';
import { createBall } from './model';
import type { Kit } from '../data/nations';
import { buildStadium } from './view/stadium';
import { buildPitch } from './view/pitch';
import { PostFX } from './view/effects';
import { preset, resolveQuality } from './view/quality';
import { loadPlayerAsset } from './view/assets';
import { Avatar, makeTeamKit } from './view/avatar';
import { LegacyVisual, type Visual } from './view/visual';

/** Main menu backdrop: a player standing on the pitch in the floodlit stadium bowl. */
export class MenuScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.3, 2000);
  private post: PostFX;
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private player: Visual | null = null;

  constructor(private host: HTMLElement, kit: Kit) {
    const q = { ...preset(resolveQuality('auto')), crowdDensity: 0.45, shadows: true, shadowMapSize: 1024 };
    this.renderer = new THREE.WebGLRenderer({ antialias: !q.bloom, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.post = new PostFX(this.renderer, this.scene, this.camera, q);
    const stadium = buildStadium(this.scene, this.renderer, q, [kit.primary, kit.secondary, '#21e6c1', '#c6ff1a']);
    buildPitch(this.scene, this.renderer, 9, [kit.primary, kit.secondary]);
    const key = stadium.key;
    key.castShadow = true;
    key.target.position.set(-30, 0, 0);
    key.position.set(-50, 40, 25);
    const spot = new THREE.PointLight('#fff4de', 30, 16);
    spot.position.set(-27, 4, 4);
    this.scene.add(spot);
    const ball = createBall();
    ball.scale.setScalar(1.3);
    this.scene.add(ball);

    void loadPlayerAsset(this.renderer).then((asset) => {
      if (this.disposed) return;
      const av: Visual = asset ? new Avatar(asset, makeTeamKit(kit), { num: 10, forward: false, skin: 1, hair: 3, scrumCap: false }) : new LegacyVisual(kit, 1, false);
      av.root.position.set(-30, 0, 0);
      av.setShadow(true);
      av.setBase('idle');
      this.scene.add(av.root);
      this.player = av;
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();

    let last = performance.now();
    let t = 0;
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const a = t * 0.07 + 2.2;
      const portrait = this.camera.aspect < 1;
      const r = portrait ? 8.5 : 6.2;
      this.camera.position.set(-30 + Math.cos(a) * r, 1.9 + Math.sin(t * 0.3) * 0.15, Math.sin(a) * r);
      const p = this.player;
      if (p) {
        // face the camera at a three-quarter angle
        const toCam = Math.atan2(this.camera.position.z, this.camera.position.x + 30);
        p.root.rotation.y = -(toCam + 0.5);
        p.update(dt);
        p.handPosition(ball.position);
        ball.rotation.set(0, p.root.rotation.y, 0.4);
      } else ball.position.set(-30, 1.1, 0);
      const look = new THREE.Vector3(-30, 1.15, 0);
      if (!portrait) {
        // keep the player on the right of the screen, behind the menu tiles
        const right = new THREE.Vector3().subVectors(look, this.camera.position).cross(new THREE.Vector3(0, 1, 0)).normalize();
        look.addScaledVector(right, -1.9);
      } else look.y = 0.3;
      this.camera.lookAt(look);
      stadium.update(t, 0.2, this.camera);
      this.post.render();
    };
    this.raf = requestAnimationFrame(loop);
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
    this.post.dispose();
    disposeScene(this.scene, this.renderer);
  }
}
