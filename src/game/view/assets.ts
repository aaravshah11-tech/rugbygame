import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Player model: Quaternius stylised low-poly man (Male_Shirt), exported from the
 * uploaded .blend to GLB with all actions baked. To swap models, point MODEL_URL at
 * another rigged GLB and map its clip names below. Clips are retargeted by bone name;
 * anything missing is generated from the Idle pose, and anything that can't be matched
 * falls back to Idle, so a player never T-poses.
 */
export const MODEL_URL = './models/rugby_player.glb';

export type AnimName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sidestepL'
  | 'sidestepR'
  | 'pass'
  | 'catch'
  | 'kick'
  | 'tackle'
  | 'dive'
  | 'fall'
  | 'getup'
  | 'celebrate'
  | 'handoff'
  | 'bind'
  | 'lying'
  | 'carry'
  | 'base';

/** Source clip for each game animation (first match wins). */
export const CLIP_SOURCES: Partial<Record<AnimName, string[]>> = {
  idle: ['Man_Idle', 'idle', 'Idle'],
  walk: ['Man_Walk', 'walk', 'Walk'],
  run: ['Man_Run', 'run', 'Run'],
  fall: ['Man_Death', 'Death'],
  celebrate: ['Man_Jump', 'Jump'],
  handoff: ['Man_Punch', 'Punch'],
};

/** Generic bone keys -> candidate names in the model (Quaternius first, Mixamo as fallback). */
const BONES: Record<string, string[]> = {
  Hips: ['Hips', 'mixamorigHips'],
  Spine: ['Abdomen', 'mixamorigSpine'],
  Chest: ['Torso', 'mixamorigSpine2', 'mixamorigSpine1'],
  Neck: ['Neck', 'mixamorigNeck'],
  Head: ['Head', 'mixamorigHead'],
  LShoulder: ['ShoulderL', 'Shoulder.L', 'mixamorigLeftShoulder'],
  LArm: ['UpperArmL', 'UpperArm.L', 'mixamorigLeftArm'],
  LForeArm: ['LowerArmL', 'LowerArm.L', 'mixamorigLeftForeArm'],
  LHand: ['PalmL', 'Palm.L', 'mixamorigLeftHand'],
  RShoulder: ['ShoulderR', 'Shoulder.R', 'mixamorigRightShoulder'],
  RArm: ['UpperArmR', 'UpperArm.R', 'mixamorigRightArm'],
  RForeArm: ['LowerArmR', 'LowerArm.R', 'mixamorigRightForeArm'],
  RHand: ['PalmR', 'Palm.R', 'mixamorigRightHand'],
  LUpLeg: ['UpperLegL', 'UpperLeg.L', 'mixamorigLeftUpLeg'],
  LLeg: ['LowerLegL', 'LowerLeg.L', 'mixamorigLeftLeg'],
  LFoot: ['FootL', 'Foot.L', 'mixamorigLeftFoot'],
  RUpLeg: ['UpperLegR', 'UpperLeg.R', 'mixamorigRightUpLeg'],
  RLeg: ['LowerLegR', 'LowerLeg.R', 'mixamorigRightLeg'],
  RFoot: ['FootR', 'Foot.R', 'mixamorigRightFoot'],
};

export function findBone(root: THREE.Object3D, key: string): THREE.Object3D | null {
  for (const n of BONES[key] ?? [key]) {
    const o = root.getObjectByName(n);
    if (o) return o;
  }
  return null;
}

export interface PlayerAsset {
  scene: THREE.Object3D;
  clips: Map<AnimName, THREE.AnimationClip>;
  height: number;
  /** model-space anchor points measured in the idle pose (metres, unscaled) */
  backZ: number;
  backY: number;
  headCenter: THREE.Vector3;
  headRadius: number;
  eyes: THREE.Vector3[];
}

let pending: Promise<PlayerAsset | null> | null = null;

