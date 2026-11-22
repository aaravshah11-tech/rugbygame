import { CLUB_NATION, nationById } from '../data/nations';
import { nationSquad, playerOvr, posInfo, type Player, type Ratings } from '../data/players';
import type { Kit } from '../data/nations';
import type { MatchConfig, TeamSetup, Drill } from '../game/types';
import type { Profile } from './types';
import { STAFF } from './store';

export function nationTeam(id: string): TeamSetup {
  const n = nationById(id);
  return { id, name: n.name, short: n.short, kit: n.kit, players: nationSquad(id).starters, bench: nationSquad(id).bench };
}

// Formation links used for chemistry (shirt numbers that sit next to each other).
export const LINKS: [number, number][] = [
  [1, 2], [2, 3], [1, 4], [3, 5], [4, 5], [4, 6], [5, 7], [6, 8], [7, 8], [8, 9], [9, 10],
  [10, 12], [12, 13], [11, 12], [13, 14], [11, 15], [14, 15], [10, 15],
];

export function clubPlayers(p: Profile): (Player | null)[] {
  const byId = new Map(p.club.cards.map((c) => [c.id, c]));
  return p.club.starting.map((id) => (id ? byId.get(id) ?? null : null));
}

export function staffBoost(p: Profile): Partial<Ratings> {
  const out: Partial<Ratings> = {};
  for (const id of p.club.staff) {
    const s = STAFF.find((x) => x.id === id);
    if (!s) continue;
    for (const [k, v] of Object.entries(s.boost)) out[k as keyof Ratings] = (out[k as keyof Ratings] ?? 0) + (v ?? 0);
  }
  return out;
}

/** 0..100: natural positions and same-nation links between neighbours. */
export function chemistry(players: (Player | null)[]): number {
  let total = 0;
  players.forEach((pl, i) => {
    if (!pl) return;
    const slot = i + 1;
    let c = pl.position === slot ? 4 : posInfo(pl.position).group === posInfo(slot).group ? 2 : 0;
    let links = 0;
    for (const [a, b] of LINKS) {
      if (a !== slot && b !== slot) continue;
      const o = players[(a === slot ? b : a) - 1];
      if (o && o.nation === pl.nation) links++;
    }
    c += Math.min(6, links * 2);
    total += c;
  });
  return Math.round((total / 150) * 100);
}

export function clubOvr(p: Profile): number {
  const ps = clubPlayers(p);
  const boost = staffBoost(p);
  const filled = ps.map((pl, i) => (pl ? playerOvr(pl, i + 1, boost) : 0));
  return Math.round(filled.reduce((a, b) => a + b, 0) / 15);
}

export function clubTeam(p: Profile): TeamSetup | null {
  const ps = clubPlayers(p);
  if (ps.some((x) => !x)) return null;
  const chem = chemistry(ps);
  const boost = { ...staffBoost(p) };
  const chemBonus = Math.floor(chem / 25);
  for (const k of ['pace', 'strength', 'passing', 'kicking', 'tackling', 'handling'] as const) boost[k] = (boost[k] ?? 0) + chemBonus;
  // Shift each player's natural position to the slot so in-match roles line up.
  const byId = new Map(p.club.cards.map((c) => [c.id, c]));
  const bench = p.club.bench.map((id) => (id ? byId.get(id) : undefined)).filter((x): x is Player => !!x);
  return { id: CLUB_NATION.id, name: CLUB_NATION.name, short: CLUB_NATION.short, kit: CLUB_NATION.kit, players: ps as Player[], bench, boost };
}

function hexDist(a: string, b: string) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const d = (s: number) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [r1, g1, b1] = d(pa);
  const [r2, g2, b2] = d(pb);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** If the kits clash, the away side wears its change strip (colours inverted). */
function changeKit(k: Kit): Kit {
  return { ...k, primary: k.secondary, secondary: k.primary, shorts: k.primary, socks: k.secondary };
}

export function buildMatch(user: TeamSetup, cpu: TeamSetup, userIsHome: boolean, p: Profile, drill?: Drill): MatchConfig {
  let u = user;
  let c = cpu;
  if (hexDist(u.kit.primary, c.kit.primary) < 110) {
    if (userIsHome) c = { ...c, kit: changeKit(c.kit) };
    else u = { ...u, kit: changeKit(u.kit) };
    if (hexDist(u.kit.primary, c.kit.primary) < 110) c = { ...c, kit: { ...c.kit, primary: '#1d1f27', secondary: c.kit.primary } };
  }
  return {
    user: u,
    cpu: c,
    userIsHome,
    halfMinutes: p.settings.halfLength,
    difficulty: p.settings.difficulty,
    camera: p.settings.camera,
    quality: p.settings.graphics ?? 'auto',
    drill,
    weather: p.settings.weather ?? 'dry',
    tactics: p.settings.tactics ?? { attack: 'balanced', defence: 'balanced', kicking: 'balanced' },
    rules: p.settings.rules ?? 'standard',
    autoSwitch: p.settings.autoSwitch ?? true,
  };
}
