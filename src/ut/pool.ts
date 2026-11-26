/**
 * The Ultimate Team card pool: every player from every team in the game (nations, clubs, the
 * school side) plus Icons, and the maths that turns a base player + card type into a card.
 */
import { CLUBS, NATIONS, SCHOOLS, nationById, type Nation } from '../data/nations';
import { generatePlayer, nationSquad, ovrFor, posInfo, tuneToOvr, type Player, type Ratings } from '../data/players';
import { clamp, hashString, makeRng } from '../util/rng';
import { RARE, SPECIALS, TIER, type SpecialType } from './config';

export type League = 'INT' | 'PREM' | 'SCH' | 'ICON';
export const LEAGUE_NAME: Record<League, string> = { INT: 'International', PREM: 'Premiership', SCH: 'Schools', ICON: 'Icons' };

export interface BaseCard {
  /** stable id, e.g. "ENG-10", "LEI-b3", "ICON-lomu" */
  id: string;
  player: Player;
  team: string;
  /** a nation's players: the nation; club players: the club (their nationality isn't in the data) */
  nation: string;
  league: League;
  ovr: number;
  rare: boolean;
  /** generated academy prospect (not in a real squad) */
  academy?: boolean;
}

// ------------------------------------------------------------------ icons
/** Legends of the game (original card art; ratings are game estimates). [first, last, nation, pos, ovr, P S A K T H] */
const ICON_LIST: [string, string, string, number, number, number[]][] = [
  ['Jonah', 'Lomu', 'NZL', 11, 95, [97, 96, 70, 55, 70, 88]],
  ['Richie', 'McCaw', 'NZL', 7, 94, [80, 88, 78, 40, 97, 92]],
  ['Dan', 'Carter', 'NZL', 10, 94, [84, 66, 95, 98, 72, 92]],
  ['Jonny', 'Wilkinson', 'ENG', 10, 93, [78, 72, 90, 99, 90, 88]],
  ['Martin', 'Johnson', 'ENG', 4, 91, [62, 96, 70, 30, 92, 86]],
  ['Brian', "O'Driscoll", 'IRE', 13, 94, [88, 80, 90, 60, 90, 95]],
  ['Paul', "O'Connell", 'IRE', 5, 90, [60, 95, 68, 30, 91, 88]],
  ['Shane', 'Williams', 'WAL', 11, 91, [97, 58, 80, 70, 70, 92]],
  ['Gareth', 'Edwards', 'WAL', 9, 95, [90, 70, 97, 85, 78, 95]],
  ['Serge', 'Blanco', 'FRA', 15, 92, [92, 70, 86, 82, 74, 93]],
  ['Bryan', 'Habana', 'RSA', 14, 92, [98, 66, 74, 64, 76, 90]],
  ['Os', 'du Randt', 'RSA', 1, 89, [58, 97, 66, 25, 88, 80]],
  ['Victor', 'Matfield', 'RSA', 5, 91, [62, 92, 72, 35, 88, 94]],
  ['David', 'Campese', 'AUS', 11, 91, [94, 62, 86, 78, 66, 93]],
  ['John', 'Eales', 'AUS', 4, 90, [64, 92, 76, 80, 88, 90]],
  ['Sergio', 'Parisse', 'ITA', 8, 91, [78, 90, 84, 60, 88, 92]],
  ['Agustín', 'Pichot', 'ARG', 9, 88, [84, 66, 92, 80, 74, 90]],
  ['Waisale', 'Serevi', 'FIJ', 10, 90, [90, 60, 92, 88, 62, 95]],
  ['Keith', 'Wood', 'IRE', 2, 89, [72, 90, 80, 60, 86, 88]],
  ['Jason', 'Robinson', 'ENG', 15, 90, [97, 62, 78, 70, 72, 92]],
];

