import type { Player, Ratings } from '../data/players';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'elite';
export type CameraMode = 'broadcast' | 'sideline' | 'close';
export type HalfLength = 3 | 5 | 8;
export type Weather = 'dry' | 'rain';
export type AttackStyle = 'forwards' | 'balanced' | 'expansive';
export type DefenceStyle = 'drift' | 'balanced' | 'blitz';
export type KickStyle = 'low' | 'balanced' | 'territory';
export type RulesMode = 'arcade' | 'standard' | 'sim';
export interface Tactics {
  attack: AttackStyle;
  defence: DefenceStyle;
  kicking: KickStyle;
  /** your own tuning, 0.6 .. 1.4 (1 = normal) */
  depth?: number;
  width?: number;
  lineSpeed?: number;
  /** players committed to each ruck: 1 (keep them in the line) .. 3 (secure every ball) */
  ruckCommit?: number;
}

/** A set play you design: who gets the ball and the line they run. */
export interface CustomPlay {
  id: string;
  name: string;
  /** pass order (num); line is used when no drawn run exists for that player */
  steps: { num: number; line: 'crash' | 'switch' | 'loop' | 'wide' | 'out' }[];
  /** drawn runs: where each player goes, metres from the breakdown (dx = forward, dz = towards the open side) */
  runs?: { num: number; dx: number; dz: number }[];
}

export interface Settings {
  music: number;
  sfx: number;
  haptics: boolean;
  difficulty: Difficulty;
  camera: CameraMode;
  halfLength: HalfLength;
  graphics: 'auto' | 'low' | 'medium' | 'high';
  weather: Weather;
  tactics: Tactics;
  rules: RulesMode;
  autoSwitch: boolean;
  leftHanded: boolean;
  /** action button size multiplier */
  buttonScale: number;
  customPlays?: CustomPlay[];
}

export interface Fixture {
  id: string;
  stage: string; // 'R1'..'R5', 'Group A', 'QF', 'SF', 'Final', 'S1'..
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  homeTries?: number;
  awayTries?: number;
  played: boolean;
}

export interface ChampionshipState {
  user: string;
  teams: string[];
  fixtures: Fixture[];
  round: number; // 1..5, 6 = finished
  finished: boolean;
  champion?: string;
}

export interface WorldCupState {
  user: string;
  groups: { name: string; teams: string[] }[];
  fixtures: Fixture[];
  stage: 'group' | 'QF' | 'SF' | 'Final' | 'done';
  eliminated: boolean;
  champion?: string;
}

export interface SeasonState {
  fixtures: Fixture[]; // home is always the club
  index: number;
  wins: number;
  draws: number;
  losses: number;
  finished: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  desc: string;
  boost: Partial<Ratings>;
  cost: number;
}

export interface Challenge {
  id: string;
  kind: ChallengeKind;
  label: string;
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
}
export type ChallengeKind = 'win' | 'tries' | 'tackles' | 'conversions' | 'hardWin' | 'passes' | 'matches';

export interface Profile {
  version: 1;
  coins: number;
  settings: Settings;
  club: {
    cards: Player[];
    starting: (string | null)[]; // 15 card ids
    bench: (string | null)[]; // 8 card ids
    staff: string[];
    season: SeasonState | null;
    seasonsPlayed: number;
  };
  championship: ChampionshipState | null;
  worldCup: WorldCupState | null;
  comps: Partial<Record<'six' | 'league' | 'prem', import('./comps').CompState | null>>;
  daily: { lastLogin: string; streak: number; pendingReward: number; challengesDate: string; challenges: Challenge[] };
  stats: { matches: number; wins: number; draws: number; losses: number; tries: number; tackles: number };
  trophies: { championship: number; worldCup: number; seasons: number; league?: number; prem?: number };
  trainingDone: Record<string, boolean>;
  /** Kicking Challenge progress per level */
  kickLevels?: Record<string, { best: number; passed: boolean }>;
  /** daily challenge scenarios completed today */
  scenarios?: { date: string; done: string[] };
  updatedAt: number;
}

/** Stats collected for the user's side at the end of a match. */
export interface MatchResult {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  homeTries: number;
  awayTries: number;
  userSide: 0 | 1 | null; // 0 = home
  user: { tries: number; tackles: number; conversions: number; passes: number; penalties: number; dropGoals: number };
  difficulty: Difficulty;
}
