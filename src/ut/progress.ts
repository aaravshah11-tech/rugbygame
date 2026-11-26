/**
 * Objectives (daily / weekly / season), the 40-level season pass, Squad Building Challenges and
 * Evolutions: definitions plus the bookkeeping that ticks them off as you play.
 */
import { hashString, makeRng } from '../util/rng';
import { SEASON } from './config';
import { view, type CardView, type OwnedCard } from './pool';
import { chemistry, teamRating } from './squad';
import { dayKey, weekKey, type UTState } from './store';
import type { Ratings } from '../data/players';

// ------------------------------------------------------------------ events
export type UTEvent =
  | 'match' | 'win' | 'try' | 'wingTry' | 'forwardTry' | 'tackle' | 'conversion'
  | 'battlesWin' | 'rivalsWin' | 'championsWin' | 'draftWin' | 'friendlyWin' | 'momentStar'
  | 'pack' | 'sbc' | 'quicksell' | 'sold' | 'bought' | 'evoLevel';

export interface Reward {
  coins?: number;
  pack?: string;
  xp?: number;
  items?: number;
}
export const rewardText = (r: Reward) => [r.coins ? `${r.coins.toLocaleString()} coins` : '', r.pack ? `${packName(r.pack)}` : '', r.items ? `${r.items} position change${r.items > 1 ? 's' : ''}` : '', r.xp ? `${r.xp} XP` : ''].filter(Boolean).join(' · ');
const PACK_NAMES: Record<string, string> = { bronze: 'Bronze Pack', silver: 'Silver Pack', gold: 'Gold Pack', premium: 'Premium Gold', rare: 'Rare Players', jumbo: 'Jumbo Premium', ultimate: 'Ultimate Pack', icon: 'Icon Pack', promo: 'Promo Pack', starter: 'Starter Pack' };
export const packName = (id: string) => PACK_NAMES[id] ?? id;

export interface ObjectiveDef {
  id: string;
  label: string;
  event: UTEvent;
  target: number;
  reward: Reward;
}

const DAILY_POOL: Omit<ObjectiveDef, 'id'>[] = [
  { label: 'Play 2 Ultimate Team matches', event: 'match', target: 2, reward: { coins: 1_000, xp: 200 } },
  { label: 'Win a match', event: 'win', target: 1, reward: { coins: 1_500, xp: 250 } },
  { label: 'Score 3 tries', event: 'try', target: 3, reward: { coins: 1_200, xp: 200 } },
  { label: 'Make 15 tackles', event: 'tackle', target: 15, reward: { coins: 1_000, xp: 200 } },
  { label: 'Open a pack', event: 'pack', target: 1, reward: { coins: 500, xp: 150 } },
  { label: 'Kick 2 conversions', event: 'conversion', target: 2, reward: { coins: 1_000, xp: 200 } },
  { label: 'Quick sell 3 cards', event: 'quicksell', target: 3, reward: { coins: 600, xp: 150 } },
];
const WEEKLY_POOL: Omit<ObjectiveDef, 'id'>[] = [
  { label: 'Score 5 tries with wingers', event: 'wingTry', target: 5, reward: { pack: 'premium', xp: 600 } },
  { label: 'Win 3 Rivals matches', event: 'rivalsWin', target: 3, reward: { pack: 'rare', xp: 700 } },
  { label: 'Win 3 Squad Battles', event: 'battlesWin', target: 3, reward: { coins: 6_000, xp: 600 } },
  { label: 'Complete 2 SBCs', event: 'sbc', target: 2, reward: { pack: 'gold', xp: 500 } },
  { label: 'Score 3 tries with forwards', event: 'forwardTry', target: 3, reward: { coins: 5_000, xp: 500 } },
  { label: 'Win a Draft match', event: 'draftWin', target: 1, reward: { pack: 'premium', xp: 500 } },
  { label: 'Earn 3 Moments stars', event: 'momentStar', target: 3, reward: { coins: 4_000, xp: 500 } },
  { label: 'Sell 2 cards on the Transfer Market', event: 'sold', target: 2, reward: { coins: 3_000, xp: 400 } },
];
export const SEASON_OBJECTIVES: ObjectiveDef[] = [
  { id: 's-matches', label: 'Play 25 matches', event: 'match', target: 25, reward: { pack: 'jumbo', xp: 1_500 } },
  { id: 's-wins', label: 'Win 15 matches', event: 'win', target: 15, reward: { pack: 'ultimate', xp: 2_000 } },
  { id: 's-tries', label: 'Score 50 tries', event: 'try', target: 50, reward: { pack: 'promo', xp: 2_000 } },
  { id: 's-wing', label: 'Score 20 tries with wingers', event: 'wingTry', target: 20, reward: { pack: 'rare', xp: 1_500 } },
  { id: 's-rivals', label: 'Win 10 Rivals matches', event: 'rivalsWin', target: 10, reward: { pack: 'ultimate', xp: 2_000 } },
  { id: 's-champs', label: 'Win 5 Champions matches', event: 'championsWin', target: 5, reward: { pack: 'icon', xp: 2_500 } },
  { id: 's-sbc', label: 'Complete 8 SBCs', event: 'sbc', target: 8, reward: { pack: 'jumbo', xp: 1_500 } },
  { id: 's-packs', label: 'Open 25 packs', event: 'pack', target: 25, reward: { coins: 25_000, xp: 1_500 } },
  { id: 's-evo', label: 'Level up 3 Evolutions', event: 'evoLevel', target: 3, reward: { pack: 'promo', xp: 1_500 } },
  { id: 's-draft', label: 'Win 4 Draft matches', event: 'draftWin', target: 4, reward: { pack: 'ultimate', xp: 2_000 } },
];

