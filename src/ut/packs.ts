/**
 * Pack opening: rolls the best card first (so the configured odds are exact), fills the rest,
 * adds the 5% walkout, and works out duplicates.
 */
import { makeRng, hashString, type Rng } from '../util/rng';
import { BGS_PULL, PACKS, QUICK_SELL, WALKOUT, type PackDef, type SpecialType } from './config';
import { cardPool, view, type BaseCard, type OwnedCard } from './pool';
import { newCard, weekKey, type UTState } from './store';
import { marketPrice } from './market';

export const packDef = (id: string) => PACKS.find((p) => p.id === id) ?? PACKS[2];

// ------------------------------------------------------------------ promos
export interface Promo {
  id: SpecialType;
  name: string;
  blurb: string;
  colors: [string, string];
}
const PROMO_ROTATION: Promo[] = [
  { id: 'showdown', name: 'Nations Showdown', blurb: 'Boosted stars from the big rivalries', colors: ['#b3122e', '#0b4ea2'] },
  { id: 'fs', name: 'Future Stars', blurb: 'Tomorrow’s superstars, boosted today', colors: ['#00c2d8', '#0b2240'] },
  { id: 'hero', name: 'Heroes', blurb: 'Cult heroes with huge boosts', colors: ['#6a2bd1', '#1b0b3a'] },
  { id: 'tots', name: 'Team of the Season', blurb: 'The best of the season, massively boosted', colors: ['#1b6fe0', '#ffd23a'] },
];
/** The promo running this week (rotates weekly). */
export function currentPromo(d = new Date()): Promo {
  const w = Math.floor(new Date(weekKey(d)).getTime() / (7 * 86400000));
  return PROMO_ROTATION[w % PROMO_ROTATION.length];
}

/** Players in the current promo (seeded by week: the same all week). */
export function promoPlayers(d = new Date()): BaseCard[] {
  const p = currentPromo(d);
  const rng = makeRng(hashString('promo-' + weekKey(d) + p.id));
  const pool = cardPool().filter((c) => c.league !== 'ICON' && !c.academy);
  const band = p.id === 'fs' ? pool.filter((c) => c.ovr >= 74 && c.ovr <= 84) : pool.filter((c) => c.ovr >= 80);
  const out: BaseCard[] = [];
  while (out.length < 15 && band.length) out.push(band.splice(rng.int(0, band.length - 1), 1)[0]);
  return out;
}

/**
 * Team of the Week: your own top performers this week (tries, POTM) first, topped up with in-form
 * stars so there's always a full XV.
 */
