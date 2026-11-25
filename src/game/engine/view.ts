/** Drawing the match: animation choice, render sync, replays, aim arcs, rain, call icons and the camera. */
import type { MatchEngine } from '../engine';
import * as THREE from 'three';
import { clamp } from '../../util/rng';
import { FIELD } from '../field';
import type { AnimName } from '../view/assets';
import { ANIMS, G, GRUB_FRICTION, GRUB_KEEP, GRUB_REST, REPLAY_SPEED, SHADOW_BASIS, dirOf, dist } from './shared';
import type { P, ReplayFrame } from './shared';

// ---------------------------------------------------------------- rendering
export function animFor(eng: MatchEngine, p: P, speed: number): [AnimName, number] {
  if (p.state === 'down') return ['lying', 1];
  if (p.state === 'bound') return ['bind', 1];
  if (eng.atBaseT >= 0 && eng.ball.carrier === p && eng.phase === 'play') return ['base', 1];
  if (eng.phase === 'scrum' && p.num === 9 && p.state === 'free' && eng.ball.state === 'dead') return ['base', 1];
  if (p.celebrateT > 0) return ['celebrate', 1];
  // Hysteresis: a player has to clearly speed up or slow down before the clip changes.
  const l = p.loco;
  if (l === 'idle' && speed > 0.7) p.loco = 'walk';
  else if (l === 'walk' && speed < 0.3) p.loco = 'idle';
  else if (l === 'walk' && speed > 3.1) p.loco = 'run';
  else if (l === 'run' && speed < 2.4) p.loco = speed < 0.3 ? 'idle' : 'walk';
  if (p.loco === 'idle') return ['idle', 1];
  // playback matched to the measured stride so feet don't skate
  const gs = eng.asset?.gaitSpeed ?? {};
  if (p.loco === 'walk') return ['walk', clamp(speed / (gs.walk ?? 1.6), 0.55, 1.9)];
  return ['run', clamp(speed / (gs.run ?? 6.4), 0.65, 1.6)];
}

