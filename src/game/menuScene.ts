import * as THREE from 'three';
import { buildStadium } from './stadium';
import { animateModel, createBall, createPlayerModel, makeTeamLook } from './model';
import type { Kit } from '../data/nations';

/** Main menu backdrop: a player standing on the pitch in a floodlit stadium. */
export class MenuScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.3, 400);
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;

  constructor(private host: HTMLElement, kit: Kit) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    const stadium = buildStadium(this.scene, [kit.primary, kit.secondary, '#21e6c1', '#c6ff1a'], { crowdDensity: 0.7 });
    const model = createPlayerModel(makeTeamLook(kit), 2, 1.05);
    model.root.position.set(-30, 0, 0);
    this.scene.add(model.root);
    const ball = createBall();
    ball.scale.setScalar(1.1);
    this.scene.add(ball);
    // Spotlight pool under the player
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 32),
      new THREE.MeshBasicMaterial({ color: '#c6ff1a', transparent: true, opacity: 0.12, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(-30, 0.03, 0);
    this.scene.add(glow);

    const key = new THREE.PointLight('#ffffff', 40, 14);
    key.position.set(-26, 4, 3);
    this.scene.add(key);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    this.ro = ro;
    this.resize();

    let last = performance.now();
    let t = 0;
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      // idle: ball tucked, slight bounce, turning to camera
      animateModel(model, 0.6, dt, 'carry');
      const h = -model.root.rotation.y;
      ball.position.set(-30 + Math.cos(h) * 0.35, 1.1 + Math.sin(t * 2) * 0.02, Math.sin(h) * 0.35);
      ball.rotation.set(0, -h, 0.4);
      const a = t * 0.08;
      const portrait = this.camera.aspect < 1;
      const r = portrait ? 9 : 7;
      this.camera.position.set(-30 + Math.cos(a + 2.2) * r, 2.2 + Math.sin(t * 0.3) * 0.2, Math.sin(a + 2.2) * r);
      // Face the camera at a three-quarter angle.
      const toCam = Math.atan2(this.camera.position.z, this.camera.position.x + 30);
      model.root.rotation.y = -(toCam + 0.55 + Math.sin(t * 0.4) * 0.12);
      // Keep the player on the right side of the screen in landscape.
      const look = new THREE.Vector3(-30, 1.3, 0);
      if (!portrait) {
        const right = new THREE.Vector3().subVectors(look, this.camera.position).cross(new THREE.Vector3(0, 1, 0)).normalize();
        look.addScaledVector(right, -2.2);
      } else look.y = 0.4;
      this.camera.lookAt(look);
      stadium.update(t, 0.25);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
