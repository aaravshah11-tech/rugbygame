/** Set pieces and breakdowns: kick-off line-ups, rucks, mauls, scrums, lineouts, place kicks and set plays. */
import type { MatchEngine } from '../engine';
import * as THREE from 'three';
import { audio } from '../../util/audio';
import { haptic } from '../../util/haptics';
import { clamp, rand } from '../../util/rng';
import { CFG } from '../gameConfig';
import { FIELD } from '../stadium';
import type { MiniGameKind, SetPlayId } from '../types';
import { G, dirOf, dist, line, other } from './shared';
import type { P, Side } from './shared';

/** ADD PLAYER at a ruck: bind the nearest free team-mate in. */
export function addToRuck(eng: MatchEngine) {
  const r = eng.ruck;
  if (!r) return;
  const mine = r.att === 0 ? r.addAtt : r.addDef;
  if (mine >= 2) return;
  const d = dirOf(r.att);
  const cand = eng.teams[0]
    .filter((p) => p.state === 'free' && p.num !== 9 && p !== eng.controlled)
    .sort((p, q) => dist(p.x, p.z, r.x, r.z) - dist(q.x, q.z, r.x, r.z))[0];
  if (!cand) return;
  cand.state = 'bound';
  cand.tx = r.x + (r.att === 0 ? -d : d) * (1.6 + mine * 0.6);
  cand.tz = r.z + (mine ? 0.5 : -0.5);
  cand.urgency = 1;
  if (r.att === 0) r.addAtt++;
  else r.addDef++;
  audio.thud(0.4);
  haptic('light');
}

/** How the ball is coming: quick (green), slow (amber) or turnover danger (red). */
export function ruckBall(_eng: MatchEngine, r: NonNullable<MatchEngine['ruck']>): 'quick' | 'slow' | 'danger' {
  const defBodies = r.addDef + (r.contest > 0.3 ? 1 : 0);
  if (defBodies > r.addAtt + 1 || r.contest > 0.55) return 'danger';
  const dur = r.dur - r.addAtt * 0.35 + r.addDef * 0.25 + r.contest * 0.6;
  return dur <= 1.35 ? 'quick' : 'slow';
}

/** The two meshes of the ruck arc (made once, hidden until the first ruck). */
export function ensureRuckArcs(eng: MatchEngine): { bg: THREE.Mesh; fg: THREE.Mesh } {
  const mk = (color: string, opacity: number, order: number) => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    m.renderOrder = order;
    m.visible = false;
    eng.scene.add(m);
    return m;
  };
  eng.ruckArcBg ??= mk('#13204a', 0.85, 3);
  eng.ruckArc ??= mk('#ffffff', 1, 4);
  return { bg: eng.ruckArcBg, fg: eng.ruckArc };
}

/** Arc under the ruck that fills as the ball becomes available. */
export function updateRuckArc(eng: MatchEngine, r: { x: number; z: number; att: Side; progress: number }) {
  const { bg, fg } = ensureRuckArcs(eng);
  const rr = eng.ruck;
  if (rr) {
    const col = { quick: '#7dff3a', slow: '#ffb020', danger: '#ff3d5e' }[eng.ruckBall(rr)];
    (fg.material as THREE.MeshBasicMaterial).color.set(col);
  }
  const build = (mesh: THREE.Mesh, frac: number, r0: number, r1: number) => {
    // smile-shaped arc on the camera side (-x) of the ruck
    const a0 = Math.PI - 0.95;
    const a1 = a0 + 1.9 * frac;
    const segs = 24;
    const pos: number[] = [];
    for (let i = 0; i < segs; i++) {
      const t0 = a0 + ((a1 - a0) * i) / segs;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / segs;
      const p = (a: number, rad: number) => [r.x + Math.cos(a) * rad, 0.06, r.z + Math.sin(a) * rad];
      pos.push(...p(t0, r0), ...p(t0, r1), ...p(t1, r1), ...p(t0, r0), ...p(t1, r1), ...p(t1, r0));
    }
    mesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mesh.geometry = g;
    mesh.visible = true;
  };
  build(bg, 1, 2.6, 3.0);
  build(fg, r.progress, 2.65, 2.95);
}

// ---------------------------------------------------------------- restarts
export function resetStates(eng: MatchEngine) {
  for (const p of eng.players) {
    if (p.state !== 'off') p.state = 'free';
    p.timer = 0;
    p.diveT = 0;
    p.celebrateT = 0;
    p.vx = p.vz = 0;
  }
  eng.ruck = null;
  eng.maul = null;
  eng.setPlay = null;
  eng.atBaseT = -1;
  eng.offsideLine.visible = false;
  eng.lineBreakFrom = null;
}

export function place(_eng: MatchEngine, p: P, x: number, z: number) {
  p.x = p.tx = p.gx = x;
  p.z = p.tz = p.gz = z;
  p.vx = p.vz = 0;
  p.heading = p.side === 0 ? 0 : Math.PI;
  p.face = p.heading;
}

export function setupKickoff(eng: MatchEngine, kickSide: Side, atX: number) {
  eng.resetStates();
  eng.camMode = 'game';
  const dk = dirOf(kickSide);
  const recv = other(kickSide);
  const kicker = eng.teams[kickSide][9];
  eng.teams[kickSide].forEach((p, i) => {
    if (p === kicker) eng.place(p, atX - dk * 3, 0);
    else eng.place(p, atX - dk * (1 + (i % 2)), -30 + (i * 60) / 14);
  });
  const recvForwards = eng.teams[recv].slice(0, 8);
  const recvBacks = eng.teams[recv].slice(8);
  recvForwards.forEach((p, i) => eng.place(p, atX + dk * (13 + (i % 3) * 3), -20 + i * 6));
  recvBacks.forEach((p, i) => eng.place(p, atX + dk * (24 + (i % 3) * 7), -28 + i * 8));
  const b = eng.ball;
  b.state = 'held';
  b.carrier = kicker;
  b.lastSide = kickSide;
  eng.phase = 'dead';
  eng.controlled = null;
  eng.autoControl();
  if (!eng.cfg.drill) {
    eng.camMode = 'kickoff';
    eng.camFocus = kicker;
    eng.camModeT = 0;
  }
  const kick = (target: { x: number; z: number }, T: number) => {
    eng.whistle();
    eng.after(0.6, () => {
      void T;
      // Solve for a high kick landing at the target.
      b.carrier = null;
      b.state = 'air';
      b.x = kicker.x + dk * 0.5;
      b.z = kicker.z;
      b.y = 0.5;
      b.vx = (target.x - b.x) / T;
      b.vz = (target.z - b.z) / T;
      b.vy = (1.2 - 0.5 + 0.5 * G * T * T) / T;
      b.kicker = kicker;
      b.kickFromX = kicker.x;
      b.bounced = false;
      b.wind = false;
      b.grubber = false;
      b.goalCheck = null;
      kicker.kickT = 0.4;
      kicker.fx = 'kick';
      eng.camMode = 'game';
      for (const pl of eng.players) pl.catchCD = kickSide === pl.side ? 0.8 : 0;
      audio.kick();
      eng.phase = 'kickoff';
      eng.phaseT = 0;
    });
  };
  const T = 3;
  if (kickSide === 0 && !eng.cfg.drill) {
    // Your restart: drag to where you want it to land (short to contest, long to pin them back).
    eng.after(0.8, () => {
      eng.kickoffAim = { kicker, atX, kick, side: kickSide };
      eng.camMode = 'game';
      // nobody aims it: kick it 12m to the open side
      const mine = eng.kickoffAim;
      eng.after(CFG.prompts.kickoffAim, () => {
        if (eng.kickoffAim === mine) {
          eng.kickTarget = null;
          eng.kickoffKick();
        }
      });
      eng.say(atX === 0 ? 'Kick-off' : '22 drop-out', 'info', 'Drag to where you want it to land');
      eng.emit({ type: 'hud', hud: eng.hud() });
    });
  } else {
    eng.after(1.2, () => kick({ x: atX + dk * rand.range(14, 22), z: rand.range(-18, 18) }, T));
  }
}

