/** Player input: buttons, swipes, aiming kicks, switching player. */
import type { MatchEngine } from '../engine';
import * as THREE from 'three';
import { audio } from '../../util/audio';
import { haptic } from '../../util/haptics';
import { clamp, rand } from '../../util/rng';
import { CFG } from '../gameConfig';
import { FIELD } from '../stadium';
import type { InputAction, KickKind } from '../types';
import { KICK_MAX, dirOf, dist, other } from './shared';
import type { P } from './shared';

// ---------------------------------------------------------------- input
export function handleActions(eng: MatchEngine) {
  const acts = eng.input.actions.splice(0);
  for (const a of acts) eng.handleAction(a);
}

export function handleAction(eng: MatchEngine, a: InputAction) {
  const c = eng.controlled;
  const b = eng.ball;
  const userHasBall = b.carrier !== null && b.carrier === c && c.side === 0;
  const live = eng.phase === 'play' || eng.phase === 'kickoff';
  switch (a.type) {
    case 'pass':
      if (eng.offload) eng.tryOffload(a.dir);
      else if (userHasBall && live) eng.doPass(c!, a.long, a.dir);
      break;
    case 'ruckContest': {
      const r = eng.ruck;
      if (r && r.att === 1 && r.userDef !== 'fan') {
        if (r.userDef === 'none') {
          r.userDef = 'contest';
          eng.addToRuck(); // a jackal goes in over the ball
        }
        r.contest = Math.min(1, r.contest + 0.09);
        haptic('light');
      }
      break;
    }
    case 'ruckFan': {
      const r = eng.ruck;
      if (r && r.att === 1 && r.userDef === 'none') {
        r.userDef = 'fan';
        r.fan = true;
        eng.say('Fan out', 'info', 'Everyone in the line');
      }
      break;
    }
    case 'scrumPush':
      if (eng.scrum && eng.scrum.stage === 'push') eng.scrum.user = Math.min(3.2, eng.scrum.user + 0.42);
      break;
    case 'scrumPlay':
      if (eng.scrum && eng.scrum.stage === 'choose') eng.scrumPlay(a.play);
      break;
    case 'kick':
      // the landing spot comes from where the user touched the pitch
      if (eng.kickTarget) {
        a.tx = eng.kickTarget.x;
        a.tz = eng.kickTarget.z;
      } else a.tx = a.tz = undefined;
      if (eng.kickoffAim) eng.kickoffKick();
      else if (eng.penTouch) eng.penaltyTouchKick(a);
      else if (userHasBall && live) eng.userKick(c!, a.kind, a.dist, a.angle, a.power ?? 0.85, a.tx, a.tz);
      eng.kickTarget = null;
      break;
    case 'basePass':
      if (c && userHasBall && eng.atBaseT >= 0) {
        eng.atBaseT = -1;
        eng.doPass(c, false, a.dir, true);
      }
      break;
    case 'pickGo':
      if (c && userHasBall && eng.atBaseT >= 0) eng.pickAndGo(c);
      break;
    case 'snipe':
      if (c && userHasBall && eng.atBaseT >= 0) {
        eng.atBaseT = -1;
        c.vx = dirOf(c.side) * 4;
        c.sidestepCD = 0;
        eng.pop('SNIPE!', 'good');
      }
      break;
    case 'charge':
      eng.charge();
      break;
    case 'diveTry':
      if (c && userHasBall && live && c.diveT <= 0) {
        c.diveT = 0.55;
        c.vx = dirOf(c.side) * 8.5;
        c.fx = 'dive';
        eng.pop('DIVE!', 'good');
      }
      break;
    case 'collapseMaul': {
      const m = eng.maul;
      if (!m || m.att !== 1) break;
      eng.emit({ type: 'minigameCancel' });
      eng.activeMini = null;
      if (rand.chance(0.4 * eng.strict())) {
        eng.maul = null;
        for (const p of eng.players) if (p.state === 'bound') p.state = 'free';
        eng.whistle();
        eng.say('Collapsing the maul', 'bad', `Penalty ${eng.teamShort(1)}`);
        eng.stoppage(() => eng.awardPenalty(1, m.x, m.z));
      } else {
        // brought down legally: the drive is over, they have to use it
        eng.maul = null;
        for (const p of eng.players) if (p.state === 'bound') {
          p.state = 'down';
          p.timer = 0.4;
        }
        eng.pop('MAUL STOPPED!', 'good');
        eng.ballToNine(1, m.x, m.z);
      }
      break;
    }
    case 'call':
      eng.resolveCall(a.id);
      break;
    case 'catch':
      eng.catchPressT = eng.time;
      break;
    case 'dropgoal':
      if (userHasBall && live && eng.canDropGoal()) eng.dropGoal(c!);
      break;
    case 'sidestep':
      if (c && userHasBall && c.sidestepT <= 0 && c.sidestepCD <= 0) {
        c.sidestepT = 0.35;
        c.sidestepCD = 1.5;
        c.sideDir = eng.input.moveX !== 0 ? Math.sign(eng.input.moveX) * eng.camRightSign() : c.z > 0 ? -1 : 1;
        c.fx = c.sideDir * Math.cos(c.heading) > 0 ? 'sidestepR' : 'sidestepL';
      }
      break;
    case 'handoff':
      if (c && userHasBall && c.handoffT <= 0) {
        c.handoffT = 0.6;
        c.fx = 'handoff';
        const d = eng.nearestOpponent(c, 2.2);
        if (d) eng.tryFend(c, d);
      }
      break;
    case 'tackle':
      if (c && live && eng.atBaseT < 0 && b.carrier && b.carrier.side === 1 && c.state === 'free') {
        const reach = CFG.tackle.userPress[eng.cfg.difficulty];
        if (dist(c.x, c.z, b.carrier.x, b.carrier.z) <= reach) eng.attemptTackle(c, b.carrier, false);
      }
      break;
    case 'dive':
      if (c && live && eng.atBaseT < 0 && c.state === 'free' && b.carrier && b.carrier.side === 1) {
        const carrier = b.carrier;
        const d = dist(c.x, c.z, carrier.x, carrier.z);
        c.diveT = 0.45;
        c.fx = 'dive';
        const ang = Math.atan2(carrier.z - c.z, carrier.x - c.x);
        c.vx = Math.cos(ang) * 9;
        c.vz = Math.sin(ang) * 9;
        if (d <= 4) eng.after(0.18, () => {
          if (eng.ball.carrier === carrier && eng.phase === 'play') eng.attemptTackle(c, carrier, true);
        });
        else {
          c.state = 'down';
          c.timer = 1.1;
        }
      }
      break;
    case 'addPlayer':
      eng.addToRuck();
      break;
    case 'dodge':
      if (c && userHasBall && c.sidestepT <= 0 && c.sidestepCD <= 0) {
        c.sidestepT = 0.4;
        c.sidestepCD = 1.5;
        c.sideDir = a.dir * eng.camRightSign();
        c.fx = c.sideDir * Math.cos(c.heading) > 0 ? 'sidestepR' : 'sidestepL';
      }
      break;
    case 'switch':
      if (eng.possession() === 1 || !b.carrier) eng.switchDefender();
      break;
    case 'setplay':
      if (userHasBall && live) eng.startSetPlay(a.id);
      else if (eng.ruck && eng.ruck.att === 0) {
        eng.pendingSetPlay = a.id; // run it as soon as the 9 has the ball
        eng.say('Set play called', 'info');
      }
      break;
  }
}

