/** Training drills and the kicking challenge. */
import type { MatchEngine } from '../engine';
import { clamp, rand } from '../../util/rng';
import { FIELD } from '../field';
import { dirOf } from './shared';

/** Daily challenge scenarios: set the score, the clock and where play starts. */
export function startChallenge(eng: MatchEngine) {
  const ch = eng.cfg.challenge!;
  if (ch.score) eng.score = [ch.score[0], ch.score[1]];
  if (ch.secondHalfAt !== undefined) {
    eng.half = 2;
    eng.gameSec = ch.secondHalfAt;
  }
  eng.emit({ type: 'hud', hud: eng.hud() });
  const d = dirOf(0);
  if (ch.goal === 'holdOut') {
    // defend a scrum 8m from your own line
    eng.setupScrum(-d * (FIELD.tryX - 8), 6, 1);
  } else if (ch.startX !== undefined) {
    eng.setupScrum(d * ch.startX, 0, 0);
  } else eng.setupKickoff(eng.firstKicker, 0);
  eng.say(ch.title, 'info', 'Challenge');
}

/** Did the user complete the challenge? (checked at the final whistle) */
export function challengeResult(eng: MatchEngine): boolean | undefined {
  const ch = eng.cfg.challenge;
  if (!ch) return undefined;
  const [u, c] = eng.score;
  const start = ch.score ?? [0, 0];
  if (ch.goal === 'win') return u > c;
  if (ch.goal === 'holdOut') return c === start[1];
  if (ch.goal === 'tryFromOwn22') return eng.tries[0] > 0;
  return eng.tries[0] >= (ch.target ?? 1);
}

// ---------------------------------------------------------------- drills
export function startDrill(eng: MatchEngine) {
  eng.drillScore = 0;
  eng.drillStage = 0;
  eng.drillCount = 0;
  eng.drillNext(true);
}

export function drillNext(eng: MatchEngine, first = false) {
  const drill = eng.cfg.drill!;
  if (!first) eng.drillCount++;
  eng.resetStates();
  eng.camMode = 'game';
  if (drill === 'passing') {
    if (eng.drillScore >= 10) return;
    eng.teams[1].forEach((p) => {
      p.state = 'off';
      eng.place(p, 0, 80);
    });
    eng.teams[0].forEach((p, i) => eng.place(p, -30 - Math.abs(i - 9) * 1.5, clamp((i - 9) * 4.5, -32, 32)));
    const ten = eng.teams[0][9];
    eng.place(ten, -30, 0);
    eng.giveBall(ten);
    eng.phase = 'play';
    eng.assignSlots();
    eng.emit({ type: 'drill', text: 'Tap PASS for short, hold for long. Swipe the button ← → to pick a side.', progress: `${eng.drillScore} / 10 passes` });
    return;
  }
  if (drill === 'tackling') {
    if (eng.drillCount >= 5) return eng.finishDrill(5);
    eng.teams[1].forEach((p, i) => {
      p.state = i >= 8 ? 'free' : 'off';
      eng.place(p, i >= 8 ? 30 + Math.abs(i - 11) * 1.5 : 0, i >= 8 ? (i - 11) * 5 : 80);
    });
    eng.teams[0].forEach((p, i) => eng.place(p, 0, clamp((i - 7) * 4.2, -32, 32)));
    const carrier = eng.teams[1][9];
    eng.giveBall(carrier);
    eng.phase = 'play';
    eng.controlled = null;
    eng.autoControl();
    eng.emit({ type: 'drill', text: 'Get close and hit TACKLE. Use DIVE from further out. SWITCH changes player.', progress: `Rep ${eng.drillCount + 1} / 5 · ${eng.drillScore} tackles` });
    return;
  }
  if (drill === 'kicking') {
    const kc = eng.cfg.kickChallenge;
    const spots: [number, number][] = kc ? kc.spots : [[36, 0], [34, 12], [30, -18], [26, 8], [32, -26]];
    if (eng.drillCount >= spots.length) return eng.finishDrill(spots.length);
    if (kc && eng.drillCount === 0) {
      // fixed wind strength for the level, from a random direction
      const a = rand.range(0, Math.PI * 2);
      eng.wind = { x: (Math.cos(a) * kc.windKmh) / 3.6, z: (Math.sin(a) * kc.windKmh) / 3.6 };
    }
    eng.emit({
      type: 'drill',
      text: kc ? `${kc.level} — make every kick` : 'Swipe up through the ball: direction aims, speed is power, curve your swipe to bend it. Watch the wind!',
      progress: `Kick ${eng.drillCount + 1} / ${spots.length} · ${eng.drillScore} scored`,
    });
    const [x, z] = spots[eng.drillCount];
    eng.setupPlaceKick(0, 'drill', x, z);
    return;
  }
  if (drill === 'setpieces') {
    eng.drillStage = eng.drillCount;
    switch (eng.drillCount) {
      case 0:
        return eng.setupScrum(10, 0, 0);
      case 1:
        return eng.setupLineout(20, 1, 0);
      case 2: {
        eng.emit({ type: 'drill', text: 'Ruck: swipe UP in the green to secure quick ball', progress: 'Set piece 3 / 4' });
        eng.phase = 'dead';
        eng.teams.flat().forEach((p, i) => eng.place(p, (p.side ? 4 : -4) + (i % 3), (i % 15) * 3 - 21));
        eng.after(0.6, () =>
          eng.requestMini('ruck', true, 0, (q) => {
            const ok = q > 0.6;
            if (ok) eng.drillScore++;
            eng.say(ok ? 'Quick ball!' : 'Slow ball', ok ? 'good' : 'bad');
            eng.after(1.4, () => eng.drillNext());
          }),
        );
        return;
      }
      case 3: {
        eng.emit({ type: 'drill', text: 'Maul: swipe UP again and again to drive forward', progress: 'Set piece 4 / 4' });
        const carrier = eng.teams[0][1];
        eng.place(carrier, 20, 20);
        eng.teams.flat().forEach((p) => p !== carrier && eng.place(p, 20 + (p.side ? 2 : -2), 20 + rand.range(-3, 3)));
        eng.startMaul(20, 20, 0, carrier);
        const startX = 20;
        const check = () => {
          if (eng.maul) return eng.after(0.2, check);
          const gained = eng.ball.x - startX;
          if (gained > 2) eng.drillScore++;
          eng.finishDrill(4);
        };
        eng.after(0.5, check);
        return;
      }
      default:
        return eng.finishDrill(4);
    }
  }
}

export function finishDrill(eng: MatchEngine, total: number) {
  eng.phase = 'dead';
  eng.after(1, () => eng.emit({ type: 'drillDone', score: eng.drillScore, total }));
}
