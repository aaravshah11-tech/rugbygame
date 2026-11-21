import { makeRng, hashString, clamp, uid, type Rng } from '../util/rng';
import { NATIONS, nationById, type Nation } from './nations';
import { randomName } from './names';

export type Rating = 'pace' | 'strength' | 'passing' | 'kicking' | 'tackling' | 'handling';
export const RATING_KEYS: Rating[] = ['pace', 'strength', 'passing', 'kicking', 'tackling', 'handling'];
export const RATING_LABEL: Record<Rating, string> = {
  pace: 'PAC', strength: 'STR', passing: 'PAS', kicking: 'KIC', tackling: 'TKL', handling: 'HAN',
};
export type Ratings = Record<Rating, number>;
export type Rarity = 'bronze' | 'silver' | 'gold';

export interface Player {
  id: string;
  first: string;
  last: string;
  nation: string;
  position: number; // natural shirt position 1..15
  ratings: Ratings;
  level: number;
  xp: number;
  /** extra points bought via training upgrades */
  training: Partial<Ratings>;
}

export const POSITIONS: { num: number; name: string; short: string; group: 'front' | 'lock' | 'back-row' | 'half' | 'centre' | 'back3' }[] = [
  { num: 1, name: 'Loosehead Prop', short: 'LP', group: 'front' },
  { num: 2, name: 'Hooker', short: 'HK', group: 'front' },
  { num: 3, name: 'Tighthead Prop', short: 'TP', group: 'front' },
  { num: 4, name: 'Lock', short: 'LK', group: 'lock' },
  { num: 5, name: 'Lock', short: 'LK', group: 'lock' },
  { num: 6, name: 'Blindside Flanker', short: 'BF', group: 'back-row' },
  { num: 7, name: 'Openside Flanker', short: 'OF', group: 'back-row' },
  { num: 8, name: 'Number 8', short: 'N8', group: 'back-row' },
  { num: 9, name: 'Scrum-half', short: 'SH', group: 'half' },
  { num: 10, name: 'Fly-half', short: 'FH', group: 'half' },
  { num: 11, name: 'Left Wing', short: 'LW', group: 'back3' },
  { num: 12, name: 'Inside Centre', short: 'IC', group: 'centre' },
  { num: 13, name: 'Outside Centre', short: 'OC', group: 'centre' },
  { num: 14, name: 'Right Wing', short: 'RW', group: 'back3' },
  { num: 15, name: 'Fullback', short: 'FB', group: 'back3' },
];
export const posInfo = (num: number) => POSITIONS[num - 1];

/** Attribute profile offsets per position group (added to the base level). */
const PROFILE: Record<string, Ratings> = {
  front: { pace: -22, strength: 12, passing: -12, kicking: -30, tackling: 4, handling: -6 },
  lock: { pace: -14, strength: 10, passing: -10, kicking: -28, tackling: 4, handling: -2 },
  'back-row': { pace: -4, strength: 6, passing: -4, kicking: -22, tackling: 8, handling: 2 },
  half: { pace: 2, strength: -10, passing: 10, kicking: 6, tackling: -6, handling: 6 },
  centre: { pace: 2, strength: 2, passing: 2, kicking: -10, tackling: 4, handling: 4 },
  back3: { pace: 10, strength: -6, passing: -2, kicking: -4, tackling: -2, handling: 4 },
};
/** How much each attribute counts towards OVR by position group. */
const WEIGHTS: Record<string, Ratings> = {
  front: { pace: 0.5, strength: 3, passing: 0.5, kicking: 0, tackling: 2, handling: 1 },
  lock: { pace: 0.7, strength: 2.5, passing: 0.6, kicking: 0, tackling: 2, handling: 1.4 },
  'back-row': { pace: 1.2, strength: 1.8, passing: 0.8, kicking: 0, tackling: 2.5, handling: 1.5 },
  half: { pace: 1, strength: 0.4, passing: 2.6, kicking: 2.2, tackling: 0.6, handling: 1.8 },
  centre: { pace: 1.6, strength: 1.4, passing: 1.4, kicking: 0.4, tackling: 1.7, handling: 1.8 },
  back3: { pace: 2.8, strength: 0.6, passing: 0.8, kicking: 1, tackling: 1, handling: 2 },
};