const pickN = <T,>(seed: string, arr: T[], n: number) => {
  const rng = makeRng(hashString(seed));
  const a = [...arr];
  const out: T[] = [];
  while (out.length < n && a.length) out.push(a.splice(rng.int(0, a.length - 1), 1)[0]);
  return out;
};

export function dailyObjectives(d = dayKey()): ObjectiveDef[] {
  return pickN('daily-' + d, DAILY_POOL, 3).map((o, i) => ({ ...o, id: `d-${d}-${i}` }));
}
export function weeklyObjectives(w = weekKey()): ObjectiveDef[] {
  return pickN('weekly-' + w, WEEKLY_POOL, 5).map((o, i) => ({ ...o, id: `w-${w}-${i}` }));
}
export const allObjectives = () => [...dailyObjectives(), ...weeklyObjectives(), ...SEASON_OBJECTIVES];

/** Something happened: objectives and active evolutions move on. */
export function recordEvent(s: UTState, ev: UTEvent, n = 1, card?: string) {
  if (n <= 0) return;
  const o = s.objectives;
  // new day / week: daily and weekly progress starts again (season keeps going)
  if (o.date !== dayKey()) {
    o.date = dayKey();
    for (const k of Object.keys(o.progress)) if (k.startsWith('d-')) delete o.progress[k];
  }
  if (o.week !== weekKey()) {
    o.week = weekKey();
    for (const k of Object.keys(o.progress)) if (k.startsWith('w-')) delete o.progress[k];
  }
  for (const ob of allObjectives()) if (ob.event === ev) o.progress[ob.id] = Math.min(ob.target, (o.progress[ob.id] ?? 0) + n);
  for (const e of s.evo) {
    const def = EVOS.find((x) => x.id === e.id);
    const c = s.cards.find((x) => x.uid === e.cardUid);
    if (!def || !c) continue;
    const lvl = c.evo?.level ?? 0;
    const step = def.levels[lvl];
    if (!step) continue;
    for (const t of step.tasks) {
      if (t.event !== ev) continue;
      if (t.mine && card !== e.cardUid) continue;
      e.progress[t.event] = Math.min(t.target, (e.progress[t.event] ?? 0) + n);
    }
  }
}

export function addXp(s: UTState, xp: number) {
  s.season.xp = Math.min(SEASON.levels * SEASON.xpPerLevel, s.season.xp + xp);
}
export const seasonLevel = (xp: number) => Math.min(SEASON.levels, Math.floor(xp / SEASON.xpPerLevel));

/** Free season pass rewards, levels 1-40 (no paid track). */
export function passReward(level: number): Reward {
  if (level === 40) return { pack: 'icon' };
  if (level === 20) return { pack: 'promo' };
  if (level === 30) return { pack: 'ultimate' };
  if (level % 10 === 0) return { pack: 'jumbo', items: 2 };
  if (level % 5 === 0) return { pack: level >= 25 ? 'rare' : 'premium' };
  if (level % 3 === 0) return { pack: 'gold' };
  if (level % 4 === 0) return { items: 1, coins: 1_000 };
  return { coins: 600 + level * 60 };
}