export function loadPlayerAsset(renderer?: THREE.WebGLRenderer): Promise<PlayerAsset | null> {
  if (pending) return pending;
  pending = new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    if (renderer) loader.setKTX2Loader(new KTX2Loader().setTranscoderPath('./basis/').detectSupport(renderer));
    loader.load(
      MODEL_URL,
      (gltf) => {
        try {
          resolve(prepare(gltf.scene, gltf.animations));
        } catch (e) {
          console.warn('Player model could not be prepared, using fallback', e);
          resolve(null);
        }
      },
      undefined,
      (err) => {
        console.warn('Player model failed to load, using fallback', err);
        resolve(null);
      },
    );
  });
  return pending;
}

// ------------------------------------------------------------------ retargeting

const norm = (s: string) => s.toLowerCase().replace(/^mixamorig:?/, '').replace(/[^a-z0-9]/g, '');

/**
 * Keeps only tracks whose bone exists in the model (matched by normalised name) and
 * drops scale tracks so per-player body proportions survive. Returns null if nothing matches.
 */
export function retargetClip(clip: THREE.AnimationClip, root: THREE.Object3D, name: string): THREE.AnimationClip | null {
  const byNorm = new Map<string, string>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) byNorm.set(norm(o.name), o.name);
  });
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const node = t.name.slice(0, dot);
    const prop = t.name.slice(dot + 1);
    if (prop === 'scale') continue;
    const target = byNorm.get(norm(node));
    if (!target) continue;
    const c = t.clone();
    c.name = `${target}.${prop}`;
    tracks.push(c);
  }
  if (!tracks.length) return null;
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

type TrackCtor = new (name: string, times: Float32Array, values: Float32Array) => THREE.KeyframeTrack;

function reverseClip(clip: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const tracks = clip.tracks.map((t) => {
    const size = t.getValueSize();
    const n = t.times.length;
    const times = new Float32Array(n);
    const values = new Float32Array(t.values.length);
    for (let i = 0; i < n; i++) {
      times[i] = clip.duration - t.times[n - 1 - i];
      values.set(t.values.subarray((n - 1 - i) * size, (n - i) * size), i * size);
    }
    return new (t.constructor as TrackCtor)(t.name, times, values);
  });
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

function holdLastFrame(clip: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const tracks = clip.tracks.map((t) => {
    const size = t.getValueSize();
    const last = Array.from(t.values.slice(t.values.length - size));
    return new (t.constructor as TrackCtor)(t.name, new Float32Array([0, 1]), new Float32Array([...last, ...last]));
  });
  return new THREE.AnimationClip(name, 1, tracks);
}

// ------------------------------------------------------------------ preparation

function measure(meshes: THREE.SkinnedMesh[]) {
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  const byMat = new Map<string, THREE.Vector3[]>();
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    const name = (m.material as THREE.Material).name;
    const list: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      m.getVertexPosition(i, v);
      v.applyMatrix4(m.matrixWorld);
      box.expandByPoint(v);
      list.push(v.clone());
    }
    byMat.set(name, (byMat.get(name) ?? []).concat(list));
    (m.userData as { pts?: THREE.Vector3[] }).pts = list;
  }
  return { box, byMat };
}

