import type { Kit } from '../data/nations';
import type { Player, Ratings } from '../data/players';
import type { CameraMode, CustomPlay, Difficulty, RulesMode, Tactics, Weather } from '../state/types';
import type { QualitySetting } from './view/quality';

export interface TeamSetup {
  id: string;
  name: string;
  short: string;
  kit: Kit;
  players: Player[]; // 15 starters, index = shirt - 1
  /** replacements available for substitutions */
  bench?: Player[];
  boost?: Partial<Ratings>;
}

export interface SquadLine {
  num: number;
  name: string;
  stamina: number;
  ovr: number;
  off: boolean;
}

export type Drill = 'passing' | 'kicking' | 'tackling' | 'setpieces';

export interface MatchConfig {
  user: TeamSetup;
  cpu: TeamSetup;
  userIsHome: boolean;
  halfMinutes: number;
  difficulty: Difficulty;
  camera: CameraMode;
  quality: QualitySetting;
  drill?: Drill;
  weather: Weather;
  tactics: Tactics;
  rules: RulesMode;
  autoSwitch: boolean;
  /** set plays the user designed */
  customPlays?: CustomPlay[];
  /** Kicking Challenge: goal kicks from these spots (x along the pitch, z across), wind in km/h; miss one and it's over */
  kickChallenge?: { level: string; spots: [number, number][]; windKmh: number };
  /** scenario overrides (daily challenges) */
  challenge?: ChallengeSetup;
}

export interface ChallengeSetup {
  id: string;
  title: string;
  /** starting score [user, cpu] */
  score?: [number, number];
  /** game seconds already played in the second half (0..2400) */
  secondHalfAt?: number;
  /** user starts with the ball at this x (metres from halfway, + = attacking) */
  startX?: number;
  goal: 'win' | 'tryFromOwn22' | 'holdOut' | 'scoreTries';
  target?: number;
}

export type MiniGameKind = 'ruck' | 'counterRuck' | 'scrum' | 'scrumDefend' | 'lineout' | 'lineoutDefend' | 'maul' | 'maulDefend';

export interface MiniGameRequest {
  id: number;
  kind: MiniGameKind;
  blocking: boolean;
  /** seconds the non-blocking bar stays up */
  duration: number;
  resolve: (quality: number) => void;
  onTap?: () => void;
}

export interface PlaceKickRequest {
  kind: 'conversion' | 'penalty' | 'drill';
  distance: number;
  /** wind relative to the kick direction: crosswind in km/h, + = pushes right */
  cross: number;
  /** headwind (-) / tailwind (+) km/h */
  along: number;
  windSpeed: number;
  kicker: string;
}

export type PenaltyChoice = 'goal' | 'touch' | 'tap' | 'scrum';

export interface HudState {
  userScore: number;
  cpuScore: number;
  clock: string;
  half: 1 | 2;
  attacking: boolean;
  canAct: boolean;
  controlledName: string;
  controlledNum: number;
  stamina: number;
  timeUp: boolean;
  phase: string;
  phaseNum: number;
  ruck: 'attack' | 'defend' | null;
  /** defending ruck choice so far */
  ruckDef: 'none' | 'contest' | 'fan';
  /** ruck ball speed: quick / slow / danger (turnover risk) */
  ruckBall: 'quick' | 'slow' | 'danger' | null;
  canDrop: boolean;
  mph: number;
  /** a defender is close enough for a hand-off */
  nearDef: boolean;
  /** referee: advantage being played (to the user or the CPU) */
  advantage: null | 'user' | 'cpu';
  /** sin-binned players with time left (mm:ss) */
  sinBin: { team: string; name: string; left: string }[];
  /** a play to call (lineout win, kick-off …) */
  call: null | { title: string; opts: { id: string; label: string; sub?: string }[]; left: number };
  /** a high ball is dropping onto your player: tap CATCH */
  catchPrompt: boolean;
  /** wind as seen on screen: angle (deg, 0 = up the screen) and km/h */
  wind: { deg: number; kmh: number };
  /** the carrier is the scrum-half (box kick available) */
  isNine: boolean;
  /** CPU conversion: wait for the run-up, then CHARGE */
  chargePrompt: null | 'wait' | 'go';
  /** close enough to dive for the line */
  canDiveTry: boolean;
  /** your scrum-half has the ball at the base of a ruck */
  atBase: boolean;
  /** ruck ball is ready but your 9 is still getting there */
  nineWait: boolean;
  /** your kick-off / drop-out: drag to aim */
  kickoffAim: boolean;
  /** CPU driving a maul at you: collapse it (penalty risk) or counter-drive */
  maulDefend: boolean;
  /** lining up a penalty kick to touch: show the kick aim */
  penTouch: boolean;
  /** offload window open: PASS now to offload in the tackle */
  offload: boolean;
  /** live scrum push battle: bal -1 (CPU driving) .. +1 (user driving) */
  scrum: null | { bal: number; t: number; dur: number; choose: boolean; userFeed: boolean };
}

