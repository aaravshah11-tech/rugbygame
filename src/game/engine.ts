import * as THREE from 'three';
import { effectiveRatings, playerOvr, type Player, type Ratings } from '../data/players';
import { FIELD } from './stadium';
import { venueFor, type Venue } from '../data/venues';
import { createBall } from './model';
import { buildStadium, type StadiumView } from './view/stadium';
import { buildPitch } from './view/pitch';
import { BallFx, Particles, PostFX, Selector } from './view/effects';
import { FpsGovernor, preset, resolveQuality, type QualityPreset } from './view/quality';
import type { AnimName, PlayerAsset } from './view/assets';
import { Avatar, makeTeamKit } from './view/avatar';
import { LegacyVisual, type Visual } from './view/visual';
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
  KickKind,
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
  /** smoothed movement goal */
  gx: number;
  gz: number;
  urgency: number;
  state: PState;
  timer: number;
  tackleCD: number;
  catchCD: number;
  sidestepT: number;
  /** sidestep cooldown */
  sidestepCD: number;
  sideDir: number;
  handoffT: number;
  diveT: number;
  kickT: number;
  stamina: number;
  slotSide: number;
  slotK: number;
  av: Visual;
  /** one-shot animation requested by the game logic this frame */
  fx: AnimName | null;
  celebrateT: number;
  wasDown: boolean;
  /** rendered facing, eased towards `heading` so players turn smoothly */
  face: number;
  casting?: boolean;
  /** lifted off the ground (lineout jumper), metres */
  lift?: number;
  prevFace?: number;
  leanZ?: number;
  leanX?: number;
  /** current locomotion animation, kept with hysteresis so it doesn't flicker */
  loco: 'idle' | 'walk' | 'run';
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
  /** kicked to touch from a penalty: the kicking team throws in wherever it goes out */
  penTouch?: boolean;
  wind: boolean;
  grubber: boolean;
  hopT: number;
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
const lastLine: Record<string, string> = {};
/** A random line for the moment, never the same one twice in a row. */
const line = (k: string) => {
  const opts = LINES[k].filter((l) => l !== lastLine[k]);
  const l = rand.pick(opts.length ? opts : LINES[k]);
  lastLine[k] = l;
  return l;
};

