import type { Kit } from '../data/nations';
import type { Player, Ratings } from '../data/players';
import type { CameraMode, Difficulty } from '../state/types';
import type { QualitySetting } from './view/quality';

export interface TeamSetup {
  id: string;
  name: string;
  short: string;
  kit: Kit;
  players: Player[]; // 15 starters, index = shirt - 1
  boost?: Partial<Ratings>;
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

export type PenaltyChoice = 'goal' | 'touch' | 'tap';

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
  canDrop: boolean;
  mph: number;
  /** live scrum push battle: bal -1 (CPU driving) .. +1 (user driving) */
  scrum: null | { bal: number; t: number; dur: number; choose: boolean; userFeed: boolean };
}

export interface EngineResult {
  userScore: number;
  cpuScore: number;
  userTries: number;
  cpuTries: number;
  user: { tries: number; tackles: number; conversions: number; passes: number; penalties: number; dropGoals: number };
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
  | { type: 'drillDone'; score: number; total: number };

export type InputAction =
  | { type: 'pass'; long: boolean; dir: -1 | 0 | 1 }
  | { type: 'kick'; kind: 'punt' | 'grubber'; dist: number; angle: number }
  | { type: 'dropgoal' }
  | { type: 'sidestep' }
  | { type: 'handoff' }
  | { type: 'tackle' }
  | { type: 'dive' }
  | { type: 'switch' }
  | { type: 'addPlayer' }
  | { type: 'scrumPush' }
  | { type: 'scrumPlay'; play: 'left' | 'right' | 'pick' }
  | { type: 'dodge'; dir: -1 | 1 }
  | { type: 'setplay'; id: SetPlayId };

export type SetPlayId = 'crash' | 'loop' | 'miss' | 'upandunder';

export interface InputState {
  moveX: number;
  moveY: number;
  sprint: boolean;
  /** TACKLE held: chase the carrier and tackle when in range */
  tackleHold: boolean;
  /** live kick aim while the kick button is held */
  /** live aim while KICK / GRUB is held: distance in metres, angle in degrees (+ = screen right) */
  kickAim: { active: boolean; kind: 'punt' | 'grubber'; dist: number; angle: number };
  actions: InputAction[];
}

export const createInput = (): InputState => ({
  moveX: 0,
  moveY: 0,
  sprint: false,
  tackleHold: false,
  kickAim: { active: false, kind: 'punt', dist: 32, angle: 0 },
  actions: [],
});
