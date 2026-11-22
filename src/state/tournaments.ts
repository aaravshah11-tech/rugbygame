import { rand, uid } from '../util/rng';
import { nationSquad, teamOvr } from '../data/players';
import { NATIONS, CHAMPIONSHIP_NATIONS } from '../data/nations';
import type { ChampionshipState, Fixture, SeasonState, WorldCupState } from './types';

export function nationOvr(id: string) {
  return teamOvr(nationSquad(id).starters);
}

/** Quick rating-based simulation for matches the user doesn't play. */
export function simulateScore(homeOvr: number, awayOvr: number, knockout = false) {
  const gen = (adv: number) => {
    const tries = Math.max(0, Math.round(rand.range(0.5, 4.5) + adv * 0.18));
    let pts = 0;
    for (let i = 0; i < tries; i++) pts += 5 + (rand.chance(0.72) ? 2 : 0);
    const pens = Math.max(0, Math.round(rand.range(0, 3.5) + adv * 0.05));
    return { pts: pts + pens * 3, tries };
  };
  const diff = homeOvr - awayOvr + 1.5;
  let h = gen(diff);
  let a = gen(-diff);
  if (knockout && h.pts === a.pts) {
    if (rand.chance(0.5 + diff * 0.03)) h = { ...h, pts: h.pts + 3 };
    else a = { ...a, pts: a.pts + 3 };
  }
  return { homeScore: h.pts, awayScore: a.pts, homeTries: h.tries, awayTries: a.tries };
}

export function simulateFixture(f: Fixture, knockout = false) {
  Object.assign(f, simulateScore(nationOvr(f.home), nationOvr(f.away), knockout), { played: true });
}

export interface TableRow {
  team: string;
  p: number; w: number; d: number; l: number; pf: number; pa: number; bp: number; pts: number;
}

/** Standard bonus points: 4 win, 2 draw, +1 for 4+ tries, +1 for losing by 7 or fewer. */
export function computeTable(teams: string[], fixtures: Fixture[]): TableRow[] {
  const rows = new Map<string, TableRow>(teams.map((t) => [t, { team: t, p: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, bp: 0, pts: 0 }]));
  for (const f of fixtures) {
    if (!f.played || f.homeScore === undefined || f.awayScore === undefined) continue;
    const h = rows.get(f.home);
    const a = rows.get(f.away);
    // Count each side that belongs to this table (cross-pool games count for the team in the pool).
    const sides: [TableRow | undefined, number, number, number][] = [
      [h, f.homeScore, f.awayScore, f.homeTries ?? 0],
      [a, f.awayScore, f.homeScore, f.awayTries ?? 0],
    ];
    for (const [r, for_, against, tries] of sides) {
      if (!r) continue;
      r.p++;
      r.pf += for_;
      r.pa += against;
      if (for_ > against) {
        r.w++;
        r.pts += 4;
      } else if (for_ === against) {
        r.d++;
        r.pts += 2;
      } else {
        r.l++;
        if (against - for_ <= 7) {
          r.bp++;
          r.pts++;
        }
      }
      if (tries >= 4) {
        r.bp++;
        r.pts++;
      }
    }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.pf - y.pa - (x.pf - x.pa) || y.pf - x.pf);
}

// ---------- Nations Championship: 6 team single round robin ----------
export function createChampionship(user: string): ChampionshipState {
  const teams = [...CHAMPIONSHIP_NATIONS];
  // Circle method round robin.
  const rot = [...teams];
  const fixtures: Fixture[] = [];
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < 3; i++) {
      const a = rot[i];
      const b = rot[5 - i];
      const homeFirst = (r + i) % 2 === 0;
      fixtures.push({ id: uid(), stage: `R${r + 1}`, home: homeFirst ? a : b, away: homeFirst ? b : a, played: false });
    }
    rot.splice(1, 0, rot.pop()!);
  }
  return { user, teams, fixtures, round: 1, finished: false };
}

export function championshipUserFixture(c: ChampionshipState): Fixture | undefined {
  return c.fixtures.find((f) => f.stage === `R${c.round}` && (f.home === c.user || f.away === c.user));
}

/** After the user's match, simulate the rest of the round and advance. */
export function advanceChampionship(c: ChampionshipState) {
  for (const f of c.fixtures) if (f.stage === `R${c.round}` && !f.played) simulateFixture(f);
  c.round++;
  if (c.round > 5) {
    c.finished = true;
    c.champion = computeTable(c.teams, c.fixtures)[0].team;
  }
}