export function render(eng: MatchEngine, dt: number) {
  const b = eng.ball;
  const m4 = new THREE.Matrix4();
  const rf = eng.replay ? eng.replayFrame() : null;
  const record = !rf && dt > 0 && (eng.recordAcc += dt) >= 1 / 30;
  const rec: ReplayFrame | null = record ? { p: new Float32Array(eng.players.length * 6), bx: b.x, by: b.y, bz: b.z, flying: b.state === 'air' || b.state === 'pass' } : null;
  if (record) eng.recordAcc = 0;
  const animDt = rf ? dt * REPLAY_SPEED : dt;
  let si = 0;
  eng.players.forEach((p, i) => {
    const off = p.state === 'off';
    p.av.root.visible = !off;
    if (off) {
      m4.makeScale(0, 0, 0);
      eng.shadows.setMatrixAt(si++, m4);
      return;
    }
    let x: number, z: number, heading: number, base: AnimName, ts: number, trig: AnimName | null;
    if (rf) {
      const o = i * 6;
      [x, z, heading] = [rf.p[o], rf.p[o + 1], rf.p[o + 2]];
      base = ANIMS[rf.p[o + 3]];
      ts = rf.p[o + 4];
      trig = rf.p[o + 5] >= 0 ? ANIMS[rf.p[o + 5]] : null;
    } else {
      const speed = Math.hypot(p.vx, p.vz);
      const atBase = eng.atBaseT >= 0 && eng.ball.carrier === p;
      if (atBase || p.state === 'down') {
        // keep facing as set
      } else if (speed > 1.1) p.heading = Math.atan2(p.vz, p.vx);
      else if (speed > 0.4 && p.state === 'bound') p.heading = Math.atan2(p.vz, p.vx);
      else if (p.state === 'free' && eng.phase !== 'play' && eng.phase !== 'kickoff') p.heading = p.side === 0 ? 0 : Math.PI;
      else if (p.state === 'free' && eng.ball.carrier !== p) {
        // standing or shuffling: look at the ball rather than flicking with every small step
        const bx = eng.ball.x - p.x;
        const bz = eng.ball.z - p.z;
        if (bx * bx + bz * bz > 1) p.heading = Math.atan2(bz, bx);
      }
      x = p.x;
      z = p.z;
      let dh = p.heading - p.face;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      p.face += dh * Math.min(1, dt * (speed > 3 ? 10 : 6));
      heading = p.face;
      [base, ts] = eng.animFor(p, speed);
      trig = p.fx;
      p.fx = null;
      if (dt > 0) {
        const down = p.state === 'down';
        if (down && !p.wasDown && !p.av.busy && !trig) trig = 'fall';
        if (!down && p.wasDown && p.state === 'free') trig = trig ?? 'getup';
        p.wasDown = down;
        p.celebrateT = Math.max(0, p.celebrateT - dt);
      }
    }
    if (rec) rec.p.set([x, z, heading, ANIMS.indexOf(base), ts, trig ? ANIMS.indexOf(trig) : -1], i * 6);
    p.av.root.position.set(x, p.lift ?? 0, z);
    p.av.root.rotation.y = -heading;
    if (!rf) {
      // body lean: forward with speed/acceleration, into the turn when cutting
      const sp = Math.hypot(p.vx, p.vz);
      const fwdLean = p.state === 'free' ? clamp(sp / 8, 0, 1) * 0.1 : 0;
      let turn = heading - (p.prevFace ?? heading);
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      p.prevFace = heading;
      const bank = p.state === 'free' && dt > 0 ? clamp((turn / dt) * sp * 0.012, -0.16, 0.16) : 0;
      p.leanZ = (p.leanZ ?? 0) + (fwdLean - (p.leanZ ?? 0)) * Math.min(1, dt * 6);
      p.leanX = (p.leanX ?? 0) + (bank - (p.leanX ?? 0)) * Math.min(1, dt * 6);
      p.av.root.rotation.z = -p.leanZ;
      p.av.root.rotation.x = p.leanX;
    }
    p.av.setBase(base, ts);
    if (trig) p.av.trigger(trig, trig === 'getup' ? 1.8 : trig === 'fall' ? 1.3 : 1);
    p.av.update(animDt);
    m4.makeTranslation(x, 0.02, z);
    eng.shadows.setMatrixAt(si++, m4);
  });
  if (rec) {
    eng.history.push(rec);
    if (eng.history.length > 150) eng.history.shift();
  }

  // ball: sits in the carrier's hands, otherwise follows physics
  const ballPos = eng.tmpV;
  if (rf) ballPos.set(rf.bx, rf.by, rf.bz);
  else if (b.state === 'held' && b.carrier && eng.atBaseT >= 0 && eng.phase === 'play') {
    const c = b.carrier;
    ballPos.set(c.x + Math.cos(c.face) * 0.62, 0.14, c.z + Math.sin(c.face) * 0.62);
  } else if (b.state === 'held' && b.carrier && b.carrier.state !== 'down') {
    b.carrier.av.handPosition(ballPos);
    ballPos.y = Math.max(0.3, ballPos.y);
  } else ballPos.set(b.x, b.y, b.z);
  eng.ballMesh.position.copy(ballPos);
  const flying = rf ? rf.flying : b.state === 'air' || b.state === 'pass';
  if (flying) eng.ballMesh.rotation.z += dt * (b.state === 'air' ? 10 : 4);
  else if (b.carrier) eng.ballMesh.rotation.set(0, -b.carrier.heading, 0.3);
  m4.makeScale(0.45, 1, 0.45);
  m4.setPosition(ballPos.x, 0.021, ballPos.z);
  eng.shadows.setMatrixAt(si, m4);
  eng.shadows.instanceMatrix.needsUpdate = true;
  eng.ballFx.update(ballPos, flying, eng.camera, eng.time);

  // real shadows only for the players nearest the action
  if (eng.quality.shadows) {
    const fx = eng.camLook.x;
    const fz = eng.camLook.z;
    // Players already casting get a head start, so the set doesn't flip back and forth.
    const score = (p: P) => (p.x - fx) ** 2 + (p.z - fz) ** 2 - (p.casting ? 30 : 0);
    const order = eng.players.filter((p) => p.state !== 'off').sort((a, c) => score(a) - score(c));
    order.forEach((p, i) => {
      const on = i < eng.quality.shadowCasters;
      if (on !== p.casting) p.av.setShadow((p.casting = on));
    });
    // Move the shadow map in whole texels so shadow edges don't shimmer as the camera pans.
    const key = eng.stadium.key;
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    const texel = (sc.right - sc.left) / key.shadow.mapSize.x || 0.05;
    // Snap in the light's own right/up axes (the light direction never changes).
    const L = SHADOW_BASIS;
    const f3 = eng.tmpV2.set(fx, 0, fz);
    const r = Math.round(f3.dot(L.right) / texel) * texel;
    const u = Math.round(f3.dot(L.up) / texel) * texel;
    const fwd = f3.dot(L.dir);
    f3.copy(L.right).multiplyScalar(r).addScaledVector(L.up, u).addScaledVector(L.dir, fwd);
    key.target.position.copy(f3);
    key.position.set(f3.x - 35, f3.y + 70, f3.z + 45);
  }

  // support runner in space calls for the ball (small bubble above the head)
  eng.updateCallIcon(rf);

  // selected player: glowing ring + arrow above the head
  const c = eng.controlled;
  const showSel = !rf && !!c && c.state !== 'off' && eng.phase !== 'placekick' && eng.cfg.drill !== 'kicking' && eng.camMode !== 'try';
  if (c && showSel) {
    c.av.headPosition(eng.tmpV);
    eng.selector.place(c.x, c.z, eng.tmpV.y, eng.time, true);
    if (eng.nameFor !== c) {
      eng.nameFor = c;
      const g = eng.nameCanvas.getContext('2d')!;
      g.clearRect(0, 0, 256, 48);
      g.font = '800 26px "Avenir Next Condensed", "Arial Narrow", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(c.name, 128, 26);
      g.fillStyle = '#ffffff';
      g.fillText(c.name, 128, 26);
      (eng.nameTag.material as THREE.SpriteMaterial).map!.needsUpdate = true;
    }
    eng.nameTag.visible = true;
    eng.nameTag.position.set(c.x, eng.tmpV.y + 1.15, c.z);
  } else {
    eng.selector.place(0, 0, 0, 0, false);
    eng.nameTag.visible = false;
  }
  // Pass markers over the players who would receive a left / right pass.
  const showMarks = !rf && !!c && b.carrier === c && c.side === 0 && (eng.phase === 'play' || eng.phase === 'kickoff');
  const crs = eng.camRightSign();
  ([-1, 1] as const).forEach((dir, i) => {
    const sp = eng.passMarks[i];
    const t = showMarks && c ? eng.passTarget(c, dir * crs, false) : undefined;
    sp.visible = !!t;
    if (t) {
      t.av.headPosition(eng.tmpV);
      sp.position.set(t.x, eng.tmpV.y + 0.75 + Math.sin(eng.time * 5 + i) * 0.06, t.z);
    }
  });
  const tgt = !rf && b.state === 'pass' && b.pass ? b.pass.target : null;
  eng.targetRing.visible = !!tgt;
  if (tgt) eng.targetRing.position.set(tgt.x, 0.035, tgt.z);

  eng.particles.update(dt);
  if (!rf) eng.updateArc();
  else eng.arc.visible = false;
  eng.updateCamera(dt, rf);
  eng.updateRain(dt);
  eng.exciteBoost = Math.max(0, eng.exciteBoost - dt * 0.25);
  const bx = rf ? rf.bx : b.x;
  const excite = Math.max(eng.exciteBoost, eng.phase === 'play' || rf ? clamp((Math.abs(bx) - 22) / 26, 0, 1) * 0.8 : 0.1);
  eng.stadium.update(eng.time, excite, eng.camera);
  eng.post.render();
}

