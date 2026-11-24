import * as THREE from 'three';
import { effectiveRatings, playerOvr } from '../data/players';
import type { Ratings } from '../data/players';
import { venueFor } from '../data/venues';
import type { Venue } from '../data/venues';
import { audio } from '../util/audio';
import { clamp, rand } from '../util/rng';
import { dirOf, dist, hashCode, indicatorColor } from './engine/shared';
import type { Ball, KickType, P, Phase, ReplayFrame, Side } from './engine/shared';
import { CFG } from './gameConfig';
import { createBall } from './model';
import { FIELD } from './stadium';
import type { CommentaryTone, EngineEvent, EngineResult, HudState, InputAction, InputState, KickKind, MatchConfig, MiniGameKind, SetPlayId, TeamSetup } from './types';
import type { AnimName, PlayerAsset } from './view/assets';
import { Avatar, makeTeamKit } from './view/avatar';
import { BallFx, Particles, PostFX, Selector } from './view/effects';
import { buildPitch } from './view/pitch';
import { FpsGovernor, preset, resolveQuality } from './view/quality';
import type { QualityPreset } from './view/quality';
import { buildStadium } from './view/stadium';
import type { StadiumView } from './view/stadium';
import { LegacyVisual } from './view/visual';
import type { Visual } from './view/visual';
import * as Inp from './engine/input';
import * as Ai from './engine/ai';
import * as Contact from './engine/contact';
import * as BallPlay from './engine/ball';
import * as Rules from './engine/rules';
import * as SetPieces from './engine/setpieces';
import * as Drills from './engine/drills';
import * as View from './engine/view';

/**
 * The match engine: owns the state, the fixed-step loop, the HUD and the Three.js scene.
 * The game logic lives in ./engine/ — input, ai, contact, ball, rules, setpieces, drills and
 * view — as plain functions taking the engine; the methods below that just forward to them keep
 * the engine's API in one place. Tuning numbers are in ./gameConfig.ts.
 */