export function nineOf(eng: MatchEngine, side: Side, nx: number, nz: number): P {
  const nine = eng.teams[side][8];
  if (nine.state === 'free') return nine;
  const free = eng.teams[side].filter((p) => p.state === 'free');
  free.sort((a, b) => dist(a.x, a.z, nx, nz) - dist(b.x, b.z, nx, nz));
  return free[0] ?? nine;
}

/** A forward from the pod picks up from the base and drives. */
export function pickAndGo(eng: MatchEngine, nine: P) {
  const d = dirOf(nine.side);
  const fwd = eng.teams[nine.side]
    .filter((p) => p.num <= 8 && p.state === 'free')
    .sort((p, q) => dist(p.x, p.z, nine.x, nine.z) - dist(q.x, q.z, nine.x, nine.z))[0];
  eng.atBaseT = -1;
  if (!fwd || dist(fwd.x, fwd.z, nine.x, nine.z) > 7) {
    eng.doPass(nine, false, 0, true);
    return;
  }
  eng.place(fwd, nine.x + d * 0.6, nine.z + 0.4);
  fwd.vx = d * 3.5;
  eng.giveBall(fwd);
  if (nine.side === 0) {
    eng.controlled = fwd;
    eng.nameFor = null;
  }
  eng.say('Pick and go', 'info', fwd.name);
}

export function releaseRuck(eng: MatchEngine) {
  let n = 0;
  for (const p of eng.players) if (p.state === 'bound') {
    p.state = 'free';
    p.urgency = 0.7 + (n++ % 3) * 0.1; // peel off at slightly different speeds
  }
  if (n) eng.assignSlots();
}

/** Puts the ball in the scrum-half's hands at the base and restarts open play. */
export function ballToNine(eng: MatchEngine, side: Side, x: number, z: number) {
  const d = dirOf(side);
  const nx = x - d * 2.1;
  const nine = eng.nineOf(side, nx, z);
  nine.state = 'free';
  if (dist(nine.x, nine.z, nx, z) > 2.5) eng.place(nine, nx, z);
  else {
    // already there: settle onto the spot without a jump
    nine.tx = nine.gx = nx;
    nine.tz = nine.gz = z;
  }
  nine.heading = d > 0 ? 0 : Math.PI; // crouched behind the ruck, facing it
  nine.vx = nine.vz = 0;
  eng.giveBall(nine);
  eng.ball.lastSide = side;
  eng.atBaseT = 0;
  eng.useItCalled = false;
  eng.phase = 'play';
  eng.phaseT = 0;
  eng.assignSlots();
  // defenders retreat behind the offside line
  const od = dirOf(other(side));
  for (const p of eng.teams[other(side)]) {
    if ((p.x - x) * -od < 2 && p.state === 'free') {
      p.tx = p.gx = x + d * 2.5 + rand.range(0, 1.5);
      p.urgency = 1;
    }
  }
  if (side === 1 || eng.controlled?.side !== 0) {
    eng.controlled = null;
    eng.autoControl();
  }
  if (side === 0 && eng.pendingSetPlay) {
    const id = eng.pendingSetPlay;
    eng.pendingSetPlay = null;
    eng.atBaseT = -1;
    eng.startSetPlay(id);
  } else eng.pendingSetPlay = null;
}

// ---------------------------------------------------------------- ruck
export function startRuck(eng: MatchEngine, c: P, t: P) {
  const att = c.side;
  const d = dirOf(att);
  const x = c.x;
  const z = c.z;
  eng.phase = 'ruck';
  eng.phaseT = 0;
  eng.ruck = { x, z, att, t: 0, dur: 1.6, progress: 0, addAtt: 0, addDef: 0, contest: 0, fan: false, userDef: 'none' };
  eng.phaseCount++;
  const b = eng.ball;
  b.carrier = null;
  b.state = 'dead';
  b.x = x - d * 0.6;
  b.y = 0.12;
  b.z = z;
  // Two from each side join the ruck.
  const join = (side: Side, off: number, n = 2) => {
    const cands = eng.teams[side].filter((p) => p.state === 'free' && p !== eng.controlled && p.num !== 9).sort((p, q) => dist(p.x, p.z, x, z) - dist(q.x, q.z, x, z));
    cands.slice(0, n).forEach((p, i) => {
      p.state = 'bound';
      p.tx = x + off;
      p.tz = z + (i ? 0.5 : -0.5);
      p.urgency = 1;
    });
  };
  join(att, -d * 1.1, clamp(Math.round(eng.customTac(att).ruck), 1, 3));
  join(other(att), d * 1.1);
  void t;
  eng.offsideLine.visible = true;
  // User line is always the user's team hindmost foot.
  eng.offsideLine.position.x = att === 0 ? x - 1.6 : x + 1.6;
  eng.positionAroundBreakdown(x, z, att);
  // Hand control to someone useful: our 9 when attacking, the nearest standing defender otherwise.
  if (att === 0) {
    const nine = eng.teams[0][8];
    eng.controlled = nine.state === 'free' ? nine : eng.controlled;
  } else {
    const free = eng.teams[0].filter((p) => p.state === 'free').sort((p, q) => dist(p.x, p.z, x, z) - dist(q.x, q.z, x, z));
    if (free[0]) eng.controlled = free[0];
  }
  const uc = eng.controlled;
  if (att === 1 && uc && uc.state === 'free' && (uc.x - x) * d < -1 && Math.abs(uc.z - z) < 8) eng.say('Get back onside!', 'info', 'Stay behind the yellow line');
  // Attacking rucks resolve automatically; when defending you can swipe up to jackal.
}

