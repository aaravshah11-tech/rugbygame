/** Contact: the ball carrier, fends, tackles, offloads and what happens after a hit. */
import type { MatchEngine } from '../engine';
import { audio } from '../../util/audio';
import { haptic } from '../../util/haptics';
import { clamp, rand } from '../../util/rng';
import { CFG } from '../gameConfig';
import { FIELD } from '../field';
import { dirOf, dist, line, other } from './shared';
import type { P } from './shared';

export function updateCarrier(eng: MatchEngine, dt: number, c: P) {
  const d = dirOf(c.side);
  // Try line
  if (c.x * d >= FIELD.tryX && Math.abs(c.z) < FIELD.halfW) {
    eng.scoreTry(c);
    return;
  }
  // Carried into own in-goal: touch down, 22 drop-out
  if (c.x * d <= -FIELD.tryX) {
    eng.whistle();
    eng.say('Touched down', 'info', '22m drop-out');
    eng.stoppage(() => eng.setupKickoff(c.side, -d * 28));
    return;
  }
  // Touch
  if (Math.abs(c.z) > FIELD.halfW) {
    eng.whistle();
    eng.say('Into touch', 'info', 'Lineout');
    const x = c.x;
    const sign = Math.sign(c.z);
    eng.stoppage(() => eng.setupLineout(x, sign, other(c.side)));
    return;
  }
  // Line break commentary
  const defAhead = eng.teams[other(c.side)].some((o) => o.state === 'free' && (o.x - c.x) * d > -0.5 && (o.x - c.x) * d < 12 && Math.abs(o.z - c.z) < 9);
  if (!defAhead) {
    if (eng.lineBreakFrom === null) eng.lineBreakFrom = c.x;
    else if (Math.abs(c.x - eng.lineBreakFrom) > 8) {
      eng.say(line('lineBreak'), 'good');
      eng.ms.breaks[c.side]++;
      eng.ps(c).breaks++;
      if (c.side === 0) eng.pop('LINE BREAK!', 'good');
      eng.lineBreakFrom = 1e9;
    }
  } else if (eng.lineBreakFrom !== 1e9) eng.lineBreakFrom = null;

  if (c.side === 0 && c === eng.controlled && eng.atBaseT >= 0) {
    eng.atBaseT += dt;
    if (Math.hypot(eng.input.moveX, eng.input.moveY) > 0.5) eng.atBaseT = -1; // sniping: the user runs it
    else eng.useItCheck(c);
  }
  if (c.side === 1 || c !== eng.controlled) eng.cpuCarrier(dt, c);
}

export function tryFend(eng: MatchEngine, c: P, d: P) {
  const chance = clamp(0.35 + (c.r.strength - d.r.strength) / 90 + (c.side === 0 ? eng.userAssist() : -eng.userAssist()), 0.1, 0.85);
  if (rand.chance(chance)) {
    d.state = 'down';
    d.timer = 1.1;
    d.vx = (d.x - c.x) * 2;
    d.vz = (d.z - c.z) * 2;
    eng.say('Big hand-off!', c.side === 0 ? 'good' : 'bad');
    audio.thud(0.6);
  }
}

export function userAssist(eng: MatchEngine) {
  return CFG.difficulty.userAssist[eng.cfg.difficulty];
}

