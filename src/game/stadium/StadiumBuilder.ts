import * as THREE from 'three';
import { buildSkyAndLights } from './lights';
import { buildStands } from './stands';
import { buildRoofs } from './roof';
import { buildBoards } from './boards';
import { buildCrowd } from './crowd';
import { buildSchoolGround } from './fields';
import { buildPitch } from './pitch';
import { buildPitchside } from './pitchside';
import { buildSponsorDressing } from './sponsorDressing';
import { padTextureWithLogo } from '../../sponsors/textures';
import { bakeStandShadows } from './shadows';
import { buildSnow } from './weather';
import { buildSurroundings } from './surroundings';
import { buildScreens, buildSignature } from './signature';
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
  const sky = buildSkyAndLights(scene, renderer, ctx.quality, spec, ctx.time, ctx.weather);
  const key = sky.key;
  const sunDir = sky.sunDir;
  const snow = ctx.weather === 'snow' ? buildSnow(group, ctx.quality) : null;
  // posts padded in the home side's colours; the pitch mown the ground's own way
  void postPads;
  buildPitch(group, renderer, pitchPx, [ctx.home.primary, ctx.home.primary], { mow: spec.pitch.mow, inGoal: spec.pitch.inGoal, artificial: spec.pitch.artificial, wet: ctx.weather === 'rain' ? 1 : 0 }, ctx.home.secondary, ctx.sponsors ? (c) => padTextureWithLogo(c, ctx.home.secondary, ctx.sponsors!.posts) : undefined);

  const right = new THREE.Vector3();
  let screensRef: { ident: (s: import('../../data/sponsors').Sponsor, c: string, t: number) => void } | null = null;
  // crowd mood, driven by match events
  const mood = { cheerH: 0, cheerA: 0, sadH: 0, sadA: 0, flash: 0 };
  const event = (e: StadiumEvent) => {
    if (e === 'tryHome') Object.assign(mood, { cheerH: 1, sadA: 1, flash: 4 });
    else if (e === 'tryAway') Object.assign(mood, { cheerA: 1, sadH: 1, flash: 4 });
    else if (e === 'missHome') mood.sadH = 1;
    else if (e === 'missAway') mood.sadA = 1;
    else if (e === 'replay' && ctx.sponsors) screensRef?.ident(ctx.sponsors.replay, 'Replay brought to you by', 4);
    else if (e === 'kickoff' && ctx.sponsors) screensRef?.ident(ctx.sponsors.title, 'In association with', 9);
  };

  if (spec.layout === 'fields') {
    const crowd = [ctx.home.primary, ctx.home.primary, ctx.home.secondary, ctx.away.primary, ctx.away.secondary];
    const ground = buildSchoolGround(group, ctx.quality, crowd, spec, key);
    const side = buildPitchside(group, spec, ctx, null);
    if (ctx.sponsors) buildSponsorDressing(group, ctx.sponsors, ctx, null);
    return { spec, group, key, sunDir, time: ctx.time, bounds: { radius: 140, top: 14 }, event, setScore: () => {}, setWind: side.setWind, setTorches: () => {}, update: (t, ex, cam) => (ground.update(t, ex, cam), side.update(t, cam), sky.update(t), snow?.update(t, cam)) };
  }

  const stands = buildStands(group, spec, ctx);
  const roofs = buildRoofs(group, spec, ctx, stands);
  bakeStandShadows(group, spec, stands, sunDir, ctx.time, ctx.quality.level === 'low');
  // floodlights, roof strips and box windows only matter after dark (just coming on at golden hour)
  const lightsOn = ctx.time === 'night' ? 1 : ctx.time === 'golden' ? 0.45 : 0;
  roofs.setGlow(lightsOn);
  for (const m of [...roofs.nightGlow, ...stands.nightGlow]) {
    if (m instanceof THREE.SpriteMaterial) m.opacity = 0.9 * lightsOn;
    else if (m instanceof THREE.MeshBasicMaterial) m.color.multiplyScalar(0.25 + 0.75 * lightsOn);
    else if (m instanceof THREE.MeshStandardMaterial) m.emissiveIntensity = 0.05 + 0.3 * lightsOn;
  }
  const boards = buildBoards(group, spec, stands, ctx.home.primary, ctx);
  // the world outside, the ground's signature feature and its big screens
  const maxBack = Math.max(...stands.runs.map((r) => r.backD), 6);
  const radius = Math.max(Math.abs(stands.front.endR), Math.abs(stands.front.opp)) + maxBack + 8;
  // the ground it stands on: a concourse round the stadium, then grass out to the horizon
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: '#4b4f57', roughness: 0.95 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.scale.set(radius + 18, radius * 0.8 + 18, 1);
  plaza.position.y = -0.06;
  group.add(plaza);
  const land = new THREE.Mesh(new THREE.CircleGeometry(1400, 48), new THREE.MeshStandardMaterial({ color: spec.climate === 'highveld' ? '#5a6a3a' : '#3e5a30', roughness: 1 }));
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.1;
  group.add(land);
  buildSurroundings(group, spec, ctx, radius);
  buildSignature(group, spec, ctx, stands, radius);
  const screens = buildScreens(group, spec, stands, ctx.sponsors ?? null);
  screensRef = screens;
  const side = buildPitchside(group, spec, ctx, stands);
  if (ctx.sponsors) buildSponsorDressing(group, ctx.sponsors, ctx, stands);
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
    sunDir,
    time: ctx.time,
    bounds: { radius, top: Math.max(roofs.maxY, ...stands.runs.map((r) => r.topY), 12) },
    event,
    setScore: screens.setScore,
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
      sky.update(time);
      snow?.update(time, camera);
      boards.update(time, mood.flash);
      side.update(time, camera);
      screens.update(time);
    },
  };
}
