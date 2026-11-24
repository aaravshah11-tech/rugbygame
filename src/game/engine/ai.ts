/** Team AI: attacking shape, defensive line, the CPU ball carrier, and moving every player. */
import type { MatchEngine } from '../engine';
import { clamp, rand } from '../../util/rng';
import { CFG } from '../gameConfig';
import { FIELD } from '../stadium';
import { dirOf, dist, moveStats, other } from './shared';
import type { P, Side } from './shared';

/** Average distance of a side's support players from their attacking slots. */
export function attackSpread(eng: MatchEngine, side: Side): number {
  const c = eng.ball.carrier;
  if (!c) return 0;
  let tot = 0;
  let n = 0;
  for (const p of eng.teams[side]) {
    if (p === c || p.state !== 'free' || p.num <= 8) continue;
    tot += dist(p.x, p.z, p.tx, p.tz);
    n++;
  }
  return n ? tot / n : 0;
}

// ---------------------------------------------------------------- movement
export function maxSpeed(eng: MatchEngine, p: P) {
  const R = CFG.run;
  let s = R.base + (p.r.pace / 100) * R.perPace;
  if (eng.ball.carrier === p) s *= R.carrierMult;
  // Tired legs: below half stamina players lose some pace.
  s *= R.tiredFloor + (1 - R.tiredFloor) * Math.min(1, p.stamina * 2);
  if (p === eng.controlled && p.side === 0) s *= R.userMult;
  return s;
}

export function movePlayers(eng: MatchEngine, dt: number) {
  const inp = eng.input;
  const joy = Math.hypot(inp.moveX, inp.moveY);
  const { fx, fz, rx, rz } = eng.camAxes();
  for (const p of eng.players) {
    p.tackleCD -= dt;
    p.sidestepCD -= dt;
    p.catchCD -= dt;
    p.sidestepT -= dt;
    p.handoffT -= dt;
    p.kickT -= dt;
    if (p.diveT > 0) {
      p.diveT -= dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.vx *= 1 - dt * 3;
      p.vz *= 1 - dt * 3;
      continue;
    }
    if (p.state === 'off') continue;
    if (p.state === 'down') {
      p.timer -= dt;
      p.vx *= 1 - dt * 6;
      p.vz *= 1 - dt * 6;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      if (p.timer <= 0) p.state = 'free';
      continue;
    }
    let dvx = 0;
    let dvz = 0;
    const max = eng.maxSpeed(p);
    const carrierNow = eng.ball.carrier;
    const chasing = p === eng.controlled && p.state === 'free' && inp.tackleHold && !!carrierNow && carrierNow.side !== p.side && eng.phase === 'play' && eng.atBaseT < 0;
    const userDriven = p === eng.controlled && p.state === 'free' && (joy > 0.12 || eng.ball.carrier === p) && eng.phase !== 'placekick';
    if (chasing && carrierNow) {
      // Hold TACKLE: sprint to cut off the ball carrier.
      const lead = Math.min(0.6, dist(p.x, p.z, carrierNow.x, carrierNow.z) / 12);
      const tx = carrierNow.x + carrierNow.vx * lead - p.x;
      const tz = carrierNow.z + carrierNow.vz * lead - p.z;
      const n = Math.hypot(tx, tz) || 1;
      const spd = max * (p.stamina > 0.05 ? CFG.run.sprintMult : 1);
      dvx = (tx / n) * spd;
      dvz = (tz / n) * spd;
      p.stamina = clamp(p.stamina - CFG.stamina.chaseDrain * dt, 0, 1);
    } else if (userDriven) {
      const sprinting = (inp.sprint || inp.sprintHold) && p.stamina > 0.05;
      const spd = max * (sprinting ? CFG.run.sprintMult : 1) * Math.min(1, joy * 1.15);
      if (joy > 0.05) {
        const mx = inp.moveX / Math.max(joy, 1);
        const my = inp.moveY / Math.max(joy, 1);
        const wx = rx * mx + fx * my;
        const wz = rz * mx + fz * my;
        const n = Math.hypot(wx, wz) || 1;
        dvx = (wx / n) * spd;
        dvz = (wz / n) * spd;
      }
      p.stamina = clamp(p.stamina + (sprinting && joy > 0.1 ? -CFG.stamina.sprintDrain : CFG.stamina.userRecover) * dt, 0, 1);
    } else if (p.state === 'free' || p.state === 'bound') {
      // Ease the goal towards the AI's target so players glide into shape instead of jittering.
      const ease = Math.min(1, dt * (p.urgency >= 1 ? 9 : 3.2));
      p.gx += (p.tx - p.gx) * ease;
      p.gz += (p.tz - p.gz) * ease;
      const dx = p.gx - p.x;
      const dz = p.gz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.15) {
        const spd = max * p.urgency * Math.min(1, d / 2.5) * (p.state === 'bound' ? (d > 1.5 ? 0.9 : 0.4) : 1);
        dvx = (dx / d) * spd;
        dvz = (dz / d) * spd;
      }
      p.stamina = clamp(p.stamina + CFG.stamina.aiRecover * dt, 0, 1);
    }
    if (p.sidestepT > 0 && eng.ball.carrier === p) {
      dvz += p.sideDir * 7;
      dvx += dirOf(p.side) * 2;
    }
    // Momentum: ~0.4s to reach top speed, ~0.3s to stop; sharp turns bleed speed,
    // less so for agile players (backs with pace and hands) than for big forwards.
    const { acc: accStat, agi } = moveStats(p);
    const cur = Math.hypot(p.vx, p.vz);
    const want = Math.hypot(dvx, dvz);
    let acc: number;
    if (p.state === 'bound') acc = 4;
    else {
      const slowing = want < cur - 0.2;
      acc = slowing ? 9.5 : 7.5 * accStat;
      if (cur > 2.5 && want > 0.5) {
        const cos = (p.vx * dvx + p.vz * dvz) / (cur * want);
        const turn = Math.acos(clamp(cos, -1, 1)); // 0 .. PI
        if (turn > 0.6) {
          const pen = clamp((turn - 0.6) / 2, 0, 1) * (0.55 - agi * 0.3);
          dvx *= 1 - pen;
          dvz *= 1 - pen;
          acc *= 0.65 + agi * 0.35;
        }
      }
    }
    p.vx += (dvx - p.vx) * Math.min(1, dt * acc);
    p.vz += (dvz - p.vz) * Math.min(1, dt * acc);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
  }
  // gentle separation so players don't overlap
  const ps = eng.players;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (a.state === 'off' || a.state === 'down') continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (b.state === 'off' || b.state === 'down') continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const min = a.state === 'bound' || b.state === 'bound' ? 0.5 : 0.8;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5 * Math.min(1, dt * 14);
        const ux = dx / d;
        const uz = dz / d;
        a.x -= ux * push;
        a.z -= uz * push;
        b.x += ux * push;
        b.z += uz * push;
      }
    }
  }
}