// ---------------------------------------------------------------- replay
export function startReplay(eng: MatchEngine, frames: ReplayFrame[], done: () => void) {
  if (frames.length < 10) return done();
  eng.replay = { frames, t: 0, done };
  eng.camMode = 'replay';
  eng.emit({ type: 'replay', active: true });
}

/** Called by the UI when the player taps to skip. */
export function skipReplay(eng: MatchEngine) {
  if (eng.replay) eng.replay.t = eng.replay.frames.length;
}

export function updateReplay(eng: MatchEngine, dt: number) {
  const r = eng.replay!;
  r.t += dt * 30 * REPLAY_SPEED;
  if (r.t >= r.frames.length - 1) {
    eng.replay = null;
    eng.camMode = 'game';
    eng.emit({ type: 'replay', active: false });
    r.done();
  }
}

export function replayFrame(eng: MatchEngine): ReplayFrame {
  const r = eng.replay!;
  const i = Math.min(Math.floor(r.t), r.frames.length - 1);
  const a = r.frames[i];
  const b = r.frames[Math.min(i + 1, r.frames.length - 1)];
  const u = r.t - i;
  const out: ReplayFrame = { p: new Float32Array(a.p), bx: a.bx + (b.bx - a.bx) * u, by: a.by + (b.by - a.by) * u, bz: a.bz + (b.bz - a.bz) * u, flying: a.flying };
  for (let k = 0; k < eng.players.length; k++) {
    const o = k * 6;
    out.p[o] = a.p[o] + (b.p[o] - a.p[o]) * u;
    out.p[o + 1] = a.p[o + 1] + (b.p[o + 1] - a.p[o + 1]) * u;
    // only fire one-shot triggers once per recorded frame
    if ((r as { lastIdx?: number }).lastIdx === i) out.p[o + 5] = -1;
  }
  (r as { lastIdx?: number }).lastIdx = i;
  return out;
}

