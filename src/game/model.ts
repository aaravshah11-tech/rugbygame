import * as THREE from 'three';
import type { Kit } from '../data/nations';
import { kitTexture } from './kit';

const SKIN = ['#f1c9a5', '#d9a57c', '#b97f55', '#8d5a3b', '#5e3a24'];
const skinMats = SKIN.map((c) => new THREE.MeshLambertMaterial({ color: c }));
const headGeo = new THREE.IcosahedronGeometry(0.15, 1);
const torsoGeo = new THREE.BoxGeometry(0.56, 0.66, 0.32);
torsoGeo.translate(0, 0.33, 0);

/** Box with a two-tone vertex colour split at `splitY` (fraction from the top). */
function twoToneBox(w: number, h: number, d: number, top: string, bottom: string, split: number) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 4, 1);
  g.translate(0, -h / 2, 0); // pivot at the top (hip / shoulder)
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color(top);
  const b = new THREE.Color(bottom);
  for (let i = 0; i < pos.count; i++) {
    const c = -pos.getY(i) / h < split ? a : b;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export interface TeamLook {
  torso: THREE.MeshLambertMaterial;
  limbMat: THREE.MeshLambertMaterial;
  legGeos: THREE.BufferGeometry[]; // per skin tone
  armGeos: THREE.BufferGeometry[];
}

export function makeTeamLook(kit: Kit): TeamLook {
  const torso = new THREE.MeshLambertMaterial({ map: kitTexture(kit) });
  const limbMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const legGeos = SKIN.map((s) => {
    // shorts, then skin, then socks
    const g = twoToneBox(0.19, 0.88, 0.21, kit.shorts, kit.socks, 0.42);
    const pos = g.attributes.position;
    const col = g.attributes.color as THREE.BufferAttribute;
    const skin = new THREE.Color(s);
    for (let i = 0; i < pos.count; i++) {
      const f = -pos.getY(i) / 0.88;
      if (f > 0.4 && f < 0.6) col.setXYZ(i, skin.r, skin.g, skin.b);
    }
    return g;
  });
  const armGeos = SKIN.map((s) => twoToneBox(0.14, 0.62, 0.15, kit.primary, s, 0.35));
  return { torso, limbMat, legGeos, armGeos };
}

export interface PlayerModel {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  phase: number;
}

export function createPlayerModel(look: TeamLook, skinIdx: number, scale = 1): PlayerModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legL = new THREE.Mesh(look.legGeos[skinIdx], look.limbMat);
  const legR = new THREE.Mesh(look.legGeos[skinIdx], look.limbMat);
  legL.position.set(0, 0.9, 0.13);
  legR.position.set(0, 0.9, -0.13);
  const torso = new THREE.Mesh(torsoGeo, look.torso);
  torso.position.y = 0.88;
  const head = new THREE.Mesh(headGeo, skinMats[skinIdx]);
  head.position.y = 1.7;
  const armL = new THREE.Mesh(look.armGeos[skinIdx], look.limbMat);
  const armR = new THREE.Mesh(look.armGeos[skinIdx], look.limbMat);
  armL.position.set(0, 1.5, 0.36);
  armR.position.set(0, 1.5, -0.36);
  body.add(legL, legR, torso, head, armL, armR);
  // Model faces +x.
  torso.rotation.y = Math.PI / 2;
  root.scale.setScalar(scale);
  return { root, body, legL, legR, armL, armR, phase: Math.random() * 6 };
}

export type Pose = 'run' | 'down' | 'bound' | 'carry' | 'dive' | 'kick' | 'idle';

/** Procedural animation: limb swing scales with speed; poses for tackles, rucks and kicks. */
export function animateModel(m: PlayerModel, speed: number, dt: number, pose: Pose) {
  const s = Math.min(speed / 8, 1.2);
  m.phase += dt * (4 + speed * 1.3);
  const swing = Math.sin(m.phase) * 0.9 * s;
  const b = m.body;
  if (pose === 'down') {
    b.rotation.z = lerpAngle(b.rotation.z, -Math.PI / 2, dt * 10);
    b.position.y = THREE.MathUtils.lerp(b.position.y, 0.18, dt * 10);
    m.legL.rotation.z = m.legR.rotation.z = 0;
    m.armL.rotation.z = m.armR.rotation.z = -2.6;
    return;
  }
  if (pose === 'dive') {
    b.rotation.z = lerpAngle(b.rotation.z, -1.3, dt * 12);
    b.position.y = THREE.MathUtils.lerp(b.position.y, 0.4, dt * 12);
    m.armL.rotation.z = m.armR.rotation.z = -2.8;
    return;
  }
  const lean = pose === 'bound' ? -0.95 : -0.12 * s;
  b.rotation.z = lerpAngle(b.rotation.z, lean, dt * 8);
  b.position.y = THREE.MathUtils.lerp(b.position.y, pose === 'bound' ? -0.25 : Math.abs(Math.sin(m.phase)) * 0.06 * s, dt * 10);
  if (pose === 'kick') {
    m.legR.rotation.z = THREE.MathUtils.lerp(m.legR.rotation.z, 1.4, dt * 18);
    m.legL.rotation.z = 0.2;
    m.armL.rotation.z = m.armR.rotation.z = 0.5;
    return;
  }
  if (pose === 'bound') {
    m.legL.rotation.z = 0.5 + swing * 0.3;
    m.legR.rotation.z = 0.5 - swing * 0.3;
    m.armL.rotation.z = m.armR.rotation.z = -1.6;
    return;
  }
  m.legL.rotation.z = swing;
  m.legR.rotation.z = -swing;
  if (pose === 'carry') {
    m.armL.rotation.z = 0.9;
    m.armR.rotation.z = -swing * 0.8;
  } else {
    m.armL.rotation.z = -swing * 0.8;
    m.armR.rotation.z = swing * 0.8;
  }
}

function lerpAngle(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, t);
}

export function createBall(): THREE.Mesh {
  const g = new THREE.SphereGeometry(1, 12, 8);
  g.scale(0.15, 0.095, 0.095);
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f3f1ea';
  x.fillRect(0, 0, 64, 32);
  x.fillStyle = '#c6ff1a';
  x.fillRect(14, 0, 6, 32);
  x.fillRect(44, 0, 6, 32);
  x.fillStyle = '#15202b';
  x.fillRect(28, 13, 8, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t }));
}