// ------------------------------------------------------------------ SBCs
export interface SbcReq {
  /** players to hand in */
  count: number;
  /** 15 = a full XV in shirt order, chemistry counts */
  xv?: boolean;
  minRating?: number;
  minChem?: number;
  /** every player at least this OVR */
  minEach?: number;
  /** only players from these teams */
  onlyFrom?: string[];
  /** at least this many different teams from onlyFrom */
  distinct?: number;
  league?: { id: string; min: number };
  rares?: number;
  tier?: 'bronze' | 'silver' | 'gold';
  academy?: number;
}
export interface SbcDef {
  id: string;
  name: string;
  group: 'Upgrades' | 'Challenges' | 'Players' | 'Icons';
  desc: string;
  req: SbcReq;
  reward: { pack?: string; card?: { base: string; special: 'hero' | 'potm' | 'tots' | 'showdown' | 'fs' } };
  repeat: number;
}
export const SBCS: SbcDef[] = [
  { id: 'six-nations', name: 'Six Nations Pride', group: 'Challenges', desc: 'A full XV from the northern nations', req: { count: 15, xv: true, onlyFrom: ['ENG', 'FRA', 'IRE', 'ITA', 'SCO', 'WAL'], distinct: 3, minChem: 30 }, reward: { pack: 'premium' }, repeat: 3 },
  { id: 'southern', name: 'Southern Giants', group: 'Challenges', desc: 'NZL, RSA, AUS and ARG players only', req: { count: 15, xv: true, onlyFrom: ['NZL', 'RSA', 'AUS', 'ARG'], distinct: 2, minChem: 25 }, reward: { pack: 'promo' }, repeat: 2 },
  { id: 'prem-upgrade', name: 'Prem Upgrade', group: 'Upgrades', desc: '11 players, team rating 78+', req: { count: 11, minRating: 78, league: { id: 'PREM', min: 3 } }, reward: { pack: 'rare' }, repeat: 5 },
  { id: 'bronze-up', name: 'Bronze Upgrade', group: 'Upgrades', desc: 'Swap 6 Bronze cards', req: { count: 6, tier: 'bronze' }, reward: { pack: 'silver' }, repeat: 20 },
  { id: 'silver-up', name: 'Silver Upgrade', group: 'Upgrades', desc: 'Swap 6 Silver cards', req: { count: 6, tier: 'silver' }, reward: { pack: 'gold' }, repeat: 20 },
  { id: 'academy', name: 'Academy Graduates', group: 'Upgrades', desc: '5 Academy prospects', req: { count: 5, academy: 5 }, reward: { pack: 'silver' }, repeat: 10 },
  { id: 'gold-up', name: '80+ Upgrade', group: 'Upgrades', desc: '10 players, team rating 80+', req: { count: 10, minRating: 80 }, reward: { pack: 'jumbo' }, repeat: 5 },
  { id: 'totw-up', name: 'TOTW Upgrade', group: 'Upgrades', desc: '11 players, rating 82+, 2 Rares', req: { count: 11, minRating: 82, rares: 2 }, reward: { pack: 'promo' }, repeat: 3 },
  { id: 'p-itoje', name: 'Maro Itoje: Hero', group: 'Players', desc: 'Unlock a Hero version', req: { count: 15, xv: true, minRating: 83, minChem: 25 }, reward: { card: { base: 'ENG-4', special: 'hero' } }, repeat: 1 },
  { id: 'p-dupont', name: 'Antoine Dupont: Player of the Match', group: 'Players', desc: 'Unlock a POTM version', req: { count: 15, xv: true, minRating: 85, minChem: 28 }, reward: { card: { base: 'FRA-9', special: 'potm' } }, repeat: 1 },
  { id: 'p-shah', name: 'A Shah: Team of the Season', group: 'Players', desc: 'The BGS star, maxed out', req: { count: 11, minRating: 80, onlyFrom: undefined }, reward: { card: { base: 'BGS-14', special: 'tots' } }, repeat: 1 },
  { id: 'icon-swap', name: 'Icon Swap', group: 'Icons', desc: 'Hand in a top squad for an Icon pack', req: { count: 15, minRating: 86, rares: 5 }, reward: { pack: 'icon' }, repeat: 2 },
];

export interface SbcCheck {
  ok: boolean;
  lines: { text: string; ok: boolean }[];
  rating: number;
  chem: number;
}

