import { COMP_TITLE, SPONSORS, SPONSOR_BY_ID, TEAM_DEALS, type Placement, type Sponsor } from '../data/sponsors';

export type Competition = 'quick' | 'six' | 'league' | 'prem' | 'wc' | 'club' | 'kick' | 'challenge' | 'training';

export interface KitDeal {
  kit?: Sponsor;
  shirt?: Sponsor;
  sleeve?: Sponsor;
  /** above the number on the back */
  back?: Sponsor;
}

/** Everything branded in one match. */
export interface MatchSponsors {
  title: Sponsor;
  /** LED board running order (title and the home side's partners appear most) */
  boards: Sponsor[];
  /** brands for full-width board takeovers and screen idents */
  featured: Sponsor[];
  pitch: [Sponsor, Sponsor];
  posts: Sponsor;
  flags: Sponsor;
  replay: Sponsor;
  potm: Sponsor;
  stats: Sponsor;
  broadcaster: Sponsor;
  home: KitDeal;
  away: KitDeal;
}

const pick = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)];
const can = (s: Sponsor, p: Placement) => s.where.includes(p);

function deal(teamId: string): KitDeal {
  const d = TEAM_DEALS[teamId];
  if (!d) return { kit: SPONSOR_BY_ID.canterbury };
  const back = d.partners.find((id) => id !== d.shirt && id !== d.kit && id !== d.sleeve);
  return { kit: SPONSOR_BY_ID[d.kit], shirt: d.shirt ? SPONSOR_BY_ID[d.shirt] : undefined, sleeve: d.sleeve ? SPONSOR_BY_ID[d.sleeve] : undefined, back: back ? SPONSOR_BY_ID[back] : undefined };
}

/**
 * Pick the brands for a match: the competition's title sponsor everywhere, the home side's
 * partners and local brands featured most, and a random rotation of the rest (rugby brands more
 * likely, "cool extras" sprinkled in) so no two matches look quite the same.
 */
export function pickMatchSponsors(comp: Competition, homeId: string, awayId: string, r: () => number = Math.random): MatchSponsors {
  const title = SPONSOR_BY_ID[COMP_TITLE[comp] ?? 'allianz'];
  const homeDeal = TEAM_DEALS[homeId];
  const partners = (homeDeal?.partners ?? []).map((id) => SPONSOR_BY_ID[id]).filter(Boolean);
  const local = SPONSORS.filter((s) => s.local?.includes(homeId) && !partners.includes(s));
  const used = new Set<string>([title.id, ...partners.map((p) => p.id), ...local.map((p) => p.id)]);
  // weighted rotation of everyone else who goes on boards
  const weight = (s: Sponsor) => (s.tier === 'title' ? 3 : s.tier === 'premium' ? 2 : 1) * (s.category === 'rugby' || s.category === 'drink' ? 1.5 : s.category === 'lifestyle' ? 0.7 : 1);
  const pool = SPONSORS.filter((s) => !used.has(s.id) && can(s, 'boards'));
  const rotation: Sponsor[] = [];
  const want = 10;
  while (rotation.length < want && pool.length) {
    const total = pool.reduce((a, s) => a + weight(s), 0);
    let x = r() * total;
    const i = pool.findIndex((s) => (x -= weight(s)) <= 0);
    rotation.push(pool.splice(Math.max(0, i), 1)[0]);
  }
  // running order: title every few panels, partners next, then locals and the rotation
  const featured = [title, ...partners, ...local, ...rotation.slice(0, 4)];
  const rest = [...partners, ...local, ...rotation];
  const boards: Sponsor[] = [];
  rest.forEach((s, i) => {
    if (i % 3 === 0) boards.push(title);
    boards.push(s);
  });
  if (boards.length < 8) boards.push(title, ...rotation.slice(0, 4));
  const pitchPool = [...partners, ...local, ...rotation].filter((s) => can(s, 'pitch'));
  const pitchB = pitchPool[0] ?? pick(SPONSORS.filter((s) => can(s, 'pitch') && s.id !== title.id), r);
  const broadcasters = SPONSORS.filter((s) => s.category === 'broadcast' && can(s, 'broadcast'));
  const watch = SPONSORS.filter((s) => s.category === 'lifestyle' && can(s, 'hud'));
  return {
    title,
    boards,
    featured,
    pitch: [title, pitchB],
    posts: title,
    flags: title,
    replay: pick([...watch, ...partners.filter((s) => can(s, 'screens'))], r) ?? title,
    potm: pick([title, ...partners].filter(Boolean), r),
    stats: pick(SPONSORS.filter((s) => s.category === 'tech' && s.tier !== 'standard').concat(SPONSOR_BY_ID.deloitte ?? []), r),
    broadcaster: pick(broadcasters, r),
    home: deal(homeId),
    away: deal(awayId),
  };
}
