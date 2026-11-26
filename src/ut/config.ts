/**
 * Try Line Ultimate Team: every tunable number in one place.
 * In-game coins only: nothing here costs real money.
 *
 * OVR bands, pack odds, coin rewards, market prices, chemistry and progression all live here, so
 * balancing never means hunting through screens.
 */

// ------------------------------------------------------------------ start
export const UT_START = {
  /** coins given the first time Ultimate Team opens */
  coins: 10_000,
  /** packs waiting to be opened on day one (the "starter pack") */
  packs: ['starter'] as string[],
  /** a full XV + bench of cards so the mode is playable straight away */
  starterSquadOvr: [60, 70] as [number, number],
};

// ------------------------------------------------------------------ cards
/** Card tier by OVR: Bronze < 65, Silver 65-74, Gold 75+. */
export const TIER = { silver: 65, gold: 75 };
/** Base cards at or above this OVR are always Rare; below it a share are (by a stable hash). */
export const RARE = { alwaysAtOvr: 82, shareBelow: 0.3 };

/** Special card types: an all-stats boost on top of the base player. */
export const SPECIALS = {
  totw: { name: 'Team of the Week', short: 'TOTW', boost: 3 },
  potm: { name: 'Player of the Match', short: 'POTM', boost: 4 },
  fs: { name: 'Future Stars', short: 'FUTURE STARS', boost: 5 },
  hero: { name: 'Hero', short: 'HERO', boost: 6 },
  showdown: { name: 'Nations Showdown', short: 'SHOWDOWN', boost: 5 },
  tots: { name: 'Team of the Season', short: 'TOTS', boost: 7 },
  icon: { name: 'Icon', short: 'ICON', boost: 0 },
  evo: { name: 'Evolution', short: 'EVO', boost: 0 },
} as const;
export type SpecialType = keyof typeof SPECIALS;

// ------------------------------------------------------------------ packs
/**
 * Pack contents. `best` decides the single best card in the pack (rolled first, top band first):
 * e.g. Gold: 25% chance of an 85+, otherwise 35% (60% in total) of 80-84, otherwise 75-79.
 * The rest of the pack is filled from `fill`. `walkout` (any pack): chance of an extra 88+ card.
 * These odds are much more generous than FC on purpose.
 */
export interface PackDef {
  id: string;
  name: string;
  price: number;
  /** players in the pack */
  count: number;
  /** of which at least this many are Rare */
  rares: number;
  /** the best card: [minOvr, maxOvr, chance] checked in order; the first that hits wins, the last is the fallback */
  best: [number, number, number][];
  /** OVR range for the other cards */
  fill: [number, number];
  /** chance the best card is a special (TOTW, Hero, Future Stars, TOTS, current promo) */
  special?: number;
  /** a guaranteed card of this kind */
  guarantee?: 'icon' | 'promo';
  /** position-change items included */
  items?: number;
  /** pack art colours */
  colors: [string, string];
  blurb: string;
  /** shown in the store (the starter pack is only given, never sold) */
  inStore?: boolean;
}

export const WALKOUT = { chance: 0.05, minOvr: 88 };

/**
 * BGS U16 boost: any pack (not Icon packs) has this chance of an extra BGS U16 player in place of
 * its weakest card. A Shah (95) is rarer: when a BGS player drops, this share of the time it's him.
 */
export const BGS_PULL = { team: 'BGS', chance: 0.35, shahShare: 0.08, shahId: 'BGS-14' };

