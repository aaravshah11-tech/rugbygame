/**
 * The guided tutorial, played on the real pitch with the real controls. The director sets up a
 * small scene for each step (who has the ball, where the defenders are), then watches the engine
 * for the player actually doing each task: it wraps a few engine methods (passes, tackles, kicks,
 * set pieces) to hear about them, and checks running/sprinting distance every frame.
 */
import type { MatchEngine } from '../engine';
import { clamp } from '../../util/rng';
import { FIELD } from '../field';
import { TUT_STEPS } from '../../tutorial/steps';
import type { InputAction, KickKind } from '../types';
import { dist, type P } from './shared';

export class TutorialDirector {
  step = 0;
  task = 0;
  /** distance run / sprinted this task (m) */
  private ran = 0;
  private lastPos: { x: number; z: number } | null = null;
  private diveAt = -99;
  /** waiting before the next scene (s); -1 = not waiting */
  wait = -1;
  private next: (() => void) | null = null;
  /** seconds the scene has looked broken (ball lost, wrong side has it) */
  private stuck = 0;
  finished = false;
  /** conversion attempts this step */
  private kicks = 0;

  constructor(private eng: MatchEngine) {
    this.wrap();
  }

  // ------------------------------------------------------------ engine hooks
  private wrap() {
    const eng = this.eng;
    const doPass = eng.doPass.bind(eng);
    eng.doPass = (passer, long, dirHint, spin = false) => {
      const ok = doPass(passer, long, dirHint, spin);
      if (ok && passer.side === 0) {
        if (long) this.signal('pass', 'long');
        else if (dirHint < 0) this.signal('pass', 'left');
        else if (dirHint > 0) this.signal('pass', 'right');
      }
      return ok;
    };
    const handleAction = eng.handleAction.bind(eng);
    eng.handleAction = (a: InputAction) => {
      const c = eng.controlled;
      const hasBall = !!c && eng.ball.carrier === c;
      if (a.type === 'sidestep' && hasBall) this.signal('evade', 'step');
      if (a.type === 'handoff' && hasBall && c && eng.nearestOpponent(c, 3.6)) this.signal('evade', 'handoff');
      if (a.type === 'dive') this.diveAt = eng.time;
      if (a.type === 'addPlayer' && eng.ruck?.att === 0) this.signal('ruck', 'add');
      if ((a.type === 'ruckContest' || a.type === 'ruckFan') && eng.ruck?.att === 1) this.signal('ruck', 'def');
      handleAction(a);
    };
    const switchDefender = eng.switchDefender.bind(eng);
    eng.switchDefender = () => {
      switchDefender();
      this.signal('defend', 'switch');
    };
    const tackleMade = eng.tackleMade.bind(eng);
    eng.tackleMade = (t: P, c: P) => {
      tackleMade(t, c);
      if (t.side === 0) {
        if (eng.time - this.diveAt < 1.6) this.signal('defend', 'dive');
        this.signal('defend', 'tackle');
      }
    };
    const userKick = eng.userKick.bind(eng);
    eng.userKick = (c: P, kind: KickKind, d: number, angle: number, power: number, tx?: number, tz?: number) => {
      userKick(c, kind, d, angle, power, tx, tz);
      if (kind === 'grubber') this.signal('kick', 'grubber');
      if (kind === 'chip') this.signal('kick', 'chip');
      if (kind === 'punt' || kind === 'box' || kind === 'touch') this.signal('kick', 'punt');
    };
    const scoreTry = eng.scoreTry.bind(eng);
    eng.scoreTry = (c: P) => {
      scoreTry(c);
      if (c.side === 0) this.signal('try', 'try');
    };
    const goalResult = eng.goalResult.bind(eng);
    eng.goalResult = (side, kind, good) => {
      goalResult(side, kind, good);
      if (side === 0 && this.cur().id === 'convert') {
        this.kicks++;
        // made it, or two honest attempts: either way they have done a conversion
        if (good || this.kicks >= 2) this.signal('convert', 'kick');
        else eng.say('Missed! Again', 'info', 'Watch the wind arrow');
      }
    };
    const endScrumPush = eng.endScrumPush.bind(eng);
    eng.endScrumPush = () => {
      endScrumPush();
      this.signal('setpiece', 'scrum');
    };
    const resolveLineout = eng.resolveLineout.bind(eng);
    eng.resolveLineout = (throwSide, x, s, q) => {
      resolveLineout(throwSide, x, s, q);
      if (throwSide === 0) this.signal('setpiece', 'lineout');
    };
  }

  private cur() {
    return TUT_STEPS[this.step];
  }

