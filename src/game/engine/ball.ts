/** The ball: passing, catching, kicking, kick-offs, charge-downs and ball physics. */
import type { MatchEngine } from '../engine';
import { audio } from '../../util/audio';
import { haptic } from '../../util/haptics';
import { clamp, rand } from '../../util/rng';
import { CFG } from '../gameConfig';
import { FIELD } from '../stadium';
import type { InputAction } from '../types';
import { G, GRUB_FRICTION, GRUB_KEEP, GRUB_REST, GRUB_VY, KICK_MAX, dirOf, dist, line, other, simulateGrubber } from './shared';
import type { KickType, P, Side } from './shared';

export function updateCarriedBall(eng: MatchEngine) {
  const b = eng.ball;
  if (b.state === 'held' && b.carrier) {
    const p = b.carrier;
    const h = p.heading;
    b.x = p.x + Math.cos(h) * 0.35;
    b.z = p.z + Math.sin(h) * 0.35;
    b.y = p.state === 'down' ? 0.25 : 1.05;
  }
}

// ---------------------------------------------------------------- passing
/** Receiver for a pass to world side s (+1 = +z), or undefined if nobody is there. */
/**
 * Best receiver on side s (+1/-1 in world z). Short passes look for a runner 4-10m away who is
 * behind the ball and not swamped by a defender; long (skip) passes look 12-20m out and skip the first man.
 */