/**
 * Clear rugby shape around a breakdown at (x, z).
 * Attack: 9 behind the ball, forward pods either side, backline staggered to the open side.
 * Defence: guards beside the ruck, an evenly spaced line on the offside line, fullback deep.
 * Returns how far (on average) players still are from their spots, so rucks can wait to settle.
 */
export function positionAroundBreakdown(eng: MatchEngine, x: number, z: number, att: Side): number {
  const d = dirOf(att);
  const open = Math.abs(z) < 4 ? 1 : -Math.sign(z); // towards the wider side of the pitch
  const cz = (v: number) => clamp(v, -32.5, 32.5);
  const spots = new Map<P, { x: number; z: number }>();
  const avail = (side: Side) => eng.teams[side].filter((p) => p.state === 'free' && !(p === eng.controlled && eng.isUserDriving(p)));

  // ----- attack
  const A = avail(att);
  const leftSign = att === 0 ? -1 : 1; // the left wing's side of the pitch for this team
  const openWing = open === leftSign ? 11 : 14;
  const blindWing = openWing === 11 ? 14 : 11;
  const backSpots: Record<number, [number, number]> = {
    9: [2.1, 0],
    10: [6, 8],
    12: [7.5, 14],
    13: [9, 20],
    [openWing]: [10, 27],
    15: [16, 11],
    [blindWing]: [9, -13],
  };
  const fwds = A.filter((p) => p.num <= 8).sort((p, q) => dist(p.x, p.z, x, z) - dist(q.x, q.z, x, z));
  fwds.forEach((p, i) => {
    // two pods of three either side of the ruck, any extra forwards trail behind
    const pod = i % 2 === 0 ? open : -open;
    const k = Math.floor(i / 2);
    if (k < 3) spots.set(p, { x: x - d * (3.2 + (k === 1 ? 1 : 0)), z: cz(z + pod * (3.5 + k * 1.7)) });
    else spots.set(p, { x: x - d * 7, z: cz(z + pod * (4 + (k - 3) * 2.6)) }); // trailing forwards spread out
  });
  for (const p of A) {
    if (p.num <= 8) continue;
    const sp = backSpots[p.num];
    if (sp) spots.set(p, { x: x - d * sp[0], z: cz(z + open * sp[1]) });
  }

  // ----- defence
  const D = avail(other(att));
  const fb = D.find((p) => p.num === 15);
  const rest = D.filter((p) => p !== fb).sort((p, q) => dist(p.x, p.z, x, z) - dist(q.x, q.z, x, z));
  const guards = rest.slice(0, eng.ruck?.fan ? 0 : 2); // fanning out: nobody guards the ruck
  guards.forEach((p, i) => spots.set(p, { x: x + d * 2.4, z: cz(z + (i ? 1.6 : -1.6)) }));
  const line = rest.slice(2).sort((p, q) => p.z - q.z);
  const n = line.length;
  const gap = 5.8;
  let centre = z + open * 4;
  centre = clamp(centre, -32 + ((n - 1) / 2) * gap, 32 - ((n - 1) / 2) * gap);
  line.forEach((p, i) => spots.set(p, { x: x + d * 3.4, z: cz(centre + (i - (n - 1) / 2) * gap) }));
  if (fb) spots.set(fb, { x: clamp(x + d * 22, -48, 48), z: cz(z * 0.4 + open * 6) });

  let total = 0;
  let count = 0;
  for (const [p, t] of spots) {
    p.tx = t.x;
    p.tz = t.z;
    p.urgency = p.num === 9 && p.side === att ? 1 : 0.9; // the scrum-half sprints to the base
    total += dist(p.x, p.z, t.x, t.z);
    count++;
  }
  return count ? total / count : 0;
}

export function updateRuck(eng: MatchEngine, dt: number) {
  const r = eng.ruck!;
  r.t += dt;
  // The ball-availability arc fills over the ruck; extra attackers speed it up.
  const dur = Math.max(0.9, r.dur - r.addAtt * 0.35 + r.addDef * 0.25 + r.contest * 0.6);
  r.progress = Math.min(1, r.progress + dt / dur);
  eng.updateRuckArc(r);
  const spread = eng.positionAroundBreakdown(r.x, r.z, r.att);
  const settled = spread < 2.5 || (r.progress >= 1 && r.t > dur + 1.5);
  // The ball stays in the ruck until the scrum-half gets there (a stand-in takes it if he's miles away).
  const nine = eng.teams[r.att][8];
  const base = { x: r.x - dirOf(r.att) * 2.1, z: r.z };
  const nineReady = nine.state !== 'free' || dist(nine.x, nine.z, base.x, base.z) < 1.8 || r.t > dur + 3.5;
  r.nineWait = r.progress >= 1 && !nineReady;
  if (r.progress >= 1 && settled && nineReady) eng.resolveRuck();
}

export function resolveRuck(eng: MatchEngine) {
  const r = eng.ruck!;
  eng.ruck = null;
  eng.offsideLine.visible = false;
  if (eng.ruckArc) eng.ruckArc.visible = eng.ruckArcBg!.visible = false;
  const q = eng.activeMini && eng.activeMini.kind.match(/uck/i) ? eng.activeMini.q : null;
  eng.emit({ type: 'minigameCancel' });
  eng.activeMini = null;
  const att = r.att;
  const def = other(att);
  let pTurn = 0.06;
  if (def === 1) pTurn += CFG.difficulty.cpuRuckSteal[eng.cfg.difficulty];
  // ADD PLAYER: attackers secure the ball, defenders committing make a steal likelier
  if (att === 0) pTurn *= Math.pow(0.45, r.addAtt);
  else pTurn = Math.min(0.55, pTurn + r.addDef * 0.16);
  // Defending: contesting hard can steal it but risks a penalty; fanning out gives up the steal.
  if (att === 1) {
    if (r.fan) pTurn = 0;
    else if (r.contest > 0) {
      pTurn = Math.min(0.6, pTurn + r.contest * 0.32);
      if (rand.chance(r.contest * 0.22)) {
        eng.whistle();
        eng.say('Hands in the ruck!', 'bad', `Penalty ${eng.teamShort(1)}`);
        eng.stoppage(() => eng.awardPenalty(1, r.x, r.z));
        return;
      }
    }
  }
  if (att === 0 && q !== null) pTurn = q > 0.7 ? 0.01 : q < 0.3 ? pTurn + 0.12 : pTurn;
  if (att === 1 && q !== null) pTurn = q > 0.7 ? 0.38 : q < 0.3 ? 0.03 : pTurn;
  // penalties at the breakdown
  if (att === 1 && q !== null && q > 0.9 && rand.chance(0.35)) {
    eng.whistle();
    eng.say('Holding on!', 'good', `Penalty ${eng.teamShort(0)}`);
    eng.stoppage(() => eng.awardPenalty(0, r.x, r.z));
    return;
  }
  const cpuOff = CFG.difficulty.cpuRuckOffside[eng.cfg.difficulty];
  if (att === 0 && rand.chance(cpuOff * eng.strict()) && !eng.advantage) {
    // play on: the user has the advantage
    eng.advantage = { side: 0, x: r.x, z: r.z, startX: r.x, t: 0 };
    eng.pop('ADVANTAGE', 'good');
    eng.say('Offside — advantage', 'good', 'Play on');
  }
  if (att === 1 && eng.controlled && eng.controlled.state === 'free') {
    const c = eng.controlled;
    const wrongSide = (c.x - r.x) * dirOf(att) < -1.5;
    if (wrongSide && Math.abs(c.z - r.z) < 5 && Math.hypot(eng.input.moveX, eng.input.moveY) > 0.2 && rand.chance(0.6)) {
      eng.whistle();
      eng.say('Offside!', 'bad', `Penalty ${eng.teamShort(1)}`);
      eng.stoppage(() => eng.awardPenalty(1, r.x, r.z));
      return;
    }
  }
  const winner = rand.chance(pTurn) ? def : att;
  if (winner !== att) {
    eng.say(line('turnover'), winner === 0 ? 'good' : 'bad');
    eng.pop('TURNOVER!', winner === 0 ? 'good' : 'bad');
    eng.ms.turnovers[winner]++;
    haptic('tackle');
  }
  // Time up: the team in possession kicks it dead if it's not behind.
  if (eng.timeUp() && eng.score[winner] >= eng.score[other(winner)]) {
    eng.endHalf();
    return;
  }
  // The ruck stays formed over the ball until the 9 plays it (see releaseRuck).
  eng.ballToNine(winner, r.x, r.z);
}

