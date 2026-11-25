/** Laws and scoring: referee, penalties and advantage, tries, goals, stoppages and the clock. */
import type { MatchEngine } from '../engine';
import { audio } from '../../util/audio';
import { haptic } from '../../util/haptics';
import { clamp, rand } from '../../util/rng';
import { CFG } from '../gameConfig';
import { FIELD } from '../field';
import type { EngineResult, PenaltyChoice } from '../types';
import { dirOf, dist, other } from './shared';
import type { P, Side } from './shared';

export function timeUp(eng: MatchEngine) {
  return !eng.cfg.drill && eng.gameSec >= 2400;
}

export function possession(eng: MatchEngine): Side {
  return eng.ball.carrier ? eng.ball.carrier.side : eng.ball.lastSide;
}

/** penalty count multiplier by rules mode */
export function strict(eng: MatchEngine): number {
  return { arcade: 0.45, standard: 1, sim: 1.5 }[eng.cfg.rules];
}

export function tickReferee(eng: MatchEngine, dt: number) {
  const a = eng.advantage;
  if (a) {
    a.t += dt;
    const c = eng.ball.carrier;
    const gained = c && c.side === a.side ? (c.x - a.startX) * dirOf(a.side) : 0;
    if (gained >= 10 || eng.phase === 'placekick') {
      eng.advantage = null;
      eng.say('Advantage over', 'info');
    } else if (eng.possession() !== a.side || a.t > 5) {
      // nothing gained: back for the penalty
      eng.advantage = null;
      eng.whistle();
      eng.say('Back for the penalty', a.side === 0 ? 'good' : 'bad', `Penalty ${eng.teamShort(a.side)}`);
      const { x, z, side } = a;
      eng.stoppage(() => eng.awardPenalty(side, x, z));
    }
  }
  // sin bin: players return after 2 game minutes (120 of the 2400 game seconds in a half)
  const now = (eng.half - 1) * 2400 + eng.gameSec;
  for (const b of [...eng.binned]) {
    if (now >= b.until) {
      eng.binned = eng.binned.filter((x) => x !== b);
      b.p.state = 'free';
      eng.place(b.p, -dirOf(b.p.side) * 30, 0);
      eng.say('Back from the bin', 'info', b.p.name);
    }
  }
}

/** Repeated penalties earn a yellow card: a back from the offending team sits out 2 minutes. */
export function penaltyAgainst(eng: MatchEngine, off: Side) {
  eng.pens[off]++;
  eng.ms.pens[off]++;
  if (eng.cfg.rules === 'arcade' || eng.cfg.drill) return;
  const limit = eng.cfg.rules === 'sim' ? 3 : 4;
  if (eng.pens[off] >= limit && !eng.binned.some((b) => b.p.side === off)) {
    eng.pens[off] = 0;
    const cands = eng.teams[off].filter((p) => p.num >= 11 && p.state !== 'off');
    const p = cands[Math.floor(Math.random() * cands.length)];
    if (!p) return;
    p.state = 'off';
    if (eng.controlled === p) eng.controlled = null;
    const now = (eng.half - 1) * 2400 + eng.gameSec;
    eng.binned.push({ p, until: now + 120 });
    eng.pop('YELLOW CARD', off === 0 ? 'bad' : 'good');
    eng.say('Yellow card!', off === 0 ? 'bad' : 'good', `${p.name} — 2 minutes in the bin`);
  }
}

export function openCall(eng: MatchEngine, title: string, opts: { id: string; label: string; sub?: string }[], def: string, timeout: number, on: (id: string) => void) {
  eng.call = { title, opts, t: 0, timeout, def, on };
  eng.emit({ type: 'hud', hud: eng.hud() });
}

export function tickCall(eng: MatchEngine, dt: number) {
  const c = eng.call;
  if (!c) return;
  c.t += dt;
  if (c.t >= c.timeout) eng.resolveCall(c.def);
}

export function resolveCall(eng: MatchEngine, id: string) {
  const c = eng.call;
  if (!c || !c.opts.some((o) => o.id === id)) return;
  eng.call = null;
  audio.click();
  c.on(id);
  eng.emit({ type: 'hud', hud: eng.hud() });
}

