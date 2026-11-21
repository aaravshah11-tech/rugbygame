import * as THREE from 'three';
import { effectiveRatings, type Player, type Ratings } from '../data/players';
import { buildStadium, FIELD, type Stadium } from './stadium';
import { animateModel, createBall, createPlayerModel, makeTeamLook, type PlayerModel, type Pose } from './model';
import { audio } from '../util/audio';
import { haptic } from '../util/haptics';
import { clamp, rand } from '../util/rng';
import type {
  CommentaryTone,
  EngineEvent,
  EngineResult,
  HudState,
  InputAction,
  InputState,
  MatchConfig,
  MiniGameKind,
  PenaltyChoice,
  SetPlayId,
  TeamSetup,
} from './types';

type Side = 0 | 1;
type PState = 'free' | 'down' | 'bound' | 'off';
type Phase = 'pre' | 'kickoff' | 'play' | 'ruck' | 'maul' | 'scrum' | 'lineout' | 'placekick' | 'dead' | 'halftime' | 'fulltime';

interface P {
  side: Side;
  num: number;
  data: Player;
  r: Ratings;
  name: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  tx: number;
  tz: number;
  urgency: number;
  state: PState;
  timer: number;
  tackleCD: number;
  catchCD: number;
  sidestepT: number;
  sideDir: number;
  handoffT: number;
  diveT: number;
  kickT: number;
  stamina: number;
  slotSide: number;
  slotK: number;
  model: PlayerModel;
}

interface PassFlight {
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  t: number;
  T: number;
  peak: number;
  target: P;
  passer: P;
  long: boolean;
  forward: boolean;
}

interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: 'held' | 'pass' | 'air' | 'ground' | 'dead';
  carrier: P | null;
  pass: PassFlight | null;
  lastSide: Side;
  kicker: P | null;
  kickFromX: number;
  bounced: boolean;
  goalCheck: null | { side: Side; kind: 'drop' | 'conversion' | 'penalty' | 'drill' };
  wind: boolean;
}

const G = 9.81;
const dirOf = (s: Side) => (s === 0 ? 1 : -1);
const other = (s: Side): Side => (s === 0 ? 1 : 0);
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

const LINES: Record<string, string[]> = {
  try: ['TRY!', 'TRY! What a finish!', 'TRY! Over the line!', 'TRY! Brilliant score!'],
  bigHit: ['Huge hit!', 'Massive tackle!', 'Bone-rattler!', 'What a hit!'],
  knockOn: ['Knock-on', 'Knocked on!', 'Spilled forward'],
  forward: ['Forward pass!', 'That went forward'],
  turnover: ['Turnover!', 'Ball stolen!', 'Jackal! Turnover!'],
  lineBreak: ['Line break!', 'Through the gap!', "He's away!"],
  brokenTackle: ['Broken tackle!', 'Bounced off him!', 'Stepped him!'],
  intercept: ['Intercepted!', 'Picked off!'],
};
const line = (k: string) => rand.pick(LINES[k]);