/** +1 if screen-right maps to world +z for the current camera. */
export function camRightSign(eng: MatchEngine) {
  return eng.cfg.camera === 'sideline' ? -1 : 1;
}

export function switchDefender(eng: MatchEngine) {
  const bx = eng.ball.x;
  const bz = eng.ball.z;
  const cands = eng.teams[0]
    .filter((p) => p.state === 'free' && p !== eng.controlled)
    .sort((a, b) => dist(a.x, a.z, bx, bz) - dist(b.x, b.z, bx, bz));
  if (cands[0]) eng.controlled = cands[0];
  audio.click();
}

/** At the base of a ruck the referee gives you time, then calls "Use it!", then awards a scrum. */
export function useItCheck(eng: MatchEngine, c: P) {
  if (eng.atBaseT > 5 && !eng.useItCalled) {
    eng.useItCalled = true;
    eng.whistle();
    eng.say('Use it!', 'info', 'Referee');
  }
  if (eng.atBaseT > 10) {
    eng.atBaseT = -1;
    eng.whistle();
    eng.say('Ball not used', 'bad', `Scrum ${eng.teamShort(other(c.side))}`);
    const x = c.x;
    const z = c.z;
    eng.stoppage(() => eng.setupScrum(x, z, other(c.side)));
  }
}

export function autoControl(eng: MatchEngine) {
  const b = eng.ball;
  if (b.carrier && b.carrier.side === 0) {
    eng.controlled = b.carrier;
    return;
  }
  if (b.state === 'pass' && b.pass && b.pass.target.side === 0) {
    eng.controlled = b.pass.target;
    return;
  }
  // Defending: you always control the defender best placed to tackle the ball carrier.
  const carrier = b.carrier ?? (b.state === 'pass' && b.pass ? b.pass.target : null);
  if (eng.cfg.autoSwitch && carrier && carrier.side === 1 && eng.controlled && !(eng.input.tackleHold && eng.controlled.state === 'free')) {
    const score = (p: P) => dist(p.x, p.z, carrier.x, carrier.z) + ((carrier.x - p.x) * dirOf(1) > 0 ? 6 : 0); // prefer defenders in front
    const best = eng.teams[0].filter((p) => p.state === 'free').sort((p, q) => score(p) - score(q))[0];
    if (best && best !== eng.controlled && (eng.controlled.state !== 'free' || score(best) + 1.5 < score(eng.controlled))) {
      eng.controlled = best;
      eng.nameFor = null;
    }
  }
  if (!eng.controlled || eng.controlled.state !== 'free' || eng.phase !== 'play') {
    const free = eng.teams[0].filter((p) => p.state === 'free');
    free.sort((p, q) => dist(p.x, p.z, b.x, b.z) - dist(q.x, q.z, b.x, b.z));
    if (free[0]) eng.controlled = free[0];
  }
}