// ---------------------------------------------------------------- scoring
export function scoreTry(eng: MatchEngine, c: P) {
  const side = c.side;
  eng.score[side] += 5;
  eng.tries[side]++;
  eng.ps(c).tries++;
  eng.stadium.event((side === 0) === eng.cfg.userIsHome ? 'tryHome' : 'tryAway');
  c.fx = 'dive';
  if (side === 0) eng.stats.tries++;
  eng.phase = 'dead';
  eng.ball.state = 'dead';
  c.state = 'free';
  c.vx = c.vz = 0;
  eng.whistle();
  audio.cheer(side === 0 ? 1.2 : 0.7);
  haptic('try');
  eng.emit({ type: 'try', scorer: c.name, team: eng.teamShort(side), userScored: side === 0 });
  eng.emit({ type: 'hud', hud: eng.hud() });
  eng.exciteBoost = 1;
  const kit = side === 0 ? eng.cfg.user.kit : eng.cfg.cpu.kit;
  eng.particles.confetti(c.x, c.z, [kit.primary, kit.secondary, '#ffffff', '#c6ff1a']);
  for (const m of eng.teams[side]) if (dist(m.x, m.z, c.x, c.z) < 18 && m.state !== 'off') {
    m.celebrateT = 3.2;
    m.tx = c.x;
    m.tz = c.z;
    m.urgency = 0.5;
  }
  eng.camMode = 'try';
  eng.camFocus = c;
  eng.camModeT = 0;
  const clip = eng.history.slice(-96);
  if (eng.cfg.drill) {
    eng.after(2, () => eng.drillNext());
    return;
  }
  const z = clamp(c.z, -30, 30);
  const conversion = () => eng.setupPlaceKick(side, 'conversion', dirOf(side) * (FIELD.tryX - 12 - Math.abs(z) * 0.1), z);
  // TMO: close ones (near the corner or a scramble) go upstairs.
  const close = Math.abs(c.z) > 26 || rand.chance(0.12);
  const tmo = eng.cfg.rules !== 'arcade' && close && rand.chance(eng.cfg.rules === 'sim' ? 0.7 : 0.45);
  const afterReplay = !tmo
    ? conversion
    : () => {
        eng.emit({ type: 'tmo', stage: 'check' });
        eng.after(2.2, () => {
          const given = rand.chance(0.72);
          eng.emit({ type: 'tmo', stage: given ? 'try' : 'notry' });
          if (given) {
            eng.after(1.4, conversion);
            return;
          }
          eng.score[side] -= 5;
          eng.tries[side]--;
          if (side === 0) eng.stats.tries--;
          eng.emit({ type: 'hud', hud: eng.hud() });
          eng.after(1.6, () => eng.setupScrum(dirOf(side) * (FIELD.tryX - 5), clamp(z, -25, 25), side));
        });
      };
  eng.after(2.6, () => eng.startReplay(clip, afterReplay));
}

export function goalResult(eng: MatchEngine, side: Side, kind: 'drop' | 'conversion' | 'penalty' | 'drill', good: boolean) {
  if (!good && kind !== 'drill') eng.stadium.event((side === 0) === eng.cfg.userIsHome ? 'missHome' : 'missAway');
  if (kind === 'drop') {
    if (!good) return;
    eng.score[side] += 3;
    if (side === 0) eng.stats.dropGoals++;
    eng.whistle();
    audio.cheer(1);
    eng.say('DROP GOAL!', side === 0 ? 'big' : 'bad', '+3');
    eng.phase = 'dead';
    eng.ball.state = 'dead';
    eng.stoppage(() => eng.setupKickoff(other(side), 0));
    return;
  }
  if (kind === 'drill') {
    if (good) eng.drillScore++;
    eng.say(good ? 'Over!' : 'Missed', good ? 'good' : 'bad');
    // Kicking Challenge: one miss ends the attempt
    if (!good && eng.cfg.kickChallenge) {
      const total = eng.cfg.kickChallenge.spots.length;
      eng.after(1.6, () => eng.finishDrill(total));
      return;
    }
    eng.after(1.6, () => eng.drillNext());
    return;
  }
  if (good) {
    const pts = kind === 'conversion' ? 2 : 3;
    eng.score[side] += pts;
    if (side === 0 && kind === 'conversion') eng.stats.conversions++;
    if (side === 0 && kind === 'penalty') eng.stats.penalties++;
    audio.cheer(0.6);
    eng.say(kind === 'conversion' ? 'Conversion good!' : 'Penalty goal!', side === 0 ? 'good' : 'bad', `+${pts}`);
  } else {
    eng.say(rand.pick(['Wide!', 'Missed!', 'Off the post!']), side === 0 ? 'bad' : 'good');
  }
  eng.emit({ type: 'placekickDone' });
  eng.emit({ type: 'hud', hud: eng.hud() });
  eng.stoppage(() => {
    eng.camMode = 'game';
    eng.setupKickoff(other(side), 0);
  }, 1.8);
}

// ---------------------------------------------------------------- stoppages & time
export function whistle(_eng: MatchEngine) {
  audio.whistle();
}