// ---------------------------------------------------------------- AI
export function assignSlots(eng: MatchEngine) {
  const b = eng.ball;
  const att = eng.possession();
  const anchor = b.carrier ?? (b.pass ? b.pass.target : null);
  const ax = anchor ? anchor.x : b.x;
  const az = anchor ? anchor.z : b.z;
  const mates = eng.teams[att].filter((p) => p !== anchor && p.state !== 'off' && p.state !== 'bound');
  const left = mates.filter((p) => p.z < az).sort((p, q) => q.z - p.z);
  const right = mates.filter((p) => p.z >= az).sort((p, q) => p.z - q.z);
  // Balance the line: more runners on the open side.
  const openRight = az < 0;
  while (openRight ? right.length < left.length - 1 : left.length < right.length - 1) {
    if (openRight) right.unshift(left.shift()!);
    else left.unshift(right.shift()!);
  }
  // Keep everyone in the order they're already standing in, so nobody crosses behind the ball.
  left.forEach((p, k) => ((p.slotSide = -1), (p.slotK = k)));
  right.forEach((p, k) => ((p.slotSide = 1), (p.slotK = k)));
  eng.slotCount = { [-1]: left.length, [1]: right.length };
  void ax;
}

export function attackSlotTarget(eng: MatchEngine, p: P, ax: number, az: number, side: Side) {
  const d = dirOf(side);
  const k = p.slotK;
  // A clean staggered line, ~6m apart, each player a little deeper; extras form a second wave.
  // Fit the line into the room on that side so nobody gets stacked on the touchline.
  const n = Math.max(1, Math.min(7, eng.slotCount[p.slotSide] ?? 7));
  const room = FIELD.halfW - 2.5 - az * p.slotSide - 4;
  // Attack style: forward-dominant = flat and tight, expansive = deeper and wider.
  const st = eng.tac[side].attack;
  const depthK = (st === 'forwards' ? 1.2 : st === 'expansive' ? 2.3 : 1.8) * eng.customTac(side).depth;
  const widthK = st === 'forwards' ? 0.85 : st === 'expansive' ? 1.12 : 1;
  const gap = clamp((room / n) * widthK * eng.customTac(side).width, 2.6, 7);
  // first wave: slots 0-6; anyone beyond forms a second wave further back, each in his own lane
  const j = k >= 7 ? k - 7 : Math.min(k, 6);
  const deep = k >= 7 ? 6 : 0;
  // forwards (1-8) hang a little flatter as pods, wingers always hold the width
  const wing = p.num === 11 || p.num === 14;
  const x = ax - d * (4.2 + j * depthK + deep + (p.num <= 8 ? -1.2 : 0));
  const zOff = wing ? Math.max((j + 0.5) * gap + 4, room - 1) : 4 + (j + 0.5) * gap;
  const z = clamp(az + p.slotSide * zOff, -FIELD.halfW + 2.5, FIELD.halfW - 2.5);
  return { x, z };
}