export class MatchEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  stadium: StadiumView;
  post: PostFX;
  particles: Particles;
  ballFx: BallFx;
  selector: Selector;
  quality: QualityPreset;
  governor: FpsGovernor;
  frameSkip = false;
  skipToggle = false;
  players: P[] = [];
  teams: [P[], P[]] = [[], []];
  ball: Ball;
  ballMesh: THREE.Mesh;
  targetRing: THREE.Mesh;
  kickRing: THREE.Mesh;
  passMarks: [THREE.Sprite, THREE.Sprite];
  nameTag: THREE.Sprite;
  nameCanvas: HTMLCanvasElement;
  nameFor: P | null = null;
  offsideLine: THREE.Mesh;
  arc: THREE.Line;
  shadows: THREE.InstancedMesh;
  raf = 0;
  last = 0;
  time = 0;
  listener: (e: EngineEvent) => void;
  readonly input: InputState;
  cfg: MatchConfig;
  /** tactics per side: [user, cpu] */
  tac!: [MatchConfig['tactics'], MatchConfig['tactics']];

  phase: Phase = 'pre';
  phaseT = 0;
  timers: { t: number; fn: () => void }[] = [];
  half: 1 | 2 = 1;
  gameSec = 0;
  score: [number, number] = [0, 0];
  tries: [number, number] = [0, 0];
  stats = { tries: 0, tackles: 0, conversions: 0, passes: 0, penalties: 0, dropGoals: 0 };
  customTac(side: Side) {
    const t = this.tac[side];
    return { depth: t.depth ?? 1, width: t.width ?? 1, lineSpeed: t.lineSpeed ?? 1, ruck: t.ruckCommit ?? 2 };
  }
  ms = { poss: [0, 0], terr: [0, 0], tackles: [0, 0], missed: [0, 0], metres: [0, 0], breaks: [0, 0], turnovers: [0, 0], pens: [0, 0] };
  pstats = new Map<P, { tries: number; tackles: number; metres: number; breaks: number }>();
  ps(p: P) {
    let s = this.pstats.get(p);
    if (!s) this.pstats.set(p, (s = { tries: 0, tackles: 0, metres: 0, breaks: 0 }));
    return s;
  }
  lastCarrierX: number | null = null;
  tickStats(dt: number) {
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
  controlled: P | null = null;
  firstKicker: Side = 1;
  wind = { x: 0, z: 0 };
  paused = false;
  waitingBlocking = false;
  miniId = 0;
  activeMini: { id: number; kind: MiniGameKind; q: number | null; taps: number; done: boolean } | null = null;
  /** Safety net: a blocking prompt that never answers (lost UI, backgrounded tab...) resolves itself. */
  blockedFor = 0;
  blockingResolve: ((q: number) => void) | null = null;
  blockWatchdog(dt: number) {
    this.blockedFor += dt;
    if (this.blockedFor < CFG.prompts.engineWatchdog) return;
    this.blockedFor = 0;
    const am = this.activeMini;
    if (am && !am.done && this.blockingResolve) this.blockingResolve(0.3);
    else this.waitingBlocking = false;
  }
  ruck: null | { x: number; z: number; att: Side; t: number; dur: number; progress: number; addAtt: number; addDef: number; contest: number; fan: boolean; userDef: 'none' | 'contest' | 'fan'; nineWait?: boolean } = null;
  ruckArc: THREE.Mesh | null = null;
  ruckArcBg: THREE.Mesh | null = null;
  pendingSetPlay: SetPlayId | null = null;
  useItCalled = false;
  slotCount: Record<number, number> = { [-1]: 7, [1]: 7 };
  scrum: null | {
    x: number; z: number; feed: Side; bal: number; t: number; dur: number; user: number; cpu: number; bias: number;
    stage: 'push' | 'choose'; chooseT: number; winner: Side; base: { p: P; x: number; z: number }[];
  } = null;
  maul: null | { x: number; z: number; att: Side; t: number; dur: number; start: number; carrier: P; cpuPush: number; userPush: number } = null;
  setPlay: null | { id: SetPlayId; targets: P[]; routes: Map<P, () => { x: number; z: number }>; until: number } = null;
  slotTimer = 0;
  aiDecisionT = 0;
  atBaseT = -1;
  lineBreakFrom: number | null = null;
  hudT = 0;
  placeAim = 0;
  placeKicker: P | null = null;
  placeKind: 'conversion' | 'penalty' | 'drill' = 'conversion';
  placeSide: Side = 0;
  camPos = new THREE.Vector3(-20, 12, 0);
  camLook = new THREE.Vector3();
  camMode: 'game' | 'placekick' | 'setpiece' | 'try' | 'kickoff' | 'replay' | 'intro' = 'game';
  camFocus: P | null = null;
  camModeT = 0;
  tackleZoomT = 0;
  exciteBoost = 0;
  phaseCount = 0;
  kickCurl = 0;
  drillCount = 0;
  drillScore = 0;
  drillStage = 0;
  ended = false;
  resizeObs: ResizeObserver;
  /** Dev builds only: `?fast` runs the match clock 20x faster for testing. */
  clockScale = import.meta.env.DEV && new URLSearchParams(location.search).has('fast') ? 20 : 1;
  // replay: ring buffer of recent frames, sampled at 30Hz
  history: ReplayFrame[] = [];
  recordAcc = 0;
  replay: { frames: ReplayFrame[]; t: number; done: () => void } | null = null;
  tmpV = new THREE.Vector3();
  tmpV2 = new THREE.Vector3();

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
  downgrade(): boolean {
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
  get graphicsLevel() {
    return this.quality.level;
  }

  // ---------------------------------------------------------------- setup
  asset: PlayerAsset | null = null;
  venue: Venue;
  buildTeams(asset: PlayerAsset | null) {
    this.asset = asset;
    const diffMod = CFG.difficulty.cpuRating[this.cfg.difficulty];
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

  resize() {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 64 : 44;
    this.camera.updateProjectionMatrix();
    this.particles?.setViewportHeight(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  /** @param holdIntro the How to Play card is up: line the teams up but keep the intro until beginIntro() */
  start(holdIntro = false) {
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
    else if (holdIntro) {
      this.setupKickoff(this.firstKicker, 0);
      this.timers = [];
      this.introHeld = true;
    } else this.startIntro();
  }

  introHeld = false;
  /** How to Play was closed: now run the walk-out and stadium sweep. */
  beginIntro() {
    if (!this.introHeld) return;
    this.introHeld = false;
    this.startIntro();
  }

  introT = -1;
  /** Camera sweeps the stadium while the teams line up; tap to skip. */
  startIntro() {
    this.setupKickoff(this.firstKicker, 0);
    this.timers = [];
    this.introT = 0;
    this.camMode = 'intro';
    // the teams walk out side by side from the tunnel to their kick-off spots
    this.teams.forEach((team, side) =>
      team.forEach((p, i) => {
        const tx = p.x;
        const tz = p.z;
        this.place(p, (side === 0 ? -1.5 : 1.5) - (i % 2) * 0.8 * (side === 0 ? 1 : -1), -FIELD.halfW - 3 - i * 1.1);
        p.tx = p.gx = tx;
        p.tz = p.gz = tz;
        p.urgency = 0.32;
      }),
    );
    audio.cheer(0.5);
    audio.fanfare();
    this.emit({ type: 'intro', on: true, title: `${this.cfg.user.name} v ${this.cfg.cpu.name}`, sub: `${this.venue.name}, ${this.venue.city}${this.cfg.weather === 'rain' ? ' · rain falling' : ''}` });
  }

  /** Daily challenge scenarios: set the score, the clock and where play starts. */
  startChallenge() {
    return Drills.startChallenge(this);
  }

  /** Did the user complete the challenge? (checked at the final whistle) */
  challengeResult(): boolean | undefined {
    return Drills.challengeResult(this);
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
    const edge = (str(0) - str(1)) / 12 + CFG.difficulty.simEdge[this.cfg.difficulty];
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

  subsUsed = new Set<number>();
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
  emit(e: EngineEvent) {
    this.listener(e);
  }
  say(text: string, tone: CommentaryTone = 'info', sub?: string) {
    this.emit({ type: 'commentary', text, tone, sub });
  }
  after(t: number, fn: () => void) {
    this.timers.push({ t, fn });
  }

  // ---------------------------------------------------------------- main loop
  /** freeze-frame on big hits (seconds of real time) */
  hitStopT = 0;
  lastHitReplay = -99;
  /** slow motion while the offload window is open */
  timeScale = 1;
  offload: null | { c: P; t: P; left: number } = null;

  frame(dt: number) {
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
      else this.blockWatchdog(dt);
    }
    this.render(this.paused ? 0 : sdt);
  }

  catchPrompt(): boolean {
    const b = this.ball;
    if (b.state !== 'air' || b.vy > 0 || b.y > 9 || b.kicker?.side === 0 && b.kicker === this.controlled) return false;
    const land = this.predictLanding();
    if (!land) return false;
    return this.teams[0].some((p) => p.state === 'free' && dist(p.x, p.z, land.x, land.z) < 3.5);
  }

  windHud() {
    const { fx, fz, rx, rz } = this.camAxes();
    const up = this.wind.x * fx + this.wind.z * fz;
    const right = this.wind.x * rx + this.wind.z * rz;
    return { deg: Math.round((Math.atan2(right, up) * 180) / Math.PI), kmh: Math.round(Math.hypot(this.wind.x, this.wind.z) * 3.6) };
  }

  pop(text: string, tone: 'good' | 'bad' | 'big') {
    this.emit({ type: 'pop', text, tone });
  }

  update(dt: number) {
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

  hud(): HudState {
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
      maulDefend: !!(this.maul && this.maul.att === 1),
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

  timeUp() {
    return Rules.timeUp(this);
  }

  possession(): Side {
    return Rules.possession(this);
  }

  // ---------------------------------------------------------------- input
  handleActions() {
    return Inp.handleActions(this);
  }

  handleAction(a: InputAction) {
    return Inp.handleAction(this, a);
  }

  /** +1 if screen-right maps to world +z for the current camera. */
  camRightSign() {
    return Inp.camRightSign(this);
  }

  switchDefender() {
    return Inp.switchDefender(this);
  }

  /** Average distance of a side's support players from their attacking slots. */
  attackSpread(side: Side): number {
    return Ai.attackSpread(this, side);
  }

  /** At the base of a ruck the referee gives you time, then calls "Use it!", then awards a scrum. */
  useItCheck(c: P) {
    return Inp.useItCheck(this, c);
  }

  /** ADD PLAYER at a ruck: bind the nearest free team-mate in. */
  addToRuck() {
    return SetPieces.addToRuck(this);
  }

  /** How the ball is coming: quick (green), slow (amber) or turnover danger (red). */
  ruckBall(r: NonNullable<MatchEngine['ruck']>): 'quick' | 'slow' | 'danger' {
    return SetPieces.ruckBall(this, r);
  }

  /** Arc under the ruck that fills as the ball becomes available. */
  updateRuckArc(r: { x: number; z: number; att: Side; progress: number }) {
    return SetPieces.updateRuckArc(this, r);
  }

  autoControl() {
    return Inp.autoControl(this);
  }

  // ---------------------------------------------------------------- movement
  maxSpeed(p: P) {
    return Ai.maxSpeed(this, p);
  }

  movePlayers(dt: number) {
    return Ai.movePlayers(this, dt);
  }

  axesV = new THREE.Vector3();
  /** Ground-plane camera axes used to map the joystick to world directions. */
  camAxes() {
    return Inp.camAxes(this);
  }

  updateCarriedBall() {
    return BallPlay.updateCarriedBall(this);
  }

  // ---------------------------------------------------------------- play
  updatePlay(dt: number) {
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

  updateCarrier(dt: number, c: P) {
    return Contact.updateCarrier(this, dt, c);
  }

  // ---------------------------------------------------------------- AI
  assignSlots() {
    return Ai.assignSlots(this);
  }

  attackSlotTarget(p: P, ax: number, az: number, side: Side) {
    return Ai.attackSlotTarget(this, p, ax, az, side);
  }

  updateAI(dt: number) {
    return Ai.updateAI(this, dt);
  }

  isUserDriving(p: P) {
    return Inp.isUserDriving(this, p);
  }

  cpuCarrier(dt: number, c: P) {
    return Ai.cpuCarrier(this, dt, c);
  }

  nearestOpponent(p: P, within: number): P | null {
    return Ai.nearestOpponent(this, p, within);
  }

  tryFend(c: P, d: P) {
    return Contact.tryFend(this, c, d);
  }

  userAssist() {
    return Contact.userAssist(this);
  }

  // ---------------------------------------------------------------- tackles
  attemptTackle(t: P, c: P, dive: boolean) {
    return Contact.attemptTackle(this, t, c, dive);
  }

  tackleMade(t: P, c: P) {
    return Contact.tackleMade(this, t, c);
  }

  /** The offload window ran out or was used. */
  tickOffload(dt: number) {
    return Contact.tickOffload(this, dt);
  }

  tryOffload(dir: -1 | 0 | 1) {
    return Contact.tryOffload(this, dir);
  }

  afterContact(t: P, c: P) {
    return Contact.afterContact(this, t, c);
  }

  // ---------------------------------------------------------------- passing
  /** Receiver for a pass to world side s (+1 = +z), or undefined if nobody is there. */
  /**
   * Best receiver on side s (+1/-1 in world z). Short passes look for a runner 4-10m away who is
   * behind the ball and not swamped by a defender; long (skip) passes look 12-20m out and skip the first man.
   */
  passTarget(passer: P, s: number, long: boolean): P | undefined {
    return BallPlay.passTarget(this, passer, s, long);
  }

  doPass(passer: P, long: boolean, dirHint: -1 | 0 | 1, spin = false): boolean {
    return BallPlay.doPass(this, passer, long, dirHint, spin);
  }

  updatePass(dt: number) {
    return BallPlay.updatePass(this, dt);
  }

  giveBall(p: P) {
    return BallPlay.giveBall(this, p);
  }

  knockOn(p: P) {
    return BallPlay.knockOn(this, p);
  }

  // ---------------------------------------------------------------- kicking
  /** Heading angle (relative to the side's attacking direction) that points from (x,z) to (tx,tz). */
  aimTo(side: Side, x: number, z: number, tx: number, tz: number) {
    return BallPlay.aimTo(this, side, x, z, tx, tz);
  }

  /**
   * Launch velocity so the ball lands `dist` metres away along heading `aim`.
   * Punts/box/drop kicks: solved from a flight time. Grubbers: solved by simulating the roll.
   */
  kickVelocity(dist: number, aim: number, side: Side, type: KickType) {
    return BallPlay.kickVelocity(this, dist, aim, side, type);
  }

  /** Kick from player p to land `dist` m away along heading `aim` (radians), with kicker-skill error. */
  kickTo(p: P, dist: number, aim: number, type: KickType, exact = false, errMul = 1) {
    return BallPlay.kickTo(this, p, dist, aim, type, exact, errMul);
  }

  catchPressT = -9;
  aimFreeze = false;
  /** Slow motion while KICK is held and the user lines it up. */
  setKickHold(on: boolean) {
    return Inp.setKickHold(this, on);
  }
  /** Freeze play while the user aims a kick. */
  setAimFreeze(on: boolean) {
    return Inp.setAimFreeze(this, on);
  }
  /** Kick-off / 22 drop-out the user aims by dragging. */
  kickoffAim: null | { kicker: P; atX: number; kick: (t: { x: number; z: number }, T: number) => void; side: Side } = null;
  placeT = 0;
  /** CPU conversion charge window timer (-1 = none) */
  chargeT = -1;
  charging = false;
  cpuCharging = false;
  tickCharge(dt: number) {
    return BallPlay.tickCharge(this, dt);
  }
  charge() {
    return BallPlay.charge(this);
  }
  penTouch: null | { kicker: P } = null;
  kickoffKick() {
    return BallPlay.kickoffKick(this);
  }
  loGeo = { x: 0, s: 1 };
  loThrow: null | { t: number; dur: number; from: { x: number; z: number }; to: { x: number; z: number }; jumper: P; rival: P; wobble: boolean } = null;
  /** Lineout throw in flight: jumpers lifted, ball arcing in from touch. */
  updateLineoutThrow(dt: number) {
    return BallPlay.updateLineoutThrow(this, dt);
  }
  penaltyTouchKick(a: Extract<InputAction, { type: 'kick' }>) {
    return BallPlay.penaltyTouchKick(this, a);
  }
  /** where the user has pointed on the pitch for the current kick */
  kickTarget: { x: number; z: number } | null = null;
  raycaster = new THREE.Raycaster();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** The player about to kick: the carrier, or the penalty kicker lining up a kick to touch. */
  kickerNow(): P | null {
    return BallPlay.kickerNow(this);
  }
  /** Point on the pitch under a screen position (for aiming kicks). Returns metres to it from the kicker. */
  aimKickAt(clientX: number, clientY: number, kind: KickKind): number | null {
    return Inp.aimKickAt(this, clientX, clientY, kind);
  }
  /**
   * Flick aim: the swipe vector on screen (px, right / down positive) becomes the kick: its
   * direction aims relative to the camera, its length sets the distance (half the screen = max range).
   */
  aimKickFlick(dxPx: number, dyPx: number, kind: KickKind): number | null {
    return Inp.aimKickFlick(this, dxPx, dyPx, kind);
  }

  clearKickTarget() {
    return Inp.clearKickTarget(this);
  }
  /** penalty count multiplier by rules mode */
  strict(): number {
    return Rules.strict(this);
  }
  advantage: null | { side: Side; x: number; z: number; startX: number; t: number } = null;
  pens: [number, number] = [0, 0];
  binned: { p: P; until: number }[] = [];
  tickReferee(dt: number) {
    return Rules.tickReferee(this, dt);
  }
  /** Repeated penalties earn a yellow card: a back from the offending team sits out 2 minutes. */
  penaltyAgainst(off: Side) {
    return Rules.penaltyAgainst(this, off);
  }
  call: null | { title: string; opts: { id: string; label: string; sub?: string }[]; t: number; timeout: number; def: string; on: (id: string) => void } = null;
  openCall(title: string, opts: { id: string; label: string; sub?: string }[], def: string, timeout: number, on: (id: string) => void) {
    return Rules.openCall(this, title, opts, def, timeout, on);
  }
  tickCall(dt: number) {
    return Rules.tickCall(this, dt);
  }
  resolveCall(id: string) {
    return Rules.resolveCall(this, id);
  }
  /** Kick from the picker: power under ~0.6 falls short, over 1 (held too long) sprays it. */
  userKick(c: P, kind: KickKind, dist: number, angle: number, power: number, tx?: number, tz?: number) {
    return Inp.userKick(this, c, kind, dist, angle, power, tx, tz);
  }

  /** Is the user's carrier in range for a drop goal? */
  canDropGoal(): boolean {
    return BallPlay.canDropGoal(this);
  }

  dropGoal(p: P) {
    return BallPlay.dropGoal(this, p);
  }

  looseBall(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    return BallPlay.looseBall(this, x, y, z, vx, vy, vz);
  }

  predictLanding(): { x: number; z: number } {
    return BallPlay.predictLanding(this);
  }

  updateBallPhysics(dt: number) {
    return BallPlay.updateBallPhysics(this, dt);
  }

  // ---------------------------------------------------------------- scoring
  scoreTry(c: P) {
    return Rules.scoreTry(this, c);
  }

  goalResult(side: Side, kind: 'drop' | 'conversion' | 'penalty' | 'drill', good: boolean) {
    return Rules.goalResult(this, side, kind, good);
  }

  // ---------------------------------------------------------------- stoppages & time
  whistle() {
    return Rules.whistle(this);
  }

  /** Ball is dead: end the half if time is up, otherwise run the restart. */
  stoppage(next: () => void, delay = 1.4) {
    return Rules.stoppage(this, next, delay);
  }

  endHalf() {
    return Rules.endHalf(this);
  }

  continueSecondHalf() {
    return Rules.continueSecondHalf(this);
  }

  result(): EngineResult {
    return Rules.result(this);
  }


  teamShort(s: Side) {
    return s === 0 ? this.cfg.user.short : this.cfg.cpu.short;
  }

  // ---------------------------------------------------------------- restarts
  resetStates() {
    return SetPieces.resetStates(this);
  }

  place(p: P, x: number, z: number) {
    return SetPieces.place(this, p, x, z);
  }

  setupKickoff(kickSide: Side, atX: number) {
    return SetPieces.setupKickoff(this, kickSide, atX);
  }

  nineOf(side: Side, nx: number, nz: number): P {
    return SetPieces.nineOf(this, side, nx, nz);
  }

  /** A forward from the pod picks up from the base and drives. */
  pickAndGo(nine: P) {
    return SetPieces.pickAndGo(this, nine);
  }

  releaseRuck() {
    return SetPieces.releaseRuck(this);
  }

  /** Puts the ball in the scrum-half's hands at the base and restarts open play. */
  ballToNine(side: Side, x: number, z: number) {
    return SetPieces.ballToNine(this, side, x, z);
  }

  // ---------------------------------------------------------------- ruck
  startRuck(c: P, t: P) {
    return SetPieces.startRuck(this, c, t);
  }

  /**
   * Clear rugby shape around a breakdown at (x, z).
   * Attack: 9 behind the ball, forward pods either side, backline staggered to the open side.
   * Defence: guards beside the ruck, an evenly spaced line on the offside line, fullback deep.
   * Returns how far (on average) players still are from their spots, so rucks can wait to settle.
   */
  positionAroundBreakdown(x: number, z: number, att: Side): number {
    return SetPieces.positionAroundBreakdown(this, x, z, att);
  }

  updateRuck(dt: number) {
    return SetPieces.updateRuck(this, dt);
  }

  resolveRuck() {
    return SetPieces.resolveRuck(this);
  }

  // ---------------------------------------------------------------- maul
  startMaul(x: number, z: number, att: Side, carrier: P) {
    return SetPieces.startMaul(this, x, z, att, carrier);
  }

  teamStrength(side: Side) {
    return SetPieces.teamStrength(this, side);
  }

  bindMaul() {
    return SetPieces.bindMaul(this);
  }

  updateMaul(dt: number) {
    return SetPieces.updateMaul(this, dt);
  }

  // ---------------------------------------------------------------- mini-games
  requestMini(kind: MiniGameKind, blocking: boolean, duration: number, after?: (q: number) => void) {
    return SetPieces.requestMini(this, kind, blocking, duration, after);
  }

  // ---------------------------------------------------------------- scrum
  setupScrum(x: number, z: number, feed: Side) {
    return SetPieces.setupScrum(this, x, z, feed);
  }

  resolveScrum(feed: Side, x: number, z: number, q: number) {
    return SetPieces.resolveScrum(this, feed, x, z, q);
  }

  updateScrum(dt: number) {
    return SetPieces.updateScrum(this, dt);
  }

  endScrumPush() {
    return SetPieces.endScrumPush(this);
  }

  /** Ball out of the scrum: 9 passes left/right, the 8 picks up, or the 9 waits at the base. */
  scrumPlay(play: 'left' | 'right' | 'pick' | 'hold' | 'nine') {
    return SetPieces.scrumPlay(this, play);
  }

  // ---------------------------------------------------------------- lineout
  setupLineout(x: number, touchSign: number, throwSide: Side) {
    return SetPieces.setupLineout(this, x, touchSign, throwSide);
  }

  resolveLineout(throwSide: Side, x: number, s: number, q: number) {
    return SetPieces.resolveLineout(this, throwSide, x, s, q);
  }

  // ---------------------------------------------------------------- penalties
  awardPenalty(side: Side, x: number, z: number) {
    return Rules.awardPenalty(this, side, x, z);
  }

  // ---------------------------------------------------------------- place kicks
  setupPlaceKick(side: Side, kind: 'conversion' | 'penalty' | 'drill', x: number, z: number) {
    return SetPieces.setupPlaceKick(this, side, kind, x, z);
  }

  /** Conversions: move the ball back along the line it was grounded on (wider angle, longer kick). Returns metres out. */
  movePlaceKick(dm: number): number {
    return SetPieces.movePlaceKick(this, dm);
  }

  /** User drags to aim (degrees relative to the posts). */
  setPlaceAim(deg: number) {
    return SetPieces.setPlaceAim(this, deg);
  }

  /** Swing meter result: power 0..1 (≈0.55 is ideal), accuracy -1..1 (0 = perfect). */
  shootPlaceKick(aimDeg: number, power: number, accuracy: number, curl = 0) {
    return SetPieces.shootPlaceKick(this, aimDeg, power, accuracy, curl);
  }

  // ---------------------------------------------------------------- set plays
  startSetPlay(id: SetPlayId) {
    return SetPieces.startSetPlay(this, id);
  }

  // ---------------------------------------------------------------- drills
  startDrill() {
    return Drills.startDrill(this);
  }

  drillNext(first = false) {
    return Drills.drillNext(this, first);
  }

  finishDrill(total: number) {
    return Drills.finishDrill(this, total);
  }

  // ---------------------------------------------------------------- rendering
  animFor(p: P, speed: number): [AnimName, number] {
    return View.animFor(this, p, speed);
  }

  render(dt: number) {
    return View.render(this, dt);
  }

  // ---------------------------------------------------------------- replay
  startReplay(frames: ReplayFrame[], done: () => void) {
    return View.startReplay(this, frames, done);
  }

  /** Called by the UI when the player taps to skip. */
  skipReplay() {
    return View.skipReplay(this);
  }

  updateReplay(dt: number) {
    return View.updateReplay(this, dt);
  }

  replayFrame(): ReplayFrame {
    return View.replayFrame(this);
  }

  updateArc() {
    return View.updateArc(this);
  }

  rain: THREE.LineSegments | null = null;
  /** Rain: streaks falling in a box around the camera's target (weather = rain only). */
  updateRain(dt: number) {
    return View.updateRain(this, dt);
  }

  callSprite: THREE.Sprite | null = null;
  callT = 0;
  callFor: P | null = null;
  updateCallIcon(rf: ReplayFrame | null) {
    return View.updateCallIcon(this, rf);
  }
  camZoom = 1;
  cpos = new THREE.Vector3();
  clook = new THREE.Vector3();
  craw = new THREE.Vector3();
  camF = new THREE.Vector3();
  camFV = new THREE.Vector3();
  camFInit = false;
  sfA = new THREE.Vector3();
  sfB = new THREE.Vector3();
  sfOut = new THREE.Vector3();
  /** Critically damped follow of the camera's target point (SmoothDamp). */
  smoothFocus(target: THREE.Vector3, dt: number): THREE.Vector3 {
    return View.smoothFocus(this, target, dt);
  }

  updateCamera(dt: number, rf: ReplayFrame | null) {
    return View.updateCamera(this, dt, rf);
  }
}
