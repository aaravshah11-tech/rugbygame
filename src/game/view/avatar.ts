import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Kit } from '../../data/nations';
import { findBone, type AnimName, type PlayerAsset } from './assets';

const SKIN_TONES = ['#f2c8a0', '#deae84', '#b97f55', '#8a5a3a', '#5c3a25'];
const HAIR = ['#1d1612', '#3a2618', '#6b4423', '#a8752f', '#d9b25c', '#2b2b2b'];
const skinMats = SKIN_TONES.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
const hairMats = HAIR.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
const browMats = HAIR.map((c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.6), roughness: 1 }));
const eyeMat = new THREE.MeshStandardMaterial({ color: '#111114', roughness: 0.3 });
const bootMat = new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.45 });

/** Flat colour material whose `aTrim` vertices (collar, cuffs, sock hoops) use the second colour. */
function trimmedMaterial(main: string, trim: string, roughness: number) {
  const m = new THREE.MeshStandardMaterial({ color: main, roughness });
  const uTrim = { value: new THREE.Color(trim) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTrim = uTrim;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTrim;\nvarying float vTrim;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrim = aTrim;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTrim;\nvarying float vTrim;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTrim, step(0.5, vTrim));');
  };
  m.customProgramCacheKey = () => 'trimmed';
  return m;
}

export interface TeamKit {
  shirt: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  shorts: THREE.MeshStandardMaterial;
  socks: THREE.MeshStandardMaterial;
  cap: THREE.MeshStandardMaterial;
  kit: Kit;
}

/** Shirt (primary + secondary collar/cuffs), shorts, socks (with secondary hoops): separate, recolourable materials. */
export function makeTeamKit(kit: Kit): TeamKit {
  return {
    shirt: trimmedMaterial(kit.primary, kit.secondary, 0.85),
    panel: new THREE.MeshStandardMaterial({ color: kit.primary, roughness: 0.85 }),
    shorts: new THREE.MeshStandardMaterial({ color: kit.shorts, roughness: 0.7 }),
    socks: trimmedMaterial(kit.socks, kit.secondary, 0.9),
    cap: new THREE.MeshStandardMaterial({ color: kit.secondary === kit.primary ? '#1a1a1a' : kit.secondary, roughness: 0.6 }),
    kit,
  };
}

export function recolourKit(t: TeamKit, kit: Kit) {
  t.shirt.color.set(kit.primary);
  t.panel.color.set(kit.primary);
  t.shorts.color.set(kit.shorts);
  t.socks.color.set(kit.socks);
  t.kit = kit;
}