export function effectiveRatings(p: Player, boost: Partial<Ratings> = {}): Ratings {
  const out = {} as Ratings;
  const lvl = (p.level - 1) * 0.6;
  for (const k of RATING_KEYS) out[k] = clamp(Math.round(p.ratings[k] + (p.training[k] ?? 0) + lvl + (boost[k] ?? 0)), 1, 99);
  return out;
}

export function ovrFor(r: Ratings, position: number): number {
  const w = WEIGHTS[posInfo(position).group];
  let sum = 0;
  let tw = 0;
  for (const k of RATING_KEYS) {
    sum += r[k] * w[k];
    tw += w[k];
  }
  return clamp(Math.round(sum / tw), 1, 99);
}

export function playerOvr(p: Player, position = p.position, boost: Partial<Ratings> = {}): number {
  const base = ovrFor(effectiveRatings(p, boost), position);
  if (position === p.position) return base;
  // Out of position penalty, smaller within the same group.
  const same = posInfo(position).group === posInfo(p.position).group;
  return Math.max(1, base - (same ? 2 : 8));
}

export function rarityOf(ovr: number): Rarity {
  return ovr >= 80 ? 'gold' : ovr >= 70 ? 'silver' : 'bronze';
}

export function generatePlayer(rng: Rng, nation: Nation, position: number, level: number): Player {
  const prof = PROFILE[posInfo(position).group];
  const ratings = {} as Ratings;
  for (const k of RATING_KEYS) ratings[k] = clamp(Math.round(level + prof[k] + rng.range(-7, 7)), 20, 97);
  // Specialist kickers at 10 / 15.
  if (position === 10) ratings.kicking = clamp(ratings.kicking + 8, 20, 98);
  const { first, last } = randomName(rng, nation.region);
  return { id: uid(), first, last, nation: nation.id, position, ratings, level: 1, xp: 0, training: {} };
}

/** Normalise a generated player so its OVR lands near a target value. */
function tuneToOvr(p: Player, target: number) {
  for (let i = 0; i < 6; i++) {
    const diff = target - ovrFor(p.ratings, p.position);
    if (Math.abs(diff) < 1) break;
    for (const k of RATING_KEYS) p.ratings[k] = clamp(p.ratings[k] + diff, 15, 98);
  }
}

export interface NationSquad {
  starters: Player[]; // index i = shirt i+1
  bench: Player[];
}

const squadCache = new Map<string, NationSquad>();

/** Each nation's squad is generated from a fixed seed so it stays the same every session. */
export function nationSquad(nationId: string): NationSquad {
  const cached = squadCache.get(nationId);
  if (cached) return cached;
  const nation = nationById(nationId);
  const rng = makeRng(hashString('tryline-' + nationId));
  const starters: Player[] = [];
  for (let pos = 1; pos <= 15; pos++) {
    const p = generatePlayer(rng, nation, pos, nation.strength + 6);
    p.id = `${nationId}-${pos}`;
    tuneToOvr(p, nation.strength + rng.int(-4, 4));
    starters.push(p);
  }
  const benchPos = [2, 1, 3, 4, 7, 9, 10, 13];
  const bench = benchPos.map((pos, i) => {
    const p = generatePlayer(rng, nation, pos, nation.strength);
    p.id = `${nationId}-b${i}`;
    tuneToOvr(p, nation.strength - rng.int(3, 8));
    return p;
  });
  const squad = { starters, bench };
  squadCache.set(nationId, squad);
  return squad;
}

export function teamOvr(players: Player[], boost: Partial<Ratings> = {}): number {
  if (!players.length) return 0;
  return Math.round(players.reduce((s, p, i) => s + playerOvr(p, i + 1, boost), 0) / players.length);
}

/** Random card for packs. `quality` 0..1 shifts the OVR distribution. */
export function randomCard(rarity: Rarity, rng: Rng): Player {
  const nation = rng.pick(NATIONS);
  const position = rng.int(1, 15);
  const target = rarity === 'gold' ? rng.int(80, 90) : rarity === 'silver' ? rng.int(70, 79) : rng.int(58, 69);
  const p = generatePlayer(rng, nation, position, target + 6);
  tuneToOvr(p, target);
  return p;
}

export const fullName = (p: Player) => `${p.first} ${p.last}`;
export const shortName = (p: Player) => `${p.first[0]}. ${p.last}`;