function prepare(gltfScene: THREE.Object3D, animations: THREE.AnimationClip[]): PlayerAsset {
  // Wrap so we can turn the model to face +Z and stand it on y = 0.
  const scene = new THREE.Group();
  scene.add(gltfScene);
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  if (!meshes.length) throw new Error('No skinned meshes in player model');

  // Retarget the source clips by bone name.
  const clips = new Map<AnimName, THREE.AnimationClip>();
  for (const [name, sources] of Object.entries(CLIP_SOURCES) as [AnimName, string[]][]) {
    const src = animations.find((a) => sources.includes(a.name));
    const c = src && retargetClip(src, scene, name);
    if (c) clips.set(name, c);
  }
  const idle = clips.get('idle');
  if (!idle) throw new Error('Model has no usable idle clip');

  // Pose the model in frame 0 of Idle: every measurement and every generated clip starts from here.
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(idle).play();
  mixer.update(0);
  scene.updateMatrixWorld(true);

  // Which way does the face point? The eyes sit in front of the head bone.
  let m0 = measure(meshes);
  const eyePts = m0.byMat.get('Eyes') ?? [];
  const headBone = findBone(scene, 'Head');
  const headPos = headBone ? headBone.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  const eyeC = eyePts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, eyePts.length));
  const yaw = eyePts.length ? Math.atan2(eyeC.x - headPos.x, eyeC.z - headPos.z) : 0;
  gltfScene.rotation.y = -yaw;
  scene.updateMatrixWorld(true);
  m0 = measure(meshes);
  gltfScene.position.y = -m0.box.min.y;
  scene.updateMatrixWorld(true);
  const { box, byMat } = measure(meshes);
  const height = box.max.y - box.min.y;

  // Trim masks: collar + cuffs on the shirt, hoops on the socks (a vertex attribute, no textures).
  for (const m of meshes) {
    const name = (m.material as THREE.Material).name;
    const pts = (m.userData as { pts: THREE.Vector3[] }).pts;
    const trim = new Float32Array(pts.length);
    if (/^shirt$/i.test(name)) {
      const top = Math.max(...pts.map((p) => p.y));
      const skin = m.geometry.attributes.skinIndex;
      const wts = m.geometry.attributes.skinWeight;
      const bones = m.skeleton.bones;
      const armBones = new Set([findBone(scene, 'LArm'), findBone(scene, 'RArm'), findBone(scene, 'LForeArm'), findBone(scene, 'RForeArm')].filter(Boolean));
      const shL = findBone(scene, 'LArm')?.getWorldPosition(new THREE.Vector3());
      const shR = findBone(scene, 'RArm')?.getWorldPosition(new THREE.Vector3());
      const armDist = pts.map((p, i) => {
        let best = 0;
        let bi = -1;
        for (let k = 0; k < 4; k++) {
          const w = wts.getComponent(i, k);
          if (w > best) {
            best = w;
            bi = skin.getComponent(i, k);
          }
        }
        if (bi < 0 || !armBones.has(bones[bi])) return -1;
        const sh = p.x > 0 ? shL : shR;
        return sh ? p.distanceTo(sh) : -1;
      });
      const maxArm = Math.max(...armDist);
      const neck = findBone(scene, 'Neck')?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(0, top, 0);
      pts.forEach((p, i) => {
        const collar = p.y > top - height * 0.035 && Math.hypot(p.x - neck.x, p.z - neck.z) < height * 0.06;
        const cuff = armDist[i] > 0 && armDist[i] > maxArm - height * 0.022;
        trim[i] = collar || cuff ? 1 : 0;
      });
    } else if (/^pants$/i.test(name)) {
      // The model wears long trousers: cut them into rugby shorts, bare knees and long socks.
      const knee = findBone(scene, 'LLeg')?.getWorldPosition(new THREE.Vector3()).y ?? height * 0.28;
      const hip = findBone(scene, 'LUpLeg')?.getWorldPosition(new THREE.Vector3()).y ?? height * 0.5;
      const shortsBottom = knee + (hip - knee) * 0.42;
      const sockTop = knee - height * 0.035;
      const region = pts.map((p) => (p.y > shortsBottom ? 0 : p.y > sockTop ? 1 : 2));
      pts.forEach((p, i) => {
        if (region[i] !== 2) return;
        const u = (sockTop - p.y) / (height * 0.2); // 0 at the top of the sock
        trim[i] = u < 0.08 || (u > 0.16 && u < 0.26) ? 1 : 0;
      });
      const g = m.geometry;
      const index = g.index ? Array.from(g.index.array as ArrayLike<number>) : pts.map((_, i) => i);
      const buckets: number[][] = [[], [], []];
      for (let t = 0; t < index.length; t += 3) {
        const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
        const r = Math.round((region[a] + region[b] + region[c]) / 3);
        buckets[r].push(a, b, c);
      }
      g.clearGroups();
      const sorted: number[] = [];
      buckets.forEach((bk, r) => {
        if (!bk.length) return;
        g.addGroup(sorted.length, bk.length, r);
        sorted.push(...bk);
      });
      g.setIndex(sorted);
      m.userData.legSplit = true;
    }
    m.geometry.setAttribute('aTrim', new THREE.BufferAttribute(trim, 1));
    m.frustumCulled = false;
    delete (m.userData as { pts?: unknown }).pts;
  }

  // Anchors for the shirt number, scrum cap and eyebrows.
  const shirt = byMat.get('Shirt') ?? [];
  let backZ = -height * 0.07;
  let backY = height * 0.7;
  const spine = shirt.filter((p) => Math.abs(p.x) < height * 0.05);
  if (spine.length) {
    const ys = spine.map((p) => p.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    backY = lo + (hi - lo) * 0.6;
    const band = spine.filter((p) => Math.abs(p.y - backY) < height * 0.05);
    if (band.length) backZ = Math.min(...band.map((p) => p.z));
  }
  const hair = [...(byMat.get('Hair') ?? []), ...(byMat.get('Hair2') ?? [])];
  const neckY = findBone(scene, 'Head')?.getWorldPosition(new THREE.Vector3()).y ?? height * 0.85;
  const headPts = [...hair, ...(byMat.get('Skin') ?? []).filter((p) => p.y > neckY)];
  const hb = new THREE.Box3().setFromPoints(headPts.length ? headPts : [new THREE.Vector3(0, height * 0.92, 0)]);
  const headCenter = hb.getCenter(new THREE.Vector3());
  const headRadius = Math.max(hb.max.x - hb.min.x, hb.max.z - hb.min.z) / 2;
  const eyesNow = byMat.get('Eyes') ?? [];
  const eyes = [eyesNow.filter((p) => p.x > 0), eyesNow.filter((p) => p.x <= 0)]
    .filter((l) => l.length)
    .map((l) => l.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / l.length));

  // Generated / derived clips, then fill any gaps with Idle so nothing can T-pose.
  const fall = clips.get('fall');
  if (fall) {
    clips.set('lying', holdLastFrame(fall, 'lying'));
    clips.set('getup', reverseClip(fall, 'getup'));
  }
  const synth = new ClipBuilder(scene);
  for (const [name, frames] of Object.entries(POSES) as [AnimName, KeyPose[]][]) {
    if (!clips.has(name)) {
      try {
        clips.set(name, synth.build(name, frames));
      } catch (e) {
        console.warn(`Could not build ${name}, using idle`, e);
      }
    }
  }
  if (!clips.has('walk')) clips.set('walk', clips.get('run') ?? idle);
  if (!clips.has('run')) clips.set('run', clips.get('walk') ?? idle);
  const all: AnimName[] = ['idle', 'walk', 'run', 'sidestepL', 'sidestepR', 'pass', 'catch', 'kick', 'tackle', 'dive', 'fall', 'getup', 'celebrate', 'handoff', 'bind', 'lying', 'carry', 'base'];
  for (const n of all) if (!clips.has(n)) clips.set(n, idle);

  // Leave the template in the Idle pose so every clone starts from it.
  mixer.stopAllAction();
  mixer.clipAction(idle).play();
  mixer.update(0);
  mixer.uncacheRoot(scene);
  scene.updateMatrixWorld(true);
  return { scene, clips, height, backZ, backY, headCenter, headRadius, eyes };
}