function luminance(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

const numberCache = new Map<string, THREE.CanvasTexture>();
function numberTexture(num: number, kit: Kit): THREE.CanvasTexture {
  const ink = Math.abs(luminance(kit.secondary) - luminance(kit.primary)) > 0.2 ? kit.secondary : luminance(kit.primary) > 0.45 ? '#101010' : '#ffffff';
  const key = `${num}-${ink}`;
  const hit = numberCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '900 96px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = g.measureText(String(num)).width;
  if (w > 116) g.font = `900 ${Math.floor((96 * 116) / w)}px "Arial Black", Arial, sans-serif`;
  g.fillStyle = ink;
  g.fillText(String(num), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  numberCache.set(key, t);
  return t;
}

/** Attach `obj` to `bone`, keeping the world transform it has right now (template space). */
function attachKeepWorld(bone: THREE.Object3D, obj: THREE.Object3D, worldPos: THREE.Vector3, worldQuat: THREE.Quaternion) {
  bone.updateWorldMatrix(true, false);
  const bq = bone.getWorldQuaternion(new THREE.Quaternion());
  const bs = bone.getWorldScale(new THREE.Vector3());
  obj.position.copy(bone.worldToLocal(worldPos.clone()));
  obj.quaternion.copy(bq.invert().multiply(worldQuat));
  obj.scale.set(1 / bs.x, 1 / bs.y, 1 / bs.z);
  bone.add(obj);
}

const LOOPING: AnimName[] = ['idle', 'walk', 'run', 'bind', 'lying', 'carry', 'celebrate'];

export interface AvatarOptions {
  num: number;
  forward: boolean;
  skin: number;
  hair: number;
  scrumCap: boolean;
}

export class Avatar {
  readonly root = new THREE.Group();
  private inner: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private meshes: THREE.Mesh[] = [];
  private base: AnimName | null = null;
  private oneShot: AnimName | null = null;
  private oneShotLeft = 0;
  private hand: THREE.Object3D | null;
  private head: THREE.Object3D | null;
  readonly height: number;

  constructor(asset: PlayerAsset, team: TeamKit, o: AvatarOptions) {
    this.inner = cloneSkinned(asset.scene);
    this.inner.updateMatrixWorld(true);
    const H = asset.height;

    // Materials by part name: every part is a separate, recolourable material.
    this.inner.traverse((obj) => {
      const m = obj as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const name = (m.material as THREE.Material).name.toLowerCase();
      let mat: THREE.Material | THREE.Material[];
      if (name === 'pants' && m.userData.legSplit) mat = [team.shorts, skinMats[o.skin % skinMats.length], team.socks];
      else if (name === 'shirt') mat = team.shirt;
      else if (name === 'shirt2') mat = team.panel;
      else if (name === 'pants') mat = team.shorts;
      else if (name.startsWith('sock')) mat = team.socks;
      else if (name.startsWith('shoe')) mat = bootMat;
      else if (name.startsWith('hair')) mat = hairMats[o.hair % hairMats.length];
      else if (name.startsWith('eye')) mat = eyeMat;
      else mat = skinMats[o.skin % skinMats.length];
      m.material = mat;
      m.castShadow = false;
      m.frustumCulled = false;
      if (name.startsWith('hair') && o.scrumCap) m.visible = false;
      this.meshes.push(m);
    });

    const head = findBone(this.inner, 'Head');
    const chest = findBone(this.inner, 'Chest') ?? findBone(this.inner, 'Spine');
    this.head = head;
    this.hand = findBone(this.inner, 'RHand');

    // Shirt number: a clean decal on the back, riding on the chest bone.
    if (chest) {
      const size = H * 0.14;
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshStandardMaterial({ map: numberTexture(o.num, team.kit), transparent: true, alphaTest: 0.35, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4 }),
      );
      attachKeepWorld(chest, decal, new THREE.Vector3(0, asset.backY, asset.backZ - H * 0.012), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      this.meshes.push(decal);
    }

    if (head) {
      const r = asset.headRadius;
      // Eyebrows above each eye.
      for (const eye of asset.eyes) {
        const brow = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 0.08, r * 0.1), browMats[o.hair % browMats.length]);
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (eye.x > 0 ? -1 : 1) * 0.12);
        attachKeepWorld(head, brow, new THREE.Vector3(eye.x * 0.92, eye.y + r * 0.22, eye.z + r * 0.02), tilt);
        this.meshes.push(brow);
      }
      // Scrum cap: padded helmet with ear guards, in the team's secondary colour.
      if (o.scrumCap) {
        const cap = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), team.cap);
        shell.scale.set(1, 0.95, 1.08);
        cap.add(shell);
        for (const s of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.38, r * 0.16, 12), team.cap);
          ear.rotation.z = Math.PI / 2;
          ear.position.set(s * r * 1.02, -r * 0.35, 0);
          cap.add(ear);
        }
        const strap = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, r * 0.05, 6, 20, Math.PI), team.cap);
        strap.rotation.set(0, Math.PI / 2, Math.PI);
        strap.position.y = -r * 0.35;
        cap.add(strap);
        attachKeepWorld(head, cap, asset.headCenter.clone().add(new THREE.Vector3(0, r * 0.05, -r * 0.05)), new THREE.Quaternion());
        cap.traverse((c) => (c as THREE.Mesh).isMesh && this.meshes.push(c as THREE.Mesh));
      }
    }

    // Stylised athletic proportions: big head + hands, broad shoulders, stocky build.
    head?.scale.multiplyScalar(1.12);
    findBone(this.inner, 'LHand')?.scale.multiplyScalar(1.18);
    findBone(this.inner, 'RHand')?.scale.multiplyScalar(1.18);
    for (const key of ['LShoulder', 'RShoulder']) {
      const b = findBone(this.inner, key);
      if (!b?.parent) continue;
      const wp = b.getWorldPosition(new THREE.Vector3());
      wp.x += Math.sign(wp.x || (key === 'LShoulder' ? 1 : -1)) * H * 0.022;
      b.position.copy(b.parent.worldToLocal(wp));
    }

    const targetH = o.forward ? (o.num === 4 || o.num === 5 ? 1.98 : o.num <= 3 ? 1.84 : 1.9) : o.num === 9 ? 1.75 : 1.83;
    const s = targetH / (H * 1.02);
    const bulk = (o.forward ? 1.15 : 1) * 1.08;
    this.height = targetH;
    this.inner.scale.set(s * bulk, s, s * bulk);
    this.inner.rotation.y = Math.PI / 2; // model faces +Z; the game's local forward is +X
    this.root.add(this.inner);

    this.mixer = new THREE.AnimationMixer(this.inner);
    for (const [name, clip] of asset.clips) {
      const a = this.mixer.clipAction(clip);
      if (!LOOPING.includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }
    this.setBase('idle', 1);
    this.mixer.update(Math.random() * 2);
  }

  private fadeTo(next: THREE.AnimationAction, dur: number) {
    for (const a of this.actions.values()) if (a !== next && a.isRunning()) a.fadeOut(dur);
    next.reset().setEffectiveTimeScale(next.timeScale).setEffectiveWeight(1).fadeIn(dur).play();
  }

  /** Continuous motion (idle/walk/run/bind/lying/celebrate); crossfades 0.2s. */
  setBase(name: AnimName, timeScale = 1) {
    const a = this.actions.get(name) ?? this.actions.get('idle');
    if (!a) return;
    a.timeScale = timeScale;
    if (this.base === name) {
      a.setEffectiveTimeScale(timeScale);
      return;
    }
    this.base = name;
    if (!this.oneShot) this.fadeTo(a, 0.2);
  }

  /** One-off action (pass, kick, tackle…), returning to the base motion afterwards. */
  trigger(name: AnimName, timeScale = 1) {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = timeScale;
    this.oneShot = name;
    this.oneShotLeft = a.getClip().duration / timeScale;
    this.fadeTo(a, 0.12);
  }

  get busy() {
    return this.oneShot;
  }

  update(dt: number) {
    if (this.oneShot) {
      this.oneShotLeft -= dt;
      if (this.oneShotLeft <= 0.1) {
        this.oneShot = null;
        const b = this.base ? this.actions.get(this.base) : null;
        if (b) this.fadeTo(b, 0.2);
      }
    }
    this.mixer.update(dt);
  }

  setShadow(cast: boolean) {
    for (const m of this.meshes) m.castShadow = cast;
  }

  handPosition(out: THREE.Vector3) {
    if (this.hand) return this.hand.getWorldPosition(out);
    return out.copy(this.root.position).setY(1.1);
  }

  headPosition(out: THREE.Vector3) {
    if (this.head) return this.head.getWorldPosition(out).setY(this.root.position.y + this.height);
    return out.copy(this.root.position).setY(this.height);
  }
}
