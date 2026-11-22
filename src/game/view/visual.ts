import * as THREE from 'three';
import type { AnimName } from './assets';
import { animateModel, createPlayerModel, makeTeamLook, type PlayerModel, type Pose } from '../model';
import type { Kit } from '../../data/nations';

/** What the engine needs from a player's visual representation. */
export interface Visual {
  readonly root: THREE.Object3D;
  readonly height: number;
  readonly busy: AnimName | null;
  setBase(name: AnimName, timeScale?: number): void;
  trigger(name: AnimName, timeScale?: number): void;
  update(dt: number): void;
  setShadow(cast: boolean): void;
  handPosition(out: THREE.Vector3): THREE.Vector3;
  headPosition(out: THREE.Vector3): THREE.Vector3;
}

const lookCache = new Map<string, ReturnType<typeof makeTeamLook>>();

/** Fallback when the GLB can't load (e.g. first launch offline): the original low-poly model. */
export class LegacyVisual implements Visual {
  readonly root: THREE.Object3D;
  readonly height = 1.85;
  private m: PlayerModel;
  private base: AnimName = 'idle';
  private shot: AnimName | null = null;
  private shotLeft = 0;
  private speed = 0;

  constructor(kit: Kit, skin: number, forward: boolean) {
    const key = JSON.stringify(kit);
    let look = lookCache.get(key);
    if (!look) lookCache.set(key, (look = makeTeamLook(kit)));
    this.m = createPlayerModel(look, skin, forward ? 1.06 : 0.97);
    this.root = this.m.root;
  }
  get busy() {
    return this.shot;
  }
  setBase(name: AnimName, ts = 1) {
    this.base = name;
    this.speed = name === 'run' ? 7 * ts : name === 'walk' ? 2 * ts : 0;
  }
  trigger(name: AnimName) {
    this.shot = name;
    this.shotLeft = 0.45;
  }
  update(dt: number) {
    if (this.shot && (this.shotLeft -= dt) <= 0) this.shot = null;
    const n = this.shot ?? this.base;
    const pose: Pose =
      n === 'lying' || n === 'fall' ? 'down' : n === 'dive' || n === 'tackle' ? 'dive' : n === 'bind' ? 'bound' : n === 'kick' ? 'kick' : n === 'idle' ? 'idle' : 'run';
    animateModel(this.m, this.speed, dt, pose);
  }
  setShadow() {}
  handPosition(out: THREE.Vector3) {
    return out.copy(this.root.position).setY(1.05);
  }
  headPosition(out: THREE.Vector3) {
    return out.copy(this.root.position).setY(1.85);
  }
}