export function updateArc(eng: MatchEngine) {
  const ka = eng.input.kickAim;
  const pos = eng.arc.geometry.attributes.position as THREE.BufferAttribute;
  if (eng.phase === 'placekick' && eng.placeSide === 0 && eng.ball.state === 'dead') {
    // Aim line for place kicks
    const b = eng.ball;
    const d = dirOf(0);
    const toPost = Math.atan2(-b.z, d * FIELD.tryX - b.x);
    const ang = toPost + (eng.placeAim * Math.PI) / 180;
    const D = dist(b.x, b.z, FIELD.tryX, 0) + 4;
    // only the first part of the flight: you still have to judge the rest (and the wind)
    for (let i = 0; i < 60; i++) {
      const u = (i / 59) * 0.32;
      pos.setXYZ(i, b.x + Math.cos(ang) * D * u, 0.2 + Math.sin(u * Math.PI) * D * 0.22, b.z + Math.sin(ang) * D * u);
    }
    pos.needsUpdate = true;
    eng.arc.visible = true;
    return;
  }
  const kk = eng.kickerNow();
  if (!ka.active || !kk) {
    eng.arc.visible = false;
    eng.kickRing.visible = false;
    return;
  }
  // Preview the actual flight (no skill error): arc + landing ring.
  let aim = ((ka.angle * Math.PI) / 180) * eng.camRightSign();
  let kdist = ka.dist;
  if (eng.kickTarget) {
    kdist = Math.hypot(eng.kickTarget.x - kk.x, eng.kickTarget.z - kk.z);
    aim = Math.atan2(eng.kickTarget.z - kk.z, (eng.kickTarget.x - kk.x) * dirOf(kk.side));
  }
  const v = eng.kickVelocity(kdist, aim, kk.side, ka.kind);
  let x = kk.x + dirOf(kk.side) * 0.5;
  let y = 0.7;
  let z = kk.z;
  let vx = v.vx;
  let vz = v.vz;
  let vy = v.vy;
  const step = ka.kind === 'grubber' ? 0.06 : 0.07;
  let landX = x;
  let landZ = z;
  let landed = false;
  for (let i = 0; i < 60; i++) {
    pos.setXYZ(i, x, Math.max(0.1, y), z);
    if (landed) continue;
    x += vx * step;
    z += vz * step;
    vy -= G * step;
    y += vy * step;
    if (ka.kind !== 'grubber' && vy < 0 && y <= 1.1) {
      landed = true;
      landX = x;
      landZ = z;
    } else if (ka.kind === 'grubber' && y <= 0.12) {
      y = 0.12;
      if (Math.abs(vy) > 1.2) {
        vy = -vy * GRUB_REST;
        vx *= GRUB_KEEP;
        vz *= GRUB_KEEP;
      } else {
        vy = 0;
        const f = Math.max(0, 1 - step * GRUB_FRICTION);
        vx *= f;
        vz *= f;
        if (Math.hypot(vx, vz) < 0.4) {
          landed = true;
          landX = x;
          landZ = z;
        }
      }
    }
    landX = x;
    landZ = z;
  }
  pos.needsUpdate = true;
  eng.arc.visible = true;
  eng.kickRing.visible = true;
  eng.kickRing.position.set(landX, 0.05, landZ);
  eng.kickRing.scale.setScalar(1 + Math.sin(eng.time * 6) * 0.06);
}

