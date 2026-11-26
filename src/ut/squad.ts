/**
 * Squad maths: chemistry (FC style, 0-3 per player, 45 max), team rating, auto-build, and turning
 * a squad of cards into a team the match engine can play.
 */
import { posInfo, type Player } from '../data/players';
import { registerTeam, type Kit, type Nation } from '../data/nations';
import type { TeamSetup } from '../game/types';
import { clamp, hashString, makeRng, type Rng } from '../util/rng';
import { CHEM, TEAM_RATING } from './config';
import { cardPool, matchPlayer, view, type BaseCard, type CardView, type OwnedCard } from './pool';
import { cardByUid, type ClubLook, type UTState } from './store';

/** Is the card in its (natural or changed) position for this shirt? */
export const inPosition = (v: CardView, slot: number) => v.pos === slot;

/** Effective OVR in a slot: out-of-position penalty like the match engine. */
export function slotOvr(v: CardView, slot: number) {
  if (v.pos === slot) return v.ovr;
  const same = posInfo(v.pos).group === posInfo(slot).group;
  return Math.max(1, v.ovr - (same ? CHEM.outOfPosition.group : CHEM.outOfPosition.other));
}

const step = (n: number, t: number[]) => t.filter((x) => n >= x).length;

/** Chemistry of each XV slot (0-3) and the team total (max 45). */
export function chemistry(xv: (CardView | null)[]): { each: number[]; total: number } {
  const team = new Map<string, number>();
  const league = new Map<string, number>();
  xv.forEach((v, i) => {
    if (!v || !inPosition(v, i + 1)) return;
    const icon = v.league === 'ICON';
    team.set(v.nation, (team.get(v.nation) ?? 0) + (icon ? 2 : 1));
    if (!icon) league.set(v.league, (league.get(v.league) ?? 0) + 1);
  });
  const each = xv.map((v, i) => {
    if (!v || !inPosition(v, i + 1)) return 0;
    if (v.league === 'ICON') return 3;
    return Math.min(3, step(team.get(v.nation) ?? 0, CHEM.team) + step(league.get(v.league) ?? 0, CHEM.league));
  });
  return { each, total: each.reduce((a, b) => a + b, 0) };
}

/** Team rating from the XV (slot OVRs) and the bench (a quarter weight). */
export function teamRating(xv: (CardView | null)[], bench: (CardView | null)[]) {
  const x = xv.map((v, i) => (v ? slotOvr(v, i + 1) : 0));
  const b = bench.filter((v): v is CardView => !!v).map((v) => v.ovr);
  const w = TEAM_RATING.benchWeight;
  return Math.round((x.reduce((a, c) => a + c, 0) + b.reduce((a, c) => a + c, 0) * w) / (15 + b.length * w));
}

export function squadViews(s: UTState) {
  const xv = s.xv.map((u) => {
    const c = cardByUid(s, u);
    return c ? view(c) : null;
  });
  const bench = s.bench.map((u) => {
    const c = cardByUid(s, u);
    return c ? view(c) : null;
  });
  return { xv, bench };
}

/**
 * Best squad from your club: for each shirt, the best in-position card, then fills gaps out of
 * position; tries swapping in a team-mate group if it raises chemistry. Bench: best of the rest.
 */
