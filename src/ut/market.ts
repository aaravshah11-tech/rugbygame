/**
 * The transfer market, simulated offline: prices come from OVR, card type and demand (positions
 * in short supply cost more), drift a little over time, and AI buyers pick up your listings.
 */
import { hashString, makeRng, uid } from '../util/rng';
import { MARKET } from './config';
import { cardPool, view, type OwnedCard } from './pool';
import { newCard, type Listing, type UTState } from './store';

/** Positions that are scarce on the market (props, hookers, fly-halves) cost a bit more. */
const POS_DEMAND: Record<number, number> = { 1: 1.15, 2: 1.12, 3: 1.15, 4: 1, 5: 1, 6: 0.95, 7: 1.05, 8: 1.05, 9: 1.1, 10: 1.2, 11: 1, 12: 0.95, 13: 1, 14: 1, 15: 1.05 };

const roundPrice = (n: number) => {
  const step = n < 1_000 ? 50 : n < 10_000 ? 100 : n < 50_000 ? 250 : n < 100_000 ? 500 : 1_000;
  return Math.max(150, Math.round(n / step) * step);
};

/** Market value of a card right now. */
export function marketPrice(c: OwnedCard, now = Date.now()): number {
  const v = view(c);
  const type = v.special ?? v.tier;
  const drift = 1 + MARKET.drift * Math.sin(now / 3.6e6 / 3 + (hashString(c.base + (c.special ?? '')) % 628) / 100);
  const raw = MARKET.base(v.ovr) * (MARKET.typeMult[type] ?? 1) * (v.rare ? MARKET.rareMult : 1) * (POS_DEMAND[v.pos] ?? 1) * drift;
  return roundPrice(raw);
}

/** Refresh the AI listings every few minutes (seeded, so a refresh shows the same list). */
export function refreshMarket(s: UTState, now = Date.now()) {
  const bucket = Math.floor(now / (MARKET.refreshMin * 60000));
  if (s.market.seed === bucket && s.market.listings.length) return;
  const rng = makeRng(bucket * 7919);
  const pool = cardPool();
  const listings: Listing[] = [];
  for (let i = 0; i < MARKET.listings; i++) {
    // more ordinary cards than stars, a few specials
    const target = Math.min(97, Math.round(58 + Math.pow(rng.next(), 1.6) * 38));
    const cands = pool.filter((c) => Math.abs(c.ovr - target) <= 2 && (c.league !== 'ICON' || target >= 88));
    if (!cands.length) continue;
    const b = rng.pick(cands);
    const special = b.league !== 'ICON' && b.ovr >= 78 && rng.chance(0.12) ? rng.pick(['totw', 'fs', 'hero', 'showdown', 'tots'] as const) : undefined;
    const card = newCard(b.id, { special });
    const price = roundPrice(marketPrice(card, now) * (0.9 + rng.next() * 0.25));
    listings.push({ id: `L${bucket}-${i}`, card: { ...card, uid: `mk-${bucket}-${i}` }, price, at: now - rng.int(0, 50) * 60000 });
  }
  s.market.seed = bucket;
  s.market.listings = listings;
}

/** Your listings: AI buyers pick them up over time (cheaper than market value = faster). */
export function processSales(s: UTState, now = Date.now()): { sold: Listing[]; coins: number } {
  const sold: Listing[] = [];
  let coins = 0;
  for (const l of s.market.mine) {
    const mins = (now - l.at) / 60000;
    if (mins < 0.5) continue;
    const value = marketPrice(l.card, now);
    const ratio = l.price / value;
    const rate = MARKET.sellRatePerMin * Math.pow(Math.max(0.05, 1.6 - ratio), 3);
    const pSold = 1 - Math.pow(1 - Math.min(0.95, rate), mins);
    const rng = makeRng(hashString(l.id) ^ Math.floor(now / 60000));
    if (rng.chance(Math.min(0.995, pSold))) {
      sold.push(l);
      coins += Math.round(l.price * (1 - MARKET.tax));
    }
  }
  if (sold.length) s.market.mine = s.market.mine.filter((l) => !sold.includes(l));
  return { sold, coins };
}

export function listCard(s: UTState, c: OwnedCard, price: number) {
  s.market.mine.push({ id: 'my-' + uid(), card: c, price: roundPrice(price), at: Date.now(), mine: true });
}

export { roundPrice };