// ---------------------------------------------------------------- tackles
export function attemptTackle(eng: MatchEngine, t: P, c: P, dive: boolean) {
  if (eng.offload || c.state !== 'free') return;
  t.tackleCD = 0.5;
  if (!dive) t.fx = 'tackle';
  const evasion = c.r.strength * 0.45 + c.r.pace * 0.3 + c.r.handling * 0.25;
  let p = 0.62 + (t.r.tackling - evasion) / 110;
  // Fresh legs win contests: a tired carrier is easier to bring down, a tired tackler misses more.
  p += (1 - c.stamina) * 0.12 - (1 - t.stamina) * 0.1;
  // Gang tackle: a second defender arriving makes it stick.
  if (eng.teams[t.side].some((o) => o !== t && o.state === 'free' && dist(o.x, o.z, c.x, c.z) < 2.2)) p += 0.1;
  if (dive) p += 0.08;
  if (c.handoffT > 0) p -= 0.12 + (c.r.strength - t.r.strength) / 200;
  if (c.sidestepT > 0) p -= 0.2 * (c.r.pace / 90);
  p += t.side === 0 ? eng.userAssist() + 0.08 : -eng.userAssist() - 0.12;
  // Sprinting carriers are harder to bring down.
  if (c.side === 0 && Math.hypot(c.vx, c.vz) > 6.2) p -= 0.08;
  // Automatic fend: strong carriers driving through contact can bump tacklers off.
  if (c.side === 0 && c === eng.controlled && Math.hypot(eng.input.moveX, eng.input.moveY) > 0.5) p -= Math.max(0, (c.r.strength - t.r.strength) / 160);
  p = clamp(p, 0.15, 0.95);
  if (rand.chance(p)) {
    eng.tackleMade(t, c);
  } else {
    t.state = 'down';
    t.timer = dive ? 1.4 : 1.1;
    t.tackleCD = 1.6;
    if (!c.av.busy) c.fx = 'handoff';
    if (rand.chance(0.6)) eng.say(line('brokenTackle'), c.side === 0 ? 'good' : 'bad');
    eng.ms.missed[t.side]++;
    if (c.side === 0) eng.pop('BROKEN TACKLE!', 'good');
  }
}

export function tackleMade(eng: MatchEngine, t: P, c: P) {
  const speed = Math.hypot(t.vx, t.vz) + Math.hypot(c.vx, c.vz);
  const big = t.r.tackling > 78 && (speed > 9 || rand.chance(0.2));
  if (t.side === 0) eng.stats.tackles++;
  eng.ms.tackles[t.side]++;
  eng.ps(t).tackles++;
  audio.thud(big ? 1 : 0.7);
  if (t.side === 0 || c.side === 0) haptic(big ? 'bighit' : 'tackle');
  if (big) {
    eng.say(line('bigHit'), t.side === 0 ? 'good' : 'bad');
    eng.pop('BIG HIT!', 'big');
    eng.hitStopT = 0.06;
    // the best hits get a quick slow-mo replay (skippable); play resumes from the ruck after it
    if (!eng.cfg.drill && (t.side === 0 || c.side === 0) && eng.time - eng.lastHitReplay > 40 && rand.chance(0.5)) {
      eng.lastHitReplay = eng.time;
      const clip = eng.history.slice(-60);
      eng.after(0.5, () => {
        if (!eng.replay && (eng.phase === 'ruck' || eng.phase === 'play')) eng.startReplay(clip, () => {});
      });
    }
  }
  c.state = 'down';
  c.timer = 1.5; // tackled players are back on their feet after 1.5s
  eng.particles.dust(c.x, c.z, big ? 1.4 : 0.7);
  c.vx *= 0.3;
  c.vz *= 0.3;
  // Dominant tackle: the carrier is driven back about a metre towards their own line.
  if (big) c.vx = -dirOf(c.side) * 6;
  t.state = 'down';
  t.timer = 1.2;
  eng.lineBreakFrom = null;
  eng.setPlay = null;

  if (eng.cfg.drill === 'tackling') {
    eng.drillScore++;
    eng.say('Tackle made!', 'good');
    eng.after(1.2, () => eng.drillNext());
    eng.phase = 'dead';
    return;
  }
  if (eng.cfg.drill === 'passing') {
    eng.after(1, () => eng.drillNext());
    eng.phase = 'dead';
    return;
  }

  // The user's carrier gets a split-second, in slow motion, to offload in the tackle.
  if (c.side === 0 && c === eng.controlled && !eng.cfg.drill) {
    eng.offload = { c, t, left: 0.55 };
    eng.timeScale = 0.35;
    eng.emit({ type: 'hud', hud: eng.hud() });
    return;
  }
  // CPU ball players with good hands sometimes get the ball away in contact.
  if (c.side === 1 && c.r.handling > 78 && rand.chance(0.12)) {
    const tgt = eng.passTarget(c, c.z < 0 ? 1 : -1, false) ?? eng.passTarget(c, c.z < 0 ? -1 : 1, false);
    if (tgt && dist(tgt.x, tgt.z, c.x, c.z) < 7) {
      eng.pop('OFFLOAD!', 'bad');
      eng.doPass(c, false, 0);
      return;
    }
  }
  eng.afterContact(t, c);
}