export class MatchEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private stadium: StadiumView;
  private post: PostFX;
  private particles: Particles;
  private ballFx: BallFx;
  private selector: Selector;
  private quality: QualityPreset;
  private governor: FpsGovernor;
  private frameSkip = false;
  private skipToggle = false;
  private players: P[] = [];
  private teams: [P[], P[]] = [[], []];
  private ball: Ball;
  private ballMesh: THREE.Mesh;
  private targetRing: THREE.Mesh;
  private kickRing: THREE.Mesh;
  private passMarks: [THREE.Sprite, THREE.Sprite];
  private nameTag: THREE.Sprite;
  private nameCanvas: HTMLCanvasElement;
  private nameFor: P | null = null;
  private offsideLine: THREE.Mesh;
  private arc: THREE.Line;
  private shadows: THREE.InstancedMesh;
  private raf = 0;
  private last = 0;
  private time = 0;
  private listener: (e: EngineEvent) => void;
  readonly input: InputState;
  private cfg: MatchConfig;
  /** tactics per side: [user, cpu] */
  private tac!: [MatchConfig['tactics'], MatchConfig['tactics']];

  private phase: Phase = 'pre';
  private phaseT = 0;
  private timers: { t: number; fn: () => void }[] = [];
  private half: 1 | 2 = 1;
  private gameSec = 0;
  private score: [number, number] = [0, 0];
  private tries: [number, number] = [0, 0];
  private stats = { tries: 0, tackles: 0, conversions: 0, passes: 0, penalties: 0, dropGoals: 0 };
  private customTac(side: Side) {
    const t = this.tac[side];
    return { depth: t.depth ?? 1, width: t.width ?? 1, lineSpeed: t.lineSpeed ?? 1, ruck: t.ruckCommit ?? 2 };
  }
  private ms = { poss: [0, 0], terr: [0, 0], tackles: [0, 0], missed: [0, 0], metres: [0, 0], breaks: [0, 0], turnovers: [0, 0], pens: [0, 0] };
  private pstats = new Map<P, { tries: number; tackles: number; metres: number; breaks: number }>();
  private ps(p: P) {
    let s = this.pstats.get(p);
    if (!s) this.pstats.set(p, (s = { tries: 0, tackles: 0, metres: 0, breaks: 0 }));
    return s;
  }
  private lastCarrierX: number | null = null;
  private tickStats(dt: number) {
    if (this.phase !== 'play' && this.phase !== 'ruck' && this.phase !== 'maul') return;
    const side = this.possession();
    this.ms.poss[side] += dt;
    const b = this.ball;
    this.ms.terr[b.x * dirOf(0) > 0 ? 0 : 1] += dt;
    const c = b.carrier;
    if (c && this.phase === 'play') {
      if (this.lastCarrierX !== null) {
        const gain = (c.x - this.lastCarrierX) * dirOf(c.side);
        if (gain > 0 && gain < 1) {
          this.ms.metres[c.side] += gain;
          this.ps(c).metres += gain;
        }
      }
      this.lastCarrierX = c.x;
    } else this.lastCarrierX = null;
  }

  /** Possession, territory and the rest for the half-time and full-time screens. */
  matchStats(): import('./types').MatchStats {
    const m = this.ms;
    const pct = (a: number[]) => {
      const t = a[0] + a[1] || 1;
      const u = Math.round((a[0] / t) * 100);
      return [u, 100 - u] as [number, number];
    };
    let best: { p: P; score: number } | null = null;
    for (const [p, st] of this.pstats) {
      const score = st.tries * 10 + st.tackles * 1.2 + st.metres * 0.12 + st.breaks * 3 + (p.side === 0 ? 0.5 : 0);
      if (!best || score > best.score) best = { p, score };
    }
    const potm = best
      ? (() => {
          const st = this.pstats.get(best!.p)!;
          const bits = [st.tries ? `${st.tries} tr${st.tries > 1 ? 'ies' : 'y'}` : '', st.tackles ? `${st.tackles} tackles` : '', st.metres >= 5 ? `${Math.round(st.metres)}m` : '', st.breaks ? `${st.breaks} line break${st.breaks > 1 ? 's' : ''}` : '']
            .filter(Boolean)
            .join(' · ');
          return { name: best!.p.data ? `${best!.p.data.first} ${best!.p.data.last}` : best!.p.name, team: this.teamShort(best!.p.side), line: bits };
        })()
      : null;
    return {
      possession: pct(m.poss),
      territory: pct(m.terr),
      tackles: [m.tackles[0], m.tackles[1]],
      missed: [m.missed[0], m.missed[1]],
      metres: [Math.round(m.metres[0]), Math.round(m.metres[1])],
      lineBreaks: [m.breaks[0], m.breaks[1]],
      turnovers: [m.turnovers[0], m.turnovers[1]],
      penalties: [m.pens[0], m.pens[1]],
      potm,
    };
  }
  private controlled: P | null = null;
  private firstKicker: Side = 1;
  private wind = { x: 0, z: 0 };
  private paused = false;
  private waitingBlocking = false;
  private miniId = 0;
  private activeMini: { id: number; kind: MiniGameKind; q: number | null; taps: number; done: boolean } | null = null;
  private ruck: null | { x: number; z: number; att: Side; t: number; dur: number; progress: number; addAtt: number; addDef: number; contest: number; fan: boolean; userDef: 'none' | 'contest' | 'fan'; nineWait?: boolean } = null;
  private ruckArc: THREE.Mesh | null = null;
  private ruckArcBg: THREE.Mesh | null = null;
  private pendingSetPlay: SetPlayId | null = null;
  private useItCalled = false;
  private slotCount: Record<number, number> = { [-1]: 7, [1]: 7 };
  private scrum: null | {
    x: number; z: number; feed: Side; bal: number; t: number; dur: number; user: number; cpu: number; bias: number;
    stage: 'push' | 'choose'; chooseT: number; winner: Side; base: { p: P; x: number; z: number }[];
  } = null;
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
  private camMode: 'game' | 'placekick' | 'setpiece' | 'try' | 'kickoff' | 'replay' | 'intro' = 'game';
  private camFocus: P | null = null;
  private camModeT = 0;
  private tackleZoomT = 0;
  private exciteBoost = 0;
  private phaseCount = 0;
  private kickCurl = 0;
  private drillCount = 0;
  private drillScore = 0;
  private drillStage = 0;
  private ended = false;
  private resizeObs: ResizeObserver;
  /** Dev builds only: `?fast` runs the match clock 20x faster for testing. */
  private clockScale = import.meta.env.DEV && new URLSearchParams(location.search).has('fast') ? 20 : 1;
  // replay: ring buffer of recent frames, sampled at 30Hz
  private history: ReplayFrame[] = [];
  private recordAcc = 0;
  private replay: { frames: ReplayFrame[]; t: number; done: () => void } | null = null;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();

  constructor(private host: HTMLElement, cfg: MatchConfig, input: InputState, listener: (e: EngineEvent) => void, asset: PlayerAsset | null) {
    cfg = { ...cfg, weather: cfg.weather ?? 'dry', rules: cfg.rules ?? 'standard', autoSwitch: cfg.autoSwitch ?? true, tactics: cfg.tactics ?? { attack: 'balanced', defence: 'balanced', kicking: 'balanced' } };
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    this.tac = [cfg.tactics, { attack: pick(['forwards', 'balanced', 'expansive'] as const), defence: pick(['drift', 'balanced', 'blitz'] as const), kicking: pick(['low', 'balanced', 'territory'] as const) }];
    this.cfg = cfg;
    this.input = input;
    this.listener = listener;
    const level = resolveQuality(cfg.quality);
    this.quality = preset(level);
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.quality.bloom && level !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.3, 2000);
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.quality);
    this.governor = new FpsGovernor(
      cfg.quality === 'auto',
      () => this.downgrade(),
      () => (this.frameSkip = true),
    );
    if (this.quality.targetFps === 30) this.frameSkip = true;
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);

    // the home side's ground; the crowd is mostly in home colours
    this.venue = venueFor(cfg.userIsHome ? cfg.user.id : cfg.cpu.id);
    const home = cfg.userIsHome ? cfg.user.kit : cfg.cpu.kit;
    const away = cfg.userIsHome ? cfg.cpu.kit : cfg.user.kit;
    this.stadium = buildStadium(this.scene, this.renderer, this.quality, [home.primary, home.primary, home.secondary, home.primary, away.primary, away.secondary], this.venue);
    // The user's team defends the -x end, so those posts wear the user's colours.
    buildPitch(this.scene, this.renderer, this.quality.pitchPxPerMetre, [cfg.user.kit.primary, cfg.cpu.kit.primary]);
    this.buildTeams(asset);

    this.ballMesh = createBall();
    this.ballMesh.scale.setScalar(1.45);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
    this.ballFx = new BallFx(this.scene);
    this.particles = new Particles(this.scene, 900, this.quality.particles);
    this.selector = new Selector(this.scene);
    this.selector.setColor(indicatorColor(cfg.user.kit));
    this.ball = {
      x: 0, y: 0.1, z: 0, vx: 0, vy: 0, vz: 0, state: 'dead', carrier: null, pass: null, lastSide: 0,
      kicker: null, kickFromX: 0, bounced: false, goalCheck: null, wind: false, grubber: false, hopT: 0,
    };

    const ringGeo = new THREE.RingGeometry(0.6, 0.8, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.targetRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#21e6c1', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.targetRing.position.y = 0.035;
    this.scene.add(this.targetRing);
    const kr = new THREE.RingGeometry(1.1, 1.45, 40);
    kr.rotateX(-Math.PI / 2);
    this.kickRing = new THREE.Mesh(kr, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.6, 0.6), transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }));
    this.kickRing.renderOrder = 5;
    this.kickRing.visible = false;
    this.scene.add(this.kickRing);

    // Pass markers: who receives a left / right pass right now.
    const mark = (dir: -1 | 1) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = 'rgba(10,14,22,0.75)';
      g.beginPath();
      g.arc(64, 64, 56, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = '#c6ff1a';
      g.stroke();
      g.fillStyle = '#c6ff1a';
      g.beginPath();
      g.moveTo(64 + dir * 30, 64);
      g.lineTo(64 - dir * 18, 34);
      g.lineTo(64 - dir * 18, 94);
      g.closePath();
      g.fill();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
      sp.scale.setScalar(0.75);
      sp.renderOrder = 10;
      sp.visible = false;
      this.scene.add(sp);
      return sp;
    };
    this.passMarks = [mark(-1), mark(1)];
    // Name label above the selected player
    this.nameCanvas = document.createElement('canvas');
    this.nameCanvas.width = 256;
    this.nameCanvas.height = 48;
    const nameTex = new THREE.CanvasTexture(this.nameCanvas);
    nameTex.colorSpace = THREE.SRGBColorSpace;
    this.nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex, depthTest: false, transparent: true }));
    this.nameTag.scale.set(2.6, 0.49, 1);
    this.nameTag.renderOrder = 11;
    this.scene.add(this.nameTag);

    const offGeo = new THREE.PlaneGeometry(0.25, 70);
    offGeo.rotateX(-Math.PI / 2);
    this.offsideLine = new THREE.Mesh(offGeo, new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.6, depthWrite: false }));
    this.offsideLine.position.y = 0.05;
    this.offsideLine.visible = false;
    this.scene.add(this.offsideLine);

    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
    this.arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(2, 2.4, 0.4) }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.scene.add(this.arc);

    // Soft blob shadows for every player + the ball: one instanced draw call.
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sg = sc.getContext('2d')!;
    const grad = sg.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 64, 64);
    const shGeo = new THREE.PlaneGeometry(1.4, 1.4);
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

  /** Steps graphics down one level (auto quality). Returns false when already at Low. */
  private downgrade(): boolean {
    if (this.quality.level === 'low') return false;
    this.quality = preset(this.quality.level === 'high' ? 'medium' : 'low');
    this.post.configure(this.quality);
    const key = this.stadium.key;
    key.castShadow = this.quality.shadows;
    key.shadow.map?.dispose();
    key.shadow.map = null;
    key.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    if (!this.quality.shadows) for (const p of this.players) p.av.setShadow(false);
    this.resize();
    return true;
  }

  /** Dev builds only: put the user's fly-half through on the line to test try/replay/conversion. */
  debugBreak() {
    if (!import.meta.env.DEV) return;
    this.timers = [];
    this.camMode = 'game';
    const p = this.teams[0][9];
    this.resetStates();
    this.place(p, 38, 6);
    p.vx = 8;
    this.giveBall(p);
    this.phase = 'play';
    for (const o of this.teams[1]) this.place(o, 20, o.num * 3 - 24);
  }

  get graphicsLevel() {
    return this.quality.level;
  }

  // ---------------------------------------------------------------- setup
  private asset: PlayerAsset | null = null;
  private venue: Venue;
  private buildTeams(asset: PlayerAsset | null) {
    this.asset = asset;
    const diffMod = { easy: -8, medium: 3, hard: 6, elite: 12 }[this.cfg.difficulty];
    const mk = (team: TeamSetup, side: Side) => {
      const kit = asset ? makeTeamKit(team.kit) : null;
      team.players.slice(0, 15).forEach((pl, i) => {
        const boost: Partial<Ratings> = { ...(team.boost ?? {}) };
        if (side === 1) for (const k of ['pace', 'strength', 'passing', 'kicking', 'tackling', 'handling'] as const) boost[k] = (boost[k] ?? 0) + diffMod;
        const r = effectiveRatings(pl, boost);
        const skin = Math.abs(hashCode(pl.id)) % 5;
        const h = Math.abs(hashCode(pl.id + 'h'));
        // Some forwards wear scrum caps (hooker, locks, flankers more often than not).
        const scrumCap = [2, 4, 5, 6, 7].includes(i + 1) && h % 3 !== 0;
        const av: Visual = asset && kit ? new Avatar(asset, kit, { num: i + 1, forward: i < 8, skin, hair: h % 6, scrumCap }) : new LegacyVisual(team.kit, skin, i < 8);
        av.root.rotation.order = 'YXZ'; // heading first, then the body lean in the player's own frame
        this.scene.add(av.root);
        const p: P = {
          side, num: i + 1, data: pl, r, name: `${pl.first[0]}. ${pl.last}`,
          x: 0, z: 0, vx: 0, vz: 0, heading: side === 0 ? 0 : Math.PI, tx: 0, tz: 0, gx: 0, gz: 0, urgency: 0,
          state: 'free', timer: 0, tackleCD: 0, catchCD: 0, sidestepT: 0, sidestepCD: 0, sideDir: 1, handoffT: 0, diveT: 0, kickT: 0,
          stamina: 1, slotSide: 1, slotK: 0, av, fx: null, celebrateT: 0, wasDown: false, face: side === 0 ? 0 : Math.PI, loco: 'idle',
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
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 64 : 44;
    this.camera.updateProjectionMatrix();
    this.particles?.setViewportHeight(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  start() {
    audio.startCrowd();
    audio.setCrowd(0.2);
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const realDt = (now - this.last) / 1000;
      if (this.frameSkip) {
        // 30fps cap: render every other display frame.
        this.skipToggle = !this.skipToggle;
        if (this.skipToggle) return;
      }
      const dt = Math.min(0.05, realDt);
      this.last = now;
      this.governor.tick(realDt);
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
    if (this.cfg.drill) this.startDrill();
    else if (this.cfg.challenge) this.startChallenge();
    else this.startIntro();
  }

  private introT = -1;
  /** Camera sweeps the stadium while the teams line up; tap to skip. */
  private startIntro() {
    this.setupKickoff(this.firstKicker, 0);
    this.timers = [];
    this.introT = 0;
    this.camMode = 'intro';
    audio.cheer(0.5);
    this.emit({ type: 'intro', on: true, title: `${this.cfg.user.name} v ${this.cfg.cpu.name}`, sub: `${this.venue.name}, ${this.venue.city}${this.cfg.weather === 'rain' ? ' · rain falling' : ''}` });
  }

  /** Daily challenge scenarios: set the score, the clock and where play starts. */
  private startChallenge() {
    const ch = this.cfg.challenge!;
    if (ch.score) this.score = [ch.score[0], ch.score[1]];
    if (ch.secondHalfAt !== undefined) {
      this.half = 2;
      this.gameSec = ch.secondHalfAt;
    }
    this.emit({ type: 'hud', hud: this.hud() });
    const d = dirOf(0);
    if (ch.goal === 'holdOut') {
      // defend a scrum 8m from your own line
      this.setupScrum(-d * (FIELD.tryX - 8), 6, 1);
    } else if (ch.startX !== undefined) {
      this.setupScrum(d * ch.startX, 0, 0);
    } else this.setupKickoff(this.firstKicker, 0);
    this.say(ch.title, 'info', 'Challenge');
  }

  /** Did the user complete the challenge? (checked at the final whistle) */
  private challengeResult(): boolean | undefined {
    const ch = this.cfg.challenge;
    if (!ch) return undefined;
    const [u, c] = this.score;
    const start = ch.score ?? [0, 0];
    if (ch.goal === 'win') return u > c;
    if (ch.goal === 'holdOut') return c === start[1];
    if (ch.goal === 'tryFromOwn22') return this.tries[0] > 0;
    return this.tries[0] >= (ch.target ?? 1);
  }

  skipIntro() {
    if (this.introT < 0) return;
    this.introT = -1;
    this.emit({ type: 'intro', on: false, title: '', sub: '' });
    this.setupKickoff(this.firstKicker, 0);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    audio.stopCrowd();
    this.post.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) audio.setCrowd(0.05);
  }

  setCamera(mode: MatchConfig['camera']) {
    this.cfg.camera = mode;
  }

  /** Skip to full time: play out the remaining minutes on paper from both teams' strength. */
  simulateRest() {
    if (this.ended) return;
    const remain = this.half === 1 ? 4800 - this.gameSec : 2400 - this.gameSec;
    const frac = clamp(remain / 4800, 0, 1);
    const str = (side: Side) => this.teams[side].reduce((a, p) => a + (p.r.pace + p.r.strength + p.r.handling + p.r.tackling + p.r.passing) / 5, 0) / 15;
    const edge = (str(0) - str(1)) / 12 + { easy: 0.25, medium: -0.075, hard: -0.15, elite: -0.3 }[this.cfg.difficulty];
    for (const side of [0, 1] as Side[]) {
      const exp = 26 * frac * (1 + (side === 0 ? edge : -edge));
      let pts = 0;
      while (pts < exp * (0.4 + Math.random() * 1.2)) {
        if (Math.random() < 0.65) {
          this.tries[side]++;
          pts += 5 + (Math.random() < 0.7 ? 2 : 0);
        } else pts += 3;
      }
      this.score[side] += pts;
    }
    this.half = 2;
    this.gameSec = 2400;
    this.timers = [];
    this.emit({ type: 'hud', hud: this.hud() });
    this.endHalf();
  }

  setCustomPlays(list: NonNullable<MatchConfig['customPlays']>) {
    this.cfg.customPlays = list;
  }

  setTactics(t: MatchConfig['tactics']) {
    this.tac[0] = t;
    this.cfg.tactics = t;
  }

  /** Your XV and bench for the substitutions screen. */
  squad(): { field: import('./types').SquadLine[]; bench: { idx: number; name: string; pos: number; ovr: number }[] } {
    const used = this.subsUsed;
    return {
      field: this.teams[0].map((p) => ({ num: p.num, name: p.name, stamina: p.stamina, ovr: Math.round((p.r.pace + p.r.strength + p.r.passing + p.r.tackling + p.r.handling) / 5), off: p.state === 'off' })),
      bench: (this.cfg.user.bench ?? [])
        .map((pl, idx) => ({ idx, name: `${pl.first[0]}. ${pl.last}`, pos: pl.position, ovr: Math.round(playerOvr(pl)) }))
        .filter((b) => !used.has(b.idx)),
    };
  }

  private subsUsed = new Set<number>();
  /** Bring a replacement on for shirt `num`: fresh legs, the new player's ratings and name. */
  substitute(num: number, benchIdx: number) {
    const pl = this.cfg.user.bench?.[benchIdx];
    const p = this.teams[0][num - 1];
    if (!pl || !p || this.subsUsed.has(benchIdx) || p.state === 'off') return;
    this.subsUsed.add(benchIdx);
    p.data = pl;
    p.r = effectiveRatings(pl, this.cfg.user.boost ?? {});
    p.name = `${pl.first[0]}. ${pl.last}`;
    p.stamina = 1;
    if (this.nameFor === p) this.nameFor = null;
    this.say('Substitution', 'info', `${p.name} on at ${num}`);
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
  /** freeze-frame on big hits (seconds of real time) */
  private hitStopT = 0;
  /** slow motion while the offload window is open */
  private timeScale = 1;
  private offload: null | { c: P; t: P; left: number } = null;

  private frame(dt: number) {
    if (!this.paused && this.hitStopT > 0) {
      this.hitStopT -= dt;
      this.render(0);
      return;
    }
    const sdt = this.aimFreeze ? 0 : dt * this.timeScale;
    if (!this.paused) {
      this.time += sdt;
      if (this.replay) this.updateReplay(dt);
      else if (!this.waitingBlocking) this.update(sdt);
    }
    this.render(this.paused ? 0 : sdt);
  }

  private catchPrompt(): boolean {
    const b = this.ball;
    if (b.state !== 'air' || b.vy > 0 || b.y > 9 || b.kicker?.side === 0 && b.kicker === this.controlled) return false;
    const land = this.predictLanding();
    if (!land) return false;
    return this.teams[0].some((p) => p.state === 'free' && dist(p.x, p.z, land.x, land.z) < 3.5);
  }

  private windHud() {
    const { fx, fz, rx, rz } = this.camAxes();
    const up = this.wind.x * fx + this.wind.z * fz;
    const right = this.wind.x * rx + this.wind.z * rz;
    return { deg: Math.round((Math.atan2(right, up) * 180) / Math.PI), kmh: Math.round(Math.hypot(this.wind.x, this.wind.z) * 3.6) };
  }

  private pop(text: string, tone: 'good' | 'bad' | 'big') {
    this.emit({ type: 'pop', text, tone });
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
    this.tickOffload(dt);
    this.tickCall(dt);
    this.tickReferee(dt);
    this.tickCharge(dt);
    this.tickStats(dt);
    // Once the 9 has played the ball, the ruck breaks up and those players rejoin the game.
    if (this.phase === 'play' && this.atBaseT < 0) this.releaseRuck();
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
      case 'lineout':
        this.updateLineoutThrow(dt);
        if (!this.loThrow && (this.ball.state === 'air' || this.ball.state === 'ground')) this.updateBallPhysics(dt);
        break;
      case 'scrum':
        if (this.scrum) this.updateScrum(dt);
        else if (this.ball.state === 'air' || this.ball.state === 'ground') this.updateBallPhysics(dt);
        break;
      case 'placekick':
      case 'dead':
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
      phaseNum: this.phaseCount,
      ruck: this.ruck ? (this.ruck.att === 0 ? 'attack' : 'defend') : null,
      ruckDef: this.ruck ? this.ruck.userDef : 'none',
      ruckBall: this.ruck ? this.ruckBall(this.ruck) : null,
      canDrop: this.canDropGoal(),
      nearDef: !!(c && this.ball.carrier === c && c.side === 0 && this.phase === 'play' && this.nearestOpponent(c, 3.2)),
      offload: !!this.offload,
      penTouch: !!this.penTouch,
      kickoffAim: !!this.kickoffAim,
      chargePrompt: this.chargeT >= 0 && this.phase === 'placekick' && this.ball.state === 'dead' ? (this.chargeT < 1.4 ? 'wait' : 'go') : null,
      canDiveTry: !!(c && this.ball.carrier === c && c.side === 0 && this.phase === 'play' && FIELD.tryX - c.x * dirOf(0) < 6 && FIELD.tryX - c.x * dirOf(0) > 0),
      atBase: !!(c && this.atBaseT >= 0 && this.ball.carrier === c && c.side === 0 && this.phase === 'play'),
      nineWait: !!(this.ruck && this.ruck.att === 0 && this.ruck.nineWait),
      catchPrompt: this.catchPrompt(),
      advantage: this.advantage ? (this.advantage.side === 0 ? 'user' : 'cpu') : null,
      sinBin: this.binned.map((b) => {
        const left = Math.max(0, b.until - ((this.half - 1) * 2400 + this.gameSec));
        return { team: this.teamShort(b.p.side), name: b.p.name, left: `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` };
      }),
      call: this.call ? { title: this.call.title, opts: this.call.opts, left: Math.max(0, this.call.timeout - this.call.t) } : null,
      wind: this.windHud(),
      isNine: !!(c && c.num === 9),
      scrum: this.scrum ? { bal: this.scrum.bal, t: this.scrum.t, dur: this.scrum.dur, choose: this.scrum.stage === 'choose', userFeed: this.scrum.feed === 0 } : null,
      mph: Math.round((this.ball.carrier ? Math.hypot(this.ball.carrier.vx, this.ball.carrier.vz) : c ? Math.hypot(c.vx, c.vz) : 0) * 2.237),
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
        if (this.offload) this.tryOffload(a.dir);
        else if (userHasBall && live) this.doPass(c!, a.long, a.dir);
        break;
      case 'ruckContest': {
        const r = this.ruck;
        if (r && r.att === 1 && r.userDef !== 'fan') {
          if (r.userDef === 'none') {
            r.userDef = 'contest';
            this.addToRuck(); // a jackal goes in over the ball
          }
          r.contest = Math.min(1, r.contest + 0.09);
          haptic('light');
        }
        break;
      }
      case 'ruckFan': {
        const r = this.ruck;
        if (r && r.att === 1 && r.userDef === 'none') {
          r.userDef = 'fan';
          r.fan = true;
          this.say('Fan out', 'info', 'Everyone in the line');
        }
        break;
      }
      case 'scrumPush':
        if (this.scrum && this.scrum.stage === 'push') this.scrum.user = Math.min(3.2, this.scrum.user + 0.42);
        break;
      case 'scrumPlay':
        if (this.scrum && this.scrum.stage === 'choose') this.scrumPlay(a.play);
        break;
      case 'kick':
        // the landing spot comes from where the user touched the pitch
        if (this.kickTarget) {
          a.tx = this.kickTarget.x;
          a.tz = this.kickTarget.z;
        } else a.tx = a.tz = undefined;
        if (this.kickoffAim) this.kickoffKick();
        else if (this.penTouch) this.penaltyTouchKick(a);
        else if (userHasBall && live) this.userKick(c!, a.kind, a.dist, a.angle, a.power ?? 0.85, a.tx, a.tz);
        this.kickTarget = null;
        break;
      case 'basePass':
        if (c && userHasBall && this.atBaseT >= 0) {
          this.atBaseT = -1;
          this.doPass(c, false, a.dir, true);
        }
        break;
      case 'pickGo':
        if (c && userHasBall && this.atBaseT >= 0) this.pickAndGo(c);
        break;
      case 'snipe':
        if (c && userHasBall && this.atBaseT >= 0) {
          this.atBaseT = -1;
          c.vx = dirOf(c.side) * 4;
          c.sidestepCD = 0;
          this.pop('SNIPE!', 'good');
        }
        break;
      case 'charge':
        this.charge();
        break;
      case 'diveTry':
        if (c && userHasBall && live && c.diveT <= 0) {
          c.diveT = 0.55;
          c.vx = dirOf(c.side) * 8.5;
          c.fx = 'dive';
          this.pop('DIVE!', 'good');
        }
        break;
      case 'call':
        this.resolveCall(a.id);
        break;
      case 'catch':
        this.catchPressT = this.time;
        break;
      case 'dropgoal':
        if (userHasBall && live && this.canDropGoal()) this.dropGoal(c!);
        break;
      case 'sidestep':
        if (c && userHasBall && c.sidestepT <= 0 && c.sidestepCD <= 0) {
          c.sidestepT = 0.35;
          c.sidestepCD = 1.5;
          c.sideDir = this.input.moveX !== 0 ? Math.sign(this.input.moveX) * this.camRightSign() : c.z > 0 ? -1 : 1;
          c.fx = c.sideDir * Math.cos(c.heading) > 0 ? 'sidestepR' : 'sidestepL';
        }
        break;
      case 'handoff':
        if (c && userHasBall && c.handoffT <= 0) {
          c.handoffT = 0.6;
          c.fx = 'handoff';
          const d = this.nearestOpponent(c, 2.2);
          if (d) this.tryFend(c, d);
        }
        break;
      case 'tackle':
        if (c && live && this.atBaseT < 0 && b.carrier && b.carrier.side === 1 && c.state === 'free') {
          const reach = { easy: 2.4, medium: 1.75, hard: 1.6, elite: 1.3 }[this.cfg.difficulty];
          if (dist(c.x, c.z, b.carrier.x, b.carrier.z) <= reach) this.attemptTackle(c, b.carrier, false);
        }
        break;
      case 'dive':
        if (c && live && this.atBaseT < 0 && c.state === 'free' && b.carrier && b.carrier.side === 1) {
          const carrier = b.carrier;
          const d = dist(c.x, c.z, carrier.x, carrier.z);
          c.diveT = 0.45;
          c.fx = 'dive';
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
      case 'addPlayer':
        this.addToRuck();
        break;
      case 'dodge':
        if (c && userHasBall && c.sidestepT <= 0 && c.sidestepCD <= 0) {
          c.sidestepT = 0.4;
          c.sidestepCD = 1.5;
          c.sideDir = a.dir * this.camRightSign();
          c.fx = c.sideDir * Math.cos(c.heading) > 0 ? 'sidestepR' : 'sidestepL';
        }
        break;
      case 'switch':
        if (this.possession() === 1 || !b.carrier) this.switchDefender();
        break;
      case 'setplay':
        if (userHasBall && live) this.startSetPlay(a.id);
        else if (this.ruck && this.ruck.att === 0) {
          this.pendingSetPlay = a.id; // run it as soon as the 9 has the ball
          this.say('Set play called', 'info');
        }
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

  /** Average distance of a side's support players from their attacking slots. */
  private attackSpread(side: Side): number {
    const c = this.ball.carrier;
    if (!c) return 0;
    let tot = 0;
    let n = 0;
    for (const p of this.teams[side]) {
      if (p === c || p.state !== 'free' || p.num <= 8) continue;
      tot += dist(p.x, p.z, p.tx, p.tz);
      n++;
    }
    return n ? tot / n : 0;
  }

  /** At the base of a ruck the referee gives you time, then calls "Use it!", then awards a scrum. */
  private useItCheck(c: P) {
    if (this.atBaseT > 5 && !this.useItCalled) {
      this.useItCalled = true;
      this.whistle();
      this.say('Use it!', 'info', 'Referee');
    }
    if (this.atBaseT > 10) {
      this.atBaseT = -1;
      this.whistle();
      this.say('Ball not used', 'bad', `Scrum ${this.teamShort(other(c.side))}`);
      const x = c.x;
      const z = c.z;
      this.stoppage(() => this.setupScrum(x, z, other(c.side)));
    }
  }

  /** ADD PLAYER at a ruck: bind the nearest free team-mate in. */
  private addToRuck() {
    const r = this.ruck;
    if (!r) return;
    const mine = r.att === 0 ? r.addAtt : r.addDef;
    if (mine >= 2) return;
    const d = dirOf(r.att);
    const cand = this.teams[0]
      .filter((p) => p.state === 'free' && p.num !== 9 && p !== this.controlled)
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
  private ruckBall(r: NonNullable<MatchEngine['ruck']>): 'quick' | 'slow' | 'danger' {
    const defBodies = r.addDef + (r.contest > 0.3 ? 1 : 0);
    if (defBodies > r.addAtt + 1 || r.contest > 0.55) return 'danger';
    const dur = r.dur - r.addAtt * 0.35 + r.addDef * 0.25 + r.contest * 0.6;
    return dur <= 1.35 ? 'quick' : 'slow';
  }

  /** Arc under the ruck that fills as the ball becomes available. */
  private updateRuckArc(r: { x: number; z: number; att: Side; progress: number }) {
    const mk = (color: string, opacity: number, order: number) => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
      m.renderOrder = order;
      this.scene.add(m);
      return m;
    };
    this.ruckArcBg ??= mk('#13204a', 0.85, 3);
    this.ruckArc ??= mk('#ffffff', 1, 4);
    const rr = this.ruck;
    if (rr) {
      const col = { quick: '#7dff3a', slow: '#ffb020', danger: '#ff3d5e' }[this.ruckBall(rr)];
      (this.ruckArc.material as THREE.MeshBasicMaterial).color.set(col);
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
    build(this.ruckArcBg, 1, 2.6, 3.0);
    build(this.ruckArc, r.progress, 2.65, 2.95);
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
    // Defending: you always control the defender best placed to tackle the ball carrier.
    const carrier = b.carrier ?? (b.state === 'pass' && b.pass ? b.pass.target : null);
    if (this.cfg.autoSwitch && carrier && carrier.side === 1 && this.controlled && !(this.input.tackleHold && this.controlled.state === 'free')) {
      const score = (p: P) => dist(p.x, p.z, carrier.x, carrier.z) + ((carrier.x - p.x) * dirOf(1) > 0 ? 6 : 0); // prefer defenders in front
      const best = this.teams[0].filter((p) => p.state === 'free').sort((p, q) => score(p) - score(q))[0];
      if (best && best !== this.controlled && (this.controlled.state !== 'free' || score(best) + 1.5 < score(this.controlled))) {
        this.controlled = best;
        this.nameFor = null;
      }
    }
    if (!this.controlled || this.controlled.state !== 'free' || this.phase !== 'play') {
      const free = this.teams[0].filter((p) => p.state === 'free');
      free.sort((p, q) => dist(p.x, p.z, b.x, b.z) - dist(q.x, q.z, b.x, b.z));
      if (free[0]) this.controlled = free[0];
    }
  }

  // ---------------------------------------------------------------- movement
  private maxSpeed(p: P) {
    // Quick, arcade-feel running: ~9.5 m/s for an average back.
    // Realistic pace: ~7.5 m/s cruising for an average back, a bit more when sprinting.
    let s = 4.6 + (p.r.pace / 100) * 2.4; // ~6.3 m/s (14 mph) for an average back, ~7.8 m/s sprinting
    if (this.ball.carrier === p) s *= 0.97;
    // Tired legs: below half stamina players lose up to 15% of their pace.
    s *= 0.85 + 0.15 * Math.min(1, p.stamina * 2);
    if (p === this.controlled && p.side === 0) s *= 1.04;
    return s;
  }

  private movePlayers(dt: number) {
    const inp = this.input;
    const joy = Math.hypot(inp.moveX, inp.moveY);
    const { fx, fz, rx, rz } = this.camAxes();
    for (const p of this.players) {
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
      const max = this.maxSpeed(p);
      const carrierNow = this.ball.carrier;
      const chasing = p === this.controlled && p.state === 'free' && inp.tackleHold && !!carrierNow && carrierNow.side !== p.side && this.phase === 'play' && this.atBaseT < 0;
      const userDriven = p === this.controlled && p.state === 'free' && (joy > 0.12 || this.ball.carrier === p) && this.phase !== 'placekick';
      if (chasing && carrierNow) {
        // Hold TACKLE: sprint to cut off the ball carrier.
        const lead = Math.min(0.6, dist(p.x, p.z, carrierNow.x, carrierNow.z) / 12);
        const tx = carrierNow.x + carrierNow.vx * lead - p.x;
        const tz = carrierNow.z + carrierNow.vz * lead - p.z;
        const n = Math.hypot(tx, tz) || 1;
        const spd = max * (p.stamina > 0.05 ? 1.24 : 1);
        dvx = (tx / n) * spd;
        dvz = (tz / n) * spd;
        p.stamina = clamp(p.stamina - 0.1 * dt, 0, 1);
      } else if (userDriven) {
        const sprinting = (inp.sprint || inp.sprintHold) && p.stamina > 0.05;
        const spd = max * (sprinting ? 1.24 : 1) * Math.min(1, joy * 1.15);
        if (joy > 0.05) {
          const mx = inp.moveX / Math.max(joy, 1);
          const my = inp.moveY / Math.max(joy, 1);
          const wx = rx * mx + fx * my;
          const wz = rz * mx + fz * my;
          const n = Math.hypot(wx, wz) || 1;
          dvx = (wx / n) * spd;
          dvz = (wz / n) * spd;
        }
        p.stamina = clamp(p.stamina + (sprinting && joy > 0.1 ? -0.14 : 0.12) * dt, 0, 1);
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
        p.stamina = clamp(p.stamina + 0.08 * dt, 0, 1);
      }
      if (p.sidestepT > 0 && this.ball.carrier === p) {
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

  private axesV = new THREE.Vector3();
  /** Ground-plane camera axes used to map the joystick to world directions. */
  private camAxes() {
    const f = this.axesV;
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
      // only re-slot occasionally, in case players have drifted badly out of order
      this.slotTimer = 6;
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
        this.ms.breaks[c.side]++;
        this.ps(c).breaks++;
        if (c.side === 0) this.pop('LINE BREAK!', 'good');
        this.lineBreakFrom = 1e9;
      }
    } else if (this.lineBreakFrom !== 1e9) this.lineBreakFrom = null;

    if (c.side === 0 && c === this.controlled && this.atBaseT >= 0) {
      this.atBaseT += dt;
      if (Math.hypot(this.input.moveX, this.input.moveY) > 0.5) this.atBaseT = -1; // sniping: the user runs it
      else this.useItCheck(c);
    }
    if (c.side === 1 || c !== this.controlled) this.cpuCarrier(dt, c);
  }

  // ---------------------------------------------------------------- AI
  private assignSlots() {
    const b = this.ball;
    const att = this.possession();
    const anchor = b.carrier ?? (b.pass ? b.pass.target : null);
    const ax = anchor ? anchor.x : b.x;
    const az = anchor ? anchor.z : b.z;
    const mates = this.teams[att].filter((p) => p !== anchor && p.state !== 'off' && p.state !== 'bound');
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
    this.slotCount = { [-1]: left.length, [1]: right.length };
    void ax;
  }

  private attackSlotTarget(p: P, ax: number, az: number, side: Side) {
    const d = dirOf(side);
    const k = p.slotK;
    // A clean staggered line, ~6m apart, each player a little deeper; extras form a second wave.
    // Fit the line into the room on that side so nobody gets stacked on the touchline.
    const n = Math.max(1, Math.min(7, this.slotCount[p.slotSide] ?? 7));
    const room = FIELD.halfW - 2.5 - az * p.slotSide - 4;
    // Attack style: forward-dominant = flat and tight, expansive = deeper and wider.
    const st = this.tac[side].attack;
    const depthK = (st === 'forwards' ? 1.2 : st === 'expansive' ? 2.3 : 1.8) * this.customTac(side).depth;
    const widthK = st === 'forwards' ? 0.85 : st === 'expansive' ? 1.12 : 1;
    const gap = clamp((room / n) * widthK * this.customTac(side).width, 2.6, 7);
    const j = Math.min(k, 6);
    const deep = k >= 7 ? 6 : 0;
    // forwards (1-8) hang a little flatter as pods, wingers always hold the width
    const wing = p.num === 11 || p.num === 14;
    const x = ax - d * (4.2 + j * depthK + deep + (p.num <= 8 ? -1.2 : 0));
    const zOff = wing ? Math.max((j + 0.5) * gap + 4, room - 1) : 4 + (j + 0.5) * gap;
    const z = clamp(az + p.slotSide * zOff, -FIELD.halfW + 2.5, FIELD.halfW - 2.5);
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
      // Project the line ahead with the carrier so support runners keep pace; at the base of a
      // ruck they sit a couple of metres deeper, ready to run onto the pass.
      const lead = carrier ? clamp(carrier.vx * dAtt, 0, 9) * 0.9 : 0;
      // At the base the line starts 2m deep and moves up ~3.5 m/s towards the gain line, so the
      // backs are already running when the scrum-half's pass arrives.
      const baseRun = this.atBaseT >= 0 ? -3 : 0; // hold the shape, deep, until the 9 plays it
      const t = this.attackSlotTarget(p, fx + dAtt * (lead + baseRun), fz, att);
      p.tx = t.x;
      p.tz = t.z;
      p.urgency = 0.95;
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

    const attackers = this.teams[att].filter((p) => p.state !== 'off' && p.state !== 'down' && p.state !== 'bound').sort((p, q) => p.z - q.z);
    // Chasers: up to two closest defenders hunt the carrier.
    const hunt = carrier ?? (b.pass ? b.pass.target : null);
    const sorted = [...defenders].sort((p, q) => dist(p.x, p.z, fx, fz) - dist(q.x, q.z, fx, fz));
    const chasers = new Set(this.atBaseT >= 0 ? [] : sorted.slice(0, this.phase === 'kickoff' ? 2 : 1));
    const fb = defenders.find((p) => p.num === 15);
    const lineDef = defenders.filter((p) => !chasers.has(p) && p !== fb).sort((p, q) => p.z - q.z);
    // Line speed: blitz rushes up, drift sits off and slides; harder CPUs get up quicker.
    const ds = this.tac[def].defence;
    const lineGap = ds === 'blitz' ? 3.2 : ds === 'drift' ? 6 : 5;
    const lineX = fx + dAtt * (this.atBaseT >= 0 ? 3.4 : lineGap);
    const lineUrg = (ds === 'blitz' ? 0.95 : ds === 'drift' ? 0.72 : 0.8) * this.customTac(def).lineSpeed + (def === 1 ? { easy: -0.08, medium: 0.025, hard: 0.05, elite: 0.1 }[this.cfg.difficulty] : 0);
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
    const uc = this.controlled;
    if (carrier && this.phase === 'play' && this.atBaseT < 0 && uc && this.input.tackleHold && uc.side !== carrier.side && uc.state === 'free' && uc.tackleCD <= 0) {
      const reach = { easy: 2.2, medium: 1.65, hard: 1.5, elite: 1.2 }[this.cfg.difficulty];
      if (dist(uc.x, uc.z, carrier.x, carrier.z) <= reach) this.attemptTackle(uc, carrier, false);
    }
    // CPU tackles (the user's controlled defender only tackles when the button is pressed)
    // The ball at the base of a ruck is still part of it: nobody may tackle the 9 until he plays it.
    if (carrier && this.phase === 'play' && this.atBaseT < 0) {
      for (const p of this.teams[def]) {
        if (p.state !== 'free' || p.tackleCD > 0 || p === this.controlled) continue;
        const d = dist(p.x, p.z, carrier.x, carrier.z);
        // Only tackle from in front or the side, not by catching up from behind on a sprinter.
        const fromBehind = (carrier.x - p.x) * dirOf(carrier.side) > 0.4 && Math.hypot(carrier.vx, carrier.vz) > 5;
        if (d < 1.05 && !fromBehind) {
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
    const atBase = this.atBaseT >= 0 && this.ball.carrier === c;
    c.tx = atBase ? c.x : c.x + d * 10;
    c.tz = atBase ? c.z : clamp(c.z + steerZ, -33, 33);
    c.urgency = atBase ? 0.1 : 1;

    this.aiDecisionT -= dt;
    if (atBase) {
      this.atBaseT += dt;
      // The CPU scrum-half waits for its line to set before passing.
      if (c.side === 1 && this.atBaseT > 1.4 && (this.attackSpread(1) < 3 || this.atBaseT > 3.2)) {
        this.atBaseT = -1;
        const toLine = FIELD.tryX - c.x * d;
        const ownHalf = c.x * d < 0;
        const kickK = { low: 0.5, balanced: 1, territory: 1.8 }[this.tac[1].kicking];
        if (toLine < 6 && rand.chance(0.45)) this.pickAndGo(c);
        else if (ownHalf && rand.chance(0.16 * kickK)) {
          this.kickTo(c, rand.range(20, 30), rand.range(-0.25, 0.25), 'box');
          this.say('Box kick', 'info');
        } else if (!this.nearestOpponent(c, 4.5) && rand.chance(0.12)) {
          c.vx = d * 4; // snipe round the fringe
        } else this.doPass(c, rand.chance(0.2), 0, true);
      }
      return;
    }
    if (c.side === 0) return; // user team support carrier is never AI driven beyond running
    if (this.aiDecisionT > 0) return;
    this.aiDecisionT = 0.45;
    // tactical kick from deep
    const ownDist = FIELD.tryX + c.x * d;
    const kickK = { low: 0.45, balanced: 1, territory: 1.7 }[this.tac[c.side].kicking];
    if ((c.num === 10 || c.num === 15 || c.num === 9) && ownDist < 32 * (kickK > 1 ? 1.4 : 1) && nearest < 9 && rand.chance(0.35 * kickK)) {
      this.kickTo(c, rand.range(32, 48), rand.range(-0.45, 0.45), 'punt');
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
        c.fx = c.sideDir * Math.cos(c.heading) > 0 ? 'sidestepR' : 'sidestepL';
      } else if (c.handoffT <= 0 && rand.chance(c.r.strength / 200)) {
        c.handoffT = 0.6;
        c.fx = 'handoff';
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
    return { easy: 0.12, medium: -0.005, hard: -0.04, elite: -0.11 }[this.cfg.difficulty];
  }

  // ---------------------------------------------------------------- tackles
  private attemptTackle(t: P, c: P, dive: boolean) {
    if (this.offload || c.state !== 'free') return;
    t.tackleCD = 0.5;
    if (!dive) t.fx = 'tackle';
    const evasion = c.r.strength * 0.45 + c.r.pace * 0.3 + c.r.handling * 0.25;
    let p = 0.62 + (t.r.tackling - evasion) / 110;
    // Fresh legs win contests: a tired carrier is easier to bring down, a tired tackler misses more.
    p += (1 - c.stamina) * 0.12 - (1 - t.stamina) * 0.1;
    // Gang tackle: a second defender arriving makes it stick.
    if (this.teams[t.side].some((o) => o !== t && o.state === 'free' && dist(o.x, o.z, c.x, c.z) < 2.2)) p += 0.1;
    if (dive) p += 0.08;
    if (c.handoffT > 0) p -= 0.12 + (c.r.strength - t.r.strength) / 200;
    if (c.sidestepT > 0) p -= 0.2 * (c.r.pace / 90);
    p += t.side === 0 ? this.userAssist() + 0.08 : -this.userAssist() - 0.12;
    // Sprinting carriers are harder to bring down.
    if (c.side === 0 && Math.hypot(c.vx, c.vz) > 6.2) p -= 0.08;
    // Automatic fend: strong carriers driving through contact can bump tacklers off.
    if (c.side === 0 && c === this.controlled && Math.hypot(this.input.moveX, this.input.moveY) > 0.5) p -= Math.max(0, (c.r.strength - t.r.strength) / 160);
    p = clamp(p, 0.15, 0.95);
    if (rand.chance(p)) {
      this.tackleMade(t, c);
    } else {
      t.state = 'down';
      t.timer = dive ? 1.4 : 1.1;
      t.tackleCD = 1.6;
      if (!c.av.busy) c.fx = 'handoff';
      if (rand.chance(0.6)) this.say(line('brokenTackle'), c.side === 0 ? 'good' : 'bad');
      this.ms.missed[t.side]++;
      if (c.side === 0) this.pop('BROKEN TACKLE!', 'good');
    }
  }

  private tackleMade(t: P, c: P) {
    const speed = Math.hypot(t.vx, t.vz) + Math.hypot(c.vx, c.vz);
    const big = t.r.tackling > 78 && (speed > 9 || rand.chance(0.2));
    if (t.side === 0) this.stats.tackles++;
    this.ms.tackles[t.side]++;
    this.ps(t).tackles++;
    audio.thud(big ? 1 : 0.7);
    if (t.side === 0 || c.side === 0) haptic(big ? 'bighit' : 'tackle');
    if (big) {
      this.say(line('bigHit'), t.side === 0 ? 'good' : 'bad');
      this.pop('BIG HIT!', 'big');
      this.hitStopT = 0.06;
    }
    c.state = 'down';
    c.timer = 1.5; // tackled players are back on their feet after 1.5s
    this.particles.dust(c.x, c.z, big ? 1.4 : 0.7);
    c.vx *= 0.3;
    c.vz *= 0.3;
    // Dominant tackle: the carrier is driven back about a metre towards their own line.
    if (big) c.vx = -dirOf(c.side) * 6;
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

    // The user's carrier gets a split-second, in slow motion, to offload in the tackle.
    if (c.side === 0 && c === this.controlled && !this.cfg.drill) {
      this.offload = { c, t, left: 0.55 };
      this.timeScale = 0.35;
      this.emit({ type: 'hud', hud: this.hud() });
      return;
    }
    // CPU ball players with good hands sometimes get the ball away in contact.
    if (c.side === 1 && c.r.handling > 78 && rand.chance(0.12)) {
      const tgt = this.passTarget(c, c.z < 0 ? 1 : -1, false) ?? this.passTarget(c, c.z < 0 ? -1 : 1, false);
      if (tgt && dist(tgt.x, tgt.z, c.x, c.z) < 7) {
        this.pop('OFFLOAD!', 'bad');
        this.doPass(c, false, 0);
        return;
      }
    }
    this.afterContact(t, c);
  }

  /** The offload window ran out or was used. */
  private tickOffload(dt: number) {
    const o = this.offload;
    if (!o) return;
    o.left -= dt / Math.max(0.05, this.timeScale);
    if (o.left <= 0) {
      this.offload = null;
      this.timeScale = 1;
      this.emit({ type: 'hud', hud: this.hud() });
      if (this.ball.carrier === o.c) this.afterContact(o.t, o.c);
    }
  }

  private tryOffload(dir: -1 | 0 | 1) {
    const o = this.offload!;
    this.offload = null;
    this.timeScale = 1;
    const c = o.c;
    const chance = clamp(0.72 + (c.r.handling - 70) / 90 + (c.r.strength - o.t.r.tackling) / 220 + this.userAssist(), 0.45, 0.94);
    if (!rand.chance(chance)) {
      if (rand.chance(0.3)) {
        this.pop('KNOCK-ON', 'bad');
        this.knockOn(c);
      } else {
        this.say('Offload not on', 'info', 'Ball to ground');
        this.afterContact(o.t, c);
      }
      return;
    }
    if (this.doPass(c, false, dir)) {
      this.pop('OFFLOAD!', 'good');
      haptic('tackle');
    } else this.afterContact(o.t, c);
  }

  private afterContact(t: P, c: P) {
    // HOLD TACKLE: the user's tackler tries to hold the carrier up and win the ball.
    // Holding TACKLE on a big forward: a strong tackler can stay up and rip the ball (play goes on).
    if (t.side === 0 && t === this.controlled && this.input.tackleHold && !this.cfg.drill && c.num <= 8) {
      const chance = clamp(0.1 + (t.r.strength - c.r.strength) / 160 + this.userAssist(), 0.04, 0.3);
      if (rand.chance(chance)) {
        this.pop('TURNOVER!', 'good');
        this.say('Ripped in the tackle!', 'good');
        this.ms.turnovers[0]++;
        t.state = 'free';
        this.giveBall(t);
        this.phase = 'play';
        this.assignSlots();
        return;
      }
    }
    // High tackle (more likely when the carrier is ducking out of a step)
    if (rand.chance(0.03 * this.strict() * (c.sidestepT > 0 ? 3 : 1))) {
      this.whistle();
      this.say('High tackle!', t.side === 0 ? 'bad' : 'good', `Penalty ${this.teamShort(c.side)}`);
      const x = c.x;
      const z = c.z;
      this.stoppage(() => this.awardPenalty(c.side, x, z));
      return;
    }
    // Knock-on in contact
    if (rand.chance(0.015 * (1.4 - c.r.handling / 100) * (this.cfg.weather === 'rain' ? 1.8 : 1))) {
      this.knockOn(c);
      return;
    }
    // Held up by big forwards -> maul
    if (c.num <= 8 && c.r.strength > 78 && rand.chance(0.05)) {
      c.state = 'free';
      t.state = 'free';
      this.startMaul(c.x, c.z, c.side, c);
      return;
    }
    this.startRuck(c, t);
  }

  // ---------------------------------------------------------------- passing
  /** Receiver for a pass to world side s (+1 = +z), or undefined if nobody is there. */
  /**
   * Best receiver on side s (+1/-1 in world z). Short passes look for a runner 4-10m away who is
   * behind the ball and not swamped by a defender; long (skip) passes look 12-20m out and skip the first man.
   */
  private passTarget(passer: P, s: number, long: boolean): P | undefined {
    const d = dirOf(passer.side);
    const opp = this.teams[other(passer.side)];
    const cands = this.teams[passer.side].filter((p) => {
      if (p === passer || p.state !== 'free') return false;
      const lat = (p.z - passer.z) * s;
      const behind = (passer.x - p.x) * d;
      return lat > 1.8 && behind > -1 && behind < 14 && dist(p.x, p.z, passer.x, passer.z) < (long ? 30 : 20);
    });
    if (!cands.length) return undefined;
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

  private doPass(passer: P, long: boolean, dirHint: -1 | 0 | 1, spin = false): boolean {
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
      const pick = (s: number) => this.passTarget(passer, s, long);
      if (side !== 0) {
        // The user chose a side: never throw it the other way.
        target = pick(side);
        if (!target && passer.side === 0 && dirHint !== 0) this.say('No one there!', 'info');
      } else {
        const sOpen = passer.z < 0 ? 1 : -1;
        target = pick(sOpen) ?? pick(-sOpen);
      }
    }
    if (!target) return false;
    const d = dirOf(passer.side);
    const distTo = dist(passer.x, passer.z, target.x, target.z);
    // Forward pass: long passes under pressure occasionally drift forward (not in arcade rules).
    const fpChance = { arcade: 0, standard: 0.006, sim: 0.025 }[this.cfg.rules] * (long ? 1.6 : 0.6) * (this.nearestOpponent(passer, 2.5) ? 1.6 : 1);
    if (!this.cfg.drill && this.phase === 'play' && rand.chance(fpChance)) {
      this.whistle();
      this.pop('FORWARD PASS', passer.side === 0 ? 'bad' : 'good');
      this.say('Forward pass', passer.side === 0 ? 'bad' : 'good', `Scrum ${this.teamShort(other(passer.side))}`);
      const x = passer.x;
      const z = passer.z;
      this.ball.carrier = null;
      this.ball.state = 'dead';
      this.stoppage(() => this.setupScrum(x, z, other(passer.side)));
      return true;
    }
    const speed = spin ? 20 : long ? 21 : 17; // flat, fizzed passes
    const T = clamp(distTo / speed, 0.22, 1.3);
    // Lead the receiver: aim where he will be, running onto it.
    const run = Math.max(0, target.vx * d);
    let tx = target.x + target.vx * T + d * Math.min(1.2, run * 0.15);
    let tz = target.z + target.vz * T;
    let err = (1 - passer.r.passing / 100) * (long ? 1.8 : 0.9);
    if (passer.side === 0) err *= { easy: 0.3, medium: 0.725, hard: 0.85, elite: 1.05 }[this.cfg.difficulty];
    tx += rand.range(-err, err) * 0.5;
    // A pass always travels slightly backwards: aim at the receiver's line, never in front of the passer.
    if ((tx - passer.x) * d > -0.3) tx = passer.x - d * 0.3;
    tz += rand.range(-err, err);
    const forward = (tx - passer.x) * d > 1.2;
    this.ball.state = 'pass';
    this.ball.carrier = null;
    this.ball.pass = { fx: passer.x, fz: passer.z, tx, tz, t: 0, T, peak: long ? 0.9 : 0.35, target, passer, long, forward };
    // the receiver attacks the ball at pace
    target.urgency = 1;
    this.ball.lastSide = passer.side;
    this.atBaseT = -1;
    passer.kickT = 0.2;
    passer.fx = 'pass';
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
    const cands = this.players
      .filter((p) => p.state === 'free' && dist(p.x, p.z, b.x, b.z) < (p === f.target ? 3.2 : p.side === f.passer.side ? 1.2 : 0.7))
      .sort((p, q) => dist(p.x, p.z, b.x, b.z) - dist(q.x, q.z, b.x, b.z));
    const recv = cands.includes(f.target) && tDist < 3.2 ? f.target : cands[0];
    if (!recv) {
      // nobody there: ball falls loose
      const vx = (f.tx - f.fx) / f.T;
      const vz = (f.tz - f.fz) / f.T;
      this.looseBall(b.x, b.y, b.z, vx * 0.5, 0, vz * 0.5);
      return;
    }
    if (recv.side !== f.passer.side) {
      if (rand.chance(0.3)) {
        this.say(line('intercept'), recv.side === 0 ? 'good' : 'bad');
        this.pop('INTERCEPT!', recv.side === 0 ? 'good' : 'bad');
        this.ms.turnovers[recv.side]++;
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
    let pc = (recv.side === 0 ? 0.985 : 0.96) + (recv.r.handling - 75) / 400 - (f.long ? 0.02 : 0) - pressure * 0.5;
    if (recv.side === 0) pc += this.userAssist();
    if (rand.chance(clamp(pc, 0.7, 0.995)) || this.cfg.drill === 'passing') {
      if (recv.side === 0) this.stats.passes++;
      this.giveBall(recv);
      // catch on the run: keep his momentum going forward
      const dd = dirOf(recv.side);
      if (recv.vx * dd < 4) recv.vx = dd * Math.max(4, recv.vx * dd);
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
    if (changed) this.phaseCount = 0;
    b.grubber = false;
    b.penTouch = false;
    if (b.state === 'pass' || b.state === 'air') p.fx = 'catch';
    b.state = 'held';
    b.carrier = p;
    b.pass = null;
    b.goalCheck = null;
    b.lastSide = p.side;
    if (this.phase === 'kickoff') this.phase = 'play';
    if (changed) this.setPlay = null;
    this.assignSlots();
    this.slotTimer = 6;
    if (p.side === 0) this.controlled = p;
  }

  private knockOn(p: P) {
    this.whistle();
    haptic('tackle');
    audio.groan();
    if (!this.offload) this.pop('KNOCK-ON', p.side === 0 ? 'bad' : 'good');
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
  /** Heading angle (relative to the side's attacking direction) that points from (x,z) to (tx,tz). */
  private aimTo(side: Side, x: number, z: number, tx: number, tz: number) {
    return Math.atan2(tz - z, (tx - x) * dirOf(side));
  }

  /**
   * Launch velocity so the ball lands `dist` metres away along heading `aim`.
   * Punts/box/drop kicks: solved from a flight time. Grubbers: solved by simulating the roll.
   */
  private kickVelocity(dist: number, aim: number, side: Side, type: KickType) {
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
  private kickTo(p: P, dist: number, aim: number, type: KickType, exact = false, errMul = 1) {
    const skill = clamp(1.15 - p.r.kicking / 100, 0.1, 0.8) * errMul;
    const aimErr = exact ? 0 : (rand.next() - 0.5) * 2 * skill * (type === 'grubber' ? 0.09 : 0.11);
    const distErr = exact ? 1 : 1 + (rand.next() - 0.5) * 2 * skill * 0.18;
    const v = this.kickVelocity(dist * distErr, aim + aimErr, p.side, type);
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
    b.wind = type !== 'grubber';
    b.grubber = type === 'grubber';
    b.hopT = 0.3;
    b.goalCheck = type === 'drop' ? { side: p.side, kind: 'drop' } : null;
    this.kickCurl = 0;
    p.kickT = 0.4;
    p.fx = 'kick';
    this.atBaseT = -1;
    audio.kick();
    for (const pl of this.players) pl.catchCD = pl === p ? 1.2 : 0.35;
    this.setPlay = null;
    if (p.side === 0 && type === 'drop') this.say('Drop goal attempt…', 'info');
  }

  private catchPressT = -9;
  private aimFreeze = false;
  /** Freeze play while the user aims a kick. */
  setAimFreeze(on: boolean) {
    this.aimFreeze = on;
    if (!on) this.input.kickAim.active = false;
  }
  /** Kick-off / 22 drop-out the user aims by dragging. */
  private kickoffAim: null | { kicker: P; atX: number; kick: (t: { x: number; z: number }, T: number) => void; side: Side } = null;
  private placeT = 0;
  /** CPU conversion charge window timer (-1 = none) */
  private chargeT = -1;
  private charging = false;
  private cpuCharging = false;
  private tickCharge(dt: number) {
    // Your conversion: take too long and their line charges you (you can see them coming).
    // Your conversion: their line charges every time once your kicker starts his approach.
    if (this.phase === 'placekick' && this.placeKind === 'conversion' && this.placeSide === 0 && this.ball.state === 'dead' && this.time - this.placeT > 2.2) {
      const b = this.ball;
      if (!this.cpuCharging) {
        this.cpuCharging = true;
        this.pop('THEY\'RE CHARGING!', 'bad');
        this.say('They are charging!', 'bad', 'Kick it before they get there');
        haptic('tackle');
      }
      const n = { easy: 1, medium: 2, hard: 3, elite: 3 }[this.cfg.difficulty];
      for (const p of this.teams[1].filter((q) => q.state === 'free').sort((q, r) => dist(q.x, q.z, b.x, b.z) - dist(r.x, r.z, b.x, b.z)).slice(0, n)) {
        p.tx = p.gx = b.x;
        p.tz = p.gz = b.z;
        p.urgency = 0.8;
      }
    } else if (this.phase !== 'placekick') this.cpuCharging = false;
    if (this.chargeT < 0 || this.phase !== 'placekick') {
      this.charging = false;
      return;
    }
    const was = this.chargeT < 1.4;
    this.chargeT += dt;
    if (was && this.chargeT >= 1.4) this.emit({ type: 'hud', hud: this.hud() });
    if (this.charging) {
      // your chasers sprint at the ball
      const b = this.ball;
      for (const p of this.teams[0].filter((q) => q.state === 'free').sort((q, r) => dist(q.x, q.z, b.x, b.z) - dist(r.x, r.z, b.x, b.z)).slice(0, 3)) {
        p.tx = p.gx = b.x;
        p.tz = p.gz = b.z;
        p.urgency = 1;
      }
    }
  }
  private charge() {
    if (this.chargeT < 0 || this.charging) return;
    if (this.chargeT < 1.4) {
      this.say('Too early!', 'bad', 'Wait for the kicker to start his run-up');
      this.chargeT = -1;
      return;
    }
    this.charging = true;
    this.pop('CHARGE!', 'good');
  }
  private penTouch: null | { kicker: P } = null;
  private kickoffKick() {
    const ka = this.kickoffAim!;
    this.kickoffAim = null;
    const dk = dirOf(ka.side);
    let t = this.kickTarget ?? { x: ka.atX + dk * 12, z: 10 };
    // must travel 10m; can't go out on the full beyond ~55m
    const fwd = clamp((t.x - ka.atX) * dk, 10, 55);
    t = { x: ka.atX + dk * fwd, z: clamp(t.z, -33, 33) };
    const T = fwd < 20 ? 2.7 : 3.3;
    ka.kick(t, T);
    if (fwd < 20) for (const p of this.teams[ka.side].slice(3, 8)) {
      p.tx = t.x;
      p.tz = t.z;
      p.urgency = 1;
    }
    this.emit({ type: 'hud', hud: this.hud() });
  }
  private loGeo = { x: 0, s: 1 };
  private loThrow: null | { t: number; dur: number; from: { x: number; z: number }; to: { x: number; z: number }; jumper: P; rival: P; wobble: boolean } = null;
  /** Lineout throw in flight: jumpers lifted, ball arcing in from touch. */
  private updateLineoutThrow(dt: number) {
    const lt = this.loThrow;
    if (!lt) return;
    lt.t += dt;
    const u = Math.min(1, lt.t / lt.dur);
    // lifters get the jumper up early (by 60% of the flight), the rival a touch later
    const lift = (k: number) => 1.4 * Math.min(1, Math.max(0, (u - k) / 0.45));
    lt.jumper.lift = lift(0.05);
    lt.rival.lift = lift(0.2) * 0.85;
    const b = this.ball;
    b.state = 'dead';
    b.carrier = null;
    b.x = lt.from.x + (lt.to.x - lt.from.x) * u + (lt.wobble ? Math.sin(u * 9) * 0.25 : 0);
    b.z = lt.from.z + (lt.to.z - lt.from.z) * u;
    b.y = 2 + (3.1 - 2) * u + Math.sin(u * Math.PI) * 2.2;
  }
  private penaltyTouchKick(a: Extract<InputAction, { type: 'kick' }>) {
    const k = this.penTouch!.kicker;
    this.penTouch = null;
    const d0 = dirOf(0);
    let dist = a.dist;
    let aim = 0;
    if (a.tx !== undefined && a.tz !== undefined) {
      dist = Math.min(Math.hypot(a.tx - k.x, a.tz - k.z), KICK_MAX.touch);
      aim = Math.atan2(a.tz - k.z, (a.tx - k.x) * d0);
    }
    const pw = a.power ?? 0.85;
    this.kickTo(k, dist * (pw < 0.6 ? 0.55 + pw * 0.75 : 1), aim, 'touch', false, pw > 1 ? 1 + (pw - 1) * 5 : 1);
    this.ball.penTouch = true;
    this.phase = 'play';
    this.phaseT = 0;
    this.assignSlots();
  }
  /** where the user has pointed on the pitch for the current kick */
  private kickTarget: { x: number; z: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** The player about to kick: the carrier, or the penalty kicker lining up a kick to touch. */
  private kickerNow(): P | null {
    if (this.penTouch) return this.penTouch.kicker;
    if (this.kickoffAim) return this.kickoffAim.kicker;
    const c = this.controlled;
    return c && this.ball.carrier === c ? c : null;
  }
  /** Point on the pitch under a screen position (for aiming kicks). Returns metres to it from the kicker. */
  aimKickAt(clientX: number, clientY: number, kind: KickKind): number | null {
    const k = this.kickerNow();
    if (!k) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV2);
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
    this.kickTarget = { x: k.x + dx, z: k.z + dz };
    return Math.min(L, max);
  }
  /**
   * Flick aim: the swipe vector on screen (px, right / down positive) becomes the kick: its
   * direction aims relative to the camera, its length sets the distance (half the screen = max range).
   */
  aimKickFlick(dxPx: number, dyPx: number, kind: KickKind): number | null {
    const k = this.kickerNow();
    if (!k) return null;
    const L = Math.hypot(dxPx, dyPx);
    if (L < 12) return null;
    const max = KICK_MAX[kind];
    const metres = Math.min(max, (L / (window.innerHeight * 0.5)) * max);
    const { fx, fz, rx, rz } = this.camAxes();
    const ux = (dxPx / L) * rx + (-dyPx / L) * fx;
    const uz = (dxPx / L) * rz + (-dyPx / L) * fz;
    const n = Math.hypot(ux, uz) || 1;
    this.kickTarget = { x: k.x + (ux / n) * metres, z: k.z + (uz / n) * metres };
    return metres;
  }

  clearKickTarget() {
    this.kickTarget = null;
  }
  /** penalty count multiplier by rules mode */
  private strict(): number {
    return { arcade: 0.45, standard: 1, sim: 1.5 }[this.cfg.rules];
  }
  private advantage: null | { side: Side; x: number; z: number; startX: number; t: number } = null;
  private pens: [number, number] = [0, 0];
  private binned: { p: P; until: number }[] = [];
  private tickReferee(dt: number) {
    const a = this.advantage;
    if (a) {
      a.t += dt;
      const c = this.ball.carrier;
      const gained = c && c.side === a.side ? (c.x - a.startX) * dirOf(a.side) : 0;
      if (gained >= 10 || this.phase === 'placekick') {
        this.advantage = null;
        this.say('Advantage over', 'info');
      } else if (this.possession() !== a.side || a.t > 5) {
        // nothing gained: back for the penalty
        this.advantage = null;
        this.whistle();
        this.say('Back for the penalty', a.side === 0 ? 'good' : 'bad', `Penalty ${this.teamShort(a.side)}`);
        const { x, z, side } = a;
        this.stoppage(() => this.awardPenalty(side, x, z));
      }
    }
    // sin bin: players return after 2 game minutes (120 of the 2400 game seconds in a half)
    const now = (this.half - 1) * 2400 + this.gameSec;
    for (const b of [...this.binned]) {
      if (now >= b.until) {
        this.binned = this.binned.filter((x) => x !== b);
        b.p.state = 'free';
        this.place(b.p, -dirOf(b.p.side) * 30, 0);
        this.say('Back from the bin', 'info', b.p.name);
      }
    }
  }
  /** Repeated penalties earn a yellow card: a back from the offending team sits out 2 minutes. */
  private penaltyAgainst(off: Side) {
    this.pens[off]++;
    this.ms.pens[off]++;
    if (this.cfg.rules === 'arcade' || this.cfg.drill) return;
    const limit = this.cfg.rules === 'sim' ? 3 : 4;
    if (this.pens[off] >= limit && !this.binned.some((b) => b.p.side === off)) {
      this.pens[off] = 0;
      const cands = this.teams[off].filter((p) => p.num >= 11 && p.state !== 'off');
      const p = cands[Math.floor(Math.random() * cands.length)];
      if (!p) return;
      p.state = 'off';
      if (this.controlled === p) this.controlled = null;
      const now = (this.half - 1) * 2400 + this.gameSec;
      this.binned.push({ p, until: now + 120 });
      this.pop('YELLOW CARD', off === 0 ? 'bad' : 'good');
      this.say('Yellow card!', off === 0 ? 'bad' : 'good', `${p.name} — 2 minutes in the bin`);
    }
  }
  private call: null | { title: string; opts: { id: string; label: string; sub?: string }[]; t: number; timeout: number; def: string; on: (id: string) => void } = null;
  private openCall(title: string, opts: { id: string; label: string; sub?: string }[], def: string, timeout: number, on: (id: string) => void) {
    this.call = { title, opts, t: 0, timeout, def, on };
    this.emit({ type: 'hud', hud: this.hud() });
  }
  private tickCall(dt: number) {
    const c = this.call;
    if (!c) return;
    c.t += dt;
    if (c.t >= c.timeout) this.resolveCall(c.def);
  }
  private resolveCall(id: string) {
    const c = this.call;
    if (!c || !c.opts.some((o) => o.id === id)) return;
    this.call = null;
    audio.click();
    c.on(id);
    this.emit({ type: 'hud', hud: this.hud() });
  }
  /** Kick from the picker: power under ~0.6 falls short, over 1 (held too long) sprays it. */
  private userKick(c: P, kind: KickKind, dist: number, angle: number, power: number, tx?: number, tz?: number) {
    if (kind === 'box' && c.num !== 9) kind = 'high';
    const short = power < 0.6 ? 0.55 + power * 0.75 : 1;
    const errMul = power > 1 ? 1 + (power - 1) * 5 : power < 0.35 ? 1.4 : 1;
    let aim = ((angle * Math.PI) / 180) * this.camRightSign();
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
    this.kickTo(c, dist * short, aim, kind, false, errMul);
    if (kind === 'high' || kind === 'box' || kind === 'chip' || kind === 'cross') {
      // chasers go after it
      const land = () => this.predictLanding();
      const t = this.teams[c.side];
      const chasers = kind === 'cross' ? [t[13], t[10]] : kind === 'chip' ? [c] : [t[10], t[13], t[14]];
      this.setPlay = { id: 'upandunder', targets: [], routes: new Map(chasers.map((p) => [p, land] as const)), until: this.time + 4 };
    }
  }

  /** Is the user's carrier in range for a drop goal? */
  private canDropGoal(): boolean {
    const c = this.ball.carrier;
    if (!c || c.side !== 0 || c !== this.controlled || this.phase !== 'play') return false;
    const D = dist(c.x, c.z, FIELD.tryX, 0);
    return D <= 42 && D >= 8 && Math.abs(c.z) < 24 && c.x < FIELD.tryX - 4;
  }

  private dropGoal(p: P) {
    const d = dirOf(p.side);
    const D = dist(p.x, p.z, d * FIELD.tryX, 0);
    const aim = this.aimTo(p.side, p.x, p.z, d * FIELD.tryX, 0);
    // aim beyond the posts so the ball is still climbing/high as it crosses the bar
    this.kickTo(p, D + 12, aim, 'drop');
  }

  private looseBall(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const b = this.ball;
    Object.assign(b, { x, y, z, vx, vy, vz, state: 'air', carrier: null, pass: null, bounced: false, wind: false, goalCheck: null, grubber: false });
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
        const wk = b.goalCheck ? 0.16 : 0.05;
        b.vx += this.wind.x * wk * dt;
        b.vz += this.wind.z * wk * dt;
        if (this.kickCurl) {
          // swerve: sideways acceleration perpendicular to the flight
          const sp = Math.hypot(b.vx, b.vz) || 1;
          b.vx += (-b.vz / sp) * this.kickCurl * dt;
          b.vz += (b.vx / sp) * this.kickCurl * dt;
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
        this.goalResult(gc.side, gc.kind, good);
        if (gc.kind !== 'drop' || good) return;
      }
    }
    if (this.phase !== 'play' && this.phase !== 'kickoff') return;

    // touch
    if (Math.abs(b.z) > FIELD.halfW) {
      const kicker = b.kicker;
      let throwSide = other(b.lastSide);
      let x = b.x;
      if (b.penTouch) {
        // penalty kicked to touch: the kicking side throws in where it went out
        throwSide = b.lastSide;
        b.penTouch = false;
        if (throwSide === 0) this.pop('FOUND TOUCH!', 'good');
      } else if (
        kicker &&
        b.bounced &&
        b.lastSide === kicker.side &&
        b.kickFromX * dirOf(kicker.side) < 0 &&
        b.x * dirOf(kicker.side) > FIELD.tryX - 22
      ) {
        // 50:22 — kicked from your own half, bounced in, out inside their 22: your throw
        throwSide = kicker.side;
        this.pop('50:22!', kicker.side === 0 ? 'good' : 'bad');
        this.say('50:22!', kicker.side === 0 ? 'good' : 'bad', `Lineout ${this.teamShort(kicker.side)}`);
        audio.cheer(0.8);
      } else if (kicker && !b.bounced && kicker.x * dirOf(kicker.side) > -28) x = b.kickFromX; // out on the full
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
      let pc = 0.92 + (p.r.handling - 70) / 250;
      if (p.side === 0) {
        pc += this.userAssist();
        // CATCH timing: a press in the last moment = clean take, mashing early = fumble risk.
        const since = this.time - this.catchPressT;
        if (since < 0.45) pc = 0.995;
        else if (since < 1.2) pc -= 0.06;
      }
      if (this.cfg.weather === 'rain') pc -= 0.07;
      if (!rand.chance(clamp(pc, 0.55, 0.98))) {
        p.catchCD = 0.6;
        if (rand.chance(0.35) && !this.cfg.drill) {
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
    this.ps(c).tries++;
    c.fx = 'dive';
    if (side === 0) this.stats.tries++;
    this.phase = 'dead';
    this.ball.state = 'dead';
    c.state = 'free';
    c.vx = c.vz = 0;
    this.whistle();
    audio.cheer(side === 0 ? 1.2 : 0.7);
    haptic('try');
    this.emit({ type: 'try', scorer: c.name, team: this.teamShort(side), userScored: side === 0 });
    this.emit({ type: 'hud', hud: this.hud() });
    this.exciteBoost = 1;
    const kit = side === 0 ? this.cfg.user.kit : this.cfg.cpu.kit;
    this.particles.confetti(c.x, c.z, [kit.primary, kit.secondary, '#ffffff', '#c6ff1a']);
    for (const m of this.teams[side]) if (dist(m.x, m.z, c.x, c.z) < 18 && m.state !== 'off') {
      m.celebrateT = 3.2;
      m.tx = c.x;
      m.tz = c.z;
      m.urgency = 0.5;
    }
    this.camMode = 'try';
    this.camFocus = c;
    this.camModeT = 0;
    const clip = this.history.slice(-96);
    if (this.cfg.drill) {
      this.after(2, () => this.drillNext());
      return;
    }
    const z = clamp(c.z, -30, 30);
    const conversion = () => this.setupPlaceKick(side, 'conversion', dirOf(side) * (FIELD.tryX - 12 - Math.abs(z) * 0.1), z);
    // TMO: close ones (near the corner or a scramble) go upstairs.
    const close = Math.abs(c.z) > 26 || rand.chance(0.12);
    const tmo = this.cfg.rules !== 'arcade' && close && rand.chance(this.cfg.rules === 'sim' ? 0.7 : 0.45);
    const afterReplay = !tmo
      ? conversion
      : () => {
          this.emit({ type: 'tmo', stage: 'check' });
          this.after(2.2, () => {
            const given = rand.chance(0.72);
            this.emit({ type: 'tmo', stage: given ? 'try' : 'notry' });
            if (given) {
              this.after(1.4, conversion);
              return;
            }
            this.score[side] -= 5;
            this.tries[side]--;
            if (side === 0) this.stats.tries--;
            this.emit({ type: 'hud', hud: this.hud() });
            this.after(1.6, () => this.setupScrum(dirOf(side) * (FIELD.tryX - 5), clamp(z, -25, 25), side));
          });
        };
    this.after(2.6, () => this.startReplay(clip, afterReplay));
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
    return { userScore: this.score[0], cpuScore: this.score[1], userTries: this.tries[0], cpuTries: this.tries[1], user: { ...this.stats }, match: this.matchStats(), challenge: this.challengeResult() };
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
      p.celebrateT = 0;
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
    p.x = p.tx = p.gx = x;
    p.z = p.tz = p.gz = z;
    p.vx = p.vz = 0;
    p.heading = p.side === 0 ? 0 : Math.PI;
    p.face = p.heading;
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
    if (!this.cfg.drill) {
      this.camMode = 'kickoff';
      this.camFocus = kicker;
      this.camModeT = 0;
    }
    const kick = (target: { x: number; z: number }, T: number) => {
      this.whistle();
      this.after(0.6, () => {
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
        this.camMode = 'game';
        for (const pl of this.players) pl.catchCD = kickSide === pl.side ? 0.8 : 0;
        audio.kick();
        this.phase = 'kickoff';
        this.phaseT = 0;
      });
    };
    const T = 3;
    if (kickSide === 0 && !this.cfg.drill) {
      // Your restart: drag to where you want it to land (short to contest, long to pin them back).
      this.after(0.8, () => {
        this.kickoffAim = { kicker, atX, kick, side: kickSide };
        this.camMode = 'game';
        this.say(atX === 0 ? 'Kick-off' : '22 drop-out', 'info', 'Drag to where you want it to land');
        this.emit({ type: 'hud', hud: this.hud() });
      });
    } else {
      this.after(1.2, () => kick({ x: atX + dk * rand.range(14, 22), z: rand.range(-18, 18) }, T));
    }
  }

  private nineOf(side: Side, nx: number, nz: number): P {
    const nine = this.teams[side][8];
    if (nine.state === 'free') return nine;
    const free = this.teams[side].filter((p) => p.state === 'free');
    free.sort((a, b) => dist(a.x, a.z, nx, nz) - dist(b.x, b.z, nx, nz));
    return free[0] ?? nine;
  }

  /** A forward from the pod picks up from the base and drives. */
  private pickAndGo(nine: P) {
    const d = dirOf(nine.side);
    const fwd = this.teams[nine.side]
      .filter((p) => p.num <= 8 && p.state === 'free')
      .sort((p, q) => dist(p.x, p.z, nine.x, nine.z) - dist(q.x, q.z, nine.x, nine.z))[0];
    this.atBaseT = -1;
    if (!fwd || dist(fwd.x, fwd.z, nine.x, nine.z) > 7) {
      this.doPass(nine, false, 0, true);
      return;
    }
    this.place(fwd, nine.x + d * 0.6, nine.z + 0.4);
    fwd.vx = d * 3.5;
    this.giveBall(fwd);
    if (nine.side === 0) {
      this.controlled = fwd;
      this.nameFor = null;
    }
    this.say('Pick and go', 'info', fwd.name);
  }

  private releaseRuck() {
    let n = 0;
    for (const p of this.players) if (p.state === 'bound') {
      p.state = 'free';
      p.urgency = 0.7 + (n++ % 3) * 0.1; // peel off at slightly different speeds
    }
    if (n) this.assignSlots();
  }

  /** Puts the ball in the scrum-half's hands at the base and restarts open play. */
  private ballToNine(side: Side, x: number, z: number) {
    const d = dirOf(side);
    const nx = x - d * 2.1;
    const nine = this.nineOf(side, nx, z);
    nine.state = 'free';
    if (dist(nine.x, nine.z, nx, z) > 2.5) this.place(nine, nx, z);
    else {
      // already there: settle onto the spot without a jump
      nine.tx = nine.gx = nx;
      nine.tz = nine.gz = z;
    }
    nine.heading = d > 0 ? 0 : Math.PI; // crouched behind the ruck, facing it
    nine.vx = nine.vz = 0;
    this.giveBall(nine);
    this.ball.lastSide = side;
    this.atBaseT = 0;
    this.useItCalled = false;
    this.phase = 'play';
    this.phaseT = 0;
    this.assignSlots();
    // defenders retreat behind the offside line
    const od = dirOf(other(side));
    for (const p of this.teams[other(side)]) {
      if ((p.x - x) * -od < 2 && p.state === 'free') {
        p.tx = p.gx = x + d * 2.5 + rand.range(0, 1.5);
        p.urgency = 1;
      }
    }
    if (side === 1 || this.controlled?.side !== 0) {
      this.controlled = null;
      this.autoControl();
    }
    if (side === 0 && this.pendingSetPlay) {
      const id = this.pendingSetPlay;
      this.pendingSetPlay = null;
      this.atBaseT = -1;
      this.startSetPlay(id);
    } else this.pendingSetPlay = null;
  }

  // ---------------------------------------------------------------- ruck
  private startRuck(c: P, t: P) {
    const att = c.side;
    const d = dirOf(att);
    const x = c.x;
    const z = c.z;
    this.phase = 'ruck';
    this.phaseT = 0;
    this.ruck = { x, z, att, t: 0, dur: 1.6, progress: 0, addAtt: 0, addDef: 0, contest: 0, fan: false, userDef: 'none' };
    this.phaseCount++;
    const b = this.ball;
    b.carrier = null;
    b.state = 'dead';
    b.x = x - d * 0.6;
    b.y = 0.12;
    b.z = z;
    // Two from each side join the ruck.
    const join = (side: Side, off: number, n = 2) => {
      const cands = this.teams[side].filter((p) => p.state === 'free' && p !== this.controlled && p.num !== 9).sort((p, q) => dist(p.x, p.z, x, z) - dist(q.x, q.z, x, z));
      cands.slice(0, n).forEach((p, i) => {
        p.state = 'bound';
        p.tx = x + off;
        p.tz = z + (i ? 0.5 : -0.5);
        p.urgency = 1;
      });
    };
    join(att, -d * 1.1, clamp(Math.round(this.customTac(att).ruck), 1, 3));
    join(other(att), d * 1.1);
    void t;
    this.offsideLine.visible = true;
    // User line is always the user's team hindmost foot.
    this.offsideLine.position.x = att === 0 ? x - 1.6 : x + 1.6;
    this.positionAroundBreakdown(x, z, att);
    // Hand control to someone useful: our 9 when attacking, the nearest standing defender otherwise.
    if (att === 0) {
      const nine = this.teams[0][8];
      this.controlled = nine.state === 'free' ? nine : this.controlled;
    } else {
      const free = this.teams[0].filter((p) => p.state === 'free').sort((p, q) => dist(p.x, p.z, x, z) - dist(q.x, q.z, x, z));
      if (free[0]) this.controlled = free[0];
    }
    const uc = this.controlled;
    if (att === 1 && uc && uc.state === 'free' && (uc.x - x) * d < -1 && Math.abs(uc.z - z) < 8) this.say('Get back onside!', 'info', 'Stay behind the yellow line');
    // Attacking rucks resolve automatically; when defending you can swipe up to jackal.
  }

  /**
   * Clear rugby shape around a breakdown at (x, z).
   * Attack: 9 behind the ball, forward pods either side, backline staggered to the open side.
   * Defence: guards beside the ruck, an evenly spaced line on the offside line, fullback deep.
   * Returns how far (on average) players still are from their spots, so rucks can wait to settle.
   */
  private positionAroundBreakdown(x: number, z: number, att: Side): number {
    const d = dirOf(att);
    const open = Math.abs(z) < 4 ? 1 : -Math.sign(z); // towards the wider side of the pitch
    const cz = (v: number) => clamp(v, -32.5, 32.5);
    const spots = new Map<P, { x: number; z: number }>();
    const avail = (side: Side) => this.teams[side].filter((p) => p.state === 'free' && !(p === this.controlled && this.isUserDriving(p)));

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
      else spots.set(p, { x: x - d * 7, z: cz(z + pod * 4) });
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
    const guards = rest.slice(0, this.ruck?.fan ? 0 : 2); // fanning out: nobody guards the ruck
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

  private updateRuck(dt: number) {
    const r = this.ruck!;
    r.t += dt;
    // The ball-availability arc fills over the ruck; extra attackers speed it up.
    const dur = Math.max(0.9, r.dur - r.addAtt * 0.35 + r.addDef * 0.25 + r.contest * 0.6);
    r.progress = Math.min(1, r.progress + dt / dur);
    this.updateRuckArc(r);
    const spread = this.positionAroundBreakdown(r.x, r.z, r.att);
    const settled = spread < 2.5 || (r.progress >= 1 && r.t > dur + 1.5);
    // The ball stays in the ruck until the scrum-half gets there (a stand-in takes it if he's miles away).
    const nine = this.teams[r.att][8];
    const base = { x: r.x - dirOf(r.att) * 2.1, z: r.z };
    const nineReady = nine.state !== 'free' || dist(nine.x, nine.z, base.x, base.z) < 1.8 || r.t > dur + 3.5;
    r.nineWait = r.progress >= 1 && !nineReady;
    if (r.progress >= 1 && settled && nineReady) this.resolveRuck();
  }

  private resolveRuck() {
    const r = this.ruck!;
    this.ruck = null;
    this.offsideLine.visible = false;
    if (this.ruckArc) this.ruckArc.visible = this.ruckArcBg!.visible = false;
    const q = this.activeMini && this.activeMini.kind.match(/uck/i) ? this.activeMini.q : null;
    this.emit({ type: 'minigameCancel' });
    this.activeMini = null;
    const att = r.att;
    const def = other(att);
    let pTurn = 0.06;
    if (def === 1) pTurn += { easy: -0.03, medium: 0.03, hard: 0.05, elite: 0.09 }[this.cfg.difficulty];
    // ADD PLAYER: attackers secure the ball, defenders committing make a steal likelier
    if (att === 0) pTurn *= Math.pow(0.45, r.addAtt);
    else pTurn = Math.min(0.55, pTurn + r.addDef * 0.16);
    // Defending: contesting hard can steal it but risks a penalty; fanning out gives up the steal.
    if (att === 1) {
      if (r.fan) pTurn = 0;
      else if (r.contest > 0) {
        pTurn = Math.min(0.6, pTurn + r.contest * 0.32);
        if (rand.chance(r.contest * 0.22)) {
          this.whistle();
          this.say('Hands in the ruck!', 'bad', `Penalty ${this.teamShort(1)}`);
          this.stoppage(() => this.awardPenalty(1, r.x, r.z));
          return;
        }
      }
    }
    if (att === 0 && q !== null) pTurn = q > 0.7 ? 0.01 : q < 0.3 ? pTurn + 0.12 : pTurn;
    if (att === 1 && q !== null) pTurn = q > 0.7 ? 0.38 : q < 0.3 ? 0.03 : pTurn;
    // penalties at the breakdown
    if (att === 1 && q !== null && q > 0.9 && rand.chance(0.35)) {
      this.whistle();
      this.say('Holding on!', 'good', `Penalty ${this.teamShort(0)}`);
      this.stoppage(() => this.awardPenalty(0, r.x, r.z));
      return;
    }
    const cpuOff = { easy: 0.06, medium: 0.028, hard: 0.02, elite: 0.005 }[this.cfg.difficulty];
    if (att === 0 && rand.chance(cpuOff * this.strict()) && !this.advantage) {
      // play on: the user has the advantage
      this.advantage = { side: 0, x: r.x, z: r.z, startX: r.x, t: 0 };
      this.pop('ADVANTAGE', 'good');
      this.say('Offside — advantage', 'good', 'Play on');
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
      this.pop('TURNOVER!', winner === 0 ? 'good' : 'bad');
      this.ms.turnovers[winner]++;
      haptic('tackle');
    }
    // Time up: the team in possession kicks it dead if it's not behind.
    if (this.timeUp() && this.score[winner] >= this.score[other(winner)]) {
      this.endHalf();
      return;
    }
    // The ruck stays formed over the ball until the 9 plays it (see releaseRuck).
    this.ballToNine(winner, r.x, r.z);
  }

  // ---------------------------------------------------------------- maul
  private startMaul(x: number, z: number, att: Side, carrier: P) {
    this.phase = 'maul';
    this.phaseT = 0;
    const cpuPush = { easy: 0.9, medium: 1.25, hard: 1.6, elite: 2 }[this.cfg.difficulty] + (this.teamStrength(1) - 75) / 30;
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
    let v = (m.att === 0 ? user - cpu : cpu - user) * 0.6 + strDiff + (m.att === 0 ? 0.6 : 0.3);
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
      if (gain < -2.5 && rand.chance(0.5)) {
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
          if (this.maul) this.maul.userPush += 0.8;
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
        t[i].heading = t[i].face = d > 0 ? 0 : Math.PI; // packs face each other
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
    ball.lastSide = feed;
    this.say('Scrum', 'info', `${this.teamShort(feed)} put-in`);
    if (this.cfg.drill === 'setpieces') this.emit({ type: 'drill', text: 'Scrum: swipe UP on SET when the marker is in the green', progress: `Set piece ${this.drillStage + 1} / 4` });
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
    // A badly mistimed engage gives the penalty away straight off.
    if (q < 0.1 && rand.chance(0.5)) {
      this.whistle();
      this.say(feed === 0 ? 'Early engagement' : 'Collapsed scrum', 'bad', `Penalty ${this.teamShort(1)}`);
      this.stoppage(() => this.awardPenalty(1, x, z));
      return;
    }
    // Push battle: the feeding side has a small edge, a good engage adds to the user's.
    const base = this.players.filter((p) => p.state === 'bound').map((p) => ({ p, x: p.x, z: p.z }));
    const cpu = { easy: 0.55, medium: 0.79, hard: 0.86, elite: 1 }[this.cfg.difficulty] + (this.teamStrength(1) - this.teamStrength(0)) / 45;
    this.scrum = {
      x, z, feed, bal: (q - 0.5) * 0.35, t: 0, dur: 4.2, user: 0, cpu, bias: feed === 0 ? 0.12 : -0.12,
      stage: 'push', chooseT: 0, winner: feed, base,
    };
    this.say('Push!', 'info', 'Swipe up fast to drive');
    audio.thud(0.6);
  }

  private updateScrum(dt: number) {
    const sc = this.scrum!;
    const d0 = dirOf(0);
    if (sc.stage === 'push') {
      sc.t += dt;
      sc.user *= Math.max(0, 1 - dt * 2.4);
      // CPU heaves in waves; the user has to keep swiping to match it.
      const cpu = sc.cpu * (0.85 + Math.sin(sc.t * 2.6) * 0.18);
      sc.bal = clamp(sc.bal + (sc.user - cpu + sc.bias) * 0.55 * dt, -1, 1);
      if (Math.random() < dt * 2.5) haptic('tackle');
      if (Math.abs(sc.bal) >= 1 || sc.t >= sc.dur) this.endScrumPush();
    } else {
      sc.chooseT += dt;
      // No choice made: the 9 takes it at the base as normal.
      if (sc.chooseT > 3.2) this.scrumPlay('hold');
    }
    // Both packs and the ball move with the shove.
    const off = sc.bal * 1.6 * d0;
    for (const b of sc.base) {
      const wob = Math.sin(this.time * 9 + b.x * 3 + b.z * 5) * 0.03;
      b.p.tx = b.x + off;
      b.p.tz = b.z + wob;
      b.p.x += (b.p.tx - b.p.x) * Math.min(1, dt * 5);
      b.p.z += (b.p.tz - b.p.z) * Math.min(1, dt * 5);
      b.p.vx = b.p.vz = 0;
    }
    this.ball.x = sc.x + off - dirOf(sc.winner) * (sc.stage === 'choose' ? 1.6 : 0);
    this.ball.z = sc.z + (sc.stage === 'choose' ? 0 : 0.8);
    this.ball.y = 0.15;
  }

  private endScrumPush() {
    const sc = this.scrum!;
    // The feeding side keeps it unless they are clearly beaten in the shove.
    const towardsFeeder = sc.feed === 0 ? sc.bal : -sc.bal;
    const winner: Side = towardsFeeder < -0.5 ? other(sc.feed) : sc.feed;
    // Driving them all the way back wins a penalty most of the time.
    if (Math.abs(sc.bal) >= 1 && rand.chance(0.6)) {
      const pen: Side = sc.bal > 0 ? 0 : 1;
      this.whistle();
      this.say(pen === 0 ? 'Scrum penalty!' : 'Scrum penalty against', pen === 0 ? 'good' : 'bad', `Penalty ${this.teamShort(pen)}`);
      const { x, z } = sc;
      this.scrum = null;
      this.stoppage(() => this.awardPenalty(pen, x, z));
      return;
    }
    sc.winner = winner;
    if (winner !== sc.feed) this.say('Against the head!', winner === 0 ? 'good' : 'bad');
    else if (Math.abs(sc.bal) > 0.5) this.say(winner === 0 ? 'Going forward!' : 'They are driving', winner === 0 ? 'good' : 'bad');
    audio.thud(0.9);
    if (winner === 0 && !this.cfg.drill) {
      sc.stage = 'choose';
      sc.chooseT = 0;
      return;
    }
    this.scrumPlay('hold');
  }

  /** Ball out of the scrum: 9 passes left/right, the 8 picks up, or the 9 waits at the base. */
  private scrumPlay(play: 'left' | 'right' | 'pick' | 'hold' | 'nine') {
    const sc = this.scrum!;
    this.scrum = null;
    const winner = sc.winner;
    const d = dirOf(winner);
    const bx = this.ball.x;
    const bz = this.ball.z;
    this.camMode = 'game';
    const eight = this.teams[winner][7];
    for (const p of this.players) if (p.state === 'bound' && !(play === 'pick' && p === eight)) {
      p.state = 'down';
      p.timer = 0.45;
    }
    if (play === 'pick') {
      eight.state = 'free';
      this.place(eight, bx - d * 0.4, bz);
      eight.heading = d > 0 ? 0 : Math.PI;
      this.giveBall(eight);
      this.ball.lastSide = winner;
      this.phase = 'play';
      this.phaseT = 0;
      this.atBaseT = -1;
      this.controlled = eight;
      this.assignSlots();
      this.say('No. 8 picks up', 'info');
      return;
    }
    this.ballToNine(winner, bx + d * 0.6, bz);
    if (play === 'nine') {
      // scrum-half breaks round the blindside
      this.atBaseT = -1;
      const nine = this.ball.carrier;
      if (nine) {
        this.controlled = nine;
        nine.vx = d * 3;
        this.say('Scrum-half breaks!', 'info');
      }
      return;
    }
    if (play === 'left' || play === 'right') {
      const nine = this.ball.carrier;
      if (nine) {
        this.atBaseT = -1;
        this.doPass(nine, false, play === 'left' ? -1 : 1);
      }
    }
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
    this.loGeo = { x: lx, s };
    // hooker ready to throw, ball above the head
    this.teams[throwSide][1].heading = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.controlled = this.teams[0][1];
    ball.lastSide = throwSide;
    this.say('Lineout', 'info', `${this.teamShort(throwSide)} throw`);
    if (this.cfg.drill === 'setpieces') this.emit({ type: 'drill', text: 'Lineout: pick a jumper, then swipe DOWN in the green to throw', progress: `Set piece ${this.drillStage + 1} / 4` });
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
    else if (throwSide === 0) this.pop(q > 0.8 ? 'CLEAN TAKE!' : 'TAKEN', 'good');
    const jumper = this.teams[winner][3];
    const rival = this.teams[other(winner)][3];
    const d = dirOf(winner);
    const distToLine = FIELD.tryX - x * d;
    // the throw: ball flies from the hooker to the lifted jumper
    const hooker = this.teams[throwSide][1];
    this.loThrow = { t: 0, dur: 0.7, from: { x: hooker.x, z: hooker.z }, to: { x: jumper.x, z: jumper.z }, jumper, rival, wobble: q < 0.5 };
    hooker.fx = 'pass';
    this.after(0.85, () => {
      this.camMode = 'game';
      this.loThrow = null;
      jumper.lift = 0;
      rival.lift = 0;
      // Your throw, your call: off the top, maul or peel.
      if (winner === 0 && throwSide === 0) {
        jumper.lift = 1.4;
        this.openCall(
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
              this.resetStates();
              const carrier = this.teams[0][1];
              this.place(carrier, x, s * 26);
              this.startMaul(x, s * 26, 0, carrier);
            } else if (id === 'peel') {
              this.resetStates();
              const runner = this.teams[0][6];
              this.place(runner, x - d * 1.5, s * 25);
              runner.vx = d * 3;
              runner.vz = -s * 4;
              this.giveBall(runner);
              this.ball.lastSide = 0;
              this.phase = 'play';
              this.phaseT = 0;
              this.atBaseT = -1;
              this.controlled = runner;
              this.assignSlots();
              this.say('Peel!', 'info', `${runner.name} round the tail`);
            } else {
              this.ballToNine(0, x - d * 1, s * 24);
              const nine = this.ball.carrier;
              if (nine) {
                this.atBaseT = -1;
                this.doPass(nine, false, 0);
              }
            }
          },
        );
        return;
      }
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
    this.penaltyAgainst(other(side));
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
      else if (c === 'touch' && side === 0) {
        // You take the kick: touch the pitch where you want it to go out.
        const kicker = [...this.teams[0]].sort((a, b) => b.r.kicking - a.r.kicking)[0];
        this.place(kicker, px, pz);
        kicker.heading = 0;
        this.ball.carrier = kicker;
        this.ball.state = 'held';
        this.controlled = kicker;
        this.penTouch = { kicker };
        this.camMode = 'game';
        this.say('Kick for touch', 'info', 'Touch the pitch where you want it to go out');
        this.emit({ type: 'hud', hud: this.hud() });
      } else if (c === 'touch') {
        this.say('Kick to touch', 'info');
        audio.kick();
        this.after(1, () => this.setupLineout(clamp(px + d * 24, -44, 44), pz >= 0 ? 1 : -1, side));
      } else if (c === 'scrum') {
        this.say('Scrum, please', 'info');
        this.after(0.6, () => this.setupScrum(px, pz, side));
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
    this.placeT = this.time;
    this.chargeT = side === 1 && kind === 'conversion' ? 0 : -1;
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
      p += { easy: -0.12, medium: 0.03, hard: 0.06, elite: 0.12 }[this.cfg.difficulty];
      const success = rand.chance(clamp(p, 0.12, 0.95));
      const aimErr = success ? rand.range(-0.6, 0.6) : (rand.chance(0.5) ? -1 : 1) * rand.range(4, 9);
      // conversions: the kicker's run-up starts at 1.2s, the kick goes at 2.2s; you can charge in between
      this.after(kind === 'conversion' ? 3.8 : 1.6, () => this.shootPlaceKick(aimErr, 0.62, 0));
    }
  }

  /** Conversions: move the ball back along the line it was grounded on (wider angle, longer kick). Returns metres out. */
  movePlaceKick(dm: number): number {
    const b = this.ball;
    if (this.phase !== 'placekick' || this.placeKind !== 'conversion' || b.state !== 'dead') return 0;
    const d = dirOf(this.placeSide);
    const out = clamp(FIELD.tryX - b.x * d + dm, 5, 35);
    b.x = d * (FIELD.tryX - out);
    if (this.placeKicker) this.place(this.placeKicker, b.x - d * 3, b.z - 1.2);
    return dist(b.x, b.z, d * FIELD.tryX, 0);
  }

  /** User drags to aim (degrees relative to the posts). */
  setPlaceAim(deg: number) {
    this.placeAim = deg;
  }

  /** Swing meter result: power 0..1 (≈0.55 is ideal), accuracy -1..1 (0 = perfect). */
  shootPlaceKick(aimDeg: number, power: number, accuracy: number, curl = 0) {
    if (this.phase !== 'placekick') return;
    // curl: -1..1 from the swipe; + bends right on screen
    this.kickCurl = curl * 2.2 * (this.placeSide === 0 ? 1 : -1);
    const side = this.placeSide;
    const d = dirOf(side);
    const kicker = this.placeKicker!;
    const b = this.ball;
    const toPost = Math.atan2(-b.z, d * FIELD.tryX - b.x);
    const skill = 1.25 - kicker.r.kicking / 100;
    const D0 = dist(b.x, b.z, d * FIELD.tryX, 0);
    // Real kicks miss: error grows with distance, worse kickers and an overcooked strike.
    const diffK = side === 0 ? { easy: 0.6, medium: 1.125, hard: 1.25, elite: 1.5 }[this.cfg.difficulty] : 1;
    let err = accuracy * 12 * skill + (Math.random() - 0.5) * 2 * skill * (1.4 + D0 / 14) * 2.4 * diffK;
    if (power > 0.66) err += (Math.random() < 0.5 ? -1 : 1) * (power - 0.66) * 30; // too much welly sprays it
    // Charged down?
    if (this.placeKind === 'conversion') {
      const chargers = this.teams[other(side)].filter((p) => p.state === 'free' && dist(p.x, p.z, b.x, b.z) < 7.5);
      const near = chargers.length ? Math.min(...chargers.map((p) => dist(p.x, p.z, b.x, b.z))) : 99;
      let pCharge = clamp((7.5 - near) / 6, 0, side === 1 ? 0.5 : 0.75);
      // you took too long over yours: they charge
      if (side === 0 && this.time - this.placeT > 7) pCharge = Math.max(pCharge, 0.3);
      if (rand.chance(pCharge)) {
        kicker.fx = 'kick';
        audio.thud(0.8);
        this.pop('CHARGED DOWN!', side === 0 ? 'bad' : 'good');
        this.say('Charged down!', side === 0 ? 'bad' : 'good');
        this.chargeT = -1;
        this.after(1.2, () => this.goalResult(side, 'conversion', false));
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
    b.goalCheck = { side, kind: this.placeKind === 'drill' ? 'drill' : this.placeKind };
    kicker.kickT = 0.5;
    kicker.fx = 'kick';
    audio.kick();
    this.arc.visible = false;
    // Safety: if the ball never reaches the posts (short), resolve as a miss.
    const myKick = b.goalCheck;
    this.after(4.6, () => (this.kickCurl = 0));
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
    if (id.startsWith('custom:')) {
      const play = (this.cfg.customPlays ?? []).find((p) => `custom:${p.id}` === id);
      if (!play) return;
      // each step: a runner and the line he runs, relative to whoever has the ball at that moment
      const cur = () => this.ball.carrier ?? c;
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
        this.say(play.name, 'info', 'Your set play — follow the ! with your passes');
        this.setPlay = { id, targets, routes, until: this.time + 9 };
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
      this.say(play.name, 'info', 'Your set play — follow the ! with your passes');
      this.setPlay = { id, targets, routes, until: this.time + 8 };
      return;
    }
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
      case 'switch': {
        // Switch: the outside centre cuts back on an angle behind the carrier for an inside ball.
        const r = free(n(13)) ? n(13) : n(12);
        routes.set(r, () => ({ x: c.x + d * 1.5, z: clamp(c.z - open * 2.5, -33, 33) }));
        targets = [r];
        this.say('Switch play', 'info', `${r.name} cuts back inside`);
        break;
      }
      case 'upandunder': {
        this.say('Up and under!', 'info');
        this.kickTo(c, 22, 0, 'box');
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
      this.emit({ type: 'drill', text: 'Swipe up through the ball: direction aims, speed is power, curve your swipe to bend it. Watch the wind!', progress: `Kick ${this.drillCount + 1} / 5 · ${this.drillScore} scored` });
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
          this.emit({ type: 'drill', text: 'Ruck: swipe UP in the green to secure quick ball', progress: 'Set piece 3 / 4' });
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
          this.emit({ type: 'drill', text: 'Maul: swipe UP again and again to drive forward', progress: 'Set piece 4 / 4' });
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
  private animFor(p: P, speed: number): [AnimName, number] {
    if (p.state === 'down') return ['lying', 1];
    if (p.state === 'bound') return ['bind', 1];
    if (this.atBaseT >= 0 && this.ball.carrier === p && this.phase === 'play') return ['base', 1];
    if (this.phase === 'scrum' && p.num === 9 && p.state === 'free' && this.ball.state === 'dead') return ['base', 1];
    if (p.celebrateT > 0) return ['celebrate', 1];
    // Hysteresis: a player has to clearly speed up or slow down before the clip changes.
    const l = p.loco;
    if (l === 'idle' && speed > 0.7) p.loco = 'walk';
    else if (l === 'walk' && speed < 0.3) p.loco = 'idle';
    else if (l === 'walk' && speed > 3.1) p.loco = 'run';
    else if (l === 'run' && speed < 2.4) p.loco = speed < 0.3 ? 'idle' : 'walk';
    if (p.loco === 'idle') return ['idle', 1];
    // playback matched to the measured stride so feet don't skate
    const gs = this.asset?.gaitSpeed ?? {};
    if (p.loco === 'walk') return ['walk', clamp(speed / (gs.walk ?? 1.6), 0.55, 1.9)];
    return ['run', clamp(speed / (gs.run ?? 6.4), 0.65, 1.6)];
  }

  private render(dt: number) {
    const b = this.ball;
    const m4 = new THREE.Matrix4();
    const rf = this.replay ? this.replayFrame() : null;
    const record = !rf && dt > 0 && (this.recordAcc += dt) >= 1 / 30;
    const rec: ReplayFrame | null = record ? { p: new Float32Array(this.players.length * 6), bx: b.x, by: b.y, bz: b.z, flying: b.state === 'air' || b.state === 'pass' } : null;
    if (record) this.recordAcc = 0;
    const animDt = rf ? dt * REPLAY_SPEED : dt;
    let si = 0;
    this.players.forEach((p, i) => {
      const off = p.state === 'off';
      p.av.root.visible = !off;
      if (off) {
        m4.makeScale(0, 0, 0);
        this.shadows.setMatrixAt(si++, m4);
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
        const atBase = this.atBaseT >= 0 && this.ball.carrier === p;
        if (atBase || p.state === 'down') {
          // keep facing as set
        } else if (speed > 1.1) p.heading = Math.atan2(p.vz, p.vx);
        else if (speed > 0.4 && p.state === 'bound') p.heading = Math.atan2(p.vz, p.vx);
        else if (p.state === 'free' && this.phase !== 'play' && this.phase !== 'kickoff') p.heading = p.side === 0 ? 0 : Math.PI;
        else if (p.state === 'free' && this.ball.carrier !== p) {
          // standing or shuffling: look at the ball rather than flicking with every small step
          const bx = this.ball.x - p.x;
          const bz = this.ball.z - p.z;
          if (bx * bx + bz * bz > 1) p.heading = Math.atan2(bz, bx);
        }
        x = p.x;
        z = p.z;
        let dh = p.heading - p.face;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        p.face += dh * Math.min(1, dt * (speed > 3 ? 10 : 6));
        heading = p.face;
        [base, ts] = this.animFor(p, speed);
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
      this.shadows.setMatrixAt(si++, m4);
    });
    if (rec) {
      this.history.push(rec);
      if (this.history.length > 150) this.history.shift();
    }

    // ball: sits in the carrier's hands, otherwise follows physics
    const ballPos = this.tmpV;
    if (rf) ballPos.set(rf.bx, rf.by, rf.bz);
    else if (b.state === 'held' && b.carrier && this.atBaseT >= 0 && this.phase === 'play') {
      const c = b.carrier;
      ballPos.set(c.x + Math.cos(c.face) * 0.62, 0.14, c.z + Math.sin(c.face) * 0.62);
    } else if (b.state === 'held' && b.carrier && b.carrier.state !== 'down') {
      b.carrier.av.handPosition(ballPos);
      ballPos.y = Math.max(0.3, ballPos.y);
    } else ballPos.set(b.x, b.y, b.z);
    this.ballMesh.position.copy(ballPos);
    const flying = rf ? rf.flying : b.state === 'air' || b.state === 'pass';
    if (flying) this.ballMesh.rotation.z += dt * (b.state === 'air' ? 10 : 4);
    else if (b.carrier) this.ballMesh.rotation.set(0, -b.carrier.heading, 0.3);
    m4.makeScale(0.45, 1, 0.45);
    m4.setPosition(ballPos.x, 0.021, ballPos.z);
    this.shadows.setMatrixAt(si, m4);
    this.shadows.instanceMatrix.needsUpdate = true;
    this.ballFx.update(ballPos, flying, this.camera, this.time);

    // real shadows only for the players nearest the action
    if (this.quality.shadows) {
      const fx = this.camLook.x;
      const fz = this.camLook.z;
      // Players already casting get a head start, so the set doesn't flip back and forth.
      const score = (p: P) => (p.x - fx) ** 2 + (p.z - fz) ** 2 - (p.casting ? 30 : 0);
      const order = this.players.filter((p) => p.state !== 'off').sort((a, c) => score(a) - score(c));
      order.forEach((p, i) => {
        const on = i < this.quality.shadowCasters;
        if (on !== p.casting) p.av.setShadow((p.casting = on));
      });
      // Move the shadow map in whole texels so shadow edges don't shimmer as the camera pans.
      const key = this.stadium.key;
      const sc = key.shadow.camera as THREE.OrthographicCamera;
      const texel = (sc.right - sc.left) / key.shadow.mapSize.x || 0.05;
      // Snap in the light's own right/up axes (the light direction never changes).
      const L = SHADOW_BASIS;
      const f3 = this.tmpV2.set(fx, 0, fz);
      const r = Math.round(f3.dot(L.right) / texel) * texel;
      const u = Math.round(f3.dot(L.up) / texel) * texel;
      const fwd = f3.dot(L.dir);
      f3.copy(L.right).multiplyScalar(r).addScaledVector(L.up, u).addScaledVector(L.dir, fwd);
      key.target.position.copy(f3);
      key.position.set(f3.x - 35, f3.y + 70, f3.z + 45);
    }

    // support runner in space calls for the ball (small bubble above the head)
    this.updateCallIcon(rf);

    // selected player: glowing ring + arrow above the head
    const c = this.controlled;
    const showSel = !rf && !!c && c.state !== 'off' && this.phase !== 'placekick' && this.cfg.drill !== 'kicking' && this.camMode !== 'try';
    if (c && showSel) {
      c.av.headPosition(this.tmpV);
      this.selector.place(c.x, c.z, this.tmpV.y, this.time, true);
      if (this.nameFor !== c) {
        this.nameFor = c;
        const g = this.nameCanvas.getContext('2d')!;
        g.clearRect(0, 0, 256, 48);
        g.font = '800 26px "Avenir Next Condensed", "Arial Narrow", Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 5;
        g.strokeStyle = 'rgba(0,0,0,0.75)';
        g.strokeText(c.name, 128, 26);
        g.fillStyle = '#ffffff';
        g.fillText(c.name, 128, 26);
        (this.nameTag.material as THREE.SpriteMaterial).map!.needsUpdate = true;
      }
      this.nameTag.visible = true;
      this.nameTag.position.set(c.x, this.tmpV.y + 1.15, c.z);
    } else {
      this.selector.place(0, 0, 0, 0, false);
      this.nameTag.visible = false;
    }
    // Pass markers over the players who would receive a left / right pass.
    const showMarks = !rf && !!c && b.carrier === c && c.side === 0 && (this.phase === 'play' || this.phase === 'kickoff');
    const crs = this.camRightSign();
    ([-1, 1] as const).forEach((dir, i) => {
      const sp = this.passMarks[i];
      const t = showMarks && c ? this.passTarget(c, dir * crs, false) : undefined;
      sp.visible = !!t;
      if (t) {
        t.av.headPosition(this.tmpV);
        sp.position.set(t.x, this.tmpV.y + 0.75 + Math.sin(this.time * 5 + i) * 0.06, t.z);
      }
    });
    const tgt = !rf && b.state === 'pass' && b.pass ? b.pass.target : null;
    this.targetRing.visible = !!tgt;
    if (tgt) this.targetRing.position.set(tgt.x, 0.035, tgt.z);

    this.particles.update(dt);
    if (!rf) this.updateArc();
    else this.arc.visible = false;
    this.updateCamera(dt, rf);
    this.updateRain(dt);
    this.exciteBoost = Math.max(0, this.exciteBoost - dt * 0.25);
    const bx = rf ? rf.bx : b.x;
    const excite = Math.max(this.exciteBoost, this.phase === 'play' || rf ? clamp((Math.abs(bx) - 22) / 26, 0, 1) * 0.8 : 0.1);
    this.stadium.update(this.time, excite, this.camera);
    this.post.render();
  }

  // ---------------------------------------------------------------- replay
  private startReplay(frames: ReplayFrame[], done: () => void) {
    if (frames.length < 10) return done();
    this.replay = { frames, t: 0, done };
    this.camMode = 'replay';
    this.emit({ type: 'replay', active: true });
  }

  /** Called by the UI when the player taps to skip. */
  skipReplay() {
    if (this.replay) this.replay.t = this.replay.frames.length;
  }

  private updateReplay(dt: number) {
    const r = this.replay!;
    r.t += dt * 30 * REPLAY_SPEED;
    if (r.t >= r.frames.length - 1) {
      this.replay = null;
      this.camMode = 'game';
      this.emit({ type: 'replay', active: false });
      r.done();
    }
  }

  private replayFrame(): ReplayFrame {
    const r = this.replay!;
    const i = Math.min(Math.floor(r.t), r.frames.length - 1);
    const a = r.frames[i];
    const b = r.frames[Math.min(i + 1, r.frames.length - 1)];
    const u = r.t - i;
    const out: ReplayFrame = { p: new Float32Array(a.p), bx: a.bx + (b.bx - a.bx) * u, by: a.by + (b.by - a.by) * u, bz: a.bz + (b.bz - a.bz) * u, flying: a.flying };
    for (let k = 0; k < this.players.length; k++) {
      const o = k * 6;
      out.p[o] = a.p[o] + (b.p[o] - a.p[o]) * u;
      out.p[o + 1] = a.p[o + 1] + (b.p[o + 1] - a.p[o + 1]) * u;
      // only fire one-shot triggers once per recorded frame
      if ((r as { lastIdx?: number }).lastIdx === i) out.p[o + 5] = -1;
    }
    (r as { lastIdx?: number }).lastIdx = i;
    return out;
  }

  private updateArc() {
    const ka = this.input.kickAim;
    const pos = this.arc.geometry.attributes.position as THREE.BufferAttribute;
    if (this.phase === 'placekick' && this.placeSide === 0 && this.ball.state === 'dead') {
      // Aim line for place kicks
      const b = this.ball;
      const d = dirOf(0);
      const toPost = Math.atan2(-b.z, d * FIELD.tryX - b.x);
      const ang = toPost + (this.placeAim * Math.PI) / 180;
      const D = dist(b.x, b.z, FIELD.tryX, 0) + 4;
      // only the first part of the flight: you still have to judge the rest (and the wind)
      for (let i = 0; i < 60; i++) {
        const u = (i / 59) * 0.32;
        pos.setXYZ(i, b.x + Math.cos(ang) * D * u, 0.2 + Math.sin(u * Math.PI) * D * 0.22, b.z + Math.sin(ang) * D * u);
      }
      pos.needsUpdate = true;
      this.arc.visible = true;
      return;
    }
    const kk = this.kickerNow();
    if (!ka.active || !kk) {
      this.arc.visible = false;
      this.kickRing.visible = false;
      return;
    }
    // Preview the actual flight (no skill error): arc + landing ring.
    let aim = ((ka.angle * Math.PI) / 180) * this.camRightSign();
    let kdist = ka.dist;
    if (this.kickTarget) {
      kdist = Math.hypot(this.kickTarget.x - kk.x, this.kickTarget.z - kk.z);
      aim = Math.atan2(this.kickTarget.z - kk.z, (this.kickTarget.x - kk.x) * dirOf(kk.side));
    }
    const v = this.kickVelocity(kdist, aim, kk.side, ka.kind);
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
    this.arc.visible = true;
    this.kickRing.visible = true;
    this.kickRing.position.set(landX, 0.05, landZ);
    this.kickRing.scale.setScalar(1 + Math.sin(this.time * 6) * 0.06);
  }

  private rain: THREE.LineSegments | null = null;
  /** Rain: streaks falling in a box around the camera's target (weather = rain only). */
  private updateRain(dt: number) {
    if (this.cfg.weather !== 'rain') return;
    const N = 1400;
    if (!this.rain) {
      const pos = new Float32Array(N * 6);
      for (let i = 0; i < N; i++) {
        const x = (Math.random() - 0.5) * 70;
        const y = Math.random() * 30;
        const z = (Math.random() - 0.5) * 70;
        pos.set([x, y, z, x + 0.05, y + 0.7, z], i * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbfd6ff, transparent: true, opacity: 0.35, depthWrite: false }));
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
      this.renderer.toneMappingExposure = 0.85;
    }
    const a = this.rain.geometry.attributes.position as THREE.BufferAttribute;
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
    this.rain.position.set(this.camLook.x, 0, this.camLook.z);
  }

  private callSprite: THREE.Sprite | null = null;
  private callT = 0;
  private callFor: P | null = null;
  private updateCallIcon(rf: ReplayFrame | null) {
    const c = this.ball.carrier;
    let show: P | null = null;
    if (!rf && c && c.side === 0 && c === this.controlled && this.phase === 'play' && this.atBaseT < 0) {
      // re-evaluate a few times a second so the bubble doesn't flicker between runners
      if (this.time - this.callT > 0.35) {
        this.callT = this.time;
        const side = Math.abs(this.input.moveX) > 0.3 ? Math.sign(this.input.moveX) * this.camRightSign() : c.z < 0 ? 1 : -1;
        const sp = this.setPlay && this.setPlay.targets.find((p) => p.state === 'free');
        if (sp) this.callFor = sp;
        else {
          const t = this.passTarget(c, side, false) ?? this.passTarget(c, -side, false);
          const free = t && !this.nearestOpponent(t, 4.5);
          this.callFor = free ? t! : null;
        }
      }
      show = this.callFor;
    }
    if (!show) {
      if (this.callSprite) this.callSprite.visible = false;
      return;
    }
    if (!this.callSprite) {
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
      this.callSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      this.callSprite.renderOrder = 6;
      this.callSprite.scale.set(0.7, 0.7, 1);
      this.scene.add(this.callSprite);
    }
    show.av.headPosition(this.tmpV);
    this.callSprite.position.set(show.x, this.tmpV.y + 0.75 + Math.sin(this.time * 6) * 0.06, show.z);
    this.callSprite.visible = true;
  }
  private camZoom = 1;
  private cpos = new THREE.Vector3();
  private clook = new THREE.Vector3();
  private craw = new THREE.Vector3();
  private camF = new THREE.Vector3();
  private camFV = new THREE.Vector3();
  private camFInit = false;
  private sfA = new THREE.Vector3();
  private sfB = new THREE.Vector3();
  private sfOut = new THREE.Vector3();
  /** Critically damped follow of the camera's target point (SmoothDamp). */
  private smoothFocus(target: THREE.Vector3, dt: number): THREE.Vector3 {
    if (!this.camFInit || dt <= 0) {
      if (!this.camFInit) this.camF.copy(target);
      this.camFInit = true;
      return this.sfOut.copy(this.camF);
    }
    const T = 0.24;
    const w = 2 / T;
    const x = w * dt;
    const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const ch = this.sfA.copy(this.camF).sub(target);
    const temp = this.sfB.copy(this.camFV).addScaledVector(ch, w).multiplyScalar(dt);
    this.camFV.addScaledVector(temp, -w).multiplyScalar(e);
    this.camF.copy(target).add(ch.add(temp).multiplyScalar(e));
    return this.sfOut.copy(this.camF);
  }

  private updateCamera(dt: number, rf: ReplayFrame | null) {
    const b = this.ball;
    this.camModeT += dt;
    this.tackleZoomT = Math.max(0, this.tackleZoomT - dt);
    const raw = this.craw.set(b.x, 0, b.z);
    if (b.carrier) raw.set(b.carrier.x, 0, b.carrier.z);
    else if (b.state === 'pass' && b.pass) raw.set(b.pass.target.x, 0, b.pass.target.z);
    else if (b.state === 'air') {
      // kicks: track between the ball and where it will come down
      const land = this.predictLanding();
      if (land) raw.set((b.x + land.x) / 2, 0, (b.z + land.z) / 2);
    }
    const focus = this.smoothFocus(raw, dt);
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    let rate = 3.2;
    const fp = this.camFocus;
    if (this.camMode === 'intro') {
      this.introT += dt;
      if (this.introT > 5.5) this.skipIntro();
      const a = -1.2 + this.introT * 0.32;
      const r = 78 - this.introT * 6;
      pos = this.cpos.set(Math.cos(a) * r, 34 - this.introT * 3.5, Math.sin(a) * r * 0.8);
      look = this.clook.set(0, 2, 0);
      rate = 3;
    } else if (this.camMode === 'replay' && rf) {
      // low side-on tracking shot
      const side = rf.bz < 15 ? 1 : -1;
      pos = this.cpos.set(rf.bx - 7, 3.2, rf.bz + side * 11);
      look = this.clook.set(rf.bx + 1, 1.1, rf.bz);
      rate = 4;
    } else if (this.camMode === 'try' && fp) {
      // slow orbit around the try scorer
      const a = 0.6 + this.camModeT * 0.35;
      pos = this.cpos.set(fp.x + Math.cos(a) * 5.5, 1.9, fp.z + Math.sin(a) * 5.5);
      look = this.clook.set(fp.x, 1.0, fp.z);
      rate = 2.5;
    } else if (this.camMode === 'kickoff' && fp) {
      const d = dirOf(fp.side);
      pos = this.cpos.set(fp.x + d * 4.5, 1.7, fp.z + 3.2);
      look = this.clook.set(fp.x, 1.2, fp.z);
      rate = 4;
    } else if (this.camMode === 'placekick') {
      const d = dirOf(this.placeSide);
      const toPost = new THREE.Vector3(d * FIELD.tryX - b.x, 0, -b.z).normalize();
      const flying = b.state === 'air';
      pos = this.cpos.set(b.x, flying ? 2.6 : 1.55, b.z).addScaledVector(toPost, flying ? -5 : -4.2);
      if (flying) pos.copy(this.camPos).lerp(new THREE.Vector3(b.x, b.y * 0.6 + 2, b.z).addScaledVector(toPost, -9), 0.5);
      look = this.clook.set(d * FIELD.tryX, 4.5, 0);
      if (flying) look = new THREE.Vector3(b.x, b.y, b.z).lerp(look, 0.4);
      rate = flying ? 3 : 5;
    } else if (this.camMode === 'setpiece' && this.phase === 'lineout') {
      // from beyond the touchline, behind the thrower, looking down the line of jumpers
      const { x: lx, s: sg } = this.loGeo;
      pos = this.cpos.set(lx - 6.5, 4.6, sg * (FIELD.halfW + 9));
      look = this.clook.set(lx + 1, 1.8, sg * 26);
      rate = 3.5;
    } else if (this.camMode === 'setpiece' && this.phase === 'scrum') {
      pos = this.cpos.set(b.x - 9, 4.5, b.z + (b.z > 0 ? -5 : 5));
      look = this.clook.set(b.x + 2, 0.8, b.z);
    } else {
      const mode = this.cfg.camera;
      const tight = this.phase === 'ruck' || this.phase === 'maul' || this.tackleZoomT > 0;
      if (mode === 'sideline') {
        pos = this.cpos.set(focus.x * 0.92, tight ? 16 : 22, focus.z * 0.3 + (tight ? 34 : 44));
        look = this.clook.set(focus.x, 0, focus.z * 0.6);
      } else if (mode === 'close') {
        pos = this.cpos.set(focus.x - (tight ? 6.5 : 8), tight ? 3.4 : 4.2, focus.z * 0.92);
        look = this.clook.set(focus.x + 8, 1, focus.z);
      } else {
        // Low broadcast camera: ~12m behind and 7m above the carrier, looking down the pitch to the try line.
        // Steady broadcast view behind your team: follows the ball, only partly sideways, no zooming.
        // Broadcast view from behind your team: far enough back and high enough to read the whole line.
        // Lead a few metres in the direction of attack, pull back when the ball is wide,
        // tighten in for rucks and mauls.
        const att = dirOf(this.possession());
        const lead = att * 4;
        const wide = clamp((Math.abs(focus.z) - 10) / 22, 0, 1);
        const zoom = (tight ? 0.84 : 1) * (1 + wide * 0.22);
        this.camZoom += (zoom - this.camZoom) * Math.min(1, dt * 1.5);
        const zz = this.camZoom;
        // keep the ball in the middle of the screen even out wide
        pos = this.cpos.set(focus.x + lead * 0.5 - 18 * zz, 10.5 * zz, focus.z * 0.72);
        look = this.clook.set(focus.x + lead + 10, 0.5, focus.z * 0.94);
      }
      if (b.state === 'air' && b.kicker) pos.y += Math.min(5, b.y * 0.3);
      rate = 3.2;
    }
    const k = 1 - Math.exp(-dt * rate);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }
}

const REPLAY_SPEED = 0.45;
/** Longest landing distance for each kick type (metres). */
const KICK_MAX: Record<KickKind, number> = { punt: 60, box: 38, grubber: 32, chip: 20, high: 44, touch: 62, cross: 50 };
/** Acceleration and agility from ratings: wingers are sharp, props are slow to get going. */
function moveStats(p: P): { acc: number; agi: number } {
  const r = p.r;
  const acc = clamp(0.8 + (r.pace - 60) / 120 - (r.strength - 70) / 260, 0.7, 1.25);
  const agi = clamp((r.pace * 0.6 + r.handling * 0.4 - 55) / 40, 0, 1);
  return { acc, agi };
}
/** Orthonormal basis of the key light (it always shines along (35, -70, -45)). */
const SHADOW_BASIS = (() => {
  const dir = new THREE.Vector3(35, -70, -45).normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  return { dir, right, up };
})();
type KickType = 'punt' | 'grubber' | 'box' | 'drop' | 'chip' | 'high' | 'touch' | 'cross';
const GRUB_VY = 3.2;
const GRUB_REST = 0.45;
const GRUB_KEEP = 0.8;
const GRUB_FRICTION = 1.0;

/** Distance a grubber travels before stopping (no random hops), for the aiming solver. */
function simulateGrubber(vh: number): number {
  let x = 0;
  let y = 0.7;
  let vx = vh;
  let vy = GRUB_VY;
  let air = true;
  const dt = 1 / 60;
  for (let i = 0; i < 1200; i++) {
    if (air) {
      vy -= G * dt;
      x += vx * dt;
      y += vy * dt;
      if (y <= 0.12) {
        y = 0.12;
        if (Math.abs(vy) > 1.2) {
          vy = -vy * GRUB_REST;
          vx *= GRUB_KEEP;
        } else air = false;
      }
    } else {
      vx *= Math.max(0, 1 - dt * GRUB_FRICTION);
      x += vx * dt;
      if (vx < 0.3) break;
    }
  }
  return x;
}
const ANIMS: AnimName[] = ['idle', 'walk', 'run', 'sidestepL', 'sidestepR', 'pass', 'catch', 'kick', 'tackle', 'dive', 'fall', 'getup', 'celebrate', 'bind', 'lying', 'carry', 'base'];

interface ReplayFrame {
  p: Float32Array; // per player: x, z, heading, base anim, time scale, triggered anim
  bx: number;
  by: number;
  bz: number;
  flying: boolean;
}

/** Selector colour: the team's primary, unless it's too dark to see against the night sky. */
function indicatorColor(kit: { primary: string; secondary: string }) {
  const c = new THREE.Color(kit.primary);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l > 0.12) return kit.primary;
  const s = new THREE.Color(kit.secondary);
  return 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b > 0.12 ? kit.secondary : '#c6ff1a';
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