/** Ball is dead: end the half if time is up, otherwise run the restart. */
export function stoppage(eng: MatchEngine, next: () => void, delay = 1.4) {
  eng.phase = 'dead';
  eng.setPlay = null;
  eng.offsideLine.visible = false;
  if (eng.cfg.drill === 'passing' || eng.cfg.drill === 'tackling') {
    eng.after(delay, () => eng.drillNext());
    return;
  }
  eng.after(delay, () => {
    if (eng.timeUp()) eng.endHalf();
    else next();
  });
}

export function endHalf(eng: MatchEngine) {
  audio.whistle(true);
  eng.emit({ type: 'minigameCancel' });
  if (eng.half === 1) {
    eng.phase = 'halftime';
    eng.say('Half time', 'info', `${eng.teamShort(0)} ${eng.score[0]} - ${eng.score[1]} ${eng.teamShort(1)}`);
    eng.emit({ type: 'halftime' });
  } else {
    eng.phase = 'fulltime';
    if (eng.ended) return;
    eng.ended = true;
    eng.say('Full time!', 'big');
    audio.cheer(1);
    eng.emit({ type: 'end', result: eng.result() });
  }
}

export function continueSecondHalf(eng: MatchEngine) {
  eng.half = 2;
  eng.gameSec = 0;
  eng.setupKickoff(other(eng.firstKicker), 0);
}

export function result(eng: MatchEngine): EngineResult {
  return { userScore: eng.score[0], cpuScore: eng.score[1], userTries: eng.tries[0], cpuTries: eng.tries[1], user: { ...eng.stats }, match: eng.matchStats(), challenge: eng.challengeResult() };
}

// ---------------------------------------------------------------- penalties
export function awardPenalty(eng: MatchEngine, side: Side, x: number, z: number) {
  eng.penaltyAgainst(other(side));
  eng.resetStates();
  const d = dirOf(side);
  const px = clamp(x, -45, 45);
  const pz = clamp(z, -30, 30);
  const goalDist = dist(px, pz, d * FIELD.tryX, 0);
  const canKick = goalDist < 52 && px * d > -10;
  eng.phase = 'dead';
  // set the teams 10m apart
  const holder = eng.teams[side][9];
  eng.teams[side].forEach((p, i) => eng.place(p, px - d * (2 + (i % 4) * 2), clamp(pz - 20 + i * 3, -33, 33)));
  eng.teams[other(side)].forEach((p, i) => eng.place(p, px + d * 10, clamp(pz - 25 + i * 3.6, -33, 33)));
  eng.place(holder, px, pz);
  eng.ball.state = 'held';
  eng.ball.carrier = holder;
  eng.ball.lastSide = side;
  const go = (c: PenaltyChoice) => {
    if (c === 'goal') eng.setupPlaceKick(side, 'penalty', px, pz);
    else if (c === 'touch' && side === 0) {
      // You take the kick: touch the pitch where you want it to go out.
      const kicker = [...eng.teams[0]].sort((a, b) => b.r.kicking - a.r.kicking)[0];
      eng.place(kicker, px, pz);
      kicker.heading = 0;
      eng.ball.carrier = kicker;
      eng.ball.state = 'held';
      eng.controlled = kicker;
      eng.penTouch = { kicker };
      eng.camMode = 'game';
      // nobody aims it: kick for the nearer touchline 25m upfield
      const mine = eng.penTouch;
      eng.after(CFG.prompts.penaltyTouchAim, () => {
        if (eng.penTouch !== mine) return;
        eng.kickTarget = { x: px + d * 25, z: (pz >= 0 ? 1 : -1) * (FIELD.halfW + 2) };
        eng.penaltyTouchKick({ type: 'kick', kind: 'touch', dist: 30, angle: 0, power: 0.85, tx: eng.kickTarget.x, tz: eng.kickTarget.z });
        eng.kickTarget = null;
      });
      eng.say('Kick for touch', 'info', 'Touch the pitch where you want it to go out');
      eng.emit({ type: 'hud', hud: eng.hud() });
    } else if (c === 'touch') {
      eng.say('Kick to touch', 'info');
      audio.kick();
      eng.after(1, () => eng.setupLineout(clamp(px + d * 24, -44, 44), pz >= 0 ? 1 : -1, side));
    } else if (c === 'scrum') {
      eng.say('Scrum, please', 'info');
      eng.after(0.6, () => eng.setupScrum(px, pz, side));
    } else {
      eng.say('Tap and go!', 'info');
      eng.giveBall(holder);
      eng.phase = 'play';
      eng.assignSlots();
    }
  };
  if (side === 0) {
    eng.emit({ type: 'penalty', canKick, resolve: go });
  } else {
    const behind = eng.score[1] < eng.score[0];
    const choice: PenaltyChoice = canKick && (goalDist < 40 || !behind) ? 'goal' : FIELD.tryX - px * d < 25 ? (rand.chance(0.3) ? 'tap' : 'touch') : 'touch';
    eng.after(1, () => go(choice));
  }
}