export function totwPlayers(s: UTState, d = new Date()): BaseCard[] {
  const pool = cardPool();
  const mine = s.performers.week === weekKey(d)
    ? Object.entries(s.performers.scores).sort((a, b) => b[1] - a[1]).map(([id]) => pool.find((c) => c.id === id)).filter((c): c is BaseCard => !!c && c.league !== 'ICON')
    : [];
  const rng = makeRng(hashString('totw-' + weekKey(d)));
  const stars = pool.filter((c) => c.ovr >= 82 && c.league !== 'ICON');
  const out = mine.slice(0, 8);
  while (out.length < 15 && stars.length) {
    const c = stars.splice(rng.int(0, stars.length - 1), 1)[0];
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

// ------------------------------------------------------------------ opening
export interface PackResult {
  cards: OwnedCard[];
  /** the best card (for the reveal) */
  best: OwnedCard;
  walkout: boolean;
  items: number;
}

const roll = (rng: Rng, bands: [number, number, number][]) => {
  for (const b of bands) if (rng.chance(b[2])) return b;
  return bands[bands.length - 1];
};

function pickBand(rng: Rng, lo: number, hi: number, used: Set<string>, opts: { rare?: boolean; icons?: boolean } = {}): BaseCard | null {
  let cands = cardPool().filter((c) => c.ovr >= lo && c.ovr <= hi && !used.has(c.id) && (opts.icons ? c.league === 'ICON' : c.league !== 'ICON') && (!opts.rare || c.rare));
  // nothing in band (e.g. very high OVRs): nearest cards below
  if (!cands.length) cands = cardPool().filter((c) => !used.has(c.id) && c.league !== 'ICON' && c.ovr <= hi).sort((a, b) => b.ovr - a.ovr).slice(0, 6);
  if (!cands.length) return null;
  const c = rng.pick(cands);
  used.add(c.id);
  return c;
}

/** A special version of a player whose boosted OVR lands in [lo, hi]. */
function pickSpecial(rng: Rng, lo: number, hi: number, used: Set<string>, type?: SpecialType): OwnedCard | null {
  const promo = currentPromo();
  const types: SpecialType[] = type ? [type] : ['totw', 'fs', 'hero', 'tots', promo.id];
  for (let tries = 0; tries < 8; tries++) {
    const t = rng.pick(types);
    const src = t === promo.id ? promoPlayers() : t === 'totw' ? cardPool().filter((c) => c.ovr >= 80) : cardPool();
    const cands = src.filter((c) => c.league !== 'ICON' && !used.has(c.id) && view(newCard(c.id, { special: t })).ovr >= lo && view(newCard(c.id, { special: t })).ovr <= hi);
    if (cands.length) {
      const c = rng.pick(cands);
      used.add(c.id);
      return newCard(c.id, { special: t });
    }
  }
  return null;
}

export function openPack(def: PackDef, seed = Date.now() ^ Math.floor(Math.random() * 1e9)): PackResult {
  const rng = makeRng(seed >>> 0);
  const used = new Set<string>();
  const cards: OwnedCard[] = [];
  // 1. the best card
  const [lo, hi] = roll(rng, def.best);
  let best: OwnedCard | null = null;
  if (def.guarantee === 'icon') {
    const ic = pickBand(rng, lo, hi, used, { icons: true }) ?? pickBand(rng, 0, 99, used, { icons: true });
    if (ic) best = newCard(ic.id);
  } else if (def.guarantee === 'promo') {
    best = pickSpecial(rng, lo - 4, hi + 4, used, currentPromo().id);
  } else if (def.special && rng.chance(def.special)) {
    best = pickSpecial(rng, lo, hi, used);
  }
  if (!best) {
    const b = pickBand(rng, lo, hi, used, { rare: def.rares > 0 });
    if (b) best = newCard(b.id);
  }
  if (best) cards.push(best);
  // 2. walkout: any pack can drop an 88+
  const walkoutRoll = rng.chance(WALKOUT.chance);
  if (walkoutRoll && def.count > 1) {
    const w = pickBand(rng, WALKOUT.minOvr, 99, used, { rare: true });
    if (w) cards.push(newCard(w.id));
  }
  // 3. the rest: never better than the best roll, Rares first
  const cap = best ? view(best).ovr : def.fill[1];
  while (cards.length < def.count) {
    const needRare = cards.filter((c) => view(c).rare).length < def.rares;
    const b = pickBand(rng, def.fill[0], Math.min(def.fill[1], cap), used, { rare: needRare });
    if (!b) break;
    cards.push(newCard(b.id));
  }
  // BGS U16 boost: a school player in place of the weakest card
  if (def.guarantee !== 'icon' && def.count > 1 && rng.chance(BGS_PULL.chance)) {
    const bgs = cardPool().filter((c) => c.team === BGS_PULL.team && !used.has(c.id));
    const shah = bgs.find((c) => c.id === BGS_PULL.shahId);
    const others = bgs.filter((c) => c.id !== BGS_PULL.shahId);
    const pickB = shah && (rng.chance(BGS_PULL.shahShare) || !others.length) ? shah : others.length ? rng.pick(others) : null;
    if (pickB) {
      used.add(pickB.id);
      cards.sort((a, b) => view(b).ovr - view(a).ovr);
      if (cards.length >= def.count) cards[cards.length - 1] = newCard(pickB.id);
      else cards.push(newCard(pickB.id));
    }
  }
  const sorted = cards.sort((a, b) => view(b).ovr - view(a).ovr);
  const top = sorted[0];
  const tv = view(top);
  return { cards: sorted, best: top, walkout: tv.ovr >= WALKOUT.minOvr || !!tv.special, items: def.items ?? 0 };
}

/** Coins for quick-selling a card (a small share of its market value). */
export const quickSellValue = (c: OwnedCard) => (c.untradeable ? QUICK_SELL.min : Math.max(QUICK_SELL.min, Math.round(marketPrice(c) * QUICK_SELL.share)));