export function passTarget(eng: MatchEngine, passer: P, s: number, long: boolean): P | undefined {
  const d = dirOf(passer.side);
  const opp = eng.teams[other(passer.side)];
  const cands = eng.teams[passer.side].filter((p) => {
    if (p === passer || p.state !== 'free') return false;
    const lat = (p.z - passer.z) * s;
    const behind = (passer.x - p.x) * d;
    return lat > 1.8 && behind > -1 && behind < 14 && dist(p.x, p.z, passer.x, passer.z) < (long ? 30 : 20);
  });
  if (!cands.length) return undefined;
  // prefer runners clearly behind the ball; a level runner only if nobody else is there
  if (cands.some((p) => (passer.x - p.x) * d > 0.5)) cands.splice(0, cands.length, ...cands.filter((p) => (passer.x - p.x) * d > 0.5));
  const ideal = long ? 15 : 6.5;
  const nearestLat = Math.min(...cands.map((p) => Math.abs(p.z - passer.z)));
  let best: P | undefined;
  let bestScore = Infinity;
  for (const p of cands) {
    const lat = Math.abs(p.z - passer.z);
    const behind = (passer.x - p.x) * d;
    let score = Math.abs(lat - ideal) * 0.7;
    if (behind > 7) score += (behind - 7) * 0.8; // too deep to be useful
    if (long && lat <= nearestLat + 0.5 && cands.length > 1) score += 6; // a skip pass skips the first man
    // pressure: a defender on him already
    let near = 99;
    for (const o of opp) if (o.state === 'free') near = Math.min(near, dist(o.x, o.z, p.x, p.z));
    if (near < 2) score += 6;
    else if (near < 4) score += 2.5;
    // runners moving onto the ball, and backs, are better options than static forwards
    if (Math.hypot(p.vx, p.vz) > 2.5 && p.vx * d > 0) score -= 1.5;
    if (p.num >= 9) score -= 1;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

export function doPass(eng: MatchEngine, passer: P, long: boolean, dirHint: -1 | 0 | 1, spin = false): boolean {
  let side = 0;
  if (dirHint !== 0) side = dirHint * eng.camRightSign();
  else if (passer === eng.controlled && Math.abs(eng.input.moveX) > 0.3) side = Math.sign(eng.input.moveX) * eng.camRightSign();
  let target: P | undefined;
  // Set play override
  if (eng.setPlay && passer.side === 0) {
    while (eng.setPlay.targets.length && eng.setPlay.targets[0].state !== 'free') eng.setPlay.targets.shift();
    target = eng.setPlay.targets.shift();
  }
  if (!target) {
    const pick = (s: number) => eng.passTarget(passer, s, long);
    if (side !== 0) {
      // The user chose a side: never throw it the other way.
      target = pick(side);
      if (!target && passer.side === 0 && dirHint !== 0) eng.say('No one there!', 'info');
    } else {
      const sOpen = passer.z < 0 ? 1 : -1;
      target = pick(sOpen) ?? pick(-sOpen);
    }
  }
  if (!target) return false;
  const d = dirOf(passer.side);
  const distTo = dist(passer.x, passer.z, target.x, target.z);
  // Forward pass: long passes under pressure occasionally drift forward (not in arcade rules).
  const fpChance = { arcade: 0, standard: 0.006, sim: 0.025 }[eng.cfg.rules] * (long ? 1.6 : 0.6) * (eng.nearestOpponent(passer, 2.5) ? 1.6 : 1);
  if (!eng.cfg.drill && eng.phase === 'play' && rand.chance(fpChance)) {
    eng.whistle();
    eng.pop('FORWARD PASS', passer.side === 0 ? 'bad' : 'good');
    eng.say('Forward pass', passer.side === 0 ? 'bad' : 'good', `Scrum ${eng.teamShort(other(passer.side))}`);
    const x = passer.x;
    const z = passer.z;
    eng.ball.carrier = null;
    eng.ball.state = 'dead';
    eng.stoppage(() => eng.setupScrum(x, z, other(passer.side)));
    return true;
  }
  const speed = spin ? 20 : long ? 21 : 17; // flat, fizzed passes
  const T = clamp(distTo / speed, 0.22, 1.3);
  // Lead the receiver: aim where he will be, running onto it.
  const run = Math.max(0, target.vx * d);
  let tx = target.x + target.vx * T + d * Math.min(1.2, run * 0.15);
  let tz = target.z + target.vz * T;
  let err = (1 - passer.r.passing / 100) * (long ? 1.8 : 0.9);
  if (passer.side === 0) err *= CFG.difficulty.userPassError[eng.cfg.difficulty];
  tx += rand.range(-err, err) * 0.5;
  // A pass always travels slightly backwards: aim at the receiver's line, never in front of the passer.
  if ((tx - passer.x) * d > -0.3) tx = passer.x - d * 0.3;
  tz += rand.range(-err, err);
  const forward = (tx - passer.x) * d > 1.2;
  eng.ball.state = 'pass';
  eng.ball.carrier = null;
  eng.ball.pass = { fx: passer.x, fz: passer.z, tx, tz, t: 0, T, peak: long ? 0.9 : 0.35, target, passer, long, forward };
  // the receiver attacks the ball at pace
  target.urgency = 1;
  eng.ball.lastSide = passer.side;
  eng.atBaseT = -1;
  passer.kickT = 0.2;
  passer.fx = 'pass';
  if (passer.side === 0) eng.controlled = target;
  return true;
}

export function updatePass(eng: MatchEngine, dt: number) {
  const b = eng.ball;
  const f = b.pass!;
  f.t += dt;
  const u = Math.min(1, f.t / f.T);
  b.x = f.fx + (f.tx - f.fx) * u;
  b.z = f.fz + (f.tz - f.fz) * u;
  b.y = 1.1 + Math.sin(u * Math.PI) * f.peak;
  // steer the intended receiver onto the ball
  if (f.target.state === 'free' && !(f.target === eng.controlled && Math.hypot(eng.input.moveX, eng.input.moveY) > 0.12)) {
    // run onto the ball: aim a couple of metres past the catch point so he arrives at speed
    const dd = dirOf(f.target.side);
    f.target.tx = f.tx + dd * 2.5 * (1 - u);
    f.target.tz = f.tz;
    f.target.gx = f.target.tx;
    f.target.gz = f.target.tz;
    f.target.urgency = 1;
  }
  if (u < 1) return;
  // arrival: who can catch it?
  // The intended receiver has a generous reach; anyone else must be right on the ball.
  const tDist = dist(f.target.x, f.target.z, b.x, b.z);
  const cands = eng.players
    .filter((p) => p.state === 'free' && dist(p.x, p.z, b.x, b.z) < (p === f.target ? 3.2 : p.side === f.passer.side ? 1.2 : 0.7))
    .sort((p, q) => dist(p.x, p.z, b.x, b.z) - dist(q.x, q.z, b.x, b.z));
  const recv = cands.includes(f.target) && tDist < 3.2 ? f.target : cands[0];
  if (!recv) {
    // nobody there: ball falls loose
    const vx = (f.tx - f.fx) / f.T;
    const vz = (f.tz - f.fz) / f.T;
    eng.looseBall(b.x, b.y, b.z, vx * 0.5, 0, vz * 0.5);
    return;
  }
  if (recv.side !== f.passer.side) {
    if (rand.chance(0.3)) {
      eng.say(line('intercept'), recv.side === 0 ? 'good' : 'bad');
      eng.pop('INTERCEPT!', recv.side === 0 ? 'good' : 'bad');
      eng.ms.turnovers[recv.side]++;
      eng.giveBall(recv);
      return;
    }
    eng.looseBall(b.x, b.y, b.z, 0, 1, 0);
    return;
  }
  if (f.forward && !eng.cfg.drill) {
    eng.whistle();
    eng.say(line('forward'), recv.side === 0 ? 'bad' : 'good', `Scrum ${eng.teamShort(other(recv.side))}`);
    const x = b.x;
    const z = b.z;
    eng.stoppage(() => eng.setupScrum(x, z, other(recv.side)));
    eng.phase = 'dead';
    b.state = 'dead';
    return;
  }
  const pressure = eng.nearestOpponent(recv, 2) ? 0.06 : 0;
  let pc = (recv.side === 0 ? 0.985 : 0.96) + (recv.r.handling - 75) / 400 - (f.long ? 0.02 : 0) - pressure * 0.5;
  if (recv.side === 0) pc += eng.userAssist();
  if (rand.chance(clamp(pc, 0.7, 0.995)) || eng.cfg.drill === 'passing') {
    if (recv.side === 0) eng.stats.passes++;
    eng.giveBall(recv);
    // catch on the run: keep his momentum going forward
    const dd = dirOf(recv.side);
    if (recv.vx * dd < 4) recv.vx = dd * Math.max(4, recv.vx * dd);
    if (eng.cfg.drill === 'passing') {
      eng.drillScore++;
      eng.emit({ type: 'drill', text: 'Keep it moving — pass left and right', progress: `${eng.drillScore} / 10 passes` });
      if (eng.drillScore >= 10) eng.finishDrill(10);
    }
  } else {
    eng.knockOn(recv);
  }
}

export function giveBall(eng: MatchEngine, p: P) {
  const b = eng.ball;
  const changed = b.lastSide !== p.side;
  if (changed) eng.phaseCount = 0;
  b.grubber = false;
  b.penTouch = false;
  if (b.state === 'pass' || b.state === 'air') p.fx = 'catch';
  b.state = 'held';
  b.carrier = p;
  b.pass = null;
  b.goalCheck = null;
  b.lastSide = p.side;
  if (eng.phase === 'kickoff') eng.phase = 'play';
  if (changed) eng.setPlay = null;
  eng.assignSlots();
  eng.slotTimer = 6;
  if (p.side === 0) eng.controlled = p;
}

export function knockOn(eng: MatchEngine, p: P) {
  eng.whistle();
  haptic('tackle');
  audio.groan();
  if (!eng.offload) eng.pop('KNOCK-ON', p.side === 0 ? 'bad' : 'good');
  eng.say(line('knockOn'), p.side === 0 ? 'bad' : 'good', `Scrum ${eng.teamShort(other(p.side))}`);
  const b = eng.ball;
  b.state = 'dead';
  b.carrier = null;
  const x = p.x;
  const z = p.z;
  eng.phase = 'dead';
  if (eng.cfg.drill) {
    eng.after(1.2, () => eng.drillNext());
    return;
  }
  eng.stoppage(() => eng.setupScrum(x, z, other(p.side)));
}

// ---------------------------------------------------------------- kicking
/** Heading angle (relative to the side's attacking direction) that points from (x,z) to (tx,tz). */
export function aimTo(_eng: MatchEngine, side: Side, x: number, z: number, tx: number, tz: number) {
  return Math.atan2(tz - z, (tx - x) * dirOf(side));
}

/**
 * Launch velocity so the ball lands `dist` metres away along heading `aim`.
 * Punts/box/drop kicks: solved from a flight time. Grubbers: solved by simulating the roll.
 */
export function kickVelocity(_eng: MatchEngine, dist: number, aim: number, side: Side, type: KickType) {
  const d = dirOf(side);
  const hx = Math.cos(aim) * d;
  const hz = Math.sin(aim);
  if (type === 'grubber') {
    let lo = 2;
    let hi = 40;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (simulateGrubber(mid) < dist) lo = mid;
      else hi = mid;
    }
    const vh = (lo + hi) / 2;
    return { vx: hx * vh, vy: GRUB_VY, vz: hz * vh };
  }
  // flight time grows with distance; box kicks hang longest
  const T =
    type === 'box' ? clamp(1.9 + dist * 0.06, 2.6, 4.2)
    : type === 'drop' ? clamp(1.3 + dist * 0.035, 1.8, 3.2)
    : type === 'chip' ? clamp(1.3 + dist * 0.05, 1.6, 2.3)
    : type === 'high' ? clamp(2.8 + dist * 0.04, 3.4, 4.6)
    : type === 'cross' ? clamp(2.2 + dist * 0.035, 2.6, 3.8)
    : clamp(1.1 + dist * 0.05, 1.5, 4);
  const y0 = 0.7;
  const y1 = 1.1; // catch height
  const vy = (y1 - y0 + 0.5 * G * T * T) / T;
  const vh = dist / T;
  return { vx: hx * vh, vy, vz: hz * vh };
}

/** Kick from player p to land `dist` m away along heading `aim` (radians), with kicker-skill error. */
export function kickTo(eng: MatchEngine, p: P, dist: number, aim: number, type: KickType, exact = false, errMul = 1) {
  const skill = clamp(1.15 - p.r.kicking / 100, 0.1, 0.8) * errMul;
  const aimErr = exact ? 0 : (rand.next() - 0.5) * 2 * skill * (type === 'grubber' ? 0.09 : 0.11);
  const distErr = exact ? 1 : 1 + (rand.next() - 0.5) * 2 * skill * 0.18;
  const v = eng.kickVelocity(dist * distErr, aim + aimErr, p.side, type);
  const b = eng.ball;
  b.carrier = null;
  b.pass = null;
  b.state = 'air';
  b.x = p.x + dirOf(p.side) * 0.5;
  b.y = 0.7;
  b.z = p.z;
  b.vx = v.vx;
  b.vy = v.vy;
  b.vz = v.vz;
  b.kicker = p;
  b.kickFromX = p.x;
  b.bounced = false;
  b.lastSide = p.side;
  b.wind = type !== 'grubber';
  b.grubber = type === 'grubber';
  b.hopT = 0.3;
  b.goalCheck = type === 'drop' ? { side: p.side, kind: 'drop' } : null;
  eng.kickCurl = 0;
  p.kickT = 0.4;
  p.fx = 'kick';
  eng.atBaseT = -1;
  audio.kick();
  for (const pl of eng.players) pl.catchCD = pl === p ? 1.2 : 0.35;
  eng.setPlay = null;
  if (p.side === 0 && type === 'drop') eng.say('Drop goal attempt…', 'info');
}

export function tickCharge(eng: MatchEngine, dt: number) {
  // Your conversion: take too long and their line charges you (you can see them coming).
  // Your conversion: their line charges every time once your kicker starts his approach.
  if (eng.phase === 'placekick' && eng.placeKind === 'conversion' && eng.placeSide === 0 && eng.ball.state === 'dead' && eng.time - eng.placeT > 2.2) {
    const b = eng.ball;
    if (!eng.cpuCharging) {
      eng.cpuCharging = true;
      eng.pop('THEY\'RE CHARGING!', 'bad');
      eng.say('They are charging!', 'bad', 'Kick it before they get there');
      haptic('tackle');
    }
    const n = CFG.difficulty.cpuChargers[eng.cfg.difficulty];
    for (const p of eng.teams[1].filter((q) => q.state === 'free').sort((q, r) => dist(q.x, q.z, b.x, b.z) - dist(r.x, r.z, b.x, b.z)).slice(0, n)) {
      p.tx = p.gx = b.x;
      p.tz = p.gz = b.z;
      p.urgency = 0.8;
    }
  } else if (eng.phase !== 'placekick') eng.cpuCharging = false;
  if (eng.chargeT < 0 || eng.phase !== 'placekick') {
    eng.charging = false;
    return;
  }
  const was = eng.chargeT < 1.4;
  eng.chargeT += dt;
  if (was && eng.chargeT >= 1.4) eng.emit({ type: 'hud', hud: eng.hud() });
  if (eng.charging) {
    // your chasers sprint at the ball
    const b = eng.ball;
    for (const p of eng.teams[0].filter((q) => q.state === 'free').sort((q, r) => dist(q.x, q.z, b.x, b.z) - dist(r.x, r.z, b.x, b.z)).slice(0, 3)) {
      p.tx = p.gx = b.x;
      p.tz = p.gz = b.z;
      p.urgency = 1;
    }
  }
}

export function charge(eng: MatchEngine) {
  if (eng.chargeT < 0 || eng.charging) return;
  if (eng.chargeT < 1.4) {
    eng.say('Too early!', 'bad', 'Wait for the kicker to start his run-up');
    eng.chargeT = -1;
    return;
  }
  eng.charging = true;
  eng.pop('CHARGE!', 'good');
}

export function kickoffKick(eng: MatchEngine) {
  const ka = eng.kickoffAim!;
  eng.kickoffAim = null;
  const dk = dirOf(ka.side);
  let t = eng.kickTarget ?? { x: ka.atX + dk * 12, z: 10 };
  // must travel 10m; can't go out on the full beyond ~55m
  const fwd = clamp((t.x - ka.atX) * dk, 10, 55);
  t = { x: ka.atX + dk * fwd, z: clamp(t.z, -33, 33) };
  const T = fwd < 20 ? 2.7 : 3.3;
  ka.kick(t, T);
  if (fwd < 20) for (const p of eng.teams[ka.side].slice(3, 8)) {
    p.tx = t.x;
    p.tz = t.z;
    p.urgency = 1;
  }
  eng.emit({ type: 'hud', hud: eng.hud() });
}

/** Lineout throw in flight: jumpers lifted, ball arcing in from touch. */
export function updateLineoutThrow(eng: MatchEngine, dt: number) {
  const lt = eng.loThrow;
  if (!lt) return;
  lt.t += dt;
  const u = Math.min(1, lt.t / lt.dur);
  // lifters get the jumper up early (by 60% of the flight), the rival a touch later
  const lift = (k: number) => 1.4 * Math.min(1, Math.max(0, (u - k) / 0.45));
  lt.jumper.lift = lift(0.05);
  lt.rival.lift = lift(0.2) * 0.85;
  const b = eng.ball;
  b.state = 'dead';
  b.carrier = null;
  b.x = lt.from.x + (lt.to.x - lt.from.x) * u + (lt.wobble ? Math.sin(u * 9) * 0.25 : 0);
  b.z = lt.from.z + (lt.to.z - lt.from.z) * u;
  b.y = 2 + (3.1 - 2) * u + Math.sin(u * Math.PI) * 2.2;
}

export function penaltyTouchKick(eng: MatchEngine, a: Extract<InputAction, { type: 'kick' }>) {
  const k = eng.penTouch!.kicker;
  eng.penTouch = null;
  const d0 = dirOf(0);
  let dist = a.dist;
  let aim = 0;
  if (a.tx !== undefined && a.tz !== undefined) {
    dist = Math.min(Math.hypot(a.tx - k.x, a.tz - k.z), KICK_MAX.touch);
    aim = Math.atan2(a.tz - k.z, (a.tx - k.x) * d0);
  }
  const pw = a.power ?? 0.85;
  eng.kickTo(k, dist * (pw < 0.6 ? 0.55 + pw * 0.75 : 1), aim, 'touch', false, pw > 1 ? 1 + (pw - 1) * 5 : 1);
  eng.ball.penTouch = true;
  eng.phase = 'play';
  eng.phaseT = 0;
  eng.assignSlots();
}

/** The player about to kick: the carrier, or the penalty kicker lining up a kick to touch. */
export function kickerNow(eng: MatchEngine): P | null {
  if (eng.penTouch) return eng.penTouch.kicker;
  if (eng.kickoffAim) return eng.kickoffAim.kicker;
  const c = eng.controlled;
  return c && eng.ball.carrier === c ? c : null;
}

/** Is the user's carrier in range for a drop goal? */
export function canDropGoal(eng: MatchEngine): boolean {
  const c = eng.ball.carrier;
  if (!c || c.side !== 0 || c !== eng.controlled || eng.phase !== 'play') return false;
  const D = dist(c.x, c.z, FIELD.tryX, 0);
  return D <= 42 && D >= 8 && Math.abs(c.z) < 24 && c.x < FIELD.tryX - 4;
}

export function dropGoal(eng: MatchEngine, p: P) {
  const d = dirOf(p.side);
  const D = dist(p.x, p.z, d * FIELD.tryX, 0);
  const aim = eng.aimTo(p.side, p.x, p.z, d * FIELD.tryX, 0);
  // aim beyond the posts so the ball is still climbing/high as it crosses the bar
  eng.kickTo(p, D + 12, aim, 'drop');
}

export function looseBall(eng: MatchEngine, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
  const b = eng.ball;
  Object.assign(b, { x, y, z, vx, vy, vz, state: 'air', carrier: null, pass: null, bounced: false, wind: false, goalCheck: null, grubber: false });
  b.kicker = null;
}

export function predictLanding(eng: MatchEngine): { x: number; z: number } {
  const b = eng.ball;
  if (b.state === 'ground') return { x: b.x, z: b.z };
  // y(t) = y + vy t - g/2 t^2 = 1.2  (catch height)
  const a = -G / 2;
  const c0 = b.y - 1.2;
  const disc = b.vy * b.vy - 4 * a * c0;
  const t = disc > 0 ? (-b.vy - Math.sqrt(disc)) / (2 * a) : 0.2;
  return { x: clamp(b.x + b.vx * t, -58, 58), z: clamp(b.z + b.vz * t, -34, 34) };
}

export function updateBallPhysics(eng: MatchEngine, dt: number) {
  const b = eng.ball;
  const px = b.x;
  const py = b.y;
  const pz = b.z;
  if (b.state === 'air') {
    b.vy -= G * dt;
    if (b.wind) {
      const wk = b.goalCheck ? 0.16 : 0.05;
      b.vx += eng.wind.x * wk * dt;
      b.vz += eng.wind.z * wk * dt;
      if (eng.kickCurl) {
        // swerve: sideways acceleration perpendicular to the flight
        const sp = Math.hypot(b.vx, b.vz) || 1;
        b.vx += (-b.vz / sp) * eng.kickCurl * dt;
        b.vz += (b.vx / sp) * eng.kickCurl * dt;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.y <= 0.12) {
      b.y = 0.12;
      if (b.grubber && Math.abs(b.vy) > 1.2) {
        // grubber: low skidding bounces, slightly unpredictable
        b.vy = -b.vy * GRUB_REST;
        b.vx *= GRUB_KEEP;
        b.vz = b.vz * GRUB_KEEP + rand.range(-0.8, 0.8);
        b.bounced = true;
      } else if (!b.grubber && Math.abs(b.vy) > 2.5) {
        b.vy = -b.vy * 0.42;
        b.vx *= 0.6;
        b.vz = b.vz * 0.6 + rand.range(-2, 2);
        b.bounced = true;
        b.wind = false;
      } else {
        b.state = 'ground';
        b.vy = 0;
      }
    }
  } else if (b.state === 'ground') {
    const fr = Math.max(0, 1 - dt * (b.grubber ? GRUB_FRICTION : 1.6));
    b.vx *= fr;
    b.vz *= fr;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    // a rolling rugby ball hops end over end now and then
    if (b.grubber && Math.hypot(b.vx, b.vz) > 3) {
      b.hopT -= dt;
      if (b.hopT <= 0) {
        b.hopT = rand.range(0.25, 0.55);
        b.state = 'air';
        b.vy = rand.range(1.3, 2.4);
        b.vz += rand.range(-1.2, 1.2);
      }
    }
  }

  // goal posts (drop goals and place kicks)
  if (b.goalCheck) {
    const gx = dirOf(b.goalCheck.side) * FIELD.tryX;
    if ((px - gx) * (b.x - gx) <= 0 && px !== b.x) {
      const u = (gx - px) / (b.x - px);
      const yz = pz + (b.z - pz) * u;
      const yy = py + (b.y - py) * u;
      const good = Math.abs(yz) < FIELD.postHalfW && yy > FIELD.crossbar;
      const gc = b.goalCheck;
      b.goalCheck = null;
      eng.goalResult(gc.side, gc.kind, good);
      if (gc.kind !== 'drop' || good) return;
    }
  }
  if (eng.phase !== 'play' && eng.phase !== 'kickoff') return;

  // touch
  if (Math.abs(b.z) > FIELD.halfW) {
    const kicker = b.kicker;
    let throwSide = other(b.lastSide);
    let x = b.x;
    if (b.penTouch) {
      // penalty kicked to touch: the kicking side throws in where it went out
      throwSide = b.lastSide;
      b.penTouch = false;
      if (throwSide === 0) eng.pop('FOUND TOUCH!', 'good');
    } else if (
      kicker &&
      b.bounced &&
      b.lastSide === kicker.side &&
      b.kickFromX * dirOf(kicker.side) < 0 &&
      b.x * dirOf(kicker.side) > FIELD.tryX - 22
    ) {
      // 50:22 — kicked from your own half, bounced in, out inside their 22: your throw
      throwSide = kicker.side;
      eng.pop('50:22!', kicker.side === 0 ? 'good' : 'bad');
      eng.say('50:22!', kicker.side === 0 ? 'good' : 'bad', `Lineout ${eng.teamShort(kicker.side)}`);
      audio.cheer(0.8);
    } else if (kicker && !b.bounced && kicker.x * dirOf(kicker.side) > -28) x = b.kickFromX; // out on the full
    eng.whistle();
    eng.say('Ball in touch', 'info', `Lineout ${eng.teamShort(throwSide)}`);
    const sign = Math.sign(b.z);
    b.state = 'dead';
    eng.stoppage(() => eng.setupLineout(x, sign, throwSide));
    return;
  }
  // dead ball
  if (Math.abs(b.x) > FIELD.deadX) {
    const restartSide = other(b.lastSide);
    eng.whistle();
    eng.say('Dead ball', 'info', '22m drop-out');
    b.state = 'dead';
    eng.stoppage(() => eng.setupKickoff(restartSide, -dirOf(restartSide) * 28));
    return;
  }
  // catch / gather
  // a timed swipe/CATCH = your player leaps: higher and further reach, and he wins the contest
  const leap = b.state === 'air' && eng.time - eng.catchPressT < 0.5;
  const catchH = b.state === 'ground' ? 0.6 : leap ? 3.3 : 2.6;
  if (b.y > catchH) return;
  let best: P | null = null;
  let bd = 1.3;
  for (const p of eng.players) {
    if (p.state !== 'free' || p.catchCD > 0) continue;
    const d = dist(p.x, p.z, b.x, b.z) - (leap && p.side === 0 ? 0.9 : 0);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  if (best && leap && best.side === 0) {
    best.fx = 'catch';
    if (b.kicker && b.kicker.side !== 0) eng.pop('TAKEN IN THE AIR!', 'good');
    else eng.pop('CONTESTED — WON!', 'good');
  }
  if (!best) return;
  const p = best;
  if (b.state === 'air') {
    let pc = 0.92 + (p.r.handling - 70) / 250;
    if (p.side === 0) {
      pc += eng.userAssist();
      // CATCH timing: a press in the last moment = clean take, mashing early = fumble risk.
      const since = eng.time - eng.catchPressT;
      if (since < 0.45) pc = 0.995;
      else if (since < 1.2) pc -= 0.06;
    }
    if (eng.cfg.weather === 'rain') pc -= 0.07;
    if (!rand.chance(clamp(pc, 0.55, 0.98))) {
      p.catchCD = 0.6;
      if (rand.chance(0.35) && !eng.cfg.drill) {
        eng.knockOn(p);
        return;
      }
      b.vx = rand.range(-2, 2);
      b.vz = rand.range(-2, 2);
      b.vy = 1.5;
      return;
    }
  }
  // try by gathering a kick in the opposition in-goal
  const d = dirOf(p.side);
  if (p.x * d >= FIELD.tryX) {
    eng.giveBall(p);
    eng.scoreTry(p);
    return;
  }
  if (p.x * d <= -FIELD.tryX) {
    eng.giveBall(p);
    eng.whistle();
    eng.say('Touched down', 'info', '22m drop-out');
    eng.stoppage(() => eng.setupKickoff(p.side, -d * 28));
    return;
  }
  eng.giveBall(p);
}