export function updateAI(eng: MatchEngine, dt: number) {
  const b = eng.ball;
  const att = eng.possession();
  const def = other(att);
  const dAtt = dirOf(att);
  const carrier = b.carrier;
  let fx = b.x;
  let fz = b.z;
  if (b.state === 'pass' && b.pass) {
    fx = b.pass.tx;
    fz = b.pass.tz;
  }
  const airborne = b.state === 'air' || b.state === 'ground';
  let land: { x: number; z: number } | null = null;
  if (airborne) land = eng.predictLanding();

  // ----- attack
  for (const p of eng.teams[att]) {
    if (p.state !== 'free' || p === eng.controlled && eng.isUserDriving(p)) continue;
    if (p === carrier) continue;
    if (airborne && land) continue;
    const route = eng.setPlay?.routes.get(p);
    if (route && att === 0) {
      const r = route();
      p.tx = r.x;
      p.tz = r.z;
      p.urgency = 1;
      continue;
    }
    // Project the line ahead with the carrier so support runners keep pace; at the base of a
    // ruck they sit a couple of metres deeper, ready to run onto the pass.
    const lead = carrier ? clamp(carrier.vx * dAtt, 0, 9) * 0.9 : 0;
    // At the base the line starts 2m deep and moves up ~3.5 m/s towards the gain line, so the
    // backs are already running when the scrum-half's pass arrives.
    const baseRun = eng.atBaseT >= 0 ? -3 : 0; // hold the shape, deep, until the 9 plays it
    const t = eng.attackSlotTarget(p, fx + dAtt * (lead + baseRun), fz, att);
    p.tx = t.x;
    p.tz = t.z;
    p.urgency = 0.95;
  }

  // ----- defence
  const defenders = eng.teams[def].filter((p) => p.state === 'free' && !(p === eng.controlled && eng.isUserDriving(p)));
  if (airborne && land) {
    // Chase the kick: two nearest from each side go to the landing spot.
    for (const side of [0, 1] as Side[]) {
      const team = eng.teams[side].filter((p) => p.state === 'free' && !(p === eng.controlled && eng.isUserDriving(p)));
      team.sort((p, q) => dist(p.x, p.z, land!.x, land!.z) - dist(q.x, q.z, land!.x, land!.z));
      team.forEach((p, i) => {
        if (i < 2) {
          p.tx = b.state === 'ground' ? b.x : land!.x;
          p.tz = b.state === 'ground' ? b.z : land!.z;
          p.urgency = 1;
        } else {
          const kickSide = b.lastSide;
          const d = dirOf(kickSide);
          p.tx = side === kickSide ? land!.x - d * 12 : land!.x - d * 6;
          p.tz = clamp(land!.z + (i - 7) * 4.5, -32, 32);
          p.urgency = side === kickSide ? 0.85 : 0.6;
        }
      });
    }
    return;
  }

  const attackers = eng.teams[att].filter((p) => p.state !== 'off' && p.state !== 'down' && p.state !== 'bound').sort((p, q) => p.z - q.z);
  // Chasers: up to two closest defenders hunt the carrier.
  const hunt = carrier ?? (b.pass ? b.pass.target : null);
  const sorted = [...defenders].sort((p, q) => dist(p.x, p.z, fx, fz) - dist(q.x, q.z, fx, fz));
  const chasers = new Set(eng.atBaseT >= 0 ? [] : sorted.slice(0, eng.phase === 'kickoff' ? 2 : 1));
  const fb = defenders.find((p) => p.num === 15);
  const lineDef = defenders.filter((p) => !chasers.has(p) && p !== fb).sort((p, q) => p.z - q.z);
  // Line speed: blitz rushes up, drift sits off and slides; harder CPUs get up quicker.
  const ds = eng.tac[def].defence;
  const lineGap = ds === 'blitz' ? 3.2 : ds === 'drift' ? 6 : 5;
  const lineX = fx + dAtt * (eng.atBaseT >= 0 ? 3.4 : lineGap);
  const lineUrg = (ds === 'blitz' ? 0.95 : ds === 'drift' ? 0.72 : 0.8) * eng.customTac(def).lineSpeed + (def === 1 ? CFG.difficulty.cpuLineSpeed[eng.cfg.difficulty] : 0);
  const drift = ds === 'drift' ? 0.5 : ds === 'blitz' ? 0.2 : 0.35;
  // Even lanes centred on the ball, nudged towards the attacker in each lane.
  const n = lineDef.length;
  const spacing = Math.min(6.2, 62 / Math.max(1, n));
  let centre = fz;
  const half = ((n - 1) / 2) * spacing;
  centre = clamp(centre, -33 + half, 33 - half);
  lineDef.forEach((p, i) => {
    const even = centre + (i - (n - 1) / 2) * spacing;
    const idx = n > 1 ? Math.round((i * (attackers.length - 1)) / (n - 1)) : 0;
    const a = attackers[idx];
    const lane = a ? a.z * drift + even * (1 - drift) : even;
    const wing = p.num === 11 || p.num === 14;
    // Wingers sit back a little to cover the kick unless blitzing.
    p.tx = lineX + dAtt * (wing ? (ds === 'blitz' ? 1.5 : 4) : 0);
    p.tz = clamp(lane, -33, 33);
    p.urgency = clamp(lineUrg, 0.5, 1);
  });
  if (fb && !chasers.has(fb)) {
    fb.tx = clamp(fx + dAtt * 20, -FIELD.tryX + 2, FIELD.tryX - 2);
    fb.tz = fz * 0.6;
    fb.urgency = 0.7;
  }
  for (const p of chasers) {
    if (hunt) {
      p.tx = hunt.x + hunt.vx * 0.35;
      p.tz = hunt.z + hunt.vz * 0.35;
    } else {
      p.tx = fx;
      p.tz = fz;
    }
    p.urgency = 1;
  }

  // Holding TACKLE: the controlled defender tackles automatically once in range.
  const uc = eng.controlled;
  if (carrier && eng.phase === 'play' && eng.atBaseT < 0 && uc && eng.input.tackleHold && uc.side !== carrier.side && uc.state === 'free' && uc.tackleCD <= 0) {
    const reach = CFG.tackle.userHold[eng.cfg.difficulty];
    if (dist(uc.x, uc.z, carrier.x, carrier.z) <= reach) eng.attemptTackle(uc, carrier, false);
  }
  // CPU tackles (the user's controlled defender only tackles when the button is pressed)
  // The ball at the base of a ruck is still part of it: nobody may tackle the 9 until he plays it.
  if (carrier && eng.phase === 'play' && eng.atBaseT < 0) {
    for (const p of eng.teams[def]) {
      if (p.state !== 'free' || p.tackleCD > 0 || p === eng.controlled) continue;
      const d = dist(p.x, p.z, carrier.x, carrier.z);
      // Only tackle from in front or the side, not by catching up from behind on a sprinter.
      const fromBehind = (carrier.x - p.x) * dirOf(carrier.side) > 0.4 && Math.hypot(carrier.vx, carrier.vz) > 5;
      if (d < CFG.tackle.cpu && !fromBehind) {
        eng.attemptTackle(p, carrier, false);
        if (eng.ball.carrier !== carrier) break;
      }
    }
  }
  // Loose ball pickup handled in physics. Mark dt as used.
  void dt;
}