function iconPlayer(e: (typeof ICON_LIST)[number]): Player {
  const [first, last, nation, pos, , r] = e;
  const n = nationById(nation);
  const p = generatePlayer(makeRng(hashString('icon-' + last)), n, pos, 80);
  const keys: (keyof Ratings)[] = ['pace', 'strength', 'passing', 'kicking', 'tackling', 'handling'];
  keys.forEach((k, i) => (p.ratings[k] = r[i]));
  return { ...p, id: `ICON-${last.toLowerCase().replace(/[^a-z]/g, '')}`, first, last, nation };
}

// ------------------------------------------------------------------ pool
let POOL: BaseCard[] | null = null;
let BY_ID: Map<string, BaseCard> | null = null;

const teamsInGame = (): Nation[] => [...NATIONS, ...CLUBS, ...SCHOOLS];

function leagueOf(teamId: string): League {
  if (SCHOOLS.some((s) => s.id === teamId)) return 'SCH';
  if (CLUBS.some((c) => c.id === teamId)) return 'PREM';
  return 'INT';
}

/** Every card in the game, built once (deterministic: the same players every session). */
export function cardPool(): BaseCard[] {
  if (POOL) return POOL;
  const out: BaseCard[] = [];
  const seen = new Set<string>();
  for (const t of teamsInGame()) {
    const sq = nationSquad(t.id);
    for (const p of [...sq.starters, ...sq.bench]) {
      // a player named in two squads appears once, under their first team
      const key = `${p.first} ${p.last}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ovr = ovrFor(p.ratings, p.position);
      const rare = ovr >= RARE.alwaysAtOvr || (hashString('rare-' + p.id) % 1000) / 1000 < RARE.shareBelow;
      out.push({ id: p.id, player: p, team: t.id, nation: t.id, league: leagueOf(t.id), ovr, rare });
    }
  }
  // Academy prospects: the real squads are all elite, so each team also has ten generated
  // youngsters (OVR 50-74) to fill Bronze and Silver packs. They link with their senior side.
  for (const t of teamsInGame()) {
    if (leagueOf(t.id) === 'SCH') continue;
    const rng = makeRng(hashString('academy-' + t.id));
    for (let i = 0; i < 10; i++) {
      const pos = 1 + ((i * 7 + hashString(t.id)) % 15);
      const target = 50 + rng.int(0, 24);
      const p = generatePlayer(rng, t, pos, target + 6);
      tuneToOvr(p, target);
      p.id = `${t.id}-a${i}`;
      if (seen.has(`${p.first} ${p.last}`)) continue;
      seen.add(`${p.first} ${p.last}`);
      const ovr = ovrFor(p.ratings, p.position);
      out.push({ id: p.id, player: p, team: t.id, nation: t.id, league: leagueOf(t.id), ovr, rare: (hashString('rare-' + p.id) % 1000) / 1000 < RARE.shareBelow, academy: true });
    }
  }
  for (const e of ICON_LIST) {
    const p = iconPlayer(e);
    // tune so the card shows the listed OVR in its position
    const want = e[4];
    if (Math.abs(ovrFor(p.ratings, p.position) - want) > 1) tuneToOvr(p, want);
    out.push({ id: p.id, player: p, team: 'ICON', nation: e[2], league: 'ICON', ovr: ovrFor(p.ratings, p.position), rare: true });
  }
  POOL = out;
  BY_ID = new Map(out.map((c) => [c.id, c]));
  return out;
}

export function baseCard(id: string): BaseCard | undefined {
  if (!BY_ID) cardPool();
  return BY_ID!.get(id);
}

export const isIcon = (b: BaseCard) => b.league === 'ICON';

// ------------------------------------------------------------------ owned cards
/** A card you own. Stats are derived from the base player + type + evolutions. */
export interface OwnedCard {
  uid: string;
  base: string;
  /** special version, or undefined for a normal bronze/silver/gold card */
  special?: SpecialType;
  /** position after a position-change item */
  pos?: number;
  /** evolution: levels done and the stat boosts they gave */
  evo?: { id: string; level: number; boost: Partial<Ratings>; ovrBonus: number };
  /** reward / SBC / draft cards can't be sold on the market */
  untradeable?: boolean;
  /** cards migrated from the old Squad mode keep their own player data */
  legacy?: Player;
  /** when it was packed / bought (ms) */
  at: number;
}

export type CardTier = 'bronze' | 'silver' | 'gold';
export const tierOf = (ovr: number): CardTier => (ovr >= TIER.gold ? 'gold' : ovr >= TIER.silver ? 'silver' : 'bronze');

/** The face stats on a card. WRK (work rate / stamina) comes from position, tackling and strength. */
export interface FaceStats {
  PAC: number;
  STR: number;
  HAN: number;
  KCK: number;
  TKL: number;
  WRK: number;
}
const WRK_BASE: Record<string, number> = { front: 4, lock: 6, 'back-row': 12, half: 6, centre: 4, back3: 0 };

export interface CardView {
  card: OwnedCard;
  base: BaseCard;
  player: Player;
  ratings: Ratings;
  ovr: number;
  pos: number;
  tier: CardTier;
  rare: boolean;
  special?: SpecialType;
  face: FaceStats;
  team: string;
  nation: string;
  league: League;
  name: string;
}

const viewCache = new WeakMap<OwnedCard, CardView>();

/** Everything a screen needs to draw or use a card (cached per card object). */
export function view(card: OwnedCard): CardView {
  const hit = viewCache.get(card);
  if (hit) return hit;
  let base = baseCard(card.base);
  if (!base && card.legacy) {
    const p = card.legacy;
    base = { id: card.base, player: p, team: p.nation, nation: p.nation, league: leagueOf(p.nation), ovr: ovrFor(p.ratings, p.position), rare: false };
  }
  if (!base) base = cardPool()[0];
  const boost = card.special ? SPECIALS[card.special].boost : 0;
  const r = { ...base.player.ratings };
  for (const k of Object.keys(r) as (keyof Ratings)[]) r[k] = clamp(r[k] + boost + (card.evo?.boost[k] ?? 0), 1, 99);
  const pos = card.pos ?? base.player.position;
  const ovr = clamp(ovrFor(r, pos) + (card.evo?.ovrBonus ?? 0), 1, 99);
  const g = posInfo(pos).group;
  const face: FaceStats = {
    PAC: r.pace,
    STR: r.strength,
    HAN: Math.round(r.handling * 0.7 + r.passing * 0.3),
    KCK: r.kicking,
    TKL: r.tackling,
    WRK: clamp(Math.round(r.tackling * 0.4 + r.strength * 0.25 + r.pace * 0.35 + WRK_BASE[g] - 4), 1, 99),
  };
  const special = card.special ?? (base.league === 'ICON' ? 'icon' : card.evo ? 'evo' : undefined);
  const v: CardView = {
    card, base, player: base.player, ratings: r, ovr, pos, tier: tierOf(ovr), rare: base.rare || !!special, special,
    face, team: base.team, nation: base.nation, league: base.league, name: cardName(base.player),
  };
  viewCache.set(card, v);
  return v;
}

/** "Freeman", or "A Shah" for team-sheet initials. */
export const cardName = (p: Player) => (/^[A-Z]{1,3}$/.test(p.first) ? `${p.first} ${p.last}` : p.last);

/** The player the match engine uses: card ratings (+ chem) and the card's position. */
export function matchPlayer(v: CardView, chem: number, statPerChem: number): Player {
  const r = { ...v.ratings };
  for (const k of Object.keys(r) as (keyof Ratings)[]) r[k] = clamp(r[k] + chem * statPerChem, 1, 99);
  return { ...v.player, id: v.card.uid, position: v.pos, ratings: r, training: {}, level: 1 };
}

/** OVR range filter over the pool (base cards and, optionally, icons). */
export function poolBetween(lo: number, hi: number, icons = false): BaseCard[] {
  return cardPool().filter((c) => c.ovr >= lo && c.ovr <= hi && (icons || c.league !== 'ICON'));
}