  /** A task was done in the engine: tick it off if it is the current one. */
  private signal(step: string, task: string) {
    if (this.finished || this.wait >= 0) return;
    const s = this.cur();
    if (s.id !== step || s.tasks[this.task]?.id !== task) return;
    this.complete();
  }

  complete() {
    const s = this.cur();
    this.eng.pop(this.task + 1 < s.tasks.length ? 'NICE!' : 'STEP COMPLETE!', 'good');
    this.task++;
    this.ran = 0;
    if (this.task >= s.tasks.length) {
      this.emit(true);
      this.later(s.id === 'try' ? 2.6 : 1.8, () => this.goStep(this.step + 1));
    } else {
      this.emit();
      // a new scene for tasks that need a fresh setup
      const needsScene = s.id === 'ruck' || s.id === 'kick' || s.id === 'setpiece' || (s.id === 'defend' && this.task > 0) || (s.id === 'evade' && this.task === 1);
      if (needsScene) this.later(1.6, () => this.scene());
    }
  }

  private later(t: number, fn: () => void) {
    this.wait = t;
    this.next = fn;
  }

  /** Skip the current step (the overlay asks "are you sure?" first). */
  skip() {
    this.wait = -1;
    this.next = null;
    this.goStep(this.step + 1);
  }

  goStep(i: number) {
    this.step = i;
    this.task = 0;
    this.ran = 0;
    this.kicks = 0;
    this.stuck = 0;
    this.eng.timeScale = 1;
    if (i >= TUT_STEPS.length - 1) {
      // the last step is the mini match, played as a normal (short) match
      this.finished = true;
      this.eng.phase = 'dead';
      this.emit();
      return;
    }
    this.emit();
    this.scene();
  }

  start() {
    this.goStep(0);
  }

  private emit(stepDone = false) {
    this.eng.emit({ type: 'tutorial', step: this.step, task: this.task, stepDone, finished: this.finished });
  }

  /** Called when the engine would start the next drill rep (after a try, knock-on, tackle…). */
  drillNext() {
    if (this.finished || this.wait >= 0) return;
    // conversion follows the try on its own; anything else: set the scene up again
    this.scene();
  }

  // ------------------------------------------------------------ scenes
  private off(side: 0 | 1) {
    this.eng.teams[side].forEach((p) => {
      p.state = 'off';
      this.eng.place(p, 0, 80);
    });
  }
  private on(p: P, x: number, z: number) {
    p.state = 'free';
    this.eng.place(p, x, z);
  }
  /** user attacking line across the pitch with the ball for `carrier` at (x, z) */
  private attackLine(carrierIdx: number, x: number, z: number) {
    const eng = this.eng;
    eng.teams[0].forEach((p, i) => this.on(p, x - 3 - Math.abs(i - carrierIdx) * 1.3, clamp(z + (i - carrierIdx) * 5, -32, 32)));
    const c = eng.teams[0][carrierIdx];
    this.on(c, x, z);
    eng.giveBall(c);
    eng.controlled = c;
    return c;
  }