// ------------------------------------------------------------------ procedural clips
// Poses are offsets from the Idle pose (arms hanging). Model space: facing +Z, left = +X, up = +Y.
// Arm forward = x -90, arm out sideways = z +90 (left) / -90 (right); elbow bend = x -;
// thigh forward = x -, knee bend = x +; bend at the waist = x +; twist = y.

type Rot = [axis: 'x' | 'y' | 'z', deg: number][];
interface PoseDef {
  bones: Partial<Record<string, Rot>>;
  hips?: { dy?: number; dz?: number; rot?: Rot };
}
interface KeyPose {
  t: number;
  p: PoseDef;
}
const IDLE: PoseDef = { bones: {} };

const CROUCH: PoseDef = {
  bones: { LUpLeg: [['x', -65]], RUpLeg: [['x', -65]], LLeg: [['x', 85]], RLeg: [['x', 85]], Spine: [['x', 25]] },
  hips: { dy: -0.3, rot: [['x', 15]] },
};
const merge = (...ps: Partial<PoseDef>[]): PoseDef => ({
  bones: Object.assign({}, ...ps.map((p) => p.bones ?? {})),
  hips: ps.reduce<PoseDef['hips']>((h, p) => (p.hips ? { ...h, ...p.hips } : h), undefined),
});
const BIND_POSE = (lean: number, legL: number, legR: number) =>
  merge(CROUCH, {
    bones: {
      Spine: [['x', lean]],
      Chest: [['x', 15]],
      LArm: [['x', -70], ['z', -25]],
      RArm: [['x', -70], ['z', 25]],
      LForeArm: [['x', -50]],
      RForeArm: [['x', -50]],
      Head: [['x', -35]],
      LUpLeg: [['x', legL]],
      RUpLeg: [['x', legR]],
      LLeg: [['x', 85]],
      RLeg: [['x', 85]],
    },
    hips: { dy: -0.36, rot: [['x', 28]] },
  });