// ---------------------------------------------------------------- maul
export function startMaul(eng: MatchEngine, x: number, z: number, att: Side, carrier: P) {
  eng.phase = 'maul';
  eng.phaseT = 0;
  const cpuPush = CFG.difficulty.cpuMaulPush[eng.cfg.difficulty] + (eng.teamStrength(1) - 75) / 30;
  eng.maul = { x, z, att, t: 0, dur: 3.4, start: x, carrier, cpuPush, userPush: 0 };
  const b = eng.ball;
  b.carrier = carrier;
  b.state = 'held';
  b.lastSide = att;
  carrier.state = 'bound';
  eng.say('Maul!', 'info');
  eng.requestMini(att === 0 ? 'maul' : 'maulDefend', false, 3);
  eng.bindMaul();
}

export function teamStrength(eng: MatchEngine, side: Side) {
  const f = eng.teams[side].slice(0, 8);
  return f.reduce((s, p) => s + p.r.strength, 0) / f.length;
}

export function bindMaul(eng: MatchEngine) {
  const m = eng.maul!;
  const d = dirOf(m.att);
  const pick = (side: Side, n: number) =>
    eng.teams[side]
      .filter((p) => p.state === 'free' && p !== m.carrier)
      .sort((p, q) => dist(p.x, p.z, m.x, m.z) - dist(q.x, q.z, m.x, m.z))
      .slice(0, n);
  pick(m.att, 3).forEach((p) => (p.state = 'bound'));
  pick(other(m.att), 3).forEach((p) => (p.state = 'bound'));
  void d;
}

export function updateMaul(eng: MatchEngine, dt: number) {
  const m = eng.maul!;
  m.t += dt;
  const d = dirOf(m.att);
  // user taps push their way; CPU pushes with a steady force
  m.userPush *= Math.max(0, 1 - dt * 2.2);
  const user = m.userPush;
  const cpu = m.cpuPush * (0.8 + Math.sin(m.t * 3) * 0.2);
  const strDiff = (eng.teamStrength(m.att) - eng.teamStrength(other(m.att))) / 30;
  let v = (m.att === 0 ? user - cpu : cpu - user) * 0.6 + strDiff + (m.att === 0 ? 0.6 : 0.3);
  v = clamp(v, -2, 2.6);
  m.x += d * v * dt;
  // arrange bound players around the maul
  let ia = 0;
  let idf = 0;
  for (const p of eng.players) {
    if (p.state !== 'bound') continue;
    if (p === m.carrier) {
      p.tx = m.x;
      p.tz = m.z;
    } else if (p.side === m.att) {
      p.tx = m.x - d * (0.7 + (ia >> 1) * 0.6);
      p.tz = m.z + (ia % 2 ? 0.5 : -0.5);
      ia++;
    } else {
      p.tx = m.x + d * (0.7 + (idf >> 1) * 0.6);
      p.tz = m.z + (idf % 2 ? 0.5 : -0.5);
      idf++;
    }
    p.urgency = 1;
    p.x += (p.tx - p.x) * Math.min(1, dt * 6);
    p.z += (p.tz - p.z) * Math.min(1, dt * 6);
  }
  eng.positionAroundBreakdown(m.x, m.z, m.att);
  if (m.x * d >= FIELD.tryX) {
    eng.maul = null;
    for (const p of eng.players) if (p.state === 'bound') p.state = 'free';
    eng.say('Driven over!', 'info');
    eng.scoreTry(m.carrier);
    return;
  }
  if (m.t >= m.dur) {
    eng.maul = null;
    eng.emit({ type: 'minigameCancel' });
    eng.activeMini = null;
    const gain = (m.x - m.start) * d;
    for (const p of eng.players) if (p.state === 'bound') {
      p.state = 'down';
      p.timer = 0.4;
    }
    if (gain < -2.5 && rand.chance(0.5)) {
      eng.whistle();
      eng.say('Maul held up', m.att === 0 ? 'bad' : 'good', `Scrum ${eng.teamShort(other(m.att))}`);
      eng.stoppage(() => eng.setupScrum(m.x, m.z, other(m.att)));
      return;
    }
    if (gain > 3) eng.say(`Maul drives ${Math.round(gain)}m!`, m.att === 0 ? 'good' : 'bad');
    if (eng.timeUp() && eng.score[m.att] >= eng.score[other(m.att)]) {
      eng.endHalf();
      return;
    }
    eng.ballToNine(m.att, m.x, m.z);
  }
}

// ---------------------------------------------------------------- mini-games
export function requestMini(eng: MatchEngine, kind: MiniGameKind, blocking: boolean, duration: number, after?: (q: number) => void) {
  const id = ++eng.miniId;
  eng.activeMini = { id, kind, q: null, taps: 0, done: false };
  if (blocking) {
    eng.waitingBlocking = true;
    eng.blockedFor = 0;
  }
  const resolve = (q: number) => {
    const am = eng.activeMini;
    if (!am || am.id !== id || am.done) return;
    am.q = q;
    am.done = true;
    if (blocking) eng.waitingBlocking = false;
    after?.(q);
  };
  if (blocking) eng.blockingResolve = resolve;
  eng.emit({
    type: 'minigame',
    req: {
      id,
      kind,
      blocking,
      duration,
      resolve,
      onTap: () => {
        if (eng.maul) eng.maul.userPush += 0.8;
      },
    },
  });
}