export function cpuCarrier(eng: MatchEngine, dt: number, c: P) {
  const d = dirOf(c.side);
  const opp = eng.teams[other(c.side)];
  // steering: forward plus avoidance of defenders in front
  let steerZ = 0;
  let nearest = 99;
  let nearestP: P | null = null;
  for (const o of opp) {
    if (o.state !== 'free') continue;
    const ahead = (o.x - c.x) * d;
    const dd = dist(o.x, o.z, c.x, c.z);
    if (ahead > -1 && dd < 8) {
      steerZ -= Math.sign(o.z - c.z || 0.01) * (8 - dd) * 0.4;
      if (dd < nearest) {
        nearest = dd;
        nearestP = o;
      }
    }
  }
  if (Math.abs(c.z) > 28) steerZ -= Math.sign(c.z) * 3;
  // Target mismatches: run at the slowest defender in front (a prop on a winger).
  if (c.side === 1 && c.num >= 9) {
    let weak: P | null = null;
    for (const o of opp) {
      if (o.state !== 'free') continue;
      const ahead = (o.x - c.x) * d;
      if (ahead > 0 && ahead < 12 && Math.abs(o.z - c.z) < 10 && (!weak || o.r.pace < weak.r.pace)) weak = o;
    }
    if (weak && weak.r.pace < c.r.pace - 15) steerZ += Math.sign(weak.z - c.z || 1) * 1.6;
  }
  const atBase = eng.atBaseT >= 0 && eng.ball.carrier === c;
  c.tx = atBase ? c.x : c.x + d * 10;
  c.tz = atBase ? c.z : clamp(c.z + steerZ, -33, 33);
  c.urgency = atBase ? 0.1 : 1;

  eng.aiDecisionT -= dt;
  if (atBase) {
    eng.atBaseT += dt;
    // The CPU scrum-half waits for its line to set before passing.
    if (c.side === 1 && eng.atBaseT > 1.4 && (eng.attackSpread(1) < 3 || eng.atBaseT > 3.2)) {
      eng.atBaseT = -1;
      const toLine = FIELD.tryX - c.x * d;
      const ownHalf = c.x * d < 0;
      const kickK = { low: 0.5, balanced: 1, territory: 1.8 }[eng.tac[1].kicking];
      if (toLine < 6 && rand.chance(0.45)) eng.pickAndGo(c);
      else if (ownHalf && rand.chance(0.16 * kickK)) {
        eng.kickTo(c, rand.range(20, 30), rand.range(-0.25, 0.25), 'box');
        eng.say('Box kick', 'info');
      } else if (!eng.nearestOpponent(c, 4.5) && rand.chance(0.12)) {
        c.vx = d * 4; // snipe round the fringe
      } else eng.doPass(c, rand.chance(0.2), 0, true);
    }
    return;
  }
  if (c.side === 0) return; // user team support carrier is never AI driven beyond running
  if (eng.aiDecisionT > 0) return;
  eng.aiDecisionT = 0.45;
  // tactical kick from deep
  const ownDist = FIELD.tryX + c.x * d;
  const kickK = { low: 0.45, balanced: 1, territory: 1.7 }[eng.tac[c.side].kicking];
  if ((c.num === 10 || c.num === 15 || c.num === 9) && ownDist < 32 * (kickK > 1 ? 1.4 : 1) && nearest < 9 && rand.chance(0.35 * kickK)) {
    eng.kickTo(c, rand.range(32, 48), rand.range(-0.45, 0.45), 'punt');
    return;
  }
  if (nearest < 3 && nearestP) {
    const r = rand.next();
    if (r < 0.5 * (c.r.passing / 80)) {
      if (eng.doPass(c, rand.chance(0.3), 0)) return;
    }
    if (r < 0.7 && c.sidestepT <= 0 && rand.chance(c.r.pace / 160)) {
      c.sidestepT = 0.35;
      c.sideDir = Math.sign(c.z - nearestP.z) || 1;
      c.fx = c.sideDir * Math.cos(c.heading) > 0 ? 'sidestepR' : 'sidestepL';
    } else if (c.handoffT <= 0 && rand.chance(c.r.strength / 200)) {
      c.handoffT = 0.6;
      c.fx = 'handoff';
      if (nearest < 2) eng.tryFend(c, nearestP);
    }
  }
}

export function nearestOpponent(eng: MatchEngine, p: P, within: number): P | null {
  let best: P | null = null;
  let bd = within;
  for (const o of eng.teams[other(p.side)]) {
    if (o.state !== 'free') continue;
    const d = dist(o.x, o.z, p.x, p.z);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}