const POSES: Partial<Record<AnimName, KeyPose[]>> = {
  carry: [{ t: 0, p: { bones: { RArm: [['x', -30]], RForeArm: [['x', -70]] } } }],
  sidestepL: [
    { t: 0, p: IDLE },
    { t: 0.12, p: { bones: { LUpLeg: [['z', 25]], RUpLeg: [['z', 6], ['x', -20]], RLeg: [['x', 40]], Spine: [['z', -12]], LArm: [['z', 30]] }, hips: { dy: -0.1, rot: [['z', 14]] } } },
    { t: 0.32, p: { bones: { RUpLeg: [['z', -18]], LLeg: [['x', 30]], Spine: [['z', 8]] }, hips: { dy: -0.05, rot: [['z', -8]] } } },
    { t: 0.45, p: IDLE },
  ],
  sidestepR: [
    { t: 0, p: IDLE },
    { t: 0.12, p: { bones: { RUpLeg: [['z', -25]], LUpLeg: [['z', -6], ['x', -20]], LLeg: [['x', 40]], Spine: [['z', 12]], RArm: [['z', -30]] }, hips: { dy: -0.1, rot: [['z', -14]] } } },
    { t: 0.32, p: { bones: { LUpLeg: [['z', 18]], RLeg: [['x', 30]], Spine: [['z', -8]] }, hips: { dy: -0.05, rot: [['z', 8]] } } },
    { t: 0.45, p: IDLE },
  ],
  pass: [
    { t: 0, p: IDLE },
    { t: 0.14, p: { bones: { Spine: [['y', -30]], Chest: [['y', -15]], LArm: [['x', -60], ['y', -40]], RArm: [['x', -45], ['y', -50]], LForeArm: [['x', -50]], RForeArm: [['x', -40]] } } },
    { t: 0.3, p: { bones: { Spine: [['y', 30]], Chest: [['y', 15]], LArm: [['x', -85], ['y', 40]], RArm: [['x', -80], ['y', 30]], LForeArm: [['x', -10]], RForeArm: [['x', -10]] } } },
    { t: 0.55, p: IDLE },
  ],
  catch: [
    { t: 0, p: IDLE },
    { t: 0.15, p: { bones: { LArm: [['x', -100]], RArm: [['x', -100]], LForeArm: [['x', -20]], RForeArm: [['x', -20]], Spine: [['x', 8]] } } },
    { t: 0.35, p: { bones: { LArm: [['x', -50], ['z', -15]], RArm: [['x', -50], ['z', 15]], LForeArm: [['x', -90]], RForeArm: [['x', -90]], Spine: [['x', 10]] } } },
    { t: 0.5, p: IDLE },
  ],
  kick: [
    { t: 0, p: IDLE },
    { t: 0.18, p: { bones: { LArm: [['z', 45]], RArm: [['x', -40]], RUpLeg: [['x', 35]], RLeg: [['x', 80]], Spine: [['x', -5]] }, hips: { dy: -0.04 } } },
    { t: 0.36, p: { bones: { LArm: [['z', 55]], RArm: [['x', 30]], RUpLeg: [['x', -100]], RLeg: [['x', 5]], Spine: [['x', -14]] }, hips: { dy: 0.02, rot: [['x', -8]] } } },
    { t: 0.7, p: IDLE },
  ],
  tackle: [
    { t: 0, p: IDLE },
    { t: 0.18, p: merge(CROUCH, { bones: { Spine: [['x', 40]], Chest: [['x', 15]], LArm: [['x', -90]], RArm: [['x', -90]], LForeArm: [['x', -45]], RForeArm: [['x', -45]], Head: [['x', -30]] } }) },
    { t: 0.42, p: { bones: { Spine: [['x', 20]], LArm: [['x', -150]], RArm: [['x', -150]], LForeArm: [['x', -40]], RForeArm: [['x', -40]], LUpLeg: [['x', 25]], RUpLeg: [['x', 40]], LLeg: [['x', 30]], Head: [['x', -40]] }, hips: { dy: -0.6, dz: 0.3, rot: [['x', 65]] } } },
  ],
  dive: [
    { t: 0, p: merge(CROUCH, { bones: { LArm: [['x', -120]], RArm: [['x', -120]] } }) },
    { t: 0.25, p: { bones: { LArm: [['x', -165]], RArm: [['x', -165]], LUpLeg: [['x', 25]], RUpLeg: [['x', 15]], Head: [['x', -45]] }, hips: { dy: -0.4, dz: 0.4, rot: [['x', 80]] } } },
    { t: 0.5, p: { bones: { LArm: [['x', -170]], RArm: [['x', -170]], LUpLeg: [['x', 10]], RUpLeg: [['x', 8]], LLeg: [['x', 20]], RLeg: [['x', 30]], Head: [['x', -40]] }, hips: { dy: -0.82, dz: 0.3, rot: [['x', 88]] } } },
  ],
  // scrum-half crouched at the back of the ruck, hands on the ball, looking up at the line
  base: (() => {
    // Deep, wide squat behind the ruck: knees bent hard, back almost flat, both hands down on
    // the ball between his feet, head up scanning the line. A slight rock sells "ready to pass".
    const pose = (lean: number, headY: number, dy: number): PoseDef =>
      merge(CROUCH, {
        bones: {
          LUpLeg: [['x', -95], ['z', 22]], RUpLeg: [['x', -95], ['z', -22]],
          LLeg: [['x', 120]], RLeg: [['x', 120]],
          Spine: [['x', lean]], Chest: [['x', 18]], Neck: [['x', -20]], Head: [['x', -50], ['y', headY]],
          LArm: [['x', -38], ['z', -14]], RArm: [['x', -38], ['z', 14]],
          LForeArm: [['x', -8]], RForeArm: [['x', -8]],
        },
        hips: { dy, rot: [['x', 25]] },
      });
    return [
      { t: 0, p: pose(62, -12, -0.58) },
      { t: 0.7, p: pose(66, 14, -0.6) },
      { t: 1.4, p: pose(62, -12, -0.58) },
    ];
  })(),
  bind: [
    { t: 0, p: BIND_POSE(45, -65, -65) },
    { t: 0.6, p: BIND_POSE(48, -55, -75) },
    { t: 1.2, p: BIND_POSE(45, -65, -65) },
  ],
};