// ---------------------------------------------------------------- scrum
export function setupScrum(eng: MatchEngine, x: number, z: number, feed: Side) {
  eng.resetStates();
  const mx = clamp(x, -44, 44);
  const mz = clamp(z, -29, 29);
  eng.phase = 'scrum';
  eng.camMode = 'setpiece';
  const ball = eng.ball;
  ball.state = 'dead';
  ball.carrier = null;
  ball.x = mx;
  ball.z = mz + 0.8;
  ball.y = 0.3;
  for (const side of [0, 1] as Side[]) {
    const d = dirOf(side);
    const t = eng.teams[side];
    const pack: [number, number][] = [
      [-0.7, -0.6], [-0.7, 0], [-0.7, 0.6], [-1.8, -0.3], [-1.8, 0.3], [-1.9, -1.0], [-1.9, 1.0], [-2.9, 0],
    ];
    pack.forEach(([ox, oz], i) => {
      eng.place(t[i], mx + d * ox, mz + oz);
      t[i].state = 'bound';
      t[i].heading = t[i].face = d > 0 ? 0 : Math.PI; // packs face each other
    });
    eng.place(t[8], mx - d * (side === feed ? 0.3 : 0.8), mz + (side === feed ? 1.5 : 1.2));
    const open = mz < 0 ? 1 : -1;
    [9, 11, 12, 13, 10].forEach((idx, k) => {
      const p = t[idx];
      const zz = clamp(mz + open * (6 + k * 6.5), -33, 33);
      eng.place(p, mx - d * (8 + k * 1.5), zz);
    });
    eng.place(t[14], mx - d * 22, mz * 0.3);
  }
  eng.controlled = eng.teams[0][8];
  ball.lastSide = feed;
  eng.say('Scrum', 'info', `${eng.teamShort(feed)} put-in`);
  if (eng.cfg.drill === 'setpieces') eng.emit({ type: 'drill', text: 'Scrum: swipe UP on SET when the marker is in the green', progress: `Set piece ${eng.drillStage + 1} / 4` });
  eng.after(0.8, () =>
    eng.requestMini(feed === 0 ? 'scrum' : 'scrumDefend', true, 0, (q) => eng.resolveScrum(feed, mx, mz, q)),
  );
}

export function resolveScrum(eng: MatchEngine, feed: Side, x: number, z: number, q: number) {
  audio.thud(0.8);
  haptic('tackle');
  if (eng.cfg.drill === 'setpieces') {
    const ok = q > 0.6;
    if (ok) eng.drillScore++;
    eng.say(ok ? 'Scrum won!' : 'Scrum wheeled', ok ? 'good' : 'bad');
    eng.after(1.6, () => eng.drillNext());
    return;
  }
  // A badly mistimed engage gives the penalty away straight off.
  if (q < 0.1 && rand.chance(0.5)) {
    eng.whistle();
    eng.say(feed === 0 ? 'Early engagement' : 'Collapsed scrum', 'bad', `Penalty ${eng.teamShort(1)}`);
    eng.stoppage(() => eng.awardPenalty(1, x, z));
    return;
  }
  // Push battle: the feeding side has a small edge, a good engage adds to the user's.
  const base = eng.players.filter((p) => p.state === 'bound').map((p) => ({ p, x: p.x, z: p.z }));
  const cpu = CFG.difficulty.cpuScrumPush[eng.cfg.difficulty] + (eng.teamStrength(1) - eng.teamStrength(0)) / 45;
  eng.scrum = {
    x, z, feed, bal: (q - 0.5) * 0.35, t: 0, dur: 4.2, user: 0, cpu, bias: feed === 0 ? 0.12 : -0.12,
    stage: 'push', chooseT: 0, winner: feed, base,
  };
  eng.say('Push!', 'info', 'Swipe up fast to drive');
  audio.thud(0.6);
}

export function updateScrum(eng: MatchEngine, dt: number) {
  const sc = eng.scrum!;
  const d0 = dirOf(0);
  if (sc.stage === 'push') {
    sc.t += dt;
    sc.user *= Math.max(0, 1 - dt * 2.4);
    // CPU heaves in waves; the user has to keep swiping to match it.
    const cpu = sc.cpu * (0.85 + Math.sin(sc.t * 2.6) * 0.18);
    sc.bal = clamp(sc.bal + (sc.user - cpu + sc.bias) * 0.55 * dt, -1, 1);
    if (Math.random() < dt * 2.5) haptic('tackle');
    if (Math.abs(sc.bal) >= 1 || sc.t >= sc.dur) eng.endScrumPush();
  } else {
    sc.chooseT += dt;
    // No choice made: the 9 takes it at the base as normal.
    if (sc.chooseT > 3.2) eng.scrumPlay('hold');
  }
  // Both packs and the ball move with the shove.
  const off = sc.bal * 1.6 * d0;
  for (const b of sc.base) {
    const wob = Math.sin(eng.time * 9 + b.x * 3 + b.z * 5) * 0.03;
    b.p.tx = b.x + off;
    b.p.tz = b.z + wob;
    b.p.x += (b.p.tx - b.p.x) * Math.min(1, dt * 5);
    b.p.z += (b.p.tz - b.p.z) * Math.min(1, dt * 5);
    b.p.vx = b.p.vz = 0;
  }
  eng.ball.x = sc.x + off - dirOf(sc.winner) * (sc.stage === 'choose' ? 1.6 : 0);
  eng.ball.z = sc.z + (sc.stage === 'choose' ? 0 : 0.8);
  eng.ball.y = 0.15;
}

export function endScrumPush(eng: MatchEngine) {
  const sc = eng.scrum!;
  // The feeding side keeps it unless they are clearly beaten in the shove.
  const towardsFeeder = sc.feed === 0 ? sc.bal : -sc.bal;
  const winner: Side = towardsFeeder < -0.5 ? other(sc.feed) : sc.feed;
  // Driving them all the way back wins a penalty most of the time.
  if (Math.abs(sc.bal) >= 1 && rand.chance(0.6)) {
    const pen: Side = sc.bal > 0 ? 0 : 1;
    eng.whistle();
    eng.say(pen === 0 ? 'Scrum penalty!' : 'Scrum penalty against', pen === 0 ? 'good' : 'bad', `Penalty ${eng.teamShort(pen)}`);
    const { x, z } = sc;
    eng.scrum = null;
    eng.stoppage(() => eng.awardPenalty(pen, x, z));
    return;
  }
  sc.winner = winner;
  if (winner !== sc.feed) eng.say('Against the head!', winner === 0 ? 'good' : 'bad');
  else if (Math.abs(sc.bal) > 0.5) eng.say(winner === 0 ? 'Going forward!' : 'They are driving', winner === 0 ? 'good' : 'bad');
  audio.thud(0.9);
  if (winner === 0 && !eng.cfg.drill) {
    sc.stage = 'choose';
    sc.chooseT = 0;
    return;
  }
  eng.scrumPlay('hold');
}

