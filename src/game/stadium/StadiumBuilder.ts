import * as THREE from 'three';
import { buildSkyAndLights } from './lights';
import { buildStands } from './stands';
import { buildRoofs } from './roof';
import { buildBoards } from './boards';
import { buildCrowd } from './crowd';
import { buildSchoolGround } from './fields';
import { buildPitch } from './pitch';
import { buildPitchside } from './pitchside';
import type { StadiumContext, StadiumEvent, StadiumSpec, StadiumView } from './types';

/**
 * Build a whole ground from its spec: sky and lights, the pitch, the stadium (bowl or separate
 * stands) or a school ground, crowd, boards. Everything goes into one group so it can be removed
 * and disposed in one go when the match ends.
 *
 * @param pitchPx pixels per metre for the pitch texture (graphics setting)
 * @param postPads colours of the post pads at the -x and +x ends
 */
export function buildStadium(scene: THREE.Scene, renderer: THREE.WebGLRenderer, spec: StadiumSpec, ctx: StadiumContext, pitchPx: number, postPads: [string, string]): StadiumView {
  const group = new THREE.Group();
  group.name = `stadium:${spec.id}`;
  scene.add(group);
  const key = buildSkyAndLights(scene, renderer, ctx.quality);
  // posts padded in the home side's colours; the pitch mown the ground's own way
  void postPads;
  buildPitch(group, renderer, pitchPx, [ctx.home.primary, ctx.home.primary], { mow: spec.pitch.mow, inGoal: spec.pitch.inGoal, artificial: spec.pitch.artificial, wet: ctx.weather === 'rain' ? 1 : 0 }, ctx.home.secondary);

  const right = new THREE.Vector3();
  // crowd mood, driven by match events
  const mood = { cheerH: 0, cheerA: 0, sadH: 0, sadA: 0, flash: 0 };
  const event = (e: StadiumEvent) => {
    if (e === 'tryHome') Object.assign(mood, { cheerH: 1, sadA: 1, flash: 4 });
    else if (e === 'tryAway') Object.assign(mood, { cheerA: 1, sadH: 1, flash: 4 });
    else if (e === 'missHome') mood.sadH = 1;
    else if (e === 'missAway') mood.sadA = 1;
  };

  if (spec.layout === 'fields') {
    const crowd = [ctx.home.primary, ctx.home.primary, ctx.home.secondary, ctx.away.primary, ctx.away.secondary];
    const ground = buildSchoolGround(group, ctx.quality, crowd, spec, key);
    const side = buildPitchside(group, spec, ctx, null);
    return { spec, group, key, event, setScore: () => {}, setWind: side.setWind, setTorches: () => {}, update: (t, ex, cam) => (ground.update(t, ex, cam), side.update(t, cam)) };
  }

  // the ground the stadium stands on: a plaza ring, then grass out to the horizon
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(190, 48), new THREE.MeshStandardMaterial({ color: '#4b4f57', roughness: 0.95 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = -0.06;
  group.add(plaza);
  const land = new THREE.Mesh(new THREE.CircleGeometry(1400, 48), new THREE.MeshStandardMaterial({ color: '#2f4a28', roughness: 1 }));
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.1;
  group.add(land);
  const stands = buildStands(group, spec, ctx);
  buildRoofs(group, spec, ctx, stands);
  const boards = buildBoards(group, spec, stands, ctx.home.primary);
  const side = buildPitchside(group, spec, ctx, stands);
  if (spec.track) {
    // athletics track: a ring on the ground between the pitch and the stands
    const t = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 64, 1), new THREE.MeshStandardMaterial({ color: spec.track, roughness: 0.95 }));
    t.rotation.x = -Math.PI / 2;
    t.scale.set(74, 52, 1);
    t.position.y = 0.012;
    group.add(t);
  }
  const crowd = buildCrowd(group, stands, spec, ctx);
  const cu = crowd.uniforms;
  let last = 0;
  return {
    spec,
    group,
    key,
    event,
    setScore: () => {},
    setWind: side.setWind,
    setTorches: crowd.setTorches,
    update(time, excite, camera) {
      const dt = Math.min(0.1, Math.max(0, time - last));
      last = time;
      // cheering and dismay fade over a few seconds
      const fade = (v: number, rate: number) => Math.max(0, v - dt * rate);
      mood.cheerH = fade(mood.cheerH, 0.18);
      mood.cheerA = fade(mood.cheerA, 0.18);
      mood.sadH = fade(mood.sadH, 0.3);
      mood.sadA = fade(mood.sadA, 0.3);
      mood.flash = fade(mood.flash, 1);
      cu.uTime.value = time;
      cu.uExcite.value = excite;
      cu.uCheer.value.set(mood.cheerH, mood.cheerA);
      cu.uSad.value.set(mood.sadH, mood.sadA);
      camera.getWorldDirection(right);
      right.set(-right.z, 0, right.x).normalize();
      cu.uRight.value.copy(right);
      crowd.update(time, dt);
      boards.update(time, mood.flash);
      side.update(time, camera);
    },
  };
}