/** Check a set of cards against an SBC; says exactly what's missing. */
export function checkSbc(def: SbcDef, cards: (OwnedCard | null)[]): SbcCheck {
  const r = def.req;
  const vs = cards.map((c) => (c ? view(c) : null));
  const filled = vs.filter((v): v is CardView => !!v);
  const rating = teamRating(r.xv ? vs : filled, []);
  const chem = r.xv ? chemistry(vs).total : 0;
  const lines: SbcCheck['lines'] = [];
  lines.push({ text: `Players: ${filled.length} / ${r.count}`, ok: filled.length === r.count });
  if (r.minRating) lines.push({ text: `Team rating: min ${r.minRating} (now ${filled.length ? rating : 0})`, ok: filled.length > 0 && rating >= r.minRating });
  if (r.minChem) lines.push({ text: `Chemistry: min ${r.minChem} (now ${chem})`, ok: chem >= r.minChem });
  if (r.minEach) lines.push({ text: `Every player ${r.minEach}+`, ok: filled.length > 0 && filled.every((v) => v.ovr >= r.minEach!) });
  if (r.onlyFrom) {
    const bad = filled.filter((v) => !r.onlyFrom!.includes(v.nation)).length;
    lines.push({ text: `Players from ${r.onlyFrom.join(', ')} only${bad ? ` (${bad} not)` : ''}`, ok: bad === 0 && filled.length > 0 });
  }
  if (r.distinct) {
    const n = new Set(filled.map((v) => v.nation)).size;
    lines.push({ text: `At least ${r.distinct} different teams (now ${n})`, ok: n >= r.distinct });
  }
  if (r.league) {
    const n = filled.filter((v) => v.league === r.league!.id).length;
    lines.push({ text: `${r.league.min}+ ${r.league.id === 'PREM' ? 'Premiership' : r.league.id} players (now ${n})`, ok: n >= r.league.min });
  }
  if (r.rares) {
    const n = filled.filter((v) => v.rare).length;
    lines.push({ text: `${r.rares}+ Rare cards (now ${n})`, ok: n >= r.rares });
  }
  if (r.tier) {
    const bad = filled.filter((v) => v.tier !== r.tier).length;
    lines.push({ text: `${r.tier[0].toUpperCase() + r.tier.slice(1)} cards only${bad ? ` (${bad} not)` : ''}`, ok: bad === 0 && filled.length > 0 });
  }
  if (r.academy) {
    const n = filled.filter((v) => v.base.academy).length;
    lines.push({ text: `${r.academy} Academy prospects (now ${n})`, ok: n >= r.academy });
  }
  return { ok: lines.every((l) => l.ok), lines, rating, chem };
}

/** Cards that can go into an SBC: not in your XV or bench, cheapest first. */
export function sbcCandidates(s: UTState): OwnedCard[] {
  const inSquad = new Set([...s.xv, ...s.bench].filter(Boolean));
  return s.cards.filter((c) => !inSquad.has(c.uid)).sort((a, b) => view(a).ovr - view(b).ovr);
}

/** Fill an SBC with the cheapest cards that work (greedy). */
export function autoFillSbc(def: SbcDef, pool: OwnedCard[]): (OwnedCard | null)[] {
  const r = def.req;
  const ok = (v: CardView) => (!r.onlyFrom || r.onlyFrom.includes(v.nation)) && (!r.tier || v.tier === r.tier) && (!r.academy || v.base.academy) && (!r.minEach || v.ovr >= r.minEach);
  const cands = pool.map(view).filter(ok);
  if (r.xv) {
    const used = new Set<string>();
    const out: (OwnedCard | null)[] = [];
    for (let slot = 1; slot <= 15; slot++) {
      const inPos = cands.filter((v) => !used.has(v.card.uid) && v.pos === slot);
      const need = r.minRating ?? 0;
      const c = (inPos.filter((v) => v.ovr >= need).sort((a, b) => a.ovr - b.ovr)[0] ?? inPos.sort((a, b) => b.ovr - a.ovr)[0]) ?? cands.filter((v) => !used.has(v.card.uid)).sort((a, b) => b.ovr - a.ovr)[0];
      if (c) used.add(c.card.uid);
      out.push(c?.card ?? null);
    }
    return out;
  }
  const need = r.minRating ?? 0;
  const sorted = [...cands].sort((a, b) => a.ovr - b.ovr);
  // cheapest set that reaches the rating: take the lowest that clear the bar, then top up
  let pick = sorted.filter((v) => v.ovr >= need).slice(0, r.count);
  if (pick.length < r.count) pick = [...pick, ...sorted.filter((v) => !pick.includes(v)).reverse().slice(0, r.count - pick.length)];
  if (r.rares) {
    const rares = pick.filter((v) => v.rare).length;
    if (rares < r.rares) {
      const extra = sorted.filter((v) => v.rare && !pick.includes(v)).slice(0, r.rares - rares);
      pick = [...extra, ...pick.filter((v) => !v.rare)].slice(0, r.count);
    }
  }
  return Array.from({ length: r.count }, (_, i) => pick[i]?.card ?? null);
}