/** Ball out of the scrum: 9 passes left/right, the 8 picks up, or the 9 waits at the base. */
export function scrumPlay(eng: MatchEngine, play: 'left' | 'right' | 'pick' | 'hold' | 'nine') {
  const sc = eng.scrum!;
  eng.scrum = null;
  const winner = sc.winner;
  const d = dirOf(winner);
  const bx = eng.ball.x;
  const bz = eng.ball.z;
  eng.camMode = 'game';
  const eight = eng.teams[winner][7];
  for (const p of eng.players) if (p.state === 'bound' && !(play === 'pick' && p === eight)) {
    p.state = 'down';
    p.timer = 0.45;
  }
  if (play === 'pick') {
    eight.state = 'free';
    eng.place(eight, bx - d * 0.4, bz);
    eight.heading = d > 0 ? 0 : Math.PI;
    eng.giveBall(eight);
    eng.ball.lastSide = winner;
    eng.phase = 'play';
    eng.phaseT = 0;
    eng.atBaseT = -1;
    eng.controlled = eight;
    eng.assignSlots();
    eng.say('No. 8 picks up', 'info');
    return;
  }
  eng.ballToNine(winner, bx + d * 0.6, bz);
  if (play === 'nine') {
    // scrum-half breaks round the blindside
    eng.atBaseT = -1;
    const nine = eng.ball.carrier;
    if (nine) {
      eng.controlled = nine;
      nine.vx = d * 3;
      eng.say('Scrum-half breaks!', 'info');
    }
    return;
  }
  if (play === 'left' || play === 'right') {
    const nine = eng.ball.carrier;
    if (nine) {
      eng.atBaseT = -1;
      eng.doPass(nine, false, play === 'left' ? -1 : 1);
    }
  }
}

// ---------------------------------------------------------------- lineout
export function setupLineout(eng: MatchEngine, x: number, touchSign: number, throwSide: Side) {
  eng.resetStates();
  const lx = clamp(x, -44, 44);
  const s = touchSign || 1;
  eng.phase = 'lineout';
  eng.camMode = 'setpiece';
  const ball = eng.ball;
  ball.state = 'dead';
  ball.carrier = null;
  for (const side of [0, 1] as Side[]) {
    const d = dirOf(side);
    const t = eng.teams[side];
    const jumpers = [0, 2, 3, 4, 5, 6, 7];
    jumpers.forEach((idx, k) => eng.place(t[idx], lx - d * 0.6, s * (30 - k * 1.4)));
    if (side === throwSide) eng.place(t[1], lx, s * 35.6);
    else eng.place(t[1], lx - d * 1.5, s * 32);
    eng.place(t[8], lx - d * 2, s * 19);
    [9, 11, 12, 13, 10].forEach((idx, k) => eng.place(t[idx], lx - d * (10 + k * 1.2), s * (16 - k * 7)));
    eng.place(t[14], lx - d * 25, 0);
  }
  ball.x = lx;
  ball.z = s * 35.6;
  ball.y = 1.3;
  eng.loGeo = { x: lx, s };
  // hooker ready to throw, ball above the head
  eng.teams[throwSide][1].heading = s > 0 ? -Math.PI / 2 : Math.PI / 2;
  eng.controlled = eng.teams[0][1];
  ball.lastSide = throwSide;
  eng.say('Lineout', 'info', `${eng.teamShort(throwSide)} throw`);
  if (eng.cfg.drill === 'setpieces') eng.emit({ type: 'drill', text: 'Lineout: pick a jumper, then swipe DOWN in the green to throw', progress: `Set piece ${eng.drillStage + 1} / 4` });
  eng.after(0.8, () =>
    eng.requestMini(throwSide === 0 ? 'lineout' : 'lineoutDefend', true, 0, (q) => eng.resolveLineout(throwSide, lx, s, q)),
  );
}

export function resolveLineout(eng: MatchEngine, throwSide: Side, x: number, s: number, q: number) {
  if (eng.cfg.drill === 'setpieces') {
    const ok = q > 0.6;
    if (ok) eng.drillScore++;
    eng.say(ok ? 'Clean take!' : 'Not straight', ok ? 'good' : 'bad');
    eng.after(1.6, () => eng.drillNext());
    return;
  }
  const pWin = throwSide === 0 ? 0.55 + 0.42 * q : 1 - (0.92 - 0.5 * q);
  const winner: Side = rand.chance(pWin) ? 0 : 1;
  if (winner !== throwSide) eng.say('Lineout stolen!', winner === 0 ? 'good' : 'bad');
  else if (throwSide === 0) eng.pop(q > 0.8 ? 'CLEAN TAKE!' : 'TAKEN', 'good');
  const jumper = eng.teams[winner][3];
  const rival = eng.teams[other(winner)][3];
  const d = dirOf(winner);
  const distToLine = FIELD.tryX - x * d;
  // the throw: ball flies from the hooker to the lifted jumper
  const hooker = eng.teams[throwSide][1];
  eng.loThrow = { t: 0, dur: 0.7, from: { x: hooker.x, z: hooker.z }, to: { x: jumper.x, z: jumper.z }, jumper, rival, wobble: q < 0.5 };
  hooker.fx = 'pass';
  eng.after(0.85, () => {
    eng.camMode = 'game';
    eng.loThrow = null;
    jumper.lift = 0;
    rival.lift = 0;
    // Your throw, your call: off the top, maul or peel.
    if (winner === 0 && throwSide === 0) {
      jumper.lift = 1.4;
      eng.openCall(
        'BALL WON AT THE TOP',
        [
          { id: 'top', label: 'PASS', sub: 'off the top to the 9' },
          { id: 'peel', label: 'RUN', sub: 'peel round the tail' },
          { id: 'maul', label: 'MAUL', sub: distToLine < 25 ? 'drive for the line' : 'set the drive' },
        ],
        distToLine < 22 ? 'maul' : 'top',
        3.5,
        (id) => {
          jumper.lift = 0;
          if (id === 'maul') {
            eng.resetStates();
            const carrier = eng.teams[0][1];
            eng.place(carrier, x, s * 26);
            eng.startMaul(x, s * 26, 0, carrier);
          } else if (id === 'peel') {
            eng.resetStates();
            const runner = eng.teams[0][6];
            eng.place(runner, x - d * 1.5, s * 25);
            runner.vx = d * 3;
            runner.vz = -s * 4;
            eng.giveBall(runner);
            eng.ball.lastSide = 0;
            eng.phase = 'play';
            eng.phaseT = 0;
            eng.atBaseT = -1;
            eng.controlled = runner;
            eng.assignSlots();
            eng.say('Peel!', 'info', `${runner.name} round the tail`);
          } else {
            eng.ballToNine(0, x - d * 1, s * 24);
            const nine = eng.ball.carrier;
            if (nine) {
              eng.atBaseT = -1;
              eng.doPass(nine, false, 0);
            }
          }
        },
      );
      return;
    }
    // Close to the line, the winners set up a driving maul.
    if (winner === throwSide && distToLine < 22 && rand.chance(0.55)) {
      eng.resetStates();
      const carrier = eng.teams[winner][1];
      eng.place(carrier, x, s * 26);
      eng.startMaul(x, s * 26, winner, carrier);
      return;
    }
    eng.ballToNine(winner, x - d * 1, s * 24);
  });
}

