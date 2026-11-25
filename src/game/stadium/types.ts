import type * as THREE from 'three';
import type { QualityPreset } from '../view/quality';

/**
 * Stadiums are described, not modelled: a StadiumSpec says what a ground is like (stands, roofs,
 * seats, lights, setting, signature feature) and the builder turns it into geometry.
 *
 * Game axes: the pitch runs along x (try lines at x = +-50, dead-ball lines at +-60), touchlines at
 * z = +-35. "main" is the long side at -z (the side the teams walk out from, and the far side for
 * the broadcast camera), "opp" the long side at +z, "endL" the -x end and "endR" the +x end.
 */
export type SideKey = 'main' | 'opp' | 'endL' | 'endR';
export const SIDES: SideKey[] = ['main', 'opp', 'endL', 'endR'];

export type RoofType = 'none' | 'cantilever' | 'bowl' | 'closing' | 'translucent';
export type CapacityTier = 'club' | 'medium' | 'large' | 'national';
export type TimeOfDay = 'afternoon' | 'golden' | 'night';
export type StadiumWeather = 'dry' | 'rain' | 'snow';

export interface StandSpec {
  /** tiers of seating; 0 = no stand on this side */
  tiers: number;
  /** rows in the lower tier (upper tiers are a little shallower) */
  rows?: number;
  /** steepness in degrees (old club stands ~20, modern bowls ~30, top tiers steeper) */
  rake?: number;
  roof: RoofType;
  /** executive-box level with glass between the lower and upper tier */
  boxes?: boolean;
  /** a standing terrace: concrete steps and crush barriers, fans standing */
  terrace?: boolean;
  /** roof held up by pillars along the front (older stands) */
  columns?: boolean;
  /** players' tunnel and dugouts in this stand */
  tunnel?: boolean;
  /** grass bank where there is no stand */
  bank?: boolean;
  /** a temporary / scaffold stand (open steel frame under the seats) */
  temporary?: boolean;
}

export type SeatPattern = 'alternate' | 'mosaic' | 'blocks' | 'letters' | 'gradient' | 'scatter';

export type SignatureKind =
  | 'arch'
  | 'masts'
  | 'floatingRoof'
  | 'waveRoof'
  | 'timberRoof'
  | 'volcano'
  | 'river'
  | 'clockTower'
  | 'commsTower'
  | 'hill'
  | 'palms'
  | 'shed'
  | 'gatehouse'
  | 'sculpture'
  | 'pines'
  | 'bigMainStand'
  | 'scoreboard'
  | 'harbour'
  | 'pavilion';

export interface StadiumSpec {
  id: string;
  name: string;
  city: string;
  capacity: number;
  tier: CapacityTier;
  /** bowl = one smooth curved ring; stands = separate boxy stands; fields = a school ground */
  layout: 'bowl' | 'stands' | 'fields';
  stands: Record<SideKey, StandSpec>;
  /** corners filled with seating (bowl) or left open */
  corners: 'open' | 'closed';
  seats: { colors: string[]; pattern: SeatPattern; letters?: string; letterColor?: string };
  cladding: { style: 'glass' | 'concrete' | 'metal' | 'brick' | 'timber'; color: string };
  roofColor: string;
  /** 0..1; translucent roofs let light through */
  roofOpacity?: number;
  lights: 'pylons' | 'roof' | 'both';
  screens: { count: number; at: 'ends' | 'corners' | 'roof' };
  surroundings: {
    kind: 'city' | 'suburb' | 'trees' | 'fields' | 'tropical' | 'harbour';
    /** tallest buildings (m) for city / harbour settings */
    skyline?: number;
    river?: boolean;
    ocean?: boolean;
    hills?: 'hills' | 'mountains' | 'volcano';
  };
  signature: { kind: SignatureKind; note: string };
  pitch: { mow: 'stripes' | 'checker' | 'diagonal' | 'circles' | 'wide'; inGoal: string; artificial?: boolean };
  /** athletics track round the pitch (pushes the stands back) */
  track?: string;
  /** sky / sun character */
  climate?: 'temperate' | 'tropical' | 'highveld';
  /** share of seats filled for an ordinary game */
  fill: number;
}

export interface StadiumContext {
  quality: QualityPreset;
  /** shirt colours for the crowd: home fans first, then away */
  home: { primary: string; secondary: string };
  away: { primary: string; secondary: string };
  time: TimeOfDay;
  weather: StadiumWeather;
  /** 0.6 friendly .. 1 final: how full the ground is */
  importance: number;
}

export type StadiumEvent = 'try' | 'tryAgainst' | 'missKick' | 'attack22' | 'kickoff' | 'halftime' | 'fulltime';

export interface StadiumView {
  spec: StadiumSpec;
  group: THREE.Group;
  /** the light that casts player shadows (sun or main floodlight bank) */
  key: THREE.DirectionalLight;
  update(time: number, excite: number, camera: THREE.Camera): void;
  /** crowd and boards react */
  event(e: StadiumEvent): void;
  /** text for the big screens */
  setScore(text: string): void;
  /** the match wind (m/s), for flags */
  setWind(x: number, z: number): void;
}