// ---------- World Cup: 4 groups (4,4,3,3) then QF/SF/Final ----------
export function createWorldCup(user: string): WorldCupState {
  const seeded = [...NATIONS].sort((a, b) => b.strength - a.strength).map((n) => n.id);
  const groups = [
    { name: 'A', teams: [] as string[] },
    { name: 'B', teams: [] as string[] },
    { name: 'C', teams: [] as string[] },
    { name: 'D', teams: [] as string[] },
  ];
  // Snake draft through seeding pots so groups are balanced.
  seeded.forEach((t, i) => {
    const pot = Math.floor(i / 4);
    const idx = pot % 2 === 0 ? i % 4 : 3 - (i % 4);
    groups[idx].teams.push(t);
  });
  const fixtures: Fixture[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.teams.length; i++)
      for (let j = i + 1; j < g.teams.length; j++)
        fixtures.push({ id: uid(), stage: `Group ${g.name}`, home: g.teams[i], away: g.teams[j], played: false });
  }
  return { user, groups, fixtures, stage: 'group', eliminated: false };
}

export function worldCupUserFixture(w: WorldCupState): Fixture | undefined {
  if (w.stage === 'done' || w.eliminated) return undefined;
  const stage = w.stage === 'group' ? undefined : w.stage;
  return w.fixtures.find(
    (f) => !f.played && (f.home === w.user || f.away === w.user) && (stage ? f.stage === stage : f.stage.startsWith('Group')),
  );
}

const winner = (f: Fixture) => ((f.homeScore ?? 0) >= (f.awayScore ?? 0) ? f.home : f.away);

/** Called after each user match (or to auto-sim when eliminated). Progresses stages as they complete. */
export function advanceWorldCup(w: WorldCupState) {
  if (w.stage === 'group') {
    // Simulate one "matchday" worth of other group games each time the user plays.
    const pending = w.fixtures.filter((f) => f.stage.startsWith('Group') && !f.played && f.home !== w.user && f.away !== w.user);
    const userLeft = w.fixtures.filter((f) => f.stage.startsWith('Group') && !f.played && (f.home === w.user || f.away === w.user)).length;
    const toSim = userLeft === 0 ? pending : pending.slice(0, Math.ceil(pending.length / (userLeft + 1)));
    toSim.forEach((f) => simulateFixture(f));
    if (w.fixtures.every((f) => !f.stage.startsWith('Group') || f.played)) {
      const st = w.groups.map((g) => computeTable(g.teams, w.fixtures.filter((f) => f.stage === `Group ${g.name}`)));
      const [A, B, C, D] = st;
      const qf: [string, string][] = [
        [A[0].team, B[1].team],
        [C[0].team, D[1].team],
        [B[0].team, A[1].team],
        [D[0].team, C[1].team],
      ];
      qf.forEach(([h, a]) => w.fixtures.push({ id: uid(), stage: 'QF', home: h, away: a, played: false }));
      w.stage = 'QF';
      if (!qf.flat().includes(w.user)) w.eliminated = true;
    }
    return;
  }
  const stage = w.stage;
  if (stage === 'done') return;
  const current = w.fixtures.filter((f) => f.stage === stage);
  current.filter((f) => !f.played).forEach((f) => {
    if (f.home !== w.user && f.away !== w.user) simulateFixture(f, true);
  });
  if (current.some((f) => !f.played)) return;
  const winners = current.map(winner);
  if (!winners.includes(w.user)) w.eliminated = true;
  if (stage === 'Final') {
    w.stage = 'done';
    w.champion = winners[0];
    return;
  }
  const next = stage === 'QF' ? 'SF' : 'Final';
  for (let i = 0; i < winners.length; i += 2)
    w.fixtures.push({ id: uid(), stage: next, home: winners[i], away: winners[i + 1], played: false });
  w.stage = next;
}

/** When eliminated, play out the rest of the tournament instantly. */
export function finishWorldCup(w: WorldCupState) {
  let guard = 0;
  while (w.stage !== 'done' && guard++ < 20) {
    w.fixtures.filter((f) => !f.played && (f.stage === w.stage || (w.stage === 'group' && f.stage.startsWith('Group')))).forEach((f) => simulateFixture(f, w.stage !== 'group'));
    advanceWorldCup(w);
  }
}

// ---------- Squad Builder season: 8 matches of rising difficulty ----------
export function createSeason(): SeasonState {
  const order = [...NATIONS].sort((a, b) => a.strength - b.strength);
  const picks = [order[0], order[1], order[3], order[5], order[7], order[9], order[11], order[13]];
  return {
    fixtures: picks.map((n, i) => ({ id: uid(), stage: `M${i + 1}`, home: 'CLB', away: n.id, played: false })),
    index: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    finished: false,
  };
}
