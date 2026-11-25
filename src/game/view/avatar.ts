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

const PATTERN_ID: Record<string, number> = { plain: 0, hoops: 1, stripes: 2, halves: 3, quarters: 4, band: 5, shoulders: 6, chevron: 7, sash: 8, zigzag: 0 };

/**
 * Shirt material with the real kit pattern drawn in the mesh's own (bind-pose) space, so hoops,
 * quarters etc. stay put on the body as it moves. Trim (collar/cuffs) still comes from aTrim.
 */
function shirtMaterial(kit: Kit, roughness: number, withTrim: boolean) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness });
  const u = {
    uPri: { value: new THREE.Color(kit.primary) },
    uSec: { value: new THREE.Color(kit.secondary) },
    uAcc: { value: new THREE.Color(kit.accent) },
    uFourth: { value: new THREE.Color(kit.fourth ?? kit.accent) },
    uTrim: { value: new THREE.Color(kit.collar ?? kit.secondary) },
    uPat: { value: PATTERN_ID[kit.pattern] ?? 0 },
    uY0: { value: 0 },
    uY1: { value: 1 },
    uXW: { value: 0.25 },
  };
  m.userData.kitUniforms = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTrim;\nvarying float vTrim;\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrim = aTrim;\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uPri; uniform vec3 uSec; uniform vec3 uAcc; uniform vec3 uFourth; uniform vec3 uTrim;
uniform float uPat; uniform float uY0; uniform float uY1; uniform float uXW;
varying float vTrim; varying vec3 vObj;
vec3 kitColor() {
  float ty = clamp((vObj.y - uY0) / max(0.0001, uY1 - uY0), 0.0, 1.0);
  float tx = clamp(vObj.x / uXW, -1.5, 1.5);
  vec3 c = uPri;
  if (uPat > 0.5 && uPat < 1.5) c = mix(uPri, uSec, step(0.5, fract(ty * 6.0)));
  else if (uPat < 2.5 && uPat > 1.5) c = mix(uPri, uSec, step(0.5, fract(tx * 2.5 + 0.25)));
  else if (uPat < 3.5 && uPat > 2.5) c = tx > 0.0 ? uSec : uPri;
  else if (uPat < 4.5 && uPat > 3.5) {
    bool r = tx > 0.0; bool up = ty > 0.62;
    c = up ? (r ? uSec : uPri) : (r ? uFourth : uAcc);
  }
  else if (uPat < 5.5 && uPat > 4.5) c = (ty > 0.5 && ty < 0.66) ? uSec : uPri;
  else if (uPat < 6.5 && uPat > 5.5) c = ty > 0.8 ? uSec : uPri;
  else if (uPat < 7.5 && uPat > 6.5) { float v = ty + abs(tx) * 0.3; c = (v > 0.64 && v < 0.76) ? uSec : uPri; }
  else if (uPat > 7.5) c = abs(ty - (0.55 + tx * 0.25)) < 0.07 ? uSec : uPri;
  return c;
}`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb = kitColor();${withTrim ? '\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTrim, step(0.5, vTrim));' : ''}`);
  };
  m.customProgramCacheKey = () => (withTrim ? 'kitshirt-t' : 'kitshirt');
  return m;
}

/** Fit the pattern to the shirt mesh once we know its size. */
function fitShirt(mat: THREE.Material, geo: THREE.BufferGeometry) {
  const u = (mat as THREE.MeshStandardMaterial).userData.kitUniforms;
  if (!u || u.fitted) return;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const h = bb.max.y - bb.min.y;
  // the torso: from the waist to the top of the shoulders, about a third of the arm span wide
  u.uY0.value = bb.min.y + h * 0.05;
  u.uY1.value = bb.max.y;
  u.uXW.value = Math.max(0.0001, (bb.max.x - bb.min.x) * 0.16);
  u.fitted = true;
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
    shirt: shirtMaterial(kit, 0.85, true),
    panel: shirtMaterial(kit, 0.85, false),
    shorts: new THREE.MeshStandardMaterial({ color: kit.shorts, roughness: 0.7 }),
    socks: trimmedMaterial(kit.socks, kit.secondary, 0.9),
    cap: new THREE.MeshStandardMaterial({ color: kit.secondary === kit.primary ? '#1a1a1a' : kit.secondary, roughness: 0.6 }),
    kit,
  };
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

const LOOPING: AnimName[] = ['idle', 'walk', 'run', 'bind', 'lying', 'carry', 'celebrate', 'base'];

export interface AvatarOptions {
  num: number;
  forward: boolean;
  skin: number;
  hair: number;
  scrumCap: boolean;
  /** body size multiplier (taller and broader) */
  size?: number;
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
      else if (name === 'shirt') {
        mat = team.shirt;
        fitShirt(team.shirt, m.geometry);
      } else if (name === 'shirt2') {
        mat = team.panel;
        fitShirt(team.panel, m.geometry);
      }
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

    const size = o.size ?? 1;
    const targetH = (o.forward ? (o.num === 4 || o.num === 5 ? 1.98 : o.num <= 3 ? 1.84 : 1.9) : o.num === 9 ? 1.75 : 1.83) * size;
    const s = targetH / (H * 1.02);
    const bulk = (o.forward ? 1.15 : 1) * 1.08 * (1 + (size - 1) * 1.6); // big men are broader, not just taller
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

  private fadeTo(next: THREE.AnimationAction, dur: number, syncFrom?: THREE.AnimationAction | null) {
    // Walk <-> run keep the same point in the stride so the legs don't snap.
    const phase = syncFrom && syncFrom.isRunning() ? (syncFrom.time / syncFrom.getClip().duration) % 1 : null;
    for (const a of this.actions.values()) if (a !== next && a.isRunning()) a.fadeOut(dur);
    next.reset().setEffectiveTimeScale(next.timeScale).setEffectiveWeight(1).fadeIn(dur).play();
    if (phase !== null) next.time = phase * next.getClip().duration;
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
    const prev = this.base;
    this.base = name;
    const gait = (n: AnimName | null) => n === 'walk' || n === 'run';
    if (!this.oneShot) this.fadeTo(a, gait(prev) && gait(name) ? 0.3 : 0.22, gait(prev) && gait(name) && prev ? this.actions.get(prev) : null);
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
