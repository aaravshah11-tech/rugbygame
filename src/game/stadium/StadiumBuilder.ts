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
  let excited = 0;
  let flash = 0;
  const event = (e: StadiumEvent) => {
    if (e === 'try' || e === 'tryAgainst') {
      excited = 1;
      flash = 4;
    }
  };

  if (spec.layout === 'fields') {
    const crowd = [ctx.home.primary, ctx.home.primary, ctx.home.secondary, ctx.away.primary, ctx.away.secondary];
    const ground = buildSchoolGround(group, ctx.quality, crowd, spec, key);
    const side = buildPitchside(group, spec, ctx, null);
    return { spec, group, key, event, setScore: () => {}, setWind: side.setWind, update: (t, ex, cam) => (ground.update(t, ex, cam), side.update(t, cam)) };
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
  const { uniforms: crowdUniforms } = buildCrowd(group, stands.seats, spec, ctx);
  return {
    spec,
    group,
    key,
    event,
    setScore: () => {},
    setWind: side.setWind,
    update(time, excite, camera) {
      excited = Math.max(0, excited - 0.004);
      crowdUniforms.uTime.value = time;
      crowdUniforms.uExcite.value = Math.max(excite, excited);
      camera.getWorldDirection(right);
      right.set(-right.z, 0, right.x).normalize();
      crowdUniforms.uRight.value.copy(right);
      flash = Math.max(0, flash - 1 / 60);
      boards.update(time, flash);
      side.update(time, camera);
    },
  };
}