export function autoBuild(cards: OwnedCard[]): { xv: (string | null)[]; bench: (string | null)[] } {
  const views = cards.map(view);
  const pick = (pool: CardView[]) => {
    const used = new Set<string>();
    const xv: (CardView | null)[] = Array(15).fill(null);
    // in-position first, strongest positions first so stars aren't wasted
    const slots = Array.from({ length: 15 }, (_, i) => i + 1);
    for (const slot of slots) {
      const best = pool.filter((v) => !used.has(v.base.id) && v.pos === slot).sort((a, b) => b.ovr - a.ovr)[0];
      if (best) {
        xv[slot - 1] = best;
        used.add(best.base.id);
      }
    }
    for (const slot of slots) {
      if (xv[slot - 1]) continue;
      const best = pool.filter((v) => !used.has(v.base.id)).sort((a, b) => slotOvr(b, slot) - slotOvr(a, slot))[0];
      if (best) {
        xv[slot - 1] = best;
        used.add(best.base.id);
      }
    }
    return { xv, used };
  };
  // try the plain best XV and a few "one team" XVs; keep the highest rating + chem score
  let bestPick = pick(views);
  const score = (xv: (CardView | null)[]) => teamRating(xv, []) * 2 + chemistry(xv).total * 0.6;
  let bestScore = score(bestPick.xv);
  const teams = [...new Set(views.map((v) => v.nation))];
  for (const t of teams) {
    const same = views.filter((v) => v.nation === t);
    if (same.length < 5) continue;
    // favour this team: its cards first, everyone else after
    const ordered = [...same, ...views.filter((v) => v.nation !== t).map((v) => ({ ...v, ovr: v.ovr - 3 }) as CardView)];
    const p = pick(ordered);
    const real = p.xv.map((v) => (v ? views.find((x) => x.card.uid === v.card.uid)! : null));
    const sc = score(real);
    if (sc > bestScore) {
      bestScore = sc;
      bestPick = { xv: real, used: p.used };
    }
  }
  const benchPos = [2, 1, 3, 4, 7, 9, 10, 13];
  const bench: (string | null)[] = benchPos.map(() => null);
  const used = new Set(bestPick.xv.filter(Boolean).map((v) => v!.base.id));
  benchPos.forEach((pos, i) => {
    const b = views.filter((v) => !used.has(v.base.id)).sort((a, c) => slotOvr(c, pos) - slotOvr(a, pos))[0];
    if (b) {
      bench[i] = b.card.uid;
      used.add(b.base.id);
    }
  });
  return { xv: bestPick.xv.map((v) => v?.card.uid ?? null), bench };
}

// ------------------------------------------------------------------ teams for the engine
export const UT_CLUB_ID = 'UTC';

export function clubKit(c: ClubLook): Kit {
  return { primary: c.kit.primary, secondary: c.kit.secondary, accent: c.badge.c2, pattern: c.kit.pattern, shorts: c.kit.secondary === '#ffffff' ? c.kit.primary : c.kit.secondary, socks: c.kit.primary, collar: c.kit.secondary };
}

/** Your club as a match team: card ratings + chemistry boosts, the club kit and name. */
export function utTeam(s: UTState): TeamSetup | null {
  const { xv, bench } = squadViews(s);
  if (xv.some((v) => !v)) return null;
  const chem = chemistry(xv);
  const players = xv.map((v, i) => ({ ...matchPlayer(v!, chem.each[i], CHEM.statPerPoint), position: i + 1 === v!.pos ? v!.pos : v!.pos }));
  const benchP = bench.filter((v): v is CardView => !!v).map((v) => matchPlayer(v, 0, CHEM.statPerPoint));
  const n: Nation = { id: UT_CLUB_ID, name: s.club.name, short: s.club.short, strength: teamRating(xv, bench), region: 'anglo', kit: clubKit(s.club) };
  registerTeam(n);
  return { id: n.id, name: n.name, short: n.short, kit: n.kit, players: players as Player[], bench: benchP };
}

// ------------------------------------------------------------------ AI squads
const AI_NAMES = [
  'Harbour Hawks', 'Ironvale RFC', 'Northgate Rovers', 'Copperfield', 'Blackwater Pirates', 'Ashby Wolves', 'Kingsford Knights',
  'Redcliffe Raiders', 'Stormhaven', 'Westbrook Warriors', 'Granite Bay', 'Thornbury Titans', 'Silverdale', 'Fenwick Foxes',
  'Highmoor Hurricanes', 'Oakridge Rams', 'Saltmarsh Sharks', 'Elmstead Eagles', 'Duncliffe Dragons', 'Marlow Mavericks',
];
const PATTERNS: Kit['pattern'][] = ['plain', 'hoops', 'stripes', 'sash', 'chevron', 'halves'];
const COLORS = ['#b3122e', '#0b4ea2', '#0f7a3c', '#111111', '#f2c230', '#5b2a86', '#e2621b', '#0e1b45', '#7a0f20', '#ffffff', '#1e8bc3', '#2f2f2f'];