// ------------------------------------------------------------------ evolutions
export interface EvoTask {
  event: UTEvent;
  target: number;
  /** must be done by the evolving card itself */
  mine?: boolean;
  label: string;
}
export interface EvoDef {
  id: string;
  name: string;
  desc: string;
  eligible: (v: CardView) => boolean;
  rule: string;
  levels: { tasks: EvoTask[]; boost: Partial<Ratings>; ovr: number }[];
}
const backs = (v: CardView) => v.pos >= 9;
const fwds = (v: CardView) => v.pos <= 8;
export const EVOS: EvoDef[] = [
  {
    id: 'speed', name: 'Speed Merchant', desc: 'Turn a back into a flyer', rule: 'Backs, OVR 82 or less, PAC 88 or less',
    eligible: (v) => backs(v) && v.ovr <= 82 && v.face.PAC <= 88 && !v.special,
    levels: [
      { tasks: [{ event: 'match', target: 2, mine: true, label: 'Play 2 matches with him in your XV' }], boost: { pace: 3 }, ovr: 1 },
      { tasks: [{ event: 'try', target: 1, mine: true, label: 'Score a try with him' }], boost: { pace: 3, handling: 2 }, ovr: 1 },
      { tasks: [{ event: 'win', target: 2, mine: true, label: 'Win 2 matches with him in your XV' }], boost: { pace: 2, handling: 2 }, ovr: 2 },
    ],
  },
  {
    id: 'enforcer', name: 'The Enforcer', desc: 'A forward who hits like a truck', rule: 'Forwards, OVR 80 or less',
    eligible: (v) => fwds(v) && v.ovr <= 80 && !v.special,
    levels: [
      { tasks: [{ event: 'match', target: 2, mine: true, label: 'Play 2 matches with him in your XV' }], boost: { strength: 3, tackling: 2 }, ovr: 1 },
      { tasks: [{ event: 'tackle', target: 20, label: 'Make 20 tackles as a team' }], boost: { tackling: 3 }, ovr: 1 },
      { tasks: [{ event: 'win', target: 2, mine: true, label: 'Win 2 matches with him in your XV' }], boost: { strength: 3, tackling: 2 }, ovr: 2 },
    ],
  },
  {
    id: 'boot', name: 'Golden Boot', desc: 'A kicker to win you tight games', rule: 'Fly-halves and full-backs, OVR 84 or less',
    eligible: (v) => (v.pos === 10 || v.pos === 15) && v.ovr <= 84 && !v.special,
    levels: [
      { tasks: [{ event: 'conversion', target: 3, label: 'Kick 3 conversions' }], boost: { kicking: 4 }, ovr: 1 },
      { tasks: [{ event: 'match', target: 3, mine: true, label: 'Play 3 matches with him in your XV' }], boost: { kicking: 3, passing: 2 }, ovr: 1 },
      { tasks: [{ event: 'win', target: 2, mine: true, label: 'Win 2 matches with him in your XV' }], boost: { kicking: 2, passing: 2 }, ovr: 2 },
    ],
  },
  {
    id: 'academy', name: 'Academy Breakthrough', desc: 'Fast-track a youngster to the first team', rule: 'Academy prospects',
    eligible: (v) => !!v.base.academy && !v.special,
    levels: [
      { tasks: [{ event: 'match', target: 1, mine: true, label: 'Play a match with him in your XV' }], boost: { pace: 3, strength: 3, passing: 3, kicking: 3, tackling: 3, handling: 3 }, ovr: 2 },
      { tasks: [{ event: 'win', target: 1, mine: true, label: 'Win a match with him in your XV' }], boost: { pace: 3, strength: 3, passing: 3, kicking: 3, tackling: 3, handling: 3 }, ovr: 2 },
      { tasks: [{ event: 'try', target: 2, label: 'Score 2 tries as a team' }], boost: { pace: 3, strength: 3, passing: 3, kicking: 3, tackling: 3, handling: 3 }, ovr: 3 },
    ],
  },
];

/** Is the active evolution's current level done? */
export function evoReady(s: UTState, e: UTState['evo'][number]): boolean {
  const def = EVOS.find((x) => x.id === e.id);
  const c = s.cards.find((x) => x.uid === e.cardUid);
  if (!def || !c) return false;
  const step = def.levels[c.evo?.level ?? 0];
  return !!step && step.tasks.every((t) => (e.progress[t.event] ?? 0) >= t.target);
}