// ---------------------------------------------------------------- place kicks
export function setupPlaceKick(eng: MatchEngine, side: Side, kind: 'conversion' | 'penalty' | 'drill', x: number, z: number) {
  eng.resetStates();
  eng.phase = 'placekick';
  eng.camMode = 'placekick';
  eng.placeKind = kind;
  eng.placeSide = side;
  const d = dirOf(side);
  const kicker = [...eng.teams[side]].sort((a, b) => b.r.kicking - a.r.kicking)[0];
  eng.placeKicker = kicker;
  const b = eng.ball;
  b.state = 'dead';
  b.carrier = null;
  b.x = x;
  b.z = z;
  b.y = 0.2;
  eng.place(kicker, x - d * 3, z - 1.2);
  // everyone else behind the kicker / under the posts
  eng.teams[side].forEach((p, i) => p !== kicker && eng.place(p, x - d * (14 + (i % 3) * 2), clamp(z - 18 + i * 2.6, -33, 33)));
  eng.teams[other(side)].forEach((p, i) => eng.place(p, d * (FIELD.tryX + 2), -8 + i * 1.1));
  if (kind === 'drill') eng.teams[1].forEach((p) => (p.state = 'off'));
  eng.placeAim = 0;
  eng.placeT = eng.time;
  eng.chargeT = side === 1 && kind === 'conversion' ? 0 : -1;
  const goalDist = dist(x, z, d * FIELD.tryX, 0);
  if (side === 0) {
    const ang = Math.atan2(-z, d * FIELD.tryX - x);
    const fwd = { x: Math.cos(ang), z: Math.sin(ang) };
    const along = (eng.wind.x * fwd.x + eng.wind.z * fwd.z) * 3.6;
    // screen right (+z when looking +x) relative to the kick direction
    const cross = (eng.wind.x * -fwd.z + eng.wind.z * fwd.x) * 3.6;
    eng.after(0.4, () =>
      eng.emit({
        type: 'placekick',
        req: { kind, distance: goalDist, cross, along, windSpeed: Math.hypot(eng.wind.x, eng.wind.z) * 3.6, kicker: kicker.name },
      }),
    );
  } else {
    // CPU kicker
    const angleF = Math.abs(z) / Math.max(goalDist, 1);
    let p = 1.08 - goalDist / 58 - angleF * 0.3 + (kicker.r.kicking - 75) / 140;
    p += CFG.difficulty.cpuGoalKick[eng.cfg.difficulty];
    const success = rand.chance(clamp(p, 0.12, 0.95));
    const aimErr = success ? rand.range(-0.6, 0.6) : (rand.chance(0.5) ? -1 : 1) * rand.range(4, 9);
    // conversions: the kicker's run-up starts at 1.2s, the kick goes at 2.2s; you can charge in between
    eng.after(kind === 'conversion' ? 3.8 : 1.6, () => eng.shootPlaceKick(aimErr, 0.62, 0));
  }
}

/** Conversions: move the ball back along the line it was grounded on (wider angle, longer kick). Returns metres out. */
export function movePlaceKick(eng: MatchEngine, dm: number): number {
  const b = eng.ball;
  if (eng.phase !== 'placekick' || eng.placeKind !== 'conversion' || b.state !== 'dead') return 0;
  const d = dirOf(eng.placeSide);
  const out = clamp(FIELD.tryX - b.x * d + dm, 5, 35);
  b.x = d * (FIELD.tryX - out);
  if (eng.placeKicker) eng.place(eng.placeKicker, b.x - d * 3, b.z - 1.2);
  return dist(b.x, b.z, d * FIELD.tryX, 0);
}

/** User drags to aim (degrees relative to the posts). */
export function setPlaceAim(eng: MatchEngine, deg: number) {
  eng.placeAim = deg;
}

/** Swing meter result: power 0..1 (≈0.55 is ideal), accuracy -1..1 (0 = perfect). */
export function shootPlaceKick(eng: MatchEngine, aimDeg: number, power: number, accuracy: number, curl = 0) {
  if (eng.phase !== 'placekick') return;
  // curl: -1..1 from the swipe; + bends right on screen
  eng.kickCurl = curl * 2.2 * (eng.placeSide === 0 ? 1 : -1);
  const side = eng.placeSide;
  const d = dirOf(side);
  const kicker = eng.placeKicker!;
  const b = eng.ball;
  const toPost = Math.atan2(-b.z, d * FIELD.tryX - b.x);
  const skill = 1.25 - kicker.r.kicking / 100;
  const D0 = dist(b.x, b.z, d * FIELD.tryX, 0);
  // Real kicks miss: error grows with distance, worse kickers and an overcooked strike.
  const diffK = side === 0 ? CFG.difficulty.userGoalKickError[eng.cfg.difficulty] : 1;
  let err = accuracy * 12 * skill + (Math.random() - 0.5) * 2 * skill * (1.4 + D0 / 14) * 2.4 * diffK;
  if (power > 0.66) err += (Math.random() < 0.5 ? -1 : 1) * (power - 0.66) * 30; // too much welly sprays it
  // Charged down?
  if (eng.placeKind === 'conversion') {
    const chargers = eng.teams[other(side)].filter((p) => p.state === 'free' && dist(p.x, p.z, b.x, b.z) < 7.5);
    const near = chargers.length ? Math.min(...chargers.map((p) => dist(p.x, p.z, b.x, b.z))) : 99;
    let pCharge = clamp((7.5 - near) / 6, 0, side === 1 ? 0.5 : 0.75);
    // you took too long over yours: they charge
    if (side === 0 && eng.time - eng.placeT > 7) pCharge = Math.max(pCharge, 0.3);
    if (rand.chance(pCharge)) {
      kicker.fx = 'kick';
      audio.thud(0.8);
      eng.pop('CHARGED DOWN!', side === 0 ? 'bad' : 'good');
      eng.say('Charged down!', side === 0 ? 'bad' : 'good');
      eng.chargeT = -1;
      eng.after(1.2, () => eng.goalResult(side, 'conversion', false));
      b.state = 'dead';
      return;
    }
  }
  // aimDeg is screen-relative: + = right. For side 0 (looking +x) right = +z = +angle.
  const ang = toPost + ((aimDeg + err) * Math.PI) / 180 * (side === 0 ? 1 : -1);
  const D = dist(b.x, b.z, d * FIELD.tryX, 0);
  const elev = (36 * Math.PI) / 180;
  const h = 5.5;
  const vReq = Math.sqrt((G * D * D) / (2 * Math.cos(elev) ** 2 * Math.max(0.5, D * Math.tan(elev) - h)));
  const v = vReq * (0.8 + power * 0.36); // needs a firm strike (power ~0.6+) to get there
  b.state = 'air';
  b.grubber = false;
  b.vx = Math.cos(ang) * Math.cos(elev) * v;
  b.vz = Math.sin(ang) * Math.cos(elev) * v;
  b.vy = Math.sin(elev) * v;
  b.y = 0.2;
  b.wind = true;
  b.bounced = false;
  b.kicker = kicker;
  b.goalCheck = { side, kind: eng.placeKind === 'drill' ? 'drill' : eng.placeKind };
  kicker.kickT = 0.5;
  kicker.fx = 'kick';
  audio.kick();
  eng.arc.visible = false;
  // Safety: if the ball never reaches the posts (short), resolve as a miss.
  const myKick = b.goalCheck;
  eng.after(4.6, () => (eng.kickCurl = 0));
  eng.after(4.5, () => {
    if (eng.ball.goalCheck === myKick && myKick) {
      eng.ball.goalCheck = null;
      eng.goalResult(myKick.side, myKick.kind, false);
    }
  });
}