export interface AiSquad {
  id: string;
  name: string;
  short: string;
  kit: Kit;
  cards: BaseCard[];
  ovr: number;
}

/** A random squad of cards around a target OVR (seeded, so the same opponent stays the same). */
export function aiSquad(seed: string, target: number, rngIn?: Rng): AiSquad {
  const rng = rngIn ?? makeRng(hashString(seed));
  const pool = cardPool().filter((c) => c.league !== 'ICON');
  const cards: BaseCard[] = [];
  const used = new Set<string>();
  for (let pos = 1; pos <= 23; pos++) {
    const slot = pos <= 15 ? pos : [2, 1, 3, 4, 7, 9, 10, 13][pos - 16];
    const want = target + rng.int(-4, 4) - (pos > 15 ? 3 : 0);
    let cands = pool.filter((c) => c.player.position === slot && !used.has(c.id) && Math.abs(c.ovr - want) <= 3);
    if (!cands.length) cands = pool.filter((c) => c.player.position === slot && !used.has(c.id)).sort((a, b) => Math.abs(a.ovr - want) - Math.abs(b.ovr - want)).slice(0, 4);
    const c = rng.pick(cands);
    used.add(c.id);
    cards.push(c);
  }
  const name = rng.pick(AI_NAMES);
  const c1 = rng.pick(COLORS);
  let c2 = rng.pick(COLORS);
  if (c2 === c1) c2 = c1 === '#ffffff' ? '#111111' : '#ffffff';
  const kit: Kit = { primary: c1, secondary: c2, accent: c2, pattern: rng.pick(PATTERNS), shorts: c2 === '#ffffff' ? '#111111' : c2, socks: c1 };
  const id = 'AI' + (hashString(seed) % 100000);
  const short = name.split(' ')[0].slice(0, 3).toUpperCase();
  const ovr = Math.round(cards.slice(0, 15).reduce((a, c) => a + c.ovr, 0) / 15);
  // registered now so their badge and kit show in lists before the match
  registerTeam({ id, name, short, strength: ovr, region: 'anglo', kit });
  return { id, name, short, kit, cards, ovr };
}

export function aiTeam(a: AiSquad): TeamSetup {
  const n: Nation = { id: a.id, name: a.name, short: a.short, strength: a.ovr, region: 'anglo', kit: a.kit };
  registerTeam(n);
  const players = a.cards.slice(0, 15).map((c, i) => ({ ...c.player, id: `${a.id}-${i}`, position: i + 1 }));
  const bench = a.cards.slice(15).map((c, i) => ({ ...c.player, id: `${a.id}-b${i}` }));
  return { id: a.id, name: a.name, short: a.short, kit: a.kit, players, bench };
}

/** Squad of the given cards as a team (draft, SBC previews). */
export function cardsTeam(id: string, name: string, kit: Kit, cards: CardView[]): TeamSetup {
  const xv = cards.slice(0, 15);
  const chem = chemistry(xv);
  const players = xv.map((v, i) => matchPlayer(v, chem.each[i], CHEM.statPerPoint));
  const bench = cards.slice(15).map((v) => matchPlayer(v, 0, CHEM.statPerPoint));
  registerTeam({ id, name, short: name.slice(0, 3).toUpperCase(), strength: teamRating(xv, []), region: 'anglo', kit });
  return { id, name, short: name.slice(0, 3).toUpperCase(), kit, players, bench };
}

export const clampOvr = (n: number) => clamp(Math.round(n), 40, 99);