export const PACKS: PackDef[] = [
  { id: 'bronze', name: 'Bronze Pack', price: 750, count: 6, rares: 1, best: [[65, 69, 0.15], [55, 64, 1]], fill: [52, 64], colors: ['#e0a77a', '#7a4520'], blurb: '6 players · Bronze', inStore: true },
  { id: 'silver', name: 'Silver Pack', price: 2_500, count: 6, rares: 1, best: [[75, 79, 0.2], [65, 74, 1]], fill: [65, 74], colors: ['#f4f6fa', '#7d8796'], blurb: '6 players · Silver', inStore: true },
  { id: 'gold', name: 'Gold Pack', price: 7_500, count: 6, rares: 1, best: [[85, 89, 0.25], [80, 84, 0.35 / 0.75], [75, 79, 1]], fill: [75, 80], colors: ['#ffe58a', '#b07a10'], blurb: '6 Gold players · 60% chance of an 80+', inStore: true },
  { id: 'premium', name: 'Premium Gold Pack', price: 15_000, count: 8, rares: 3, best: [[87, 92, 0.4], [82, 86, 0.45 / 0.6], [78, 81, 1]], fill: [75, 82], items: 1, colors: ['#fff1b0', '#c88a00'], blurb: '8 Gold players · 3 Rares · 85% chance of an 82+', inStore: true },
  { id: 'rare', name: 'Rare Players Pack', price: 20_000, count: 8, rares: 8, best: [[86, 90, 0.35], [80, 85, 1]], fill: [77, 84], colors: ['#ffd84a', '#7a4f00'], blurb: '8 Rare Gold players', inStore: true },
  { id: 'jumbo', name: 'Jumbo Premium Gold', price: 35_000, count: 14, rares: 4, best: [[87, 92, 0.5], [82, 86, 1]], fill: [75, 83], items: 2, colors: ['#ffe58a', '#8a5a00'], blurb: '14 Gold players · 4 Rares', inStore: true },
  { id: 'ultimate', name: 'Ultimate Pack', price: 100_000, count: 12, rares: 12, best: [[90, 99, 0.2], [85, 89, 1]], fill: [80, 87], special: 0.5, items: 2, colors: ['#1d1d1d', '#ffcf3a'], blurb: 'Guaranteed 85+ · 50% special · 20% 90+', inStore: true },
  { id: 'icon', name: 'Icon Pack', price: 150_000, count: 1, rares: 1, best: [[86, 99, 1]], fill: [86, 99], guarantee: 'icon', colors: ['#ffffff', '#d4b25a'], blurb: 'One guaranteed Icon', inStore: true },
  { id: 'promo', name: 'Promo Pack', price: 40_000, count: 6, rares: 6, best: [[80, 92, 1]], fill: [78, 85], guarantee: 'promo', colors: ['#0b0f1a', '#2ee6ff'], blurb: 'Guaranteed card from the current promo', inStore: true },
  { id: 'starter', name: 'Starter Pack', price: 0, count: 10, rares: 2, best: [[82, 86, 0.5], [78, 81, 1]], fill: [66, 78], items: 1, colors: ['#c6ff1a', '#1b5e20'], blurb: 'Welcome to Try Line Ultimate Team' },
];

/** Duplicates: quick sell (instant coins) or keep in storage. */
export const QUICK_SELL = { share: 0.1, min: 30 };

// ------------------------------------------------------------------ chemistry
/**
 * Each player in the XV earns 0-3 chem (FC style), only when playing in position: up to +3 from
 * team-mates (same nation or club) in the XV and +1 from league-mates;
 * an Icon counts double for their nation and always gets full league chem.
 */
export const CHEM = {
  team: [2, 4, 7] as number[], // teammates (incl. self) for +1 / +2 / +3
  /** league links add at most +1 (there are only three leagues, so they'd otherwise max everyone out) */
  league: [8] as number[],
  /** every chem point adds this to each rating in matches */
  statPerPoint: 1,
  /** OVR penalty out of position: same position group / anything else */
  outOfPosition: { group: 2, other: 8 },
  max: 45,
};
/** Position-change items: which positions a card can be moved to. */
export const POS_CHANGES: Record<number, number[]> = {
  1: [3], 3: [1], 2: [1, 3], 4: [5, 6], 5: [4, 6], 6: [7, 8, 5], 7: [6, 8], 8: [6, 7],
  9: [10], 10: [9, 12, 15], 11: [14, 15], 12: [13, 10], 13: [12, 14], 14: [11, 15], 15: [11, 14, 10],
};

// ------------------------------------------------------------------ team rating
/** Team rating: XV average plus bench at a quarter weight (FC style). */
export const TEAM_RATING = { benchWeight: 0.25 };