/** The offload window ran out or was used. */
export function tickOffload(eng: MatchEngine, dt: number) {
  const o = eng.offload;
  if (!o) return;
  o.left -= dt / Math.max(0.05, eng.timeScale);
  if (o.left <= 0) {
    eng.offload = null;
    eng.timeScale = 1;
    eng.emit({ type: 'hud', hud: eng.hud() });
    if (eng.ball.carrier === o.c) eng.afterContact(o.t, o.c);
  }
}

export function tryOffload(eng: MatchEngine, dir: -1 | 0 | 1) {
  const o = eng.offload!;
  eng.offload = null;
  eng.timeScale = 1;
  const c = o.c;
  const chance = clamp(0.72 + (c.r.handling - 70) / 90 + (c.r.strength - o.t.r.tackling) / 220 + eng.userAssist(), 0.45, 0.94);
  if (!rand.chance(chance)) {
    if (rand.chance(0.3)) {
      eng.pop('KNOCK-ON', 'bad');
      eng.knockOn(c);
    } else {
      eng.say('Offload not on', 'info', 'Ball to ground');
      eng.afterContact(o.t, c);
    }
    return;
  }
  if (eng.doPass(c, false, dir)) {
    eng.pop('OFFLOAD!', 'good');
    haptic('tackle');
  } else eng.afterContact(o.t, c);
}

export function afterContact(eng: MatchEngine, t: P, c: P) {
  // HOLD TACKLE: the user's tackler tries to hold the carrier up and win the ball.
  // Holding TACKLE on a big forward: a strong tackler can stay up and rip the ball (play goes on).
  if (t.side === 0 && t === eng.controlled && eng.input.tackleHold && !eng.cfg.drill && c.num <= 8) {
    const chance = clamp(0.1 + (t.r.strength - c.r.strength) / 160 + eng.userAssist(), 0.04, 0.3);
    if (rand.chance(chance)) {
      eng.pop('TURNOVER!', 'good');
      eng.say('Ripped in the tackle!', 'good');
      eng.ms.turnovers[0]++;
      t.state = 'free';
      eng.giveBall(t);
      eng.phase = 'play';
      eng.assignSlots();
      return;
    }
  }
  // High tackle (more likely when the carrier is ducking out of a step)
  if (rand.chance(0.03 * eng.strict() * (c.sidestepT > 0 ? 3 : 1))) {
    eng.whistle();
    eng.say('High tackle!', t.side === 0 ? 'bad' : 'good', `Penalty ${eng.teamShort(c.side)}`);
    const x = c.x;
    const z = c.z;
    eng.stoppage(() => eng.awardPenalty(c.side, x, z));
    return;
  }
  // Knock-on in contact
  if (rand.chance(0.015 * (1.4 - c.r.handling / 100) * (eng.cfg.weather === 'rain' ? 1.8 : 1))) {
    eng.knockOn(c);
    return;
  }
  // Held up by big forwards -> maul
  if (c.num <= 8 && c.r.strength > 78 && rand.chance(0.05)) {
    c.state = 'free';
    t.state = 'free';
    eng.startMaul(c.x, c.z, c.side, c);
    return;
  }
  eng.startRuck(c, t);
}