export class MatchEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private stadium: Stadium;
  private players: P[] = [];
  private teams: [P[], P[]] = [[], []];
  private ball: Ball;
  private ballMesh: THREE.Mesh;
  private ring: THREE.Mesh;
  private targetRing: THREE.Mesh;
  private offsideLine: THREE.Mesh;
  private arc: THREE.Line;
  private shadows: THREE.InstancedMesh;
  private raf = 0;
  private last = 0;
  private time = 0;
  private listener: (e: EngineEvent) => void;
  readonly input: InputState;
  private cfg: MatchConfig;

  private phase: Phase = 'pre';
  private phaseT = 0;
  private timers: { t: number; fn: () => void }[] = [];
  private half: 1 | 2 = 1;
  private gameSec = 0;
  private score: [number, number] = [0, 0];
  private tries: [number, number] = [0, 0];
  private stats = { tries: 0, tackles: 0, conversions: 0, passes: 0, penalties: 0, dropGoals: 0 };
  private controlled: P | null = null;
  private firstKicker: Side = 1;
  private wind = { x: 0, z: 0 };
  private paused = false;
  private waitingBlocking = false;
  private miniId = 0;
  private activeMini: { id: number; kind: MiniGameKind; q: number | null; taps: number; done: boolean } | null = null;
  private ruck: null | { x: number; z: number; att: Side; t: number; dur: number } = null;
  private maul: null | { x: number; z: number; att: Side; t: number; dur: number; start: number; carrier: P; cpuPush: number; userPush: number } = null;
  private setPlay: null | { id: SetPlayId; targets: P[]; routes: Map<P, () => { x: number; z: number }>; until: number } = null;
  private slotTimer = 0;
  private aiDecisionT = 0;
  private atBaseT = -1;
  private lineBreakFrom: number | null = null;
  private hudT = 0;
  private placeAim = 0;
  private placeKicker: P | null = null;
  private placeKind: 'conversion' | 'penalty' | 'drill' = 'conversion';
  private placeSide: Side = 0;
  private camPos = new THREE.Vector3(-20, 12, 0);
  private camLook = new THREE.Vector3();
  private camMode: 'game' | 'placekick' | 'setpiece' = 'game';
  private drillCount = 0;
  private drillScore = 0;
  private drillStage = 0;
  private ended = false;
  private resizeObs: ResizeObserver;
  /** Dev builds only: `?fast` runs the match clock 20x faster for testing. */
  private clockScale = import.meta.env.DEV && new URLSearchParams(location.search).has('fast') ? 20 : 1;

  constructor(private host: HTMLElement, cfg: MatchConfig, input: InputState, listener: (e: EngineEvent) => void) {
    this.cfg = cfg;
    this.input = input;
    this.listener = listener;
    this.renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2.5, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);

    this.stadium = buildStadium(this.scene, [cfg.user.kit.primary, cfg.user.kit.secondary, cfg.cpu.kit.primary, cfg.cpu.kit.secondary]);
    this.buildTeams();

    this.ballMesh = createBall();
    this.scene.add(this.ballMesh);
    this.ball = {
      x: 0, y: 0.1, z: 0, vx: 0, vy: 0, vz: 0, state: 'dead', carrier: null, pass: null, lastSide: 0,
      kicker: null, kickFromX: 0, bounced: false, goalCheck: null, wind: false,
    };

    const ringGeo = new THREE.RingGeometry(0.75, 0.95, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#c6ff1a', transparent: true, opacity: 0.95, depthWrite: false }));
    this.ring.position.y = 0.04;
    this.scene.add(this.ring);
    this.targetRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#21e6c1', transparent: true, opacity: 0.7, depthWrite: false }));
    this.targetRing.position.y = 0.035;
    this.targetRing.scale.setScalar(0.7);
    this.scene.add(this.targetRing);

    const offGeo = new THREE.PlaneGeometry(0.3, 70);
    offGeo.rotateX(-Math.PI / 2);
    this.offsideLine = new THREE.Mesh(offGeo, new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.55, depthWrite: false }));
    this.offsideLine.position.y = 0.05;
    this.offsideLine.visible = false;
    this.scene.add(this.offsideLine);

    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
    this.arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: '#c6ff1a' }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.scene.add(this.arc);

    // Blob shadows: one instanced draw call for every player + ball.
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sg = sc.getContext('2d')!;
    const grad = sg.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 64, 64);
    const shGeo = new THREE.PlaneGeometry(1.3, 1.3);
    shGeo.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(
      shGeo,
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }),
      this.players.length + 1,
    );
    this.shadows.frustumCulled = false;
    this.scene.add(this.shadows);

    const ws = rand.range(0, 22) / 3.6;
    const wa = rand.range(0, Math.PI * 2);
    this.wind = { x: Math.cos(wa) * ws, z: Math.sin(wa) * ws };
  }

  // ---------------------------------------------------------------- setup
  private buildTeams() {
    const diffMod = { easy: -8, medium: 0, hard: 6 }[this.cfg.difficulty];
    const mk = (team: TeamSetup, side: Side) => {
      const look = makeTeamLook(team.kit);
      team.players.slice(0, 15).forEach((pl, i) => {
        const boost: Partial<Ratings> = { ...(team.boost ?? {}) };
        if (side === 1) for (const k of ['pace', 'strength', 'passing', 'kicking', 'tackling', 'handling'] as const) boost[k] = (boost[k] ?? 0) + diffMod;
        const r = effectiveRatings(pl, boost);
        const skin = Math.abs(hashCode(pl.id)) % 5;
        const scale = i < 8 ? 1.06 : 0.97;
        const model = createPlayerModel(look, skin, scale);
        this.scene.add(model.root);
        const p: P = {
          side, num: i + 1, data: pl, r, name: `${pl.first[0]}. ${pl.last}`,
          x: 0, z: 0, vx: 0, vz: 0, heading: side === 0 ? 0 : Math.PI, tx: 0, tz: 0, urgency: 0,
          state: 'free', timer: 0, tackleCD: 0, catchCD: 0, sidestepT: 0, sideDir: 1, handoffT: 0, diveT: 0, kickT: 0,
          stamina: 1, slotSide: 1, slotK: 0, model,
        };
        this.players.push(p);
        this.teams[side].push(p);
      });
    };
    mk(this.cfg.user, 0);
    mk(this.cfg.cpu, 1);
  }

  private resize() {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 70 : 50;
    this.camera.updateProjectionMatrix();
  }

  start() {
    audio.startCrowd();
    audio.setCrowd(0.2);
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
    if (this.cfg.drill) this.startDrill();
    else this.setupKickoff(this.firstKicker, 0);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    audio.stopCrowd();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.domElement.remove();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) audio.setCrowd(0.05);
  }

  setCamera(mode: MatchConfig['camera']) {
    this.cfg.camera = mode;
  }

  // ---------------------------------------------------------------- events
  private emit(e: EngineEvent) {
    this.listener(e);
  }
  private say(text: string, tone: CommentaryTone = 'info', sub?: string) {
    this.emit({ type: 'commentary', text, tone, sub });
  }
  private after(t: number, fn: () => void) {
    this.timers.push({ t, fn });
  }

  // ---------------------------------------------------------------- main loop
  private frame(dt: number) {
    if (!this.paused) {
      this.time += dt;
      if (!this.waitingBlocking) this.update(dt);
    }
    this.render(dt);
  }

  private update(dt: number) {
    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
    this.phaseT += dt;
    if (!this.cfg.drill && (this.phase === 'play' || this.phase === 'ruck' || this.phase === 'maul')) {
      this.gameSec += dt * this.clockScale * (2400 / (this.cfg.halfMinutes * 60));
    }
    this.handleActions();

    switch (this.phase) {
      case 'kickoff':
      case 'play':
        this.updatePlay(dt);
        break;
      case 'ruck':
        this.updateRuck(dt);
        break;
      case 'maul':
        this.updateMaul(dt);
        break;
      case 'placekick':
      case 'dead':
      case 'scrum':
      case 'lineout':
        if (this.ball.state === 'air' || this.ball.state === 'ground') this.updateBallPhysics(dt);
        break;
      default:
        break;
    }
    this.movePlayers(dt);
    this.updateCarriedBall();

    // crowd gets louder near either try line
    const bx = this.ball.x;
    const near = clamp((Math.abs(bx) - 20) / 30, 0, 1);
    audio.setCrowd(this.phase === 'play' || this.phase === 'ruck' ? 0.15 + near * 0.85 : 0.2);

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      this.emit({ type: 'hud', hud: this.hud() });
    }
  }

  private hud(): HudState {
    const totalMin = Math.floor((this.half - 1) * 40 + Math.min(this.gameSec, 2400) / 60);
    const secs = Math.floor(Math.min(this.gameSec, 2400) % 60);
    const c = this.controlled;
    return {
      userScore: this.score[0],
      cpuScore: this.score[1],
      clock: `${String(totalMin).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      half: this.half,
      attacking: this.possession() === 0,
      canAct: this.phase === 'play' || this.phase === 'kickoff' || this.phase === 'ruck' || this.phase === 'maul',
      controlledName: c ? c.name : '',
      controlledNum: c ? c.num : 0,
      stamina: c ? c.stamina : 1,
      timeUp: this.timeUp(),
      phase: this.phase,
    };
  }

  private timeUp() {
    return !this.cfg.drill && this.gameSec >= 2400;
  }

  private possession(): Side {
    return this.ball.carrier ? this.ball.carrier.side : this.ball.lastSide;
  }

  // ---------------------------------------------------------------- input
  private handleActions() {
    const acts = this.input.actions.splice(0);
    for (const a of acts) this.handleAction(a);
  }

  private handleAction(a: InputAction) {
    const c = this.controlled;
    const b = this.ball;
    const userHasBall = b.carrier !== null && b.carrier === c && c.side === 0;
    const live = this.phase === 'play' || this.phase === 'kickoff';
    switch (a.type) {
      case 'pass':
        if (userHasBall && live) this.doPass(c!, a.long, a.dir);
        break;
      case 'kick':
        if (userHasBall && live) this.doKick(c!, a.power, a.aim * 0.7, a.power < 0.3 ? 'grubber' : 'punt');
        break;
      case 'sidestep':
        if (c && userHasBall && c.sidestepT <= 0) {
          c.sidestepT = 0.35;
          c.sideDir = this.input.moveX !== 0 ? Math.sign(this.input.moveX) * this.camRightSign() : c.z > 0 ? -1 : 1;
        }
        break;
      case 'handoff':
        if (c && userHasBall && c.handoffT <= 0) {
          c.handoffT = 0.6;
          const d = this.nearestOpponent(c, 2.2);
          if (d) this.tryFend(c, d);
        }
        break;
      case 'tackle':
        if (c && live && b.carrier && b.carrier.side === 1 && c.state === 'free') {
          const reach = { easy: 2.4, medium: 1.9, hard: 1.6 }[this.cfg.difficulty];
          if (dist(c.x, c.z, b.carrier.x, b.carrier.z) <= reach) this.attemptTackle(c, b.carrier, false);
        }
        break;
      case 'dive':
        if (c && live && c.state === 'free' && b.carrier && b.carrier.side === 1) {
          const carrier = b.carrier;
          const d = dist(c.x, c.z, carrier.x, carrier.z);
          c.diveT = 0.45;
          const ang = Math.atan2(carrier.z - c.z, carrier.x - c.x);
          c.vx = Math.cos(ang) * 9;
          c.vz = Math.sin(ang) * 9;
          if (d <= 4) this.after(0.18, () => {
            if (this.ball.carrier === carrier && this.phase === 'play') this.attemptTackle(c, carrier, true);
          });
          else {
            c.state = 'down';
            c.timer = 1.1;
          }
        }
        break;
      case 'switch':
        if (this.possession() === 1 || !b.carrier) this.switchDefender();
        break;
      case 'setplay':
        if (userHasBall && live) this.startSetPlay(a.id);
        break;
    }
  }

  /** +1 if screen-right maps to world +z for the current camera. */
  private camRightSign() {
    return this.cfg.camera === 'sideline' ? -1 : 1;
  }

  private switchDefender() {
    const bx = this.ball.x;
    const bz = this.ball.z;
    const cands = this.teams[0]
      .filter((p) => p.state === 'free' && p !== this.controlled)
      .sort((a, b) => dist(a.x, a.z, bx, bz) - dist(b.x, b.z, bx, bz));
    if (cands[0]) this.controlled = cands[0];
    audio.click();
  }

  private autoControl() {
    const b = this.ball;
    if (b.carrier && b.carrier.side === 0) {
      this.controlled = b.carrier;
      return;
    }
    if (b.state === 'pass' && b.pass && b.pass.target.side === 0) {
      this.controlled = b.pass.target;
      return;
    }
    if (!this.controlled || this.controlled.state !== 'free' || this.phase !== 'play') {
      const free = this.teams[0].filter((p) => p.state === 'free');
      free.sort((p, q) => dist(p.x, p.z, b.x, b.z) - dist(q.x, q.z, b.x, b.z));
      if (free[0]) this.controlled = free[0];
    }
  }

  // ---------------------------------------------------------------- movement
  private maxSpeed(p: P) {
    let s = 5.4 + (p.r.pace / 100) * 4;
    if (this.ball.carrier === p) s *= 0.95;
    return s;
  }

  private movePlayers(dt: number) {
    const inp = this.input;
    const joy = Math.hypot(inp.moveX, inp.moveY);
    const { fx, fz, rx, rz } = this.camAxes();
    for (const p of this.players) {
      p.tackleCD -= dt;
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
      const max = this.maxSpeed(p);
      const userDriven = p === this.controlled && p.state === 'free' && (joy > 0.12 || this.ball.carrier === p) && this.phase !== 'placekick';
      if (userDriven) {
        const sprinting = inp.sprint && p.stamina > 0.05;
        const spd = max * (sprinting ? 1.2 : 1) * Math.min(1, joy);
        if (joy > 0.05) {
          const mx = inp.moveX / Math.max(joy, 1);
          const my = inp.moveY / Math.max(joy, 1);
          const wx = rx * mx + fx * my;
          const wz = rz * mx + fz * my;
          const n = Math.hypot(wx, wz) || 1;
          dvx = (wx / n) * spd;
          dvz = (wz / n) * spd;
        }
        p.stamina = clamp(p.stamina + (sprinting && joy > 0.1 ? -0.22 : 0.1) * dt, 0, 1);
      } else if (p.state === 'free' || p.state === 'bound') {
        const dx = p.tx - p.x;
        const dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.15) {
          const spd = max * p.urgency * Math.min(1, d / 2.5) * (p.state === 'bound' ? 0.5 : 1);
          dvx = (dx / d) * spd;
          dvz = (dz / d) * spd;
        }
        p.stamina = clamp(p.stamina + 0.08 * dt, 0, 1);
      }
      if (p.sidestepT > 0 && this.ball.carrier === p) {
        dvz += p.sideDir * 7;
        dvx += dirOf(p.side) * 2;
      }
      const acc = p.state === 'bound' ? 4 : 7;
      p.vx += (dvx - p.vx) * Math.min(1, dt * acc);
      p.vz += (dvz - p.vz) * Math.min(1, dt * acc);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }
    // gentle separation so players don't overlap
    const ps = this.players;
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
          const push = (min - d) * 0.5;
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

  /** Ground-plane camera axes used to map the joystick to world directions. */
  private camAxes() {
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-4) f.set(1, 0, 0);
    f.normalize();
    return { fx: f.x, fz: f.z, rx: -f.z, rz: f.x };
  }

  private updateCarriedBall() {
    const b = this.ball;
    if (b.state === 'held' && b.carrier) {
      const p = b.carrier;
      const h = p.heading;
      b.x = p.x + Math.cos(h) * 0.35;
      b.z = p.z + Math.sin(h) * 0.35;
      b.y = p.state === 'down' ? 0.25 : 1.05;
    }
  }

  // ---------------------------------------------------------------- play
  private updatePlay(dt: number) {
    const b = this.ball;
    this.autoControl();
    if (b.state === 'held' && b.carrier) this.updateCarrier(dt, b.carrier);
    else if (b.state === 'pass') this.updatePass(dt);
    else if (b.state === 'air' || b.state === 'ground') this.updateBallPhysics(dt);
    if (this.phase !== 'play' && this.phase !== 'kickoff') return;
    this.slotTimer -= dt;
    if (this.slotTimer <= 0) {
      this.slotTimer = 1.5;
      this.assignSlots();
    }
    this.updateAI(dt);
    if (this.setPlay && this.time > this.setPlay.until) this.setPlay = null;
  }

  private updateCarrier(dt: number, c: P) {
    const d = dirOf(c.side);
    // Try line
    if (c.x * d >= FIELD.tryX && Math.abs(c.z) < FIELD.halfW) {
      this.scoreTry(c);
      return;
    }
    // Carried into own in-goal: touch down, 22 drop-out
    if (c.x * d <= -FIELD.tryX) {
      this.whistle();
      this.say('Touched down', 'info', '22m drop-out');
      this.stoppage(() => this.setupKickoff(c.side, -d * 28));
      return;
    }
    // Touch
    if (Math.abs(c.z) > FIELD.halfW) {
      this.whistle();
      this.say('Into touch', 'info', 'Lineout');
      const x = c.x;
      const sign = Math.sign(c.z);
      this.stoppage(() => this.setupLineout(x, sign, other(c.side)));
      return;
    }
    // Line break commentary
    const defAhead = this.teams[other(c.side)].some((o) => o.state === 'free' && (o.x - c.x) * d > -0.5 && (o.x - c.x) * d < 12 && Math.abs(o.z - c.z) < 9);
    if (!defAhead) {
      if (this.lineBreakFrom === null) this.lineBreakFrom = c.x;
      else if (Math.abs(c.x - this.lineBreakFrom) > 8) {
        this.say(line('lineBreak'), 'good');
        this.lineBreakFrom = 1e9;
      }
    } else if (this.lineBreakFrom !== 1e9) this.lineBreakFrom = null;

    if (c.side === 1 || c !== this.controlled) this.cpuCarrier(dt, c);
  }

  // ---------------------------------------------------------------- AI
  private assignSlots() {
    const b = this.ball;
    const att = this.possession();
    const anchor = b.carrier ?? (b.pass ? b.pass.target : null);
    const ax = anchor ? anchor.x : b.x;
    const az = anchor ? anchor.z : b.z;
    const mates = this.teams[att].filter((p) => p !== anchor && p.state !== 'off');
    const left = mates.filter((p) => p.z < az).sort((p, q) => q.z - p.z);
    const right = mates.filter((p) => p.z >= az).sort((p, q) => p.z - q.z);
    // Balance the line: more runners on the open side.
    const openRight = az < 0;
    while (openRight ? right.length < left.length - 1 : left.length < right.length - 1) {
      if (openRight) right.unshift(left.shift()!);
      else left.unshift(right.shift()!);
    }
    left.forEach((p, k) => ((p.slotSide = -1), (p.slotK = k)));
    right.forEach((p, k) => ((p.slotSide = 1), (p.slotK = k)));
    void ax;
  }

  private attackSlotTarget(p: P, ax: number, az: number, side: Side) {
    const d = dirOf(side);
    const k = p.slotK;
    const deep = k >= 5 ? 7 : 0;
    const x = ax - d * (2.8 + Math.min(k, 4) * 1.3 + deep);
    const z = clamp(az + p.slotSide * (5 + Math.min(k, 5) * 5.2), -FIELD.halfW + 2, FIELD.halfW - 2);
    return { x, z };
  }

  private updateAI(dt: number) {
    const b = this.ball;
    const att = this.possession();
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
    if (airborne) land = this.predictLanding();

    // ----- attack
    for (const p of this.teams[att]) {
      if (p.state !== 'free' || p === this.controlled && this.isUserDriving(p)) continue;
      if (p === carrier) continue;
      if (airborne && land) continue;
      const route = this.setPlay?.routes.get(p);
      if (route && att === 0) {
        const r = route();
        p.tx = r.x;
        p.tz = r.z;
        p.urgency = 1;
        continue;
      }
      const t = this.attackSlotTarget(p, fx, fz, att);
      p.tx = t.x;
      p.tz = t.z;
      const behind = (fx - p.x) * dAtt;
      p.urgency = behind < 1 ? 0.75 : 0.95;
    }

    // ----- defence
    const defenders = this.teams[def].filter((p) => p.state === 'free' && !(p === this.controlled && this.isUserDriving(p)));
    if (airborne && land) {
      // Chase the kick: two nearest from each side go to the landing spot.
      for (const side of [0, 1] as Side[]) {
        const team = this.teams[side].filter((p) => p.state === 'free' && !(p === this.controlled && this.isUserDriving(p)));
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

    const attackers = this.teams[att].filter((p) => p.state !== 'off' && p.state !== 'down').sort((p, q) => p.z - q.z);
    // Chasers: up to two closest defenders hunt the carrier.
    const hunt = carrier ?? (b.pass ? b.pass.target : null);
    const sorted = [...defenders].sort((p, q) => dist(p.x, p.z, fx, fz) - dist(q.x, q.z, fx, fz));
    const chasers = new Set(sorted.slice(0, this.phase === 'kickoff' ? 3 : 2));
    const fb = defenders.find((p) => p.num === 15);
    const lineDef = defenders.filter((p) => !chasers.has(p) && p !== fb).sort((p, q) => p.z - q.z);
    const lineX = fx + dAtt * (this.atBaseT >= 0 ? 4 : 3);
    lineDef.forEach((p, i) => {
      const idx = lineDef.length > 1 ? Math.round((i * (attackers.length - 1)) / (lineDef.length - 1)) : 0;
      const a = attackers[idx];
      const lane = a ? a.z : fz;
      const wing = p.num === 11 || p.num === 14;
      p.tx = lineX + dAtt * (wing ? 5 : 0);
      p.tz = clamp(lane * 0.85 + fz * 0.15, -33, 33);
      p.urgency = 0.82;
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

    // CPU tackles (the user's controlled defender only tackles when the button is pressed)
    if (carrier && this.phase === 'play') {
      for (const p of this.teams[def]) {
        if (p.state !== 'free' || p.tackleCD > 0 || p === this.controlled) continue;
        const d = dist(p.x, p.z, carrier.x, carrier.z);
        if (d < 1.25) {
          this.attemptTackle(p, carrier, false);
          if (this.ball.carrier !== carrier) break;
        }
      }
    }
    // Loose ball pickup handled in physics. Mark dt as used.
    void dt;
  }

  private isUserDriving(p: P) {
    if (p !== this.controlled) return false;
    const joy = Math.hypot(this.input.moveX, this.input.moveY);
    return joy > 0.12 || this.ball.carrier === p;
  }

  private cpuCarrier(dt: number, c: P) {
    const d = dirOf(c.side);
    const opp = this.teams[other(c.side)];
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
    const atBase = this.atBaseT >= 0 && this.ball.carrier === c;
    c.tx = c.x + d * 10;
    c.tz = clamp(c.z + steerZ, -33, 33);
    c.urgency = atBase ? 0.25 : 1;

    this.aiDecisionT -= dt;
    if (atBase) {
      this.atBaseT += dt;
      if (this.atBaseT > (c.side === 1 ? 0.75 : 99)) {
        this.atBaseT = -1;
        this.doPass(c, rand.chance(0.25), 0);
      }
      return;
    }
    if (c.side === 0) return; // user team support carrier is never AI driven beyond running
    if (this.aiDecisionT > 0) return;
    this.aiDecisionT = 0.25;
    // tactical kick from deep
    const ownDist = FIELD.tryX + c.x * d;
    if ((c.num === 10 || c.num === 15 || c.num === 9) && ownDist < 32 && nearest < 9 && rand.chance(0.35)) {
      this.doKick(c, rand.range(0.7, 1), rand.range(-0.5, 0.5), 'punt');
      return;
    }
    if (nearest < 3 && nearestP) {
      const r = rand.next();
      if (r < 0.5 * (c.r.passing / 80)) {
        if (this.doPass(c, rand.chance(0.3), 0)) return;
      }
      if (r < 0.7 && c.sidestepT <= 0 && rand.chance(c.r.pace / 160)) {
        c.sidestepT = 0.35;
        c.sideDir = Math.sign(c.z - nearestP.z) || 1;
      } else if (c.handoffT <= 0 && rand.chance(c.r.strength / 200)) {
        c.handoffT = 0.6;
        if (nearest < 2) this.tryFend(c, nearestP);
      }
    }
  }

  private nearestOpponent(p: P, within: number): P | null {
    let best: P | null = null;
    let bd = within;
    for (const o of this.teams[other(p.side)]) {
      if (o.state !== 'free') continue;
      const d = dist(o.x, o.z, p.x, p.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private tryFend(c: P, d: P) {
    const chance = clamp(0.35 + (c.r.strength - d.r.strength) / 90 + (c.side === 0 ? this.userAssist() : -this.userAssist()), 0.1, 0.85);
    if (rand.chance(chance)) {
      d.state = 'down';
      d.timer = 1.1;
      d.vx = (d.x - c.x) * 2;
      d.vz = (d.z - c.z) * 2;
      this.say('Big hand-off!', c.side === 0 ? 'good' : 'bad');
      audio.thud(0.6);
    }
  }

  private userAssist() {
    return { easy: 0.12, medium: 0.03, hard: -0.04 }[this.cfg.difficulty];
  }

  // ---------------------------------------------------------------- tackles
  private attemptTackle(t: P, c: P, dive: boolean) {
    t.tackleCD = 0.5;
    const evasion = c.r.strength * 0.45 + c.r.pace * 0.3 + c.r.handling * 0.25;
    let p = 0.62 + (t.r.tackling - evasion) / 110;
    if (dive) p += 0.08;
    if (c.handoffT > 0) p -= 0.12 + (c.r.strength - t.r.strength) / 200;
    if (c.sidestepT > 0) p -= 0.2 * (c.r.pace / 90);
    p += t.side === 0 ? this.userAssist() + 0.08 : -this.userAssist();
    p = clamp(p, 0.15, 0.95);
    if (rand.chance(p)) {
      this.tackleMade(t, c);
    } else {
      t.state = 'down';
      t.timer = dive ? 1.2 : 0.7;
      if (rand.chance(0.6)) this.say(line('brokenTackle'), c.side === 0 ? 'good' : 'bad');
    }
  }

  private tackleMade(t: P, c: P) {
    const speed = Math.hypot(t.vx, t.vz) + Math.hypot(c.vx, c.vz);
    const big = t.r.tackling > 78 && (speed > 9 || rand.chance(0.2));
    if (t.side === 0) this.stats.tackles++;
    audio.thud(big ? 1 : 0.7);
    if (t.side === 0 || c.side === 0) haptic(big ? 'bighit' : 'tackle');
    if (big) this.say(line('bigHit'), t.side === 0 ? 'good' : 'bad');
    c.state = 'down';
    c.timer = 2.5;
    c.vx *= 0.3;
    c.vz *= 0.3;
    t.state = 'down';
    t.timer = 1.2;
    this.lineBreakFrom = null;
    this.setPlay = null;

    if (this.cfg.drill === 'tackling') {
      this.drillScore++;
      this.say('Tackle made!', 'good');
      this.after(1.2, () => this.drillNext());
      this.phase = 'dead';
      return;
    }
    if (this.cfg.drill === 'passing') {
      this.after(1, () => this.drillNext());
      this.phase = 'dead';
      return;
    }

    // High tackle
    if (rand.chance(0.03)) {
      this.whistle();
      this.say('High tackle!', t.side === 0 ? 'bad' : 'good', `Penalty ${this.teamShort(c.side)}`);
      const x = c.x;
      const z = c.z;
      this.stoppage(() => this.awardPenalty(c.side, x, z));
      return;
    }
    // Knock-on in contact
    if (rand.chance(0.05 * (1.4 - c.r.handling / 100))) {
      this.knockOn(c);
      return;
    }
    // Held up by big forwards -> maul
    if (c.num <= 8 && c.r.strength > 72 && rand.chance(0.18)) {
      c.state = 'free';
      t.state = 'free';
      this.startMaul(c.x, c.z, c.side, c);
      return;
    }
    this.startRuck(c, t);
  }

  // ---------------------------------------------------------------- passing
  private doPass(passer: P, long: boolean, dirHint: -1 | 0 | 1): boolean {
    const d = dirOf(passer.side);
    const mates = this.teams[passer.side].filter((p) => p !== passer && p.state === 'free');
    let side = 0;
    if (dirHint !== 0) side = dirHint * this.camRightSign();
    else if (passer === this.controlled && Math.abs(this.input.moveX) > 0.3) side = Math.sign(this.input.moveX) * this.camRightSign();
    let target: P | undefined;
    // Set play override
    if (this.setPlay && passer.side === 0) {
      while (this.setPlay.targets.length && this.setPlay.targets[0].state !== 'free') this.setPlay.targets.shift();
      target = this.setPlay.targets.shift();
    }
    if (!target) {
      const pick = (s: number) => {
        const c = mates
          .filter((p) => (p.z - passer.z) * s > 1.2 && (p.x - passer.x) * d < 2.5 && dist(p.x, p.z, passer.x, passer.z) < 30)
          .sort((a, b) => Math.abs(a.z - passer.z) - Math.abs(b.z - passer.z));
        if (!c.length) return undefined;
        if (!long) return c[0];
        const farther = c.filter((p) => Math.abs(p.z - passer.z) > 8);
        return farther[Math.min(1, farther.length - 1)] ?? c[c.length - 1];
      };
      if (side !== 0) target = pick(side);
      if (!target) {
        // pick the side with more support space
        const sOpen = passer.z < 0 ? 1 : -1;
        target = pick(sOpen) ?? pick(-sOpen);
      }
    }
    if (!target) return false;
    const distTo = dist(passer.x, passer.z, target.x, target.z);
    const speed = long ? 19 : 14;
    const T = clamp(distTo / speed, 0.25, 1.6);
    // aim at where the receiver will be
    let tx = target.x + target.vx * T;
    let tz = target.z + target.vz * T;
    let err = (1 - passer.r.passing / 100) * (long ? 2.6 : 1.4);
    if (passer.side === 0) err *= { easy: 0.4, medium: 0.8, hard: 1 }[this.cfg.difficulty];
    tx += rand.range(-err, err) * 0.6;
    tz += rand.range(-err, err);
    const forward = (tx - passer.x) * d > 1.2;
    this.ball.state = 'pass';
    this.ball.carrier = null;
    this.ball.pass = { fx: passer.x, fz: passer.z, tx, tz, t: 0, T, peak: long ? 1.4 : 0.6, target, passer, long, forward };
    this.ball.lastSide = passer.side;
    this.atBaseT = -1;
    passer.kickT = 0.2;
    if (passer.side === 0) this.controlled = target;
    return true;
  }

  private updatePass(dt: number) {
    const b = this.ball;
    const f = b.pass!;
    f.t += dt;
    const u = Math.min(1, f.t / f.T);
    b.x = f.fx + (f.tx - f.fx) * u;
    b.z = f.fz + (f.tz - f.fz) * u;
    b.y = 1.1 + Math.sin(u * Math.PI) * f.peak;
    // steer the intended receiver onto the ball
    if (f.target.state === 'free' && !(f.target === this.controlled && Math.hypot(this.input.moveX, this.input.moveY) > 0.12)) {
      f.target.tx = f.tx;
      f.target.tz = f.tz;
      f.target.urgency = 1;
    }
    if (u < 1) return;
    // arrival: who can catch it?
    const reach = 1.7;
    const cands = this.players
      .filter((p) => p.state === 'free' && dist(p.x, p.z, b.x, b.z) < reach)
      .sort((p, q) => dist(p.x, p.z, b.x, b.z) - dist(q.x, q.z, b.x, b.z));
    const recv = cands.includes(f.target) ? f.target : cands[0];
    if (!recv) {
      // nobody there: ball falls loose
      const vx = (f.tx - f.fx) / f.T;
      const vz = (f.tz - f.fz) / f.T;
      this.looseBall(b.x, b.y, b.z, vx * 0.5, 0, vz * 0.5);
      return;
    }
    if (recv.side !== f.passer.side) {
      if (rand.chance(0.45)) {
        this.say(line('intercept'), recv.side === 0 ? 'good' : 'bad');
        this.giveBall(recv);
        return;
      }
      this.looseBall(b.x, b.y, b.z, 0, 1, 0);
      return;
    }
    if (f.forward && !this.cfg.drill) {
      this.whistle();
      this.say(line('forward'), recv.side === 0 ? 'bad' : 'good', `Scrum ${this.teamShort(other(recv.side))}`);
      const x = b.x;
      const z = b.z;
      this.stoppage(() => this.setupScrum(x, z, other(recv.side)));
      this.phase = 'dead';
      b.state = 'dead';
      return;
    }
    const pressure = this.nearestOpponent(recv, 2) ? 0.06 : 0;
    let pc = 0.95 + (recv.r.handling - 75) / 300 - (f.long ? 0.04 : 0) - pressure;
    if (recv.side === 0) pc += this.userAssist();
    if (rand.chance(clamp(pc, 0.6, 0.995)) || this.cfg.drill === 'passing') {
      if (recv.side === 0) this.stats.passes++;
      this.giveBall(recv);
      if (this.cfg.drill === 'passing') {
        this.drillScore++;
        this.emit({ type: 'drill', text: 'Keep it moving — pass left and right', progress: `${this.drillScore} / 10 passes` });
        if (this.drillScore >= 10) this.finishDrill(10);
      }
    } else {
      this.knockOn(recv);
    }
  }

  private giveBall(p: P) {
    const b = this.ball;
    const changed = b.lastSide !== p.side;
    b.state = 'held';
    b.carrier = p;
    b.pass = null;
    b.goalCheck = null;
    b.lastSide = p.side;
    if (this.phase === 'kickoff') this.phase = 'play';
    if (changed) {
      this.assignSlots();
      this.setPlay = null;
    }
    if (p.side === 0) this.controlled = p;
  }

  private knockOn(p: P) {
    this.whistle();
    this.say(line('knockOn'), p.side === 0 ? 'bad' : 'good', `Scrum ${this.teamShort(other(p.side))}`);
    const b = this.ball;
    b.state = 'dead';
    b.carrier = null;
    const x = p.x;
    const z = p.z;
    this.phase = 'dead';
    if (this.cfg.drill) {
      this.after(1.2, () => this.drillNext());
      return;
    }
    this.stoppage(() => this.setupScrum(x, z, other(p.side)));
  }

  // ---------------------------------------------------------------- kicking
  private kickVelocity(power: number, aim: number, side: Side, type: 'punt' | 'grubber' | 'box') {
    const d = dirOf(side);
    const hx = Math.cos(aim) * d;
    const hz = Math.sin(aim);
    let vh: number;
    let vy: number;
    if (type === 'grubber') {
      vh = 9 + power * 10;
      vy = 2;
    } else if (type === 'box') {
      vh = 9 + power * 4;
      vy = 17;
    } else {
      vh = 12 + power * 17;
      vy = 8 + power * 9;
    }
    return { vx: hx * vh, vy, vz: hz * vh };
  }

  private doKick(p: P, power: number, aim: number, type: 'punt' | 'grubber' | 'box') {
    const v = this.kickVelocity(power, aim, p.side, type);
    const b = this.ball;
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
    b.wind = true;
    b.goalCheck = type === 'punt' ? { side: p.side, kind: 'drop' } : null;
    p.kickT = 0.4;
    this.atBaseT = -1;
    audio.kick();
    for (const pl of this.players) pl.catchCD = pl === p ? 1.2 : 0.35;
    this.setPlay = null;
  }

  private looseBall(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const b = this.ball;
    Object.assign(b, { x, y, z, vx, vy, vz, state: 'air', carrier: null, pass: null, bounced: false, wind: false, goalCheck: null });
    b.kicker = null;
  }

  private predictLanding(): { x: number; z: number } {
    const b = this.ball;
    if (b.state === 'ground') return { x: b.x, z: b.z };
    // y(t) = y + vy t - g/2 t^2 = 1.2  (catch height)
    const a = -G / 2;
    const c0 = b.y - 1.2;
    const disc = b.vy * b.vy - 4 * a * c0;
    const t = disc > 0 ? (-b.vy - Math.sqrt(disc)) / (2 * a) : 0.2;
    return { x: clamp(b.x + b.vx * t, -58, 58), z: clamp(b.z + b.vz * t, -34, 34) };
  }

  private updateBallPhysics(dt: number) {
    const b = this.ball;
    const px = b.x;
    const py = b.y;
    const pz = b.z;
    if (b.state === 'air') {
      b.vy -= G * dt;
      if (b.wind) {
        b.vx += this.wind.x * 0.05 * dt;
        b.vz += this.wind.z * 0.05 * dt;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.y <= 0.12) {
        b.y = 0.12;
        if (Math.abs(b.vy) > 2.5) {
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
      const fr = Math.max(0, 1 - dt * 1.6);
      b.vx *= fr;
      b.vz *= fr;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
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
        this.goalResult(gc.side, gc.kind, good);
        if (gc.kind !== 'drop' || good) return;
      }
    }
    if (this.phase !== 'play' && this.phase !== 'kickoff') return;

    // touch
    if (Math.abs(b.z) > FIELD.halfW) {
      const kicker = b.kicker;
      const throwSide = other(b.lastSide);
      let x = b.x;
      if (kicker && !b.bounced && kicker.x * dirOf(kicker.side) > -28) x = b.kickFromX; // out on the full
      this.whistle();
      this.say('Ball in touch', 'info', `Lineout ${this.teamShort(throwSide)}`);
      const sign = Math.sign(b.z);
      b.state = 'dead';
      this.stoppage(() => this.setupLineout(x, sign, throwSide));
      return;
    }
    // dead ball
    if (Math.abs(b.x) > FIELD.deadX) {
      const restartSide = other(b.lastSide);
      this.whistle();
      this.say('Dead ball', 'info', '22m drop-out');
      b.state = 'dead';
      this.stoppage(() => this.setupKickoff(restartSide, -dirOf(restartSide) * 28));
      return;
    }
    // catch / gather
    const catchH = b.state === 'ground' ? 0.6 : 2.6;
    if (b.y > catchH) return;
    let best: P | null = null;
    let bd = 1.3;
    for (const p of this.players) {
      if (p.state !== 'free' || p.catchCD > 0) continue;
      const d = dist(p.x, p.z, b.x, b.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) return;
    const p = best;
    if (b.state === 'air') {
      let pc = 0.86 + (p.r.handling - 70) / 200;
      if (p.side === 0) pc += this.userAssist();
      if (!rand.chance(clamp(pc, 0.55, 0.98))) {
        p.catchCD = 0.6;
        if (rand.chance(0.6) && !this.cfg.drill) {
          this.knockOn(p);
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
      this.giveBall(p);
      this.scoreTry(p);
      return;
    }
    if (p.x * d <= -FIELD.tryX) {
      this.giveBall(p);
      this.whistle();
      this.say('Touched down', 'info', '22m drop-out');
      this.stoppage(() => this.setupKickoff(p.side, -d * 28));
      return;
    }
    this.giveBall(p);
  }

  // ---------------------------------------------------------------- scoring
  private scoreTry(c: P) {
    const side = c.side;
    this.score[side] += 5;
    this.tries[side]++;
    if (side === 0) this.stats.tries++;
    this.phase = 'dead';
    this.ball.state = 'dead';
    c.state = 'down';
    c.timer = 2;
    this.whistle();
    audio.cheer(side === 0 ? 1.2 : 0.7);
    haptic('try');
    this.say(line('try'), side === 0 ? 'big' : 'bad', `${c.name} scores for ${this.teamShort(side)}`);
    this.emit({ type: 'hud', hud: this.hud() });
    if (this.cfg.drill) {
      this.after(2, () => this.drillNext());
      return;
    }
    const z = clamp(c.z, -30, 30);
    this.after(2.6, () => this.setupPlaceKick(side, 'conversion', dirOf(side) * (FIELD.tryX - 12 - Math.abs(z) * 0.1), z));
  }

  private goalResult(side: Side, kind: 'drop' | 'conversion' | 'penalty' | 'drill', good: boolean) {
    if (kind === 'drop') {
      if (!good) return;
      this.score[side] += 3;
      if (side === 0) this.stats.dropGoals++;
      this.whistle();
      audio.cheer(1);
      this.say('DROP GOAL!', side === 0 ? 'big' : 'bad', '+3');
      this.phase = 'dead';
      this.ball.state = 'dead';
      this.stoppage(() => this.setupKickoff(other(side), 0));
      return;
    }
    if (kind === 'drill') {
      if (good) this.drillScore++;
      this.say(good ? 'Over!' : 'Missed', good ? 'good' : 'bad');
      this.after(1.6, () => this.drillNext());
      return;
    }
    if (good) {
      const pts = kind === 'conversion' ? 2 : 3;
      this.score[side] += pts;
      if (side === 0 && kind === 'conversion') this.stats.conversions++;
      if (side === 0 && kind === 'penalty') this.stats.penalties++;
      audio.cheer(0.6);
      this.say(kind === 'conversion' ? 'Conversion good!' : 'Penalty goal!', side === 0 ? 'good' : 'bad', `+${pts}`);
    } else {
      this.say(rand.pick(['Wide!', 'Missed!', 'Off the post!']), side === 0 ? 'bad' : 'good');
    }
    this.emit({ type: 'placekickDone' });
    this.emit({ type: 'hud', hud: this.hud() });
    this.stoppage(() => {
      this.camMode = 'game';
      this.setupKickoff(other(side), 0);
    }, 1.8);
  }

  // ---------------------------------------------------------------- stoppages & time
  private whistle() {
    audio.whistle();
  }

  /** Ball is dead: end the half if time is up, otherwise run the restart. */
  private stoppage(next: () => void, delay = 1.4) {
    this.phase = 'dead';
    this.setPlay = null;
    this.offsideLine.visible = false;
    if (this.cfg.drill === 'passing' || this.cfg.drill === 'tackling') {
      this.after(delay, () => this.drillNext());
      return;
    }
    this.after(delay, () => {
      if (this.timeUp()) this.endHalf();
      else next();
    });
  }

  private endHalf() {
    audio.whistle(true);
    this.emit({ type: 'minigameCancel' });
    if (this.half === 1) {
      this.phase = 'halftime';
      this.say('Half time', 'info', `${this.teamShort(0)} ${this.score[0]} - ${this.score[1]} ${this.teamShort(1)}`);
      this.emit({ type: 'halftime' });
    } else {
      this.phase = 'fulltime';
      if (this.ended) return;
      this.ended = true;
      this.say('Full time!', 'big');
      audio.cheer(1);
      this.emit({ type: 'end', result: this.result() });
    }
  }

  continueSecondHalf() {
    this.half = 2;
    this.gameSec = 0;
    this.setupKickoff(other(this.firstKicker), 0);
  }

  private result(): EngineResult {
    return { userScore: this.score[0], cpuScore: this.score[1], userTries: this.tries[0], cpuTries: this.tries[1], user: { ...this.stats } };
  }

  /** Used by "Quit" to finish early. */
  forfeitResult(): EngineResult {
    return this.result();
  }

  private teamShort(s: Side) {
    return s === 0 ? this.cfg.user.short : this.cfg.cpu.short;
  }

  // ---------------------------------------------------------------- restarts
  private resetStates() {
    for (const p of this.players) {
      if (p.state !== 'off') p.state = 'free';
      p.timer = 0;
      p.diveT = 0;
      p.vx = p.vz = 0;
    }
    this.ruck = null;
    this.maul = null;
    this.setPlay = null;
    this.atBaseT = -1;
    this.offsideLine.visible = false;
    this.lineBreakFrom = null;
  }

  private place(p: P, x: number, z: number) {
    p.x = p.tx = x;
    p.z = p.tz = z;
    p.vx = p.vz = 0;
    p.heading = p.side === 0 ? 0 : Math.PI;
  }

  private setupKickoff(kickSide: Side, atX: number) {
    this.resetStates();
    this.camMode = 'game';
    const dk = dirOf(kickSide);
    const recv = other(kickSide);
    const kicker = this.teams[kickSide][9];
    this.teams[kickSide].forEach((p, i) => {
      if (p === kicker) this.place(p, atX - dk * 3, 0);
      else this.place(p, atX - dk * (1 + (i % 2)), -30 + (i * 60) / 14);
    });
    const recvForwards = this.teams[recv].slice(0, 8);
    const recvBacks = this.teams[recv].slice(8);
    recvForwards.forEach((p, i) => this.place(p, atX + dk * (13 + (i % 3) * 3), -20 + i * 6));
    recvBacks.forEach((p, i) => this.place(p, atX + dk * (24 + (i % 3) * 7), -28 + i * 8));
    const b = this.ball;
    b.state = 'held';
    b.carrier = kicker;
    b.lastSide = kickSide;
    this.phase = 'dead';
    this.controlled = null;
    this.autoControl();
    this.after(1.2, () => {
      this.whistle();
      this.after(0.6, () => {
        const target = { x: atX + dk * rand.range(14, 22), z: rand.range(-18, 18) };
        // Solve for a high kick landing at the target in ~3 s.
        const T = 3;
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
        b.goalCheck = null;
        kicker.kickT = 0.4;
        for (const pl of this.players) pl.catchCD = kickSide === pl.side ? 0.8 : 0;
        audio.kick();
        this.phase = 'kickoff';
        this.phaseT = 0;
      });
    });
  }

  private nineOf(side: Side, nx: number, nz: number): P {
    const nine = this.teams[side][8];
    if (nine.state === 'free') return nine;
    const free = this.teams[side].filter((p) => p.state === 'free');
    free.sort((a, b) => dist(a.x, a.z, nx, nz) - dist(b.x, b.z, nx, nz));
    return free[0] ?? nine;
  }

  /** Puts the ball in the scrum-half's hands at the base and restarts open play. */
  private ballToNine(side: Side, x: number, z: number) {
    const d = dirOf(side);
    const nx = x - d * 1.2;
    const nine = this.nineOf(side, nx, z);
    nine.state = 'free';
    this.place(nine, nx, z + 0.6);
    this.giveBall(nine);
    this.ball.lastSide = side;
    this.atBaseT = 0;
    this.phase = 'play';
    this.phaseT = 0;
    this.assignSlots();
    // defenders retreat behind the offside line
    const od = dirOf(other(side));
    for (const p of this.teams[other(side)]) {
      if ((p.x - x) * -od < 2 && p.state === 'free') p.x = x + d * 2 + rand.range(0, 1.5);
    }
    if (side === 1 || this.controlled?.side !== 0) {
      this.controlled = null;
      this.autoControl();
    }
  }

  // ---------------------------------------------------------------- ruck
  private startRuck(c: P, t: P) {
    const att = c.side;
    const d = dirOf(att);
    const x = c.x;
    const z = c.z;
    this.phase = 'ruck';
    this.phaseT = 0;
    this.ruck = { x, z, att, t: 0, dur: 2.1 };
    const b = this.ball;
    b.carrier = null;
    b.state = 'dead';
    b.x = x - d * 0.6;
    b.y = 0.12;
    b.z = z;
    // Two from each side join the ruck.
    const join = (side: Side, off: number) => {
      const cands = this.teams[side].filter((p) => p.state === 'free' && p !== this.controlled).sort((p, q) => dist(p.x, p.z, x, z) - dist(q.x, q.z, x, z));
      cands.slice(0, 2).forEach((p, i) => {
        p.state = 'bound';
        p.tx = x + off;
        p.tz = z + (i ? 0.45 : -0.45);
        p.urgency = 1;
      });
    };
    join(att, -d * 1.1);
    join(other(att), d * 1.1);
    void t;
    this.offsideLine.visible = true;
    // User line is always the user's team hindmost foot.
    this.offsideLine.position.x = att === 0 ? x - 1.6 : x + 1.6;
    this.positionAroundBreakdown(x, z, att);
    const uc = this.controlled;
    if (att === 1 && uc && uc.state === 'free' && (uc.x - x) * d < -1 && Math.abs(uc.z - z) < 8) this.say('Get back onside!', 'info', 'Stay behind the yellow line');
    // Non-blocking timing bar: secure (attack) or jackal (defence)
    this.requestMini(att === 0 ? 'ruck' : 'counterRuck', false, 1.7);
  }

  private positionAroundBreakdown(x: number, z: number, att: Side) {
    const d = dirOf(att);
    const proxyX = x - d * 1.2;
    for (const p of this.teams[att]) {
      if (p.state !== 'free' || p === this.controlled && this.isUserDriving(p)) continue;
      if (p.num === 9) {
        p.tx = proxyX;
        p.tz = z + 0.6;
        p.urgency = 1;
        continue;
      }
      const t = this.attackSlotTarget(p, proxyX, z, att);
      p.tx = t.x - d * 1.5;
      p.tz = t.z;
      p.urgency = 0.9;
    }
    this.assignSlots();
    const defs = this.teams[other(att)].filter((p) => p.state === 'free' && !(p === this.controlled && this.isUserDriving(p))).sort((p, q) => p.z - q.z);
    defs.forEach((p, i) => {
      if (p.num === 15) {
        p.tx = clamp(x + d * 20, -48, 48);
        p.tz = z * 0.5;
      } else {
        p.tx = x + d * 2.5;
        p.tz = clamp(z + (i - defs.length / 2) * 4.6, -33, 33);
      }
      p.urgency = 0.95;
    });
  }

  private updateRuck(dt: number) {
    const r = this.ruck!;
    r.t += dt;
    this.positionAroundBreakdown(r.x, r.z, r.att);
    const miniDone = !this.activeMini || this.activeMini.done;
    if (r.t >= r.dur && (miniDone || r.t > r.dur + 1.2)) this.resolveRuck();
  }

  private resolveRuck() {
    const r = this.ruck!;
    this.ruck = null;
    this.offsideLine.visible = false;
    const q = this.activeMini && this.activeMini.kind.match(/uck/i) ? this.activeMini.q : null;
    this.emit({ type: 'minigameCancel' });
    this.activeMini = null;
    const att = r.att;
    const def = other(att);
    let pTurn = 0.06;
    if (def === 1) pTurn += { easy: -0.03, medium: 0.01, hard: 0.05 }[this.cfg.difficulty];
    if (att === 0 && q !== null) pTurn = q > 0.7 ? 0.01 : q < 0.3 ? pTurn + 0.12 : pTurn;
    if (att === 1 && q !== null) pTurn = q > 0.7 ? 0.38 : q < 0.3 ? 0.03 : pTurn;
    // penalties at the breakdown
    if (att === 1 && q !== null && q > 0.9 && rand.chance(0.35)) {
      this.whistle();
      this.say('Holding on!', 'good', `Penalty ${this.teamShort(0)}`);
      this.stoppage(() => this.awardPenalty(0, r.x, r.z));
      return;
    }
    const cpuOff = { easy: 0.06, medium: 0.035, hard: 0.02 }[this.cfg.difficulty];
    if (att === 0 && rand.chance(cpuOff)) {
      this.whistle();
      this.say('Offside!', 'good', `Penalty ${this.teamShort(0)}`);
      this.stoppage(() => this.awardPenalty(0, r.x, r.z));
      return;
    }
    if (att === 1 && this.controlled && this.controlled.state === 'free') {
      const c = this.controlled;
      const wrongSide = (c.x - r.x) * dirOf(att) < -1.5;
      if (wrongSide && Math.abs(c.z - r.z) < 5 && Math.hypot(this.input.moveX, this.input.moveY) > 0.2 && rand.chance(0.6)) {
        this.whistle();
        this.say('Offside!', 'bad', `Penalty ${this.teamShort(1)}`);
        this.stoppage(() => this.awardPenalty(1, r.x, r.z));
        return;
      }
    }
    const winner = rand.chance(pTurn) ? def : att;
    if (winner !== att) {
      this.say(line('turnover'), winner === 0 ? 'good' : 'bad');
      haptic('tackle');
    }
    // Time up: the team in possession kicks it dead if it's not behind.
    if (this.timeUp() && this.score[winner] >= this.score[other(winner)]) {
      this.endHalf();
      return;
    }
    for (const p of this.players) if (p.state === 'bound') {
      p.state = 'down';
      p.timer = 0.35;
    }
    this.ballToNine(winner, r.x, r.z);
  }

  // ---------------------------------------------------------------- maul
  private startMaul(x: number, z: number, att: Side, carrier: P) {
    this.phase = 'maul';
    this.phaseT = 0;
    const cpuPush = { easy: 1.3, medium: 1.9, hard: 2.4 }[this.cfg.difficulty] + (this.teamStrength(1) - 75) / 25;
    this.maul = { x, z, att, t: 0, dur: 3.4, start: x, carrier, cpuPush, userPush: 0 };
    const b = this.ball;
    b.carrier = carrier;
    b.state = 'held';
    b.lastSide = att;
    carrier.state = 'bound';
    this.say('Maul!', 'info');
    this.requestMini(att === 0 ? 'maul' : 'maulDefend', false, 3);
    this.bindMaul();
  }

  private teamStrength(side: Side) {
    const f = this.teams[side].slice(0, 8);
    return f.reduce((s, p) => s + p.r.strength, 0) / f.length;
  }

  private bindMaul() {
    const m = this.maul!;
    const d = dirOf(m.att);
    const pick = (side: Side, n: number) =>
      this.teams[side]
        .filter((p) => p.state === 'free' && p !== m.carrier)
        .sort((p, q) => dist(p.x, p.z, m.x, m.z) - dist(q.x, q.z, m.x, m.z))
        .slice(0, n);
    pick(m.att, 3).forEach((p) => (p.state = 'bound'));
    pick(other(m.att), 3).forEach((p) => (p.state = 'bound'));
    void d;
  }

  private updateMaul(dt: number) {
    const m = this.maul!;
    m.t += dt;
    const d = dirOf(m.att);
    // user taps push their way; CPU pushes with a steady force
    m.userPush *= Math.max(0, 1 - dt * 2.2);
    const user = m.userPush;
    const cpu = m.cpuPush * (0.8 + Math.sin(m.t * 3) * 0.2);
    const strDiff = (this.teamStrength(m.att) - this.teamStrength(other(m.att))) / 30;
    let v = (m.att === 0 ? user - cpu : cpu - user) * 0.55 + strDiff + 0.3;
    v = clamp(v, -2, 2.6);
    m.x += d * v * dt;
    // arrange bound players around the maul
    let ia = 0;
    let idf = 0;
    for (const p of this.players) {
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
    this.positionAroundBreakdown(m.x, m.z, m.att);
    if (m.x * d >= FIELD.tryX) {
      this.maul = null;
      for (const p of this.players) if (p.state === 'bound') p.state = 'free';
      this.say('Driven over!', 'info');
      this.scoreTry(m.carrier);
      return;
    }
    if (m.t >= m.dur) {
      this.maul = null;
      this.emit({ type: 'minigameCancel' });
      this.activeMini = null;
      const gain = (m.x - m.start) * d;
      for (const p of this.players) if (p.state === 'bound') {
        p.state = 'down';
        p.timer = 0.4;
      }
      if (gain < -0.5 || rand.chance(0.12)) {
        this.whistle();
        this.say('Maul held up', m.att === 0 ? 'bad' : 'good', `Scrum ${this.teamShort(other(m.att))}`);
        this.stoppage(() => this.setupScrum(m.x, m.z, other(m.att)));
        return;
      }
      if (gain > 3) this.say(`Maul drives ${Math.round(gain)}m!`, m.att === 0 ? 'good' : 'bad');
      if (this.timeUp() && this.score[m.att] >= this.score[other(m.att)]) {
        this.endHalf();
        return;
      }
      this.ballToNine(m.att, m.x, m.z);
    }
  }

  // ---------------------------------------------------------------- mini-games
  private requestMini(kind: MiniGameKind, blocking: boolean, duration: number, after?: (q: number) => void) {
    const id = ++this.miniId;
    this.activeMini = { id, kind, q: null, taps: 0, done: false };
    if (blocking) this.waitingBlocking = true;
    this.emit({
      type: 'minigame',
      req: {
        id,
        kind,
        blocking,
        duration,
        resolve: (q) => {
          const am = this.activeMini;
          if (!am || am.id !== id || am.done) return;
          am.q = q;
          am.done = true;
          if (blocking) this.waitingBlocking = false;
          after?.(q);
        },
        onTap: () => {
          if (this.maul) this.maul.userPush += 0.55;
        },
      },
    });
  }

  // ---------------------------------------------------------------- scrum
  private setupScrum(x: number, z: number, feed: Side) {
    this.resetStates();
    const mx = clamp(x, -44, 44);
    const mz = clamp(z, -29, 29);
    this.phase = 'scrum';
    this.camMode = 'setpiece';
    const ball = this.ball;
    ball.state = 'dead';
    ball.carrier = null;
    ball.x = mx;
    ball.z = mz + 0.8;
    ball.y = 0.3;
    for (const side of [0, 1] as Side[]) {
      const d = dirOf(side);
      const t = this.teams[side];
      const pack: [number, number][] = [
        [-0.7, -0.6], [-0.7, 0], [-0.7, 0.6], [-1.8, -0.3], [-1.8, 0.3], [-1.9, -1.0], [-1.9, 1.0], [-2.9, 0],
      ];
      pack.forEach(([ox, oz], i) => {
        this.place(t[i], mx + d * ox, mz + oz);
        t[i].state = 'bound';
      });
      this.place(t[8], mx - d * (side === feed ? 0.3 : 0.8), mz + (side === feed ? 1.5 : 1.2));
      const open = mz < 0 ? 1 : -1;
      [9, 11, 12, 13, 10].forEach((idx, k) => {
        const p = t[idx];
        const zz = clamp(mz + open * (6 + k * 6.5), -33, 33);
        this.place(p, mx - d * (8 + k * 1.5), zz);
      });
      this.place(t[14], mx - d * 22, mz * 0.3);
    }
    this.controlled = this.teams[0][8];
    this.say('Scrum', 'info', `${this.teamShort(feed)} put-in`);
    if (this.cfg.drill === 'setpieces') this.emit({ type: 'drill', text: 'Scrum: tap on SET when the marker is in the green', progress: `Set piece ${this.drillStage + 1} / 4` });
    this.after(0.8, () =>
      this.requestMini(feed === 0 ? 'scrum' : 'scrumDefend', true, 0, (q) => this.resolveScrum(feed, mx, mz, q)),
    );
  }

  private resolveScrum(feed: Side, x: number, z: number, q: number) {
    audio.thud(0.8);
    haptic('tackle');
    if (this.cfg.drill === 'setpieces') {
      const ok = q > 0.6;
      if (ok) this.drillScore++;
      this.say(ok ? 'Scrum won!' : 'Scrum wheeled', ok ? 'good' : 'bad');
      this.after(1.6, () => this.drillNext());
      return;
    }
    let winner: Side = feed;
    if (feed === 0) {
      if (q < 0.12 && rand.chance(0.5)) {
        this.whistle();
        this.say('Early engagement', 'bad', `Penalty ${this.teamShort(1)}`);
        this.stoppage(() => this.awardPenalty(1, x, z));
        return;
      }
      if (q > 0.9 && rand.chance(0.3)) {
        this.whistle();
        this.say('Scrum penalty!', 'good', `Penalty ${this.teamShort(0)}`);
        this.stoppage(() => this.awardPenalty(0, x, z));
        return;
      }
      if (!rand.chance(0.72 + q * 0.27)) winner = 1;
    } else {
      if (q > 0.9 && rand.chance(0.3)) {
        this.whistle();
        this.say('Scrum penalty!', 'good', `Penalty ${this.teamShort(0)}`);
        this.stoppage(() => this.awardPenalty(0, x, z));
        return;
      }
      if (q < 0.12 && rand.chance(0.4)) {
        this.whistle();
        this.say('Collapsed scrum', 'bad', `Penalty ${this.teamShort(1)}`);
        this.stoppage(() => this.awardPenalty(1, x, z));
        return;
      }
      if (rand.chance(q > 0.7 ? 0.3 : 0.04)) winner = 0;
    }
    if (winner !== feed) this.say('Against the head!', winner === 0 ? 'good' : 'bad');
    this.after(0.4, () => {
      this.camMode = 'game';
      for (const p of this.players) if (p.state === 'bound') {
        p.state = 'down';
        p.timer = 0.5;
      }
      this.ballToNine(winner, x - dirOf(winner) * 2.4, z);
    });
  }

  // ---------------------------------------------------------------- lineout
  private setupLineout(x: number, touchSign: number, throwSide: Side) {
    this.resetStates();
    const lx = clamp(x, -44, 44);
    const s = touchSign || 1;
    this.phase = 'lineout';
    this.camMode = 'setpiece';
    const ball = this.ball;
    ball.state = 'dead';
    ball.carrier = null;
    for (const side of [0, 1] as Side[]) {
      const d = dirOf(side);
      const t = this.teams[side];
      const jumpers = [0, 2, 3, 4, 5, 6, 7];
      jumpers.forEach((idx, k) => this.place(t[idx], lx - d * 0.6, s * (30 - k * 1.4)));
      if (side === throwSide) this.place(t[1], lx, s * 35.6);
      else this.place(t[1], lx - d * 1.5, s * 32);
      this.place(t[8], lx - d * 2, s * 19);
      [9, 11, 12, 13, 10].forEach((idx, k) => this.place(t[idx], lx - d * (10 + k * 1.2), s * (16 - k * 7)));
      this.place(t[14], lx - d * 25, 0);
    }
    ball.x = lx;
    ball.z = s * 35.6;
    ball.y = 1.3;
    this.controlled = this.teams[0][1];
    this.say('Lineout', 'info', `${this.teamShort(throwSide)} throw`);
    if (this.cfg.drill === 'setpieces') this.emit({ type: 'drill', text: 'Lineout: time your throw to hit the jumper', progress: `Set piece ${this.drillStage + 1} / 4` });
    this.after(0.8, () =>
      this.requestMini(throwSide === 0 ? 'lineout' : 'lineoutDefend', true, 0, (q) => this.resolveLineout(throwSide, lx, s, q)),
    );
  }

  private resolveLineout(throwSide: Side, x: number, s: number, q: number) {
    if (this.cfg.drill === 'setpieces') {
      const ok = q > 0.6;
      if (ok) this.drillScore++;
      this.say(ok ? 'Clean take!' : 'Not straight', ok ? 'good' : 'bad');
      this.after(1.6, () => this.drillNext());
      return;
    }
    const pWin = throwSide === 0 ? 0.55 + 0.42 * q : 1 - (0.92 - 0.5 * q);
    const winner: Side = rand.chance(pWin) ? 0 : 1;
    if (winner !== throwSide) this.say('Lineout stolen!', winner === 0 ? 'good' : 'bad');
    const jumper = this.teams[winner][3];
    // lift the jumper briefly
    jumper.model.root.position.y = 1.2;
    const d = dirOf(winner);
    const distToLine = FIELD.tryX - x * d;
    this.after(0.6, () => {
      this.camMode = 'game';
      jumper.model.root.position.y = 0;
      // Close to the line, the winners set up a driving maul.
      if (winner === throwSide && distToLine < 22 && rand.chance(0.55)) {
        this.resetStates();
        const carrier = this.teams[winner][1];
        this.place(carrier, x, s * 26);
        this.startMaul(x, s * 26, winner, carrier);
        return;
      }
      this.ballToNine(winner, x - d * 1, s * 24);
    });
  }

  // ---------------------------------------------------------------- penalties
  private awardPenalty(side: Side, x: number, z: number) {
    this.resetStates();
    const d = dirOf(side);
    const px = clamp(x, -45, 45);
    const pz = clamp(z, -30, 30);
    const goalDist = dist(px, pz, d * FIELD.tryX, 0);
    const canKick = goalDist < 52 && px * d > -10;
    this.phase = 'dead';
    // set the teams 10m apart
    const holder = this.teams[side][9];
    this.teams[side].forEach((p, i) => this.place(p, px - d * (2 + (i % 4) * 2), clamp(pz - 20 + i * 3, -33, 33)));
    this.teams[other(side)].forEach((p, i) => this.place(p, px + d * 10, clamp(pz - 25 + i * 3.6, -33, 33)));
    this.place(holder, px, pz);
    this.ball.state = 'held';
    this.ball.carrier = holder;
    this.ball.lastSide = side;
    const go = (c: PenaltyChoice) => {
      if (c === 'goal') this.setupPlaceKick(side, 'penalty', px, pz);
      else if (c === 'touch') {
        this.say('Kick to touch', 'info');
        audio.kick();
        this.after(1, () => this.setupLineout(clamp(px + d * 24, -44, 44), pz >= 0 ? 1 : -1, side));
      } else {
        this.say('Tap and go!', 'info');
        this.giveBall(holder);
        this.phase = 'play';
        this.assignSlots();
      }
    };
    if (side === 0) {
      this.emit({ type: 'penalty', canKick, resolve: go });
    } else {
      const behind = this.score[1] < this.score[0];
      const choice: PenaltyChoice = canKick && (goalDist < 40 || !behind) ? 'goal' : FIELD.tryX - px * d < 25 ? (rand.chance(0.3) ? 'tap' : 'touch') : 'touch';
      this.after(1, () => go(choice));
    }
  }

  // ---------------------------------------------------------------- place kicks
  private setupPlaceKick(side: Side, kind: 'conversion' | 'penalty' | 'drill', x: number, z: number) {
    this.resetStates();
    this.phase = 'placekick';
    this.camMode = 'placekick';
    this.placeKind = kind;
    this.placeSide = side;
    const d = dirOf(side);
    const kicker = [...this.teams[side]].sort((a, b) => b.r.kicking - a.r.kicking)[0];
    this.placeKicker = kicker;
    const b = this.ball;
    b.state = 'dead';
    b.carrier = null;
    b.x = x;
    b.z = z;
    b.y = 0.2;
    this.place(kicker, x - d * 3, z - 1.2);
    // everyone else behind the kicker / under the posts
    this.teams[side].forEach((p, i) => p !== kicker && this.place(p, x - d * (14 + (i % 3) * 2), clamp(z - 18 + i * 2.6, -33, 33)));
    this.teams[other(side)].forEach((p, i) => this.place(p, d * (FIELD.tryX + 2), -8 + i * 1.1));
    if (kind === 'drill') this.teams[1].forEach((p) => (p.state = 'off'));
    this.placeAim = 0;
    const goalDist = dist(x, z, d * FIELD.tryX, 0);
    if (side === 0) {
      const ang = Math.atan2(-z, d * FIELD.tryX - x);
      const fwd = { x: Math.cos(ang), z: Math.sin(ang) };
      const along = (this.wind.x * fwd.x + this.wind.z * fwd.z) * 3.6;
      // screen right (+z when looking +x) relative to the kick direction
      const cross = (this.wind.x * -fwd.z + this.wind.z * fwd.x) * 3.6;
      this.after(0.4, () =>
        this.emit({
          type: 'placekick',
          req: { kind, distance: goalDist, cross, along, windSpeed: Math.hypot(this.wind.x, this.wind.z) * 3.6, kicker: kicker.name },
        }),
      );
    } else {
      // CPU kicker
      const angleF = Math.abs(z) / Math.max(goalDist, 1);
      let p = 1.08 - goalDist / 58 - angleF * 0.3 + (kicker.r.kicking - 75) / 140;
      p += { easy: -0.12, medium: 0, hard: 0.06 }[this.cfg.difficulty];
      const success = rand.chance(clamp(p, 0.12, 0.95));
      const aimErr = success ? rand.range(-0.6, 0.6) : (rand.chance(0.5) ? -1 : 1) * rand.range(4, 9);
      this.after(1.6, () => this.shootPlaceKick(aimErr, 0.62, 0));
    }
  }

  /** User drags to aim (degrees relative to the posts). */
  setPlaceAim(deg: number) {
    this.placeAim = deg;
  }

  /** Swing meter result: power 0..1 (≈0.55 is ideal), accuracy -1..1 (0 = perfect). */
  shootPlaceKick(aimDeg: number, power: number, accuracy: number) {
    if (this.phase !== 'placekick') return;
    const side = this.placeSide;
    const d = dirOf(side);
    const kicker = this.placeKicker!;
    const b = this.ball;
    const toPost = Math.atan2(-b.z, d * FIELD.tryX - b.x);
    const skill = 1.25 - kicker.r.kicking / 100;
    const err = accuracy * 12 * skill;
    // aimDeg is screen-relative: + = right. For side 0 (looking +x) right = +z = +angle.
    const ang = toPost + ((aimDeg + err) * Math.PI) / 180 * (side === 0 ? 1 : -1);
    const D = dist(b.x, b.z, d * FIELD.tryX, 0);
    const elev = (36 * Math.PI) / 180;
    const h = 5.5;
    const vReq = Math.sqrt((G * D * D) / (2 * Math.cos(elev) ** 2 * Math.max(0.5, D * Math.tan(elev) - h)));
    const v = vReq * (0.72 + power * 0.52);
    b.state = 'air';
    b.vx = Math.cos(ang) * Math.cos(elev) * v;
    b.vz = Math.sin(ang) * Math.cos(elev) * v;
    b.vy = Math.sin(elev) * v;
    b.y = 0.2;
    b.wind = true;
    b.bounced = false;
    b.kicker = kicker;
    b.goalCheck = { side, kind: this.placeKind === 'drill' ? 'drill' : this.placeKind };
    kicker.kickT = 0.5;
    audio.kick();
    this.arc.visible = false;
    // Safety: if the ball never reaches the posts (short), resolve as a miss.
    const myKick = b.goalCheck;
    this.after(4.5, () => {
      if (this.ball.goalCheck === myKick && myKick) {
        this.ball.goalCheck = null;
        this.goalResult(myKick.side, myKick.kind, false);
      }
    });
  }

  // ---------------------------------------------------------------- set plays
  private startSetPlay(id: SetPlayId) {
    const c = this.ball.carrier!;
    const d = dirOf(0);
    const open = c.z < 0 ? 1 : -1;
    const t = this.teams[0];
    const free = (p: P) => p.state === 'free' && p !== c;
    const routes = new Map<P, () => { x: number; z: number }>();
    let targets: P[] = [];
    const n = (num: number) => t[num - 1];
    audio.click();
    switch (id) {
      case 'crash': {
        const r = free(n(12)) ? n(12) : n(13);
        routes.set(r, () => ({ x: c.x + d * 2, z: c.z + open * 3.5 }));
        targets = [r];
        this.say('Crash ball', 'info', `${r.name} on the hard line`);
        break;
      }
      case 'loop': {
        const first = free(n(12)) ? n(12) : n(13);
        const looper = c.num === 10 ? c : n(10);
        if (looper !== c) routes.set(looper, () => ({ x: first.x - d * 1.5, z: clamp(first.z + open * 4, -33, 33) }));
        routes.set(first, () => ({ x: c.x + d * 1, z: c.z + open * 5 }));
        targets = [first, looper];
        this.say('Loop play', 'info', 'Pass, then pass back to the looper');
        break;
      }
      case 'miss': {
        const skip = free(n(13)) ? n(13) : n(15);
        const wing = open > 0 ? n(14) : n(11);
        routes.set(skip, () => ({ x: c.x + d * 0.5, z: clamp(c.z + open * 14, -33, 33) }));
        routes.set(wing, () => ({ x: c.x + d * 3, z: open * 31 }));
        targets = [skip, wing];
        this.say('Miss pass wide', 'info', 'Skip to the outside');
        break;
      }
      case 'upandunder': {
        this.say('Up and under!', 'info');
        this.doKick(c, 0.6, 0, 'box');
        const chasers = [n(11), n(14), n(15)];
        this.setPlay = {
          id,
          targets: [],
          routes: new Map(chasers.map((p) => [p, () => this.predictLanding()] as const)),
          until: this.time + 4,
        };
        return;
      }
    }
    this.setPlay = { id, targets, routes, until: this.time + 7 };
  }

  // ---------------------------------------------------------------- drills
  private startDrill() {
    this.drillScore = 0;
    this.drillStage = 0;
    this.drillCount = 0;
    this.drillNext(true);
  }

  private drillNext(first = false) {
    const drill = this.cfg.drill!;
    if (!first) this.drillCount++;
    this.resetStates();
    this.camMode = 'game';
    if (drill === 'passing') {
      if (this.drillScore >= 10) return;
      this.teams[1].forEach((p) => {
        p.state = 'off';
        this.place(p, 0, 80);
      });
      this.teams[0].forEach((p, i) => this.place(p, -30 - Math.abs(i - 9) * 1.5, clamp((i - 9) * 4.5, -32, 32)));
      const ten = this.teams[0][9];
      this.place(ten, -30, 0);
      this.giveBall(ten);
      this.phase = 'play';
      this.assignSlots();
      this.emit({ type: 'drill', text: 'Tap PASS for short, hold for long. Swipe the button ← → to pick a side.', progress: `${this.drillScore} / 10 passes` });
      return;
    }
    if (drill === 'tackling') {
      if (this.drillCount >= 5) return this.finishDrill(5);
      this.teams[1].forEach((p, i) => {
        p.state = i >= 8 ? 'free' : 'off';
        this.place(p, i >= 8 ? 30 + Math.abs(i - 11) * 1.5 : 0, i >= 8 ? (i - 11) * 5 : 80);
      });
      this.teams[0].forEach((p, i) => this.place(p, 0, clamp((i - 7) * 4.2, -32, 32)));
      const carrier = this.teams[1][9];
      this.giveBall(carrier);
      this.phase = 'play';
      this.controlled = null;
      this.autoControl();
      this.emit({ type: 'drill', text: 'Get close and hit TACKLE. Use DIVE from further out. SWITCH changes player.', progress: `Rep ${this.drillCount + 1} / 5 · ${this.drillScore} tackles` });
      return;
    }
    if (drill === 'kicking') {
      const spots: [number, number][] = [[36, 0], [34, 12], [30, -18], [26, 8], [32, -26]];
      if (this.drillCount >= spots.length) return this.finishDrill(spots.length);
      this.emit({ type: 'drill', text: 'Drag to aim, then tap twice: power, then accuracy. Watch the wind!', progress: `Kick ${this.drillCount + 1} / 5 · ${this.drillScore} scored` });
      const [x, z] = spots[this.drillCount];
      this.setupPlaceKick(0, 'drill', x, z);
      return;
    }
    if (drill === 'setpieces') {
      this.drillStage = this.drillCount;
      switch (this.drillCount) {
        case 0:
          return this.setupScrum(10, 0, 0);
        case 1:
          return this.setupLineout(20, 1, 0);
        case 2: {
          this.emit({ type: 'drill', text: 'Ruck: tap when the marker is in the green to secure quick ball', progress: 'Set piece 3 / 4' });
          this.phase = 'dead';
          this.teams.flat().forEach((p, i) => this.place(p, (p.side ? 4 : -4) + (i % 3), (i % 15) * 3 - 21));
          this.after(0.6, () =>
            this.requestMini('ruck', true, 0, (q) => {
              const ok = q > 0.6;
              if (ok) this.drillScore++;
              this.say(ok ? 'Quick ball!' : 'Slow ball', ok ? 'good' : 'bad');
              this.after(1.4, () => this.drillNext());
            }),
          );
          return;
        }
        case 3: {
          this.emit({ type: 'drill', text: 'Maul: tap as fast as you can to drive forward', progress: 'Set piece 4 / 4' });
          const carrier = this.teams[0][1];
          this.place(carrier, 20, 20);
          this.teams.flat().forEach((p) => p !== carrier && this.place(p, 20 + (p.side ? 2 : -2), 20 + rand.range(-3, 3)));
          this.startMaul(20, 20, 0, carrier);
          const startX = 20;
          const check = () => {
            if (this.maul) return this.after(0.2, check);
            const gained = this.ball.x - startX;
            if (gained > 2) this.drillScore++;
            this.finishDrill(4);
          };
          this.after(0.5, check);
          return;
        }
        default:
          return this.finishDrill(4);
      }
    }
  }

  private finishDrill(total: number) {
    this.phase = 'dead';
    this.after(1, () => this.emit({ type: 'drillDone', score: this.drillScore, total }));
  }

  // ---------------------------------------------------------------- rendering
  private render(dt: number) {
    const b = this.ball;
    const m4 = new THREE.Matrix4();
    let si = 0;
    for (const p of this.players) {
      const off = p.state === 'off';
      p.model.root.visible = !off;
      if (off) {
        m4.makeScale(0, 0, 0);
        this.shadows.setMatrixAt(si++, m4);
        continue;
      }
      const speed = Math.hypot(p.vx, p.vz);
      if (speed > 0.4 && p.state !== 'down') p.heading = Math.atan2(p.vz, p.vx);
      else if (p.state === 'free' && this.phase !== 'play') p.heading = p.side === 0 ? 0 : Math.PI;
      p.model.root.position.x = p.x;
      p.model.root.position.z = p.z;
      // Rotate so local +x faces the heading.
      p.model.root.rotation.y = -p.heading;
      let pose: Pose = 'run';
      if (p.diveT > 0) pose = 'dive';
      else if (p.state === 'down') pose = 'down';
      else if (p.state === 'bound') pose = 'bound';
      else if (p.kickT > 0) pose = 'kick';
      else if (b.carrier === p) pose = 'carry';
      animateModel(p.model, speed, this.paused ? 0 : dt, pose);
      m4.makeTranslation(p.x, 0.03, p.z);
      this.shadows.setMatrixAt(si++, m4);
    }
    m4.makeScale(0.4, 1, 0.4);
    m4.setPosition(b.x, 0.025, b.z);
    this.shadows.setMatrixAt(si, m4);
    this.shadows.instanceMatrix.needsUpdate = true;

    this.ballMesh.position.set(b.x, b.y, b.z);
    if (b.state === 'air' || b.state === 'pass') this.ballMesh.rotation.z += dt * (b.state === 'air' ? 10 : 3);
    else if (b.carrier) this.ballMesh.rotation.set(0, -b.carrier.heading, 0.3);

    const c = this.controlled;
    const showRing = !!c && c.state !== 'off' && this.phase !== 'placekick' && !this.cfg.drill?.match(/kicking/);
    this.ring.visible = showRing;
    if (c && showRing) {
      this.ring.position.x = c.x;
      this.ring.position.z = c.z;
      (this.ring.material as THREE.MeshBasicMaterial).color.set(this.possession() === 0 ? '#c6ff1a' : '#ff3d6e');
      this.ring.scale.setScalar(1 + Math.sin(this.time * 6) * 0.06);
    }
    const tgt = b.state === 'pass' && b.pass ? b.pass.target : null;
    this.targetRing.visible = !!tgt;
    if (tgt) this.targetRing.position.set(tgt.x, 0.035, tgt.z);

    this.updateArc();
    this.updateCamera(dt);
    const excite = this.phase === 'play' ? clamp((Math.abs(b.x) - 25) / 25, 0, 1) : 0.15;
    this.stadium.update(this.time, excite);
    this.renderer.render(this.scene, this.camera);
  }

  private updateArc() {
    const ka = this.input.kickAim;
    const c = this.controlled;
    const pos = this.arc.geometry.attributes.position as THREE.BufferAttribute;
    if (this.phase === 'placekick' && this.placeSide === 0 && this.ball.state === 'dead') {
      // Aim line for place kicks
      const b = this.ball;
      const d = dirOf(0);
      const toPost = Math.atan2(-b.z, d * FIELD.tryX - b.x);
      const ang = toPost + (this.placeAim * Math.PI) / 180;
      const D = dist(b.x, b.z, FIELD.tryX, 0) + 4;
      for (let i = 0; i < 60; i++) {
        const u = i / 59;
        pos.setXYZ(i, b.x + Math.cos(ang) * D * u, 0.2 + Math.sin(u * Math.PI) * D * 0.22, b.z + Math.sin(ang) * D * u);
      }
      pos.needsUpdate = true;
      this.arc.visible = true;
      return;
    }
    if (!ka.active || !c || this.ball.carrier !== c) {
      this.arc.visible = false;
      return;
    }
    const v = this.kickVelocity(ka.power, ka.aim * 0.7, c.side, ka.power < 0.3 ? 'grubber' : 'punt');
    let x = c.x;
    let y = 0.7;
    let z = c.z;
    let vy = v.vy;
    const step = 0.08;
    for (let i = 0; i < 60; i++) {
      pos.setXYZ(i, x, Math.max(0.1, y), z);
      x += v.vx * step;
      z += v.vz * step;
      vy -= G * step;
      y += vy * step;
      if (y < 0.1) {
        y = 0.1;
        vy = Math.abs(vy) * 0.3;
      }
    }
    pos.needsUpdate = true;
    this.arc.visible = true;
  }

  private updateCamera(dt: number) {
    const b = this.ball;
    const focus = new THREE.Vector3(b.x, 0, b.z);
    if (b.carrier) focus.set(b.carrier.x, 0, b.carrier.z);
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (this.camMode === 'placekick') {
      const d = dirOf(this.placeSide);
      pos = new THREE.Vector3(b.x - d * 7, 2.6, b.z);
      const toPost = new THREE.Vector3(d * FIELD.tryX - b.x, 0, -b.z).normalize();
      pos = new THREE.Vector3(b.x, 2.4, b.z).addScaledVector(toPost, -7);
      look = new THREE.Vector3(d * FIELD.tryX, 4, 0);
      if (b.state === 'air') look = new THREE.Vector3(b.x, b.y, b.z).lerp(look, 0.5);
    } else if (this.camMode === 'setpiece' && (this.phase === 'scrum' || this.phase === 'lineout')) {
      pos = new THREE.Vector3(b.x - 12, 7, b.z + (b.z > 0 ? -6 : 6));
      look = new THREE.Vector3(b.x + 2, 0.5, b.z);
    } else {
      const mode = this.cfg.camera;
      if (mode === 'sideline') {
        pos = new THREE.Vector3(focus.x * 0.92, 24, focus.z * 0.3 + 46);
        look = new THREE.Vector3(focus.x, 0, focus.z * 0.6);
      } else if (mode === 'close') {
        pos = new THREE.Vector3(focus.x - 9, 5, focus.z * 0.9);
        look = new THREE.Vector3(focus.x + 7, 1, focus.z);
      } else {
        pos = new THREE.Vector3(focus.x - 15, 10, focus.z * 0.85);
        look = new THREE.Vector3(focus.x + 9, 0, focus.z);
      }
      if (b.state === 'air') pos.y += Math.min(6, b.y * 0.4);
    }
    const k = Math.min(1, dt * (this.camMode === 'placekick' ? 5 : 3.2));
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