// ------------------------------------------------------------------ modes
export const REWARDS = {
  /** coins per match by result (all modes add their own bonuses on top) */
  match: { win: 900, draw: 450, loss: 250, perTry: 60 },
  friendlies: { dailyWins: 3, winCoins: 1_500, pack: 'gold' },
  battles: {
    /** match points by difficulty (win), halved for a draw */
    points: { easy: 200, medium: 400, hard: 700, elite: 1_000 } as Record<string, number>,
    perTry: 25,
    /** weekly ranks: points needed and reward */
    ranks: [
      { name: 'Elite 1', points: 9_000, coins: 40_000, pack: 'jumbo' },
      { name: 'Gold 1', points: 6_000, coins: 25_000, pack: 'premium' },
      { name: 'Silver 1', points: 3_500, coins: 12_000, pack: 'gold' },
      { name: 'Bronze 1', points: 1_500, coins: 5_000, pack: 'silver' },
      { name: 'Bronze 3', points: 0, coins: 1_000, pack: 'bronze' },
    ],
    opponentsPerWeek: 12,
  },
  rivals: {
    divisions: 10,
    /** points per win/draw/loss and points to promote; you can drop below 0 (relegation) from division 8 up */
    win: 3,
    draw: 1,
    loss: -1,
    promote: 9,
    safeDivisions: [10, 9],
    /** AI squad OVR in division d: base + (10 - d) * step */
    aiOvr: { base: 64, step: 3 },
    /** weekly rewards by best division reached */
    weekly: (div: number) => ({ coins: 3_000 + (10 - div) * 4_000, pack: div <= 2 ? 'ultimate' : div <= 5 ? 'premium' : 'gold' }),
    /** wins in Rivals this week to qualify for Champions */
    qualify: 4,
  },
  champions: {
    matches: 10,
    aiOvr: [84, 90] as [number, number],
    /** rewards by wins (highest tier reached) */
    tiers: [
      { wins: 9, name: 'Elite', coins: 100_000, pack: 'ultimate', extra: 'icon' },
      { wins: 7, name: 'Gold', coins: 50_000, pack: 'ultimate' },
      { wins: 5, name: 'Silver', coins: 25_000, pack: 'jumbo' },
      { wins: 3, name: 'Bronze', coins: 10_000, pack: 'premium' },
      { wins: 0, name: 'Entry', coins: 3_000, pack: 'gold' },
    ],
  },
  draft: {
    entry: 6_000,
    options: 5,
    wins: 4,
    /** AI OVR per round */
    aiOvr: [76, 80, 84, 88],
    /** rewards by wins (index = wins) */
    rewards: [
      { coins: 1_500, pack: 'silver' },
      { coins: 4_000, pack: 'gold' },
      { coins: 8_000, pack: 'premium' },
      { coins: 15_000, pack: 'jumbo' },
      { coins: 30_000, pack: 'ultimate' },
    ],
  },
  moments: {
    /** stars needed for each reward */
    milestones: [
      { stars: 3, pack: 'gold' },
      { stars: 8, pack: 'premium' },
      { stars: 15, pack: 'promo' },
      { stars: 24, pack: 'ultimate' },
    ],
  },
};

// ------------------------------------------------------------------ season pass
export const SEASON = {
  levels: 40,
  xpPerLevel: 1_000,
  xp: { match: 150, win: 150, try: 20, objective: 250, sbc: 200, pack: 40 },
};

// ------------------------------------------------------------------ transfer market
export const MARKET = {
  /** price of a card = base * typeMult * rareMult * demand, rounded to market steps */
  base: (ovr: number) => Math.round(200 * Math.pow(1.17, Math.max(0, ovr - 60))),
  typeMult: { bronze: 0.6, silver: 0.8, gold: 1, totw: 1.8, potm: 2, fs: 2.2, hero: 3, showdown: 2.4, tots: 3.5, icon: 5, evo: 1 } as Record<string, number>,
  rareMult: 1.25,
  /** prices drift by up to this much over a few hours */
  drift: 0.12,
  /** listings refresh every this many minutes */
  refreshMin: 20,
  listings: 40,
  /** EA-style tax on sales */
  tax: 0.05,
  /** chance per minute a listing sells, at the market price (cheaper sells faster) */
  sellRatePerMin: 0.12,
};

// ------------------------------------------------------------------ evolutions
export const EVO_LEVEL_TARGET = 1;