// ---------------------------------------------------------------- set plays
export function startSetPlay(eng: MatchEngine, id: SetPlayId) {
  const c = eng.ball.carrier!;
  const d = dirOf(0);
  const open = c.z < 0 ? 1 : -1;
  const t = eng.teams[0];
  const free = (p: P) => p.state === 'free' && p !== c;
  const routes = new Map<P, () => { x: number; z: number }>();
  let targets: P[] = [];
  const n = (num: number) => t[num - 1];
  audio.click();
  if (id.startsWith('custom:')) {
    const play = (eng.cfg.customPlays ?? []).find((p) => `custom:${p.id}` === id);
    if (!play) return;
    // each step: a runner and the line he runs, relative to whoever has the ball at that moment
    const cur = () => eng.ball.carrier ?? c;
    // drawn runs: everyone goes to his spot, measured from the breakdown (just ahead of the 9)
    if (play.runs && play.runs.length) {
      const ox = c.x + d * 2.1;
      const oz = c.z;
      for (const r of play.runs) {
        const pl = n(r.num);
        if (!pl || pl === c || pl.state === 'off') continue;
        const tx = clamp(ox + d * r.dx, -FIELD.tryX - 5, FIELD.tryX + 5);
        const tz = clamp(oz + open * r.dz, -33, 33);
        routes.set(pl, () => ({ x: tx, z: tz }));
      }
      for (const st of play.steps) {
        const pl = n(st.num);
        if (pl && pl !== c && pl.state !== 'off') targets.push(pl);
      }
      eng.say(play.name, 'info', 'Your set play — follow the ! with your passes');
      eng.setPlay = { id, targets, routes, until: eng.time + 9 };
      return;
    }
    let prev: P = c;
    for (const step of play.steps) {
      const r = n(step.num);
      if (!r || r === c || r.state === 'off') continue;
      const before = prev;
      const route =
        step.line === 'crash' ? () => ({ x: cur().x + d * 2, z: clamp(cur().z + open * 3.5, -33, 33) })
        : step.line === 'switch' ? () => ({ x: cur().x + d * 1.5, z: clamp(cur().z - open * 2.5, -33, 33) })
        : step.line === 'loop' ? () => ({ x: before.x - d * 1.5, z: clamp(before.z + open * 4, -33, 33) })
        : step.line === 'wide' ? () => ({ x: cur().x + d * 0.5, z: clamp(cur().z + open * 14, -33, 33) })
        : () => ({ x: cur().x + d * 1, z: clamp(cur().z + open * 7, -33, 33) });
      routes.set(r, route);
      targets.push(r);
      prev = r;
    }
    eng.say(play.name, 'info', 'Your set play — follow the ! with your passes');
    eng.setPlay = { id, targets, routes, until: eng.time + 8 };
    return;
  }
  switch (id) {
    case 'crash': {
      const r = free(n(12)) ? n(12) : n(13);
      routes.set(r, () => ({ x: c.x + d * 2, z: c.z + open * 3.5 }));
      targets = [r];
      eng.say('Crash ball', 'info', `${r.name} on the hard line`);
      break;
    }
    case 'loop': {
      const first = free(n(12)) ? n(12) : n(13);
      const looper = c.num === 10 ? c : n(10);
      if (looper !== c) routes.set(looper, () => ({ x: first.x - d * 1.5, z: clamp(first.z + open * 4, -33, 33) }));
      routes.set(first, () => ({ x: c.x + d * 1, z: c.z + open * 5 }));
      targets = [first, looper];
      eng.say('Loop play', 'info', 'Pass, then pass back to the looper');
      break;
    }
    case 'miss': {
      const skip = free(n(13)) ? n(13) : n(15);
      const wing = open > 0 ? n(14) : n(11);
      routes.set(skip, () => ({ x: c.x + d * 0.5, z: clamp(c.z + open * 14, -33, 33) }));
      routes.set(wing, () => ({ x: c.x + d * 3, z: open * 31 }));
      targets = [skip, wing];
      eng.say('Miss pass wide', 'info', 'Skip to the outside');
      break;
    }
    case 'switch': {
      // Switch: the outside centre cuts back on an angle behind the carrier for an inside ball.
      const r = free(n(13)) ? n(13) : n(12);
      routes.set(r, () => ({ x: c.x + d * 1.5, z: clamp(c.z - open * 2.5, -33, 33) }));
      targets = [r];
      eng.say('Switch play', 'info', `${r.name} cuts back inside`);
      break;
    }
    case 'upandunder': {
      eng.say('Up and under!', 'info');
      eng.kickTo(c, 22, 0, 'box');
      const chasers = [n(11), n(14), n(15)];
      eng.setPlay = {
        id,
        targets: [],
        routes: new Map(chasers.map((p) => [p, () => eng.predictLanding()] as const)),
        until: eng.time + 4,
      };
      return;
    }
  }
  eng.setPlay = { id, targets, routes, until: eng.time + 7 };
}
