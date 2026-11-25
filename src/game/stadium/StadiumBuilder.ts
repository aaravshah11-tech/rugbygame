import * as THREE from 'three';
import { buildSkyAndLights } from './lights';
import { buildRingStadium } from './stands';
import { buildSchoolGround } from './fields';
import { buildPitch } from './pitch';
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
  buildPitch(group, renderer, pitchPx, postPads);

  const right = new THREE.Vector3();
  let excited = 0;
  const event = (e: StadiumEvent) => {
    if (e === 'try' || e === 'tryAgainst') excited = 1;
  };

  if (spec.layout === 'fields') {
    const crowd = [ctx.home.primary, ctx.home.primary, ctx.home.secondary, ctx.away.primary, ctx.away.secondary];
    const ground = buildSchoolGround(group, ctx.quality, crowd, spec, key);
    return { spec, group, key, event, setScore: () => {}, update: (t, ex, cam) => ground.update(t, ex, cam) };
  }

  const { crowdUniforms, led, boards } = buildRingStadium(group, spec, ctx);
  return {
    spec,
    group,
    key,
    event,
    setScore: () => {},
    update(time, excite, camera) {
      excited = Math.max(0, excited - 0.004);
      crowdUniforms.uTime.value = time;
      crowdUniforms.uExcite.value = Math.max(excite, excited);
      camera.getWorldDirection(right);
      right.set(-right.z, 0, right.x).normalize();
      crowdUniforms.uRight.value.copy(right);
      const off = (time * 0.025) % 1;
      led.offset.x = off;
      for (const b of boards) b.offset.x = off;
    },
  };
}