const POSED = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LArm', 'LForeArm', 'LHand', 'RArm', 'RForeArm', 'RHand', 'LUpLeg', 'LLeg', 'RUpLeg', 'RLeg'];
/** In this rig the feet are IK targets parented at the root; they must follow the shins. */
const FOLLOWERS: [string, string][] = [
  ['LFoot', 'LLeg'],
  ['RFoot', 'RLeg'],
];

class ClipBuilder {
  private bones = new Map<string, { bone: THREE.Object3D; local: THREE.Quaternion; world: THREE.Quaternion; pos: THREE.Vector3; parentInv: THREE.Matrix3 }>();
  private followers: { bone: THREE.Object3D; parent: THREE.Object3D; offset: THREE.Matrix4; pos: THREE.Vector3; quat: THREE.Quaternion }[] = [];

  constructor(private root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const key of POSED) {
      const bone = findBone(root, key);
      if (!bone) continue;
      const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv);
      const parentInv = new THREE.Matrix3();
      if (bone.parent) parentInv.setFromMatrix4(bone.parent.matrixWorld).invert();
      this.bones.set(key, { bone, local: bone.quaternion.clone(), world, pos: bone.position.clone(), parentInv });
    }
    for (const [f, p] of FOLLOWERS) {
      const fb = findBone(root, f);
      const pb = findBone(root, p);
      if (!fb || !pb) continue;
      let isChild = false;
      fb.traverseAncestors((a) => {
        if (a === pb) isChild = true;
      });
      if (isChild) continue;
      const offset = new THREE.Matrix4().copy(pb.matrixWorld).invert().multiply(fb.matrixWorld);
      this.followers.push({ bone: fb, parent: pb, offset, pos: fb.position.clone(), quat: fb.quaternion.clone() });
    }
  }

  private apply(pose: PoseDef) {
    const axes = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
    const tmp = new THREE.Quaternion();
    for (const [key, b] of this.bones) {
      const rot = key === 'Hips' ? pose.hips?.rot : pose.bones[key];
      const R = new THREE.Quaternion();
      for (const [a, deg] of rot ?? []) R.premultiply(tmp.setFromAxisAngle(axes[a], THREE.MathUtils.degToRad(deg)));
      // local' = local * (W^-1 R W): rotate in model-space axes on top of the parent's motion
      b.bone.quaternion.copy(b.local).multiply(b.world.clone().invert().multiply(R).multiply(b.world));
      b.bone.position.copy(b.pos);
      if (key === 'Hips' && pose.hips) b.bone.position.add(new THREE.Vector3(0, pose.hips.dy ?? 0, pose.hips.dz ?? 0).applyMatrix3(b.parentInv));
    }
    for (const f of this.followers) {
      f.bone.position.copy(f.pos);
      f.bone.quaternion.copy(f.quat);
    }
    this.root.updateMatrixWorld(true);
    for (const f of this.followers) {
      const world = new THREE.Matrix4().copy(f.parent.matrixWorld).multiply(f.offset);
      const local = new THREE.Matrix4().copy(f.bone.parent!.matrixWorld).invert().multiply(world);
      local.decompose(f.bone.position, f.bone.quaternion, new THREE.Vector3());
    }
  }

  build(name: string, frames: KeyPose[]): THREE.AnimationClip {
    if (frames.length === 1) frames = [frames[0], { ...frames[0], t: 1 }];
    const times = frames.map((f) => f.t);
    const q: Record<string, number[]> = {};
    const p: Record<string, number[]> = {};
    for (const f of frames) {
      this.apply(f.p);
      for (const { bone } of this.bones.values()) (q[bone.name] ??= []).push(...bone.quaternion.toArray());
      const hips = this.bones.get('Hips');
      if (hips) (p[hips.bone.name] ??= []).push(...hips.bone.position.toArray());
      for (const fl of this.followers) {
        (q[fl.bone.name] ??= []).push(...fl.bone.quaternion.toArray());
        (p[fl.bone.name] ??= []).push(...fl.bone.position.toArray());
      }
    }
    this.apply(IDLE);
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [n, vals] of Object.entries(q)) tracks.push(new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, vals));
    for (const [n, vals] of Object.entries(p)) tracks.push(new THREE.VectorKeyframeTrack(`${n}.position`, times, vals));
    return new THREE.AnimationClip(name, -1, tracks);
  }
}