export interface EngineResult {
  userScore: number;
  cpuScore: number;
  userTries: number;
  cpuTries: number;
  user: { tries: number; tackles: number; conversions: number; passes: number; penalties: number; dropGoals: number };
  match?: MatchStats;
  /** challenge completed (undefined outside challenges) */
  challenge?: boolean;
}

/** Team stats, index 0 = user, 1 = CPU. */
export interface MatchStats {
  possession: [number, number];
  territory: [number, number];
  tackles: [number, number];
  missed: [number, number];
  metres: [number, number];
  lineBreaks: [number, number];
  turnovers: [number, number];
  penalties: [number, number];
  potm: { name: string; team: string; line: string } | null;
}

export type CommentaryTone = 'big' | 'good' | 'bad' | 'info';

export type EngineEvent =
  | { type: 'hud'; hud: HudState }
  | { type: 'commentary'; text: string; tone: CommentaryTone; sub?: string }
  | { type: 'minigame'; req: MiniGameRequest }
  | { type: 'minigameCancel' }
  | { type: 'placekick'; req: PlaceKickRequest }
  | { type: 'placekickDone' }
  | { type: 'penalty'; canKick: boolean; resolve: (c: PenaltyChoice) => void }
  | { type: 'halftime' }
  | { type: 'end'; result: EngineResult }
  | { type: 'try'; scorer: string; team: string; userScored: boolean }
  | { type: 'replay'; active: boolean }
  | { type: 'drill'; text: string; progress: string }
  | { type: 'pop'; text: string; tone: 'good' | 'bad' | 'big' }
  | { type: 'tmo'; stage: 'check' | 'try' | 'notry' }
  | { type: 'intro'; on: boolean; title: string; sub: string }
  | { type: 'drillDone'; score: number; total: number };

export type InputAction =
  | { type: 'pass'; long: boolean; dir: -1 | 0 | 1 }
  | { type: 'kick'; kind: KickKind; dist: number; angle: number; power?: number; tx?: number; tz?: number }
  | { type: 'catch' }
  | { type: 'dropgoal' }
  | { type: 'sidestep' }
  | { type: 'handoff' }
  | { type: 'tackle' }
  | { type: 'dive' }
  | { type: 'switch' }
  | { type: 'addPlayer' }
  | { type: 'scrumPush' }
  | { type: 'ruckContest' }
  | { type: 'ruckFan' }
  | { type: 'scrumPlay'; play: 'left' | 'right' | 'pick' | 'nine' }
  | { type: 'call'; id: string }
  | { type: 'basePass'; dir: -1 | 1 }
  | { type: 'pickGo' }
  | { type: 'charge' }
  | { type: 'collapseMaul' }
  | { type: 'diveTry' }
  | { type: 'snipe' }
  | { type: 'dodge'; dir: -1 | 1 }
  | { type: 'setplay'; id: SetPlayId };

/** Open-play kicks: punt (long), box (9 only), grubber, chip, high (up-and-under), touch, cross (cross-field). */
export type KickKind = 'punt' | 'grubber' | 'box' | 'chip' | 'high' | 'touch' | 'cross';

export type SetPlayId = 'crash' | 'loop' | 'miss' | 'switch' | 'upandunder' | `custom:${string}`;

export interface InputState {
  moveX: number;
  moveY: number;
  sprint: boolean;
  /** SPRINT button held */
  sprintHold: boolean;
  /** TACKLE held: chase the carrier and tackle when in range */
  tackleHold: boolean;
  /** live kick aim while the kick button is held */
  /** live aim while KICK / GRUB is held: distance in metres, angle in degrees (+ = screen right) */
  kickAim: { active: boolean; kind: KickKind; dist: number; angle: number };
  actions: InputAction[];
}

export const createInput = (): InputState => ({
  moveX: 0,
  moveY: 0,
  sprint: false,
  sprintHold: false,
  tackleHold: false,
  kickAim: { active: false, kind: 'punt', dist: 32, angle: 0 },
  actions: [],
});