/** Ground-plane camera axes used to map the joystick to world directions. */
export function camAxes(eng: MatchEngine) {
  const f = eng.axesV;
  eng.camera.getWorldDirection(f);
  f.y = 0;
  if (f.lengthSq() < 1e-4) f.set(1, 0, 0);
  f.normalize();
  return { fx: f.x, fz: f.z, rx: -f.z, rz: f.x };
}

export function isUserDriving(eng: MatchEngine, p: P) {
  if (p !== eng.controlled) return false;
  const joy = Math.hypot(eng.input.moveX, eng.input.moveY);
  return joy > 0.12 || eng.ball.carrier === p;
}

/** Slow motion while KICK is held and the user lines it up. */
export function setKickHold(eng: MatchEngine, on: boolean) {
  if (eng.offload) return;
  eng.timeScale = on ? 0.4 : 1;
  if (on) eng.kickTarget = null;
}

/** Freeze play while the user aims a kick. */
export function setAimFreeze(eng: MatchEngine, on: boolean) {
  eng.aimFreeze = on;
  if (!on) eng.input.kickAim.active = false;
}

/** Point on the pitch under a screen position (for aiming kicks). Returns metres to it from the kicker. */
export function aimKickAt(eng: MatchEngine, clientX: number, clientY: number, kind: KickKind): number | null {
  const k = eng.kickerNow();
  if (!k) return null;
  const rect = eng.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  eng.raycaster.setFromCamera(ndc, eng.camera);
  const hit = eng.raycaster.ray.intersectPlane(eng.groundPlane, eng.tmpV2);
  if (!hit) return null;
  // keep it within the kick's range
  const max = KICK_MAX[kind];
  let dx = hit.x - k.x;
  let dz = hit.z - k.z;
  const L = Math.hypot(dx, dz);
  if (L > max) {
    dx *= max / L;
    dz *= max / L;
  }
  eng.kickTarget = { x: k.x + dx, z: k.z + dz };
  return Math.min(L, max);
}

/**
 * Flick aim: the swipe vector on screen (px, right / down positive) becomes the kick: its
 * direction aims relative to the camera, its length sets the distance (half the screen = max range).
 */
export function aimKickFlick(eng: MatchEngine, dxPx: number, dyPx: number, kind: KickKind): number | null {
  const k = eng.kickerNow();
  if (!k) return null;
  const L = Math.hypot(dxPx, dyPx);
  if (L < 12) return null;
  const max = KICK_MAX[kind];
  const metres = Math.min(max, (L / (window.innerHeight * 0.5)) * max);
  const { fx, fz, rx, rz } = eng.camAxes();
  const ux = (dxPx / L) * rx + (-dyPx / L) * fx;
  const uz = (dxPx / L) * rz + (-dyPx / L) * fz;
  const n = Math.hypot(ux, uz) || 1;
  eng.kickTarget = { x: k.x + (ux / n) * metres, z: k.z + (uz / n) * metres };
  return metres;
}

export function clearKickTarget(eng: MatchEngine) {
  eng.kickTarget = null;
}

/** Kick from the picker: power under ~0.6 falls short, over 1 (held too long) sprays it. */
export function userKick(eng: MatchEngine, c: P, kind: KickKind, dist: number, angle: number, power: number, tx?: number, tz?: number) {
  if (kind === 'box' && c.num !== 9) kind = 'high';
  const short = power < 0.6 ? 0.55 + power * 0.75 : 1;
  const errMul = power > 1 ? 1 + (power - 1) * 5 : power < 0.35 ? 1.4 : 1;
  let aim = ((angle * Math.PI) / 180) * eng.camRightSign();
  const d0 = dirOf(c.side);
  if (tx !== undefined && tz !== undefined) {
    // kick to the spot the user touched on the pitch
    dist = Math.min(Math.hypot(tx - c.x, tz - c.z), KICK_MAX[kind]);
    aim = Math.atan2(tz - c.z, (tx - c.x) * d0);
  } else if (kind === 'touch') {
    // Find touch: aim to land just over the nearer touchline.
    const sgn = c.z >= 0 ? 1 : -1;
    const dz = sgn * (FIELD.halfW + 2) - c.z;
    aim = Math.asin(clamp(dz / Math.max(dist, 1), -0.95, 0.95));
  }
  eng.kickTo(c, dist * short, aim, kind, false, errMul);
  if (kind === 'high' || kind === 'box' || kind === 'chip' || kind === 'cross') {
    // chasers go after it
    const land = () => eng.predictLanding();
    const t = eng.teams[c.side];
    const chasers = kind === 'cross' ? [t[13], t[10]] : kind === 'chip' ? [c] : [t[10], t[13], t[14]];
    eng.setPlay = { id: 'upandunder', targets: [], routes: new Map(chasers.map((p) => [p, land] as const)), until: eng.time + 4 };
  }
}
