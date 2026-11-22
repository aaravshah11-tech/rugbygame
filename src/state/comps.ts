import { uid } from '../util/rng';
import { CHAMPIONSHIP_NATIONS, LEAGUE_NORTH, LEAGUE_SOUTH, PREM_CLUBS } from '../data/nations';
import type { Fixture } from './types';
import { computeTable, simulateFixture } from './tournaments';

export type CompKind = 'six' | 'league' | 'prem';

export interface CompState {
  kind: CompKind;
  user: string;
  teams: string[];
  groups: { name: string; teams: string[] }[];
  fixtures: Fixture[];
  round: number; // 1-based league round
  rounds: number;
  stage: 'league' | 'semi' | 'final' | 'done';
  champion?: string;
  eliminated?: boolean;
}

export const COMP_INFO: Record<CompKind, { title: string; accent: string; blurb: string; teams: string[] }> = {
  six: { title: 'Nations', accent: 'Championship', blurb: 'Six nations, five rounds, one trophy.', teams: CHAMPIONSHIP_NATIONS },
  league: {
    title: 'Nations',
    accent: 'League',
    blurb: 'North v South: play all six nations from the other hemisphere, then the conference winners meet in the final.',
    teams: [...LEAGUE_NORTH, ...LEAGUE_SOUTH],
  },
  prem: { title: 'The', accent: 'Prem', blurb: 'Ten clubs, nine rounds, then semi-finals (1v4, 2v3) and the final.', teams: PREM_CLUBS },
};

/** Single round robin by the circle method; returns rounds of [home, away] pairs. */
function roundRobin(teams: string[]): [string, string][][] {
  const list = [...teams];
  if (list.length % 2) list.push('BYE');
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a === 'BYE' || b === 'BYE') continue;
      pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

const fx = (stage: string, home: string, away: string): Fixture => ({ id: uid(), stage, home, away, played: false });

export function createComp(kind: CompKind, user: string): CompState {
  if (kind === 'league') {
    // each northern nation plays each southern nation once (6 rounds), home/away alternating
    const fixtures: Fixture[] = [];
    for (let r = 0; r < 6; r++) {
      LEAGUE_NORTH.forEach((n, i) => {
        const s = LEAGUE_SOUTH[(i + r) % 6];
        fixtures.push((r + i) % 2 === 0 ? fx(`R${r + 1}`, n, s) : fx(`R${r + 1}`, s, n));
      });
    }
    return {
      kind, user, teams: [...LEAGUE_NORTH, ...LEAGUE_SOUTH],
      groups: [{ name: 'North', teams: LEAGUE_NORTH }, { name: 'South', teams: LEAGUE_SOUTH }],
      fixtures, round: 1, rounds: 6, stage: 'league',
    };
  }
  const teams = kind === 'six' ? CHAMPIONSHIP_NATIONS : PREM_CLUBS;
  const fixtures: Fixture[] = [];
  roundRobin(teams).forEach((pairs, r) => pairs.forEach(([h, a]) => fixtures.push(fx(`R${r + 1}`, h, a))));
  return { kind, user, teams: [...teams], groups: [{ name: kind === 'six' ? 'Table' : 'Table', teams: [...teams] }], fixtures, round: 1, rounds: teams.length - 1, stage: 'league' };
}

export function compUserFixture(c: CompState): Fixture | undefined {
  if (c.stage === 'done' || c.eliminated) return undefined;
  const stage = c.stage === 'league' ? `R${c.round}` : c.stage === 'semi' ? 'SF' : 'Final';
  return c.fixtures.find((f) => f.stage === stage && !f.played && (f.home === c.user || f.away === c.user));
}

const winner = (f: Fixture) => ((f.homeScore ?? 0) >= (f.awayScore ?? 0) ? f.home : f.away);

/** Call after the user's match has been recorded: plays out the rest of the round and moves on. */
export function advanceComp(c: CompState) {
  if (c.stage === 'league') {
    for (const f of c.fixtures) if (f.stage === `R${c.round}` && !f.played) simulateFixture(f);
    c.round++;
    if (c.round <= c.rounds) return;
    const league = c.fixtures.filter((f) => f.stage.startsWith('R'));
    if (c.kind === 'six') {
      c.stage = 'done';
      c.champion = computeTable(c.teams, league)[0].team;
      return;
    }
    if (c.kind === 'league') {
      const top = c.groups.map((g) => computeTable(g.teams, league)[0].team);
      c.fixtures.push(fx('Final', top[0], top[1]));
      c.stage = 'final';
      if (!top.includes(c.user)) c.eliminated = true;
      return;
    }
    const t = computeTable(c.teams, league).map((r) => r.team);
    c.fixtures.push(fx('SF', t[0], t[3]), fx('SF', t[1], t[2]));
    c.stage = 'semi';
    if (!t.slice(0, 4).includes(c.user)) c.eliminated = true;
    return;
  }
  const stage = c.stage === 'semi' ? 'SF' : 'Final';
  const games = c.fixtures.filter((f) => f.stage === stage);
  for (const f of games) if (!f.played) simulateFixture(f, true);
  const winners = games.map(winner);
  if (!winners.includes(c.user)) c.eliminated = true;
  if (stage === 'SF') {
    c.fixtures.push(fx('Final', winners[0], winners[1]));
    c.stage = 'final';
  } else {
    c.stage = 'done';
    c.champion = winners[0];
  }
}

/** When the user is out, play the remaining fixtures instantly. */
export function finishComp(c: CompState) {
  let guard = 0;
  while (c.stage !== 'done' && guard++ < 30) {
    const stage = c.stage === 'league' ? `R${c.round}` : c.stage === 'semi' ? 'SF' : 'Final';
    for (const f of c.fixtures) if (f.stage === stage && !f.played) simulateFixture(f, c.stage !== 'league');
    advanceComp(c);
  }
}