/** Rain: streaks falling in a box around the camera's target (weather = rain only). */
export function updateRain(eng: MatchEngine, dt: number) {
  if (eng.cfg.weather !== 'rain') return;
  const N = 1400;
  if (!eng.rain) {
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 70;
      const y = Math.random() * 30;
      const z = (Math.random() - 0.5) * 70;
      pos.set([x, y, z, x + 0.05, y + 0.7, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    eng.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbfd6ff, transparent: true, opacity: 0.35, depthWrite: false }));
    eng.rain.frustumCulled = false;
    eng.scene.add(eng.rain);
    eng.renderer.toneMappingExposure = 0.85;
  }
  const a = eng.rain.geometry.attributes.position as THREE.BufferAttribute;
  const arr = a.array as Float32Array;
  const fall = 24 * dt;
  for (let i = 0; i < N; i++) {
    const o = i * 6;
    arr[o + 1] -= fall;
    arr[o + 4] -= fall;
    if (arr[o + 1] < 0) {
      arr[o + 1] += 30;
      arr[o + 4] += 30;
    }
  }
  a.needsUpdate = true;
  eng.rain.position.set(eng.camLook.x, 0, eng.camLook.z);
}

export function updateCallIcon(eng: MatchEngine, rf: ReplayFrame | null) {
  const c = eng.ball.carrier;
  let show: P | null = null;
  if (!rf && c && c.side === 0 && c === eng.controlled && eng.phase === 'play' && eng.atBaseT < 0) {
    // re-evaluate a few times a second so the bubble doesn't flicker between runners
    if (eng.time - eng.callT > 0.35) {
      eng.callT = eng.time;
      const side = Math.abs(eng.input.moveX) > 0.3 ? Math.sign(eng.input.moveX) * eng.camRightSign() : c.z < 0 ? 1 : -1;
      const sp = eng.setPlay && eng.setPlay.targets.find((p) => p.state === 'free');
      if (sp) eng.callFor = sp;
      else {
        const t = eng.passTarget(c, side, false) ?? eng.passTarget(c, -side, false);
        const free = t && !eng.nearestOpponent(t, 4.5);
        eng.callFor = free ? t! : null;
      }
    }
    show = eng.callFor;
  }
  if (!show) {
    if (eng.callSprite) eng.callSprite.visible = false;
    return;
  }
  if (!eng.callSprite) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#c6ff1a';
    g.beginPath();
    g.arc(32, 28, 22, 0, Math.PI * 2);
    g.moveTo(24, 46);
    g.lineTo(32, 60);
    g.lineTo(40, 46);
    g.fill();
    g.fillStyle = '#0b0f17';
    g.font = '900 32px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 32, 30);
    const tex = new THREE.CanvasTexture(cv);
    eng.callSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    eng.callSprite.renderOrder = 6;
    eng.callSprite.scale.set(0.7, 0.7, 1);
    eng.scene.add(eng.callSprite);
  }
  show.av.headPosition(eng.tmpV);
  eng.callSprite.position.set(show.x, eng.tmpV.y + 0.75 + Math.sin(eng.time * 6) * 0.06, show.z);
  eng.callSprite.visible = true;
}