  scene() {
    const eng = this.eng;
    const s = this.cur();
    const task = s.tasks[this.task]?.id;
    eng.emit({ type: 'minigameCancel' });
    // close any kick-at-goal screen left from the conversion
    eng.emit({ type: 'placekickDone' });
    eng.resetStates();
    eng.camMode = 'game';
    eng.timeScale = 1;
    eng.wind = { x: 0, z: 0 };
    this.stuck = 0;
    this.lastPos = null;
    switch (s.id) {
      case 'run': {
        this.off(1);
        this.attackLine(13, -30, 10);
        break;
      }
      case 'pass': {
        this.off(1);
        this.attackLine(9, -30, 0);
        break;
      }
      case 'evade': {
        this.off(1);
        this.attackLine(11, -20, 0);
        const d1 = eng.teams[1][11];
        const d2 = eng.teams[1][12];
        if (task === 'step') this.on(d1, -9, 0);
        else this.on(d2, -10, 1);
        eng.teams[1].forEach((p) => p.state === 'free' && (p.urgency = 0.35));
        break;
      }
      case 'try': {
        this.off(1);
        this.attackLine(10, FIELD.tryX - 22, -6);
        // two slow covering defenders: they chase, but a first-timer can beat them
        for (const [i, x, z] of [[1, FIELD.tryX - 6, 10], [2, FIELD.tryX - 10, -20]] as const) {
          const d = eng.teams[1][i];
          this.on(d, x, z);
          d.r = { ...d.r, pace: 38, tackling: 20 };
          d.urgency = 0.25;
        }
        break;
      }
      case 'convert': {
        // a gentle crosswind so the arrow means something; each retry from a slightly
        // different spot (a fresh kick screen)
        eng.wind = { x: 0, z: 2.2 };
        eng.setupPlaceKick(0, 'drill', FIELD.tryX - 16 + this.kicks * 2, -8 + this.kicks * 4);
        return this.emit();
      }
      case 'defend': {
        this.off(0);
        this.off(1);
        // their attack running at your line
        eng.teams[1].forEach((p, i) => i >= 8 && this.on(p, 18 + Math.abs(i - 11) * 1.5, (i - 11) * 5));
        eng.teams[0].forEach((p, i) => this.on(p, -2, clamp((i - 7) * 4.2, -32, 32)));
        const carrier = eng.teams[1][9];
        eng.giveBall(carrier);
        eng.phase = 'play';
        // start on a defender away from the ball so SWITCH has something to do
        eng.controlled = task === 'switch' ? eng.teams[0][14] : null;
        if (!eng.controlled) eng.autoControl();
        eng.assignSlots();
        return this.emit();
      }
      case 'ruck': {
        eng.teams.flat().forEach((p) => (p.state = 'free'));
        if (task === 'add') {
          const c = this.attackLine(7, 0, 0);
          const t = eng.teams[1][6];
          this.on(t, 1, 0);
          eng.teams[1].forEach((p, i) => p !== t && this.on(p, 6, clamp((i - 7) * 4.5, -32, 32)));
          eng.startRuck(c, t);
        } else {
          eng.teams[1].forEach((p, i) => this.on(p, 3 + Math.abs(i - 7), clamp((i - 7) * 4.5, -32, 32)));
          const c = eng.teams[1][7];
          this.on(c, 0, 0);
          eng.teams[0].forEach((p, i) => this.on(p, -6, clamp((i - 7) * 4.5, -32, 32)));
          const t = eng.teams[0][6];
          this.on(t, -1, 0);
          eng.giveBall(c);
          eng.startRuck(c, t);
        }
        return this.emit();
      }
      case 'kick': {
        this.off(1);
        this.attackLine(9, -25, 0);
        // a defensive line to kick over or behind
        eng.teams[1].forEach((p, i) => i >= 8 && this.on(p, -10, clamp((i - 11) * 6, -30, 30)));
        eng.teams[1].forEach((p) => p.state === 'free' && (p.urgency = 0.2));
        break;
      }
      case 'setpiece': {
        eng.teams.flat().forEach((p) => (p.state = 'free'));
        if (task === 'scrum') eng.setupScrum(10, 0, 0);
        else eng.setupLineout(20, 1, 0);
        return this.emit();
      }
      default:
        return;
    }
    eng.phase = 'play';
    eng.assignSlots();
    this.emit();
  }

  // ------------------------------------------------------------ per frame
  tick(dt: number) {
    if (this.finished) return;
    if (this.wait >= 0) {
      this.wait -= dt;
      if (this.wait < 0) {
        const fn = this.next;
        this.next = null;
        fn?.();
      }
      return;
    }
    const eng = this.eng;
    const s = this.cur();
    const task = s.tasks[this.task]?.id;
    const c = eng.controlled;
    // running and sprinting: distance with the stick pushed
    if (s.id === 'run' && c) {
      const moving = Math.hypot(eng.input.moveX, eng.input.moveY) > 0.25;
      const sprinting = eng.input.sprint || eng.input.sprintHold;
      if (this.lastPos && moving && (task === 'run' || sprinting)) this.ran += dist(c.x, c.z, this.lastPos.x, this.lastPos.z);
      this.lastPos = { x: c.x, z: c.z };
      if (this.ran > (task === 'run' ? 10 : 8)) this.complete();
    }
    // the scene went wrong (ball lost, out of play, ran off the edge): set it up again
    const attackStep = s.id === 'run' || s.id === 'pass' || s.id === 'evade' || s.id === 'try' || s.id === 'kick';
    const userBall = eng.ball.carrier?.side === 0;
    const inFlight = eng.ball.state === 'air' || eng.ball.state === 'ground' || !!eng.ball.pass;
    let broken = false;
    if (attackStep && !userBall && !inFlight && eng.phase !== 'placekick') broken = true;
    if (attackStep && userBall && Math.abs(eng.ball.carrier!.z) > FIELD.halfW - 2) broken = true;
    if (s.id === 'run' && userBall && eng.ball.carrier!.x > FIELD.tryX - 12) broken = true;
    if (s.id === 'defend' && (eng.phase === 'ruck' || eng.phase === 'dead' || eng.ball.carrier?.side === 0)) broken = true;
    if (s.id === 'ruck' && eng.phase !== 'ruck') broken = true;
    this.stuck = broken ? this.stuck + dt : 0;
    if (this.stuck > (s.id === 'kick' ? 3.5 : 2.2)) this.scene();
  }
}