/** Critically damped follow of the camera's target point (SmoothDamp). */
export function smoothFocus(eng: MatchEngine, target: THREE.Vector3, dt: number): THREE.Vector3 {
  if (!eng.camFInit || dt <= 0) {
    if (!eng.camFInit) eng.camF.copy(target);
    eng.camFInit = true;
    return eng.sfOut.copy(eng.camF);
  }
  const T = 0.24;
  const w = 2 / T;
  const x = w * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = eng.sfA.copy(eng.camF).sub(target);
  const temp = eng.sfB.copy(eng.camFV).addScaledVector(ch, w).multiplyScalar(dt);
  eng.camFV.addScaledVector(temp, -w).multiplyScalar(e);
  eng.camF.copy(target).add(ch.add(temp).multiplyScalar(e));
  return eng.sfOut.copy(eng.camF);
}

export function updateCamera(eng: MatchEngine, dt: number, rf: ReplayFrame | null) {
  const b = eng.ball;
  eng.camModeT += dt;
  eng.tackleZoomT = Math.max(0, eng.tackleZoomT - dt);
  const raw = eng.craw.set(b.x, 0, b.z);
  if (b.carrier) raw.set(b.carrier.x, 0, b.carrier.z);
  else if (b.state === 'pass' && b.pass) raw.set(b.pass.target.x, 0, b.pass.target.z);
  else if (b.state === 'air') {
    // kicks: track between the ball and where it will come down
    const land = eng.predictLanding();
    if (land) raw.set((b.x + land.x) / 2, 0, (b.z + land.z) / 2);
  }
  const focus = eng.smoothFocus(raw, dt);
  let pos: THREE.Vector3;
  let look: THREE.Vector3;
  let rate = 3.2;
  const fp = eng.camFocus;
  if (eng.camMode === 'intro') {
    eng.introT += dt;
    if (eng.introT > 5.5) eng.skipIntro();
    const a = -1.2 + eng.introT * 0.32;
    const r = 78 - eng.introT * 6;
    pos = eng.cpos.set(Math.cos(a) * r, 34 - eng.introT * 3.5, Math.sin(a) * r * 0.8);
    look = eng.clook.set(0, 2, 0);
    rate = 3;
  } else if (eng.camMode === 'replay' && rf) {
    // low side-on tracking shot
    const side = rf.bz < 15 ? 1 : -1;
    pos = eng.cpos.set(rf.bx - 7, 3.2, rf.bz + side * 11);
    look = eng.clook.set(rf.bx + 1, 1.1, rf.bz);
    rate = 4;
  } else if (eng.camMode === 'try' && fp) {
    // slow orbit around the try scorer
    const a = 0.6 + eng.camModeT * 0.35;
    pos = eng.cpos.set(fp.x + Math.cos(a) * 5.5, 1.9, fp.z + Math.sin(a) * 5.5);
    look = eng.clook.set(fp.x, 1.0, fp.z);
    rate = 2.5;
  } else if (eng.camMode === 'kickoff' && fp) {
    const d = dirOf(fp.side);
    pos = eng.cpos.set(fp.x + d * 4.5, 1.7, fp.z + 3.2);
    look = eng.clook.set(fp.x, 1.2, fp.z);
    rate = 4;
  } else if (eng.camMode === 'placekick') {
    const d = dirOf(eng.placeSide);
    const toPost = new THREE.Vector3(d * FIELD.tryX - b.x, 0, -b.z).normalize();
    const flying = b.state === 'air';
    pos = eng.cpos.set(b.x, flying ? 2.6 : 1.55, b.z).addScaledVector(toPost, flying ? -5 : -4.2);
    if (flying) pos.copy(eng.camPos).lerp(new THREE.Vector3(b.x, b.y * 0.6 + 2, b.z).addScaledVector(toPost, -9), 0.5);
    look = eng.clook.set(d * FIELD.tryX, 4.5, 0);
    if (flying) look = new THREE.Vector3(b.x, b.y, b.z).lerp(look, 0.4);
    rate = flying ? 3 : 5;
  } else if (eng.camMode === 'setpiece' && eng.phase === 'lineout') {
    // from beyond the touchline, behind the thrower, looking down the line of jumpers
    const { x: lx, s: sg } = eng.loGeo;
    pos = eng.cpos.set(lx - 6.5, 4.6, sg * (FIELD.halfW + 9));
    look = eng.clook.set(lx + 1, 1.8, sg * 26);
    rate = 3.5;
  } else if (eng.camMode === 'setpiece' && eng.phase === 'scrum') {
    pos = eng.cpos.set(b.x - 9, 4.5, b.z + (b.z > 0 ? -5 : 5));
    look = eng.clook.set(b.x + 2, 0.8, b.z);
  } else {
    const mode = eng.cfg.camera;
    const tight = eng.phase === 'ruck' || eng.phase === 'maul' || eng.tackleZoomT > 0;
    if (mode === 'sideline') {
      pos = eng.cpos.set(focus.x * 0.92, tight ? 16 : 22, focus.z * 0.3 + (tight ? 34 : 44));
      look = eng.clook.set(focus.x, 0, focus.z * 0.6);
    } else if (mode === 'close') {
      pos = eng.cpos.set(focus.x - (tight ? 6.5 : 8), tight ? 3.4 : 4.2, focus.z * 0.92);
      look = eng.clook.set(focus.x + 8, 1, focus.z);
    } else {
      // Low broadcast camera: ~12m behind and 7m above the carrier, looking down the pitch to the try line.
      // Steady broadcast view behind your team: follows the ball, only partly sideways, no zooming.
      // Broadcast view from behind your team: far enough back and high enough to read the whole line.
      // Lead a few metres in the direction of attack, pull back when the ball is wide,
      // tighten in for rucks and mauls.
      const att = dirOf(eng.possession());
      const lead = att * 4;
      const wide = clamp((Math.abs(focus.z) - 10) / 22, 0, 1);
      const zoom = (tight ? 0.84 : 1) * (1 + wide * 0.22);
      eng.camZoom += (zoom - eng.camZoom) * Math.min(1, dt * 1.5);
      const zz = eng.camZoom;
      // keep the ball in the middle of the screen even out wide
      pos = eng.cpos.set(focus.x + lead * 0.5 - 18 * zz, 10.5 * zz, focus.z * 0.72);
      look = eng.clook.set(focus.x + lead + 10, 0.5, focus.z * 0.94);
    }
    if (b.state === 'air' && b.kicker) pos.y += Math.min(5, b.y * 0.3);
    rate = 3.2;
  }
  const k = 1 - Math.exp(-dt * rate);
  eng.camPos.lerp(pos, k);
  eng.camLook.lerp(look, k);
  eng.camera.position.copy(eng.camPos);
  eng.camera.lookAt(eng.camLook);
}
