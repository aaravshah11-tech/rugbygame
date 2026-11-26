import type { EngineResult, MatchConfig, Drill } from '../game/types';
import type { MatchOutcome } from '../screens/MatchScreen';
import { recordMatch, update, getProfile } from './store';
import type { MatchResult } from './types';
import { advanceChampionship, advanceWorldCup, computeTable } from './tournaments';
import { nationById } from '../data/nations';
import { advanceComp, COMP_INFO, type CompKind } from './comps';

function toResult(cfg: MatchConfig, r: EngineResult): MatchResult {
  const home = cfg.userIsHome;
  return {
    home: home ? cfg.user.id : cfg.cpu.id,
    away: home ? cfg.cpu.id : cfg.user.id,
    homeScore: home ? r.userScore : r.cpuScore,
    awayScore: home ? r.cpuScore : r.userScore,
    homeTries: home ? r.userTries : r.cpuTries,
    awayTries: home ? r.cpuTries : r.userTries,
    userSide: home ? 0 : 1,
    user: r.user,
    difficulty: cfg.difficulty,
  };
}

function verdict(r: EngineResult) {
  return r.userScore > r.cpuScore ? 'Victory!' : r.userScore === r.cpuScore ? 'Draw' : 'Defeat';
}

function statLine(r: EngineResult) {
  return `Tries ${r.user.tries} · Tackles ${r.user.tackles} · Passes ${r.user.passes} · Conversions ${r.user.conversions}`;
}

export function finishQuick(cfg: MatchConfig, r: EngineResult): MatchOutcome {
  const coins = recordMatch(toResult(cfg, r));
  return { title: verdict(r), lines: [statLine(r)], coins };
}

export function finishChampionship(cfg: MatchConfig, fixtureId: string, r: EngineResult): MatchOutcome {
  const res = toResult(cfg, r);
  const coins = recordMatch(res);
  const lines = [statLine(r)];
  let bonus = 0;
  update((p) => {
    const c = p.championship;
    if (!c) return;
    const f = c.fixtures.find((x) => x.id === fixtureId);
    if (!f || f.played) return;
    Object.assign(f, { homeScore: res.homeScore, awayScore: res.awayScore, homeTries: res.homeTries, awayTries: res.awayTries, played: true });
    advanceChampionship(c);
    if (c.finished) {
      const top = computeTable(c.teams, c.fixtures)[0].team;
      if (top === c.user) {
        p.trophies.championship++;
        bonus = 2500;
        p.coins += bonus;
        lines.push(`${nationById(c.user).name} are Nations Champions! +${bonus} bonus`);
      } else lines.push(`Championship finished — ${nationById(top).name} take the title.`);
    }
  });
  return { title: verdict(r), lines, coins: coins + bonus };
}

export function finishWorldCup(cfg: MatchConfig, fixtureId: string, r: EngineResult): MatchOutcome {
  const res = toResult(cfg, r);
  const coins = recordMatch(res);
  const lines = [statLine(r)];
  let bonus = 0;
  update((p) => {
    const w = p.worldCup;
    if (!w) return;
    const f = w.fixtures.find((x) => x.id === fixtureId);
    if (!f || f.played) return;
    let hs = res.homeScore;
    let as = res.awayScore;
    // Knockout draws go to a sudden-death kicking contest.
    if (f.stage !== 'group' && !f.stage.startsWith('Group') && hs === as) {
      if (Math.random() < 0.5) hs += 3;
      else as += 3;
      lines.push('Level at full time — decided by a kicking contest.');
    }
    Object.assign(f, { homeScore: hs, awayScore: as, homeTries: res.homeTries, awayTries: res.awayTries, played: true });
    const stageBefore = w.stage;
    advanceWorldCup(w);
    if (w.eliminated && stageBefore !== 'group') lines.push(`Knocked out in the ${stageBefore}.`);
    if (w.eliminated && stageBefore === 'group' && w.stage !== 'group') lines.push('Out at the group stage.');
    if (w.stage === 'done' && w.champion === w.user) {
      p.trophies.worldCup++;
      bonus = 5000;
      p.coins += bonus;
      lines.push(`WORLD CHAMPIONS! +${bonus} bonus`);
    }
  });
  return { title: verdict(r), lines, coins: coins + bonus };
}

export function finishSeason(cfg: MatchConfig, fixtureId: string, r: EngineResult): MatchOutcome {
  const res = toResult(cfg, r);
  const coins = recordMatch(res);
  const lines = [statLine(r)];
  let bonus = 0;
  update((p) => {
    const s = p.club.season;
    if (!s) return;
    const f = s.fixtures.find((x) => x.id === fixtureId);
    if (!f || f.played) return;
    Object.assign(f, { homeScore: res.homeScore, awayScore: res.awayScore, played: true });
    if (r.userScore > r.cpuScore) s.wins++;
    else if (r.userScore === r.cpuScore) s.draws++;
    else s.losses++;
    s.index++;
    // XP for everyone who started
    const won = r.userScore > r.cpuScore;
    const levelled: string[] = [];
    for (const id of p.club.starting) {
      const c = p.club.cards.find((x) => x.id === id);
      if (!c) continue;
      c.xp += won ? 150 : 90;
      while (c.xp >= 300 && c.level < 10) {
        c.xp -= 300;
        c.level++;
        levelled.push(`${c.first[0]}. ${c.last}`);
      }
    }
    if (levelled.length) lines.push(`Level up: ${levelled.slice(0, 4).join(', ')}${levelled.length > 4 ? '…' : ''}`);
    if (s.index >= s.fixtures.length) {
      s.finished = true;
      p.club.seasonsPlayed++;
      bonus = s.wins * 250 + (s.wins >= 6 ? 3000 : 0);
      if (s.wins >= 6) {
        p.trophies.seasons++;
        lines.push(`Season title! ${s.wins}W ${s.draws}D ${s.losses}L`);
      } else lines.push(`Season over: ${s.wins}W ${s.draws}D ${s.losses}L`);
      p.coins += bonus;
    }
  });
  return { title: verdict(r), lines, coins: coins + bonus };
}

const DRILL_NAMES: Record<Drill, string> = { passing: 'Passing', kicking: 'Kicking', tackling: 'Tackling', setpieces: 'Set Pieces', tutorial: 'Tutorial' };

export function finishDrill(drill: Drill, score: number, total: number): MatchOutcome {
  const first = !getProfile().trainingDone[drill];
  const coins = first ? 300 : 0;
  update((p) => {
    p.trainingDone[drill] = true;
    p.coins += coins;
  });
  return {
    title: `${DRILL_NAMES[drill]} complete`,
    lines: [`Score: ${score} / ${total}`, first ? 'First completion reward!' : 'Practice makes perfect.'],
    coins,
  };
}

export function finishCompMatch(cfg: MatchConfig, kind: CompKind, fixtureId: string, r: EngineResult): MatchOutcome {
  const res = toResult(cfg, r);
  const coins = recordMatch(res);
  const lines = [statLine(r)];
  let bonus = 0;
  update((p) => {
    const c = p.comps[kind];
    if (!c) return;
    const f = c.fixtures.find((x) => x.id === fixtureId);
    if (!f || f.played) return;
    let hs = res.homeScore;
    let as = res.awayScore;
    if (!f.stage.startsWith('R') && hs === as) {
      // knock-out draws are settled by a kicking contest
      if (Math.random() < 0.5) hs += 3;
      else as += 3;
      lines.push('Level at full time: decided by a kicking contest.');
    }
    Object.assign(f, { homeScore: hs, awayScore: as, homeTries: res.homeTries, awayTries: res.awayTries, played: true });
    const before = c.stage;
    advanceComp(c);
    if (c.eliminated && before !== c.stage) lines.push(before === 'league' ? 'You missed out on the play-offs.' : 'Knocked out.');
    if (c.stage === 'done') {
      const name = `${COMP_INFO[kind].title} ${COMP_INFO[kind].accent}`;
      if (c.champion === c.user) {
        bonus = 3000;
        p.coins += bonus;
        if (kind === 'six') p.trophies.championship++;
        else p.trophies[kind] = (p.trophies[kind] ?? 0) + 1;
        lines.push(`${nationById(c.user).name} win the ${name}! +${bonus} bonus`);
      } else lines.push(`${nationById(c.champion!).name} win the ${name}.`);
    }
  });
  return { title: verdict(r), lines, coins: coins + bonus };
}

/** Tutorial reward (first completion only): coins and a free Gold pack waiting in Ultimate Team. */
export const TUTORIAL_REWARD = { coins: 2500, pack: 'gold' };

export function finishTutorial(r: EngineResult | null): MatchOutcome {
  const first = !getProfile().tutorial?.rewarded;
  update((p) => {
    p.tutorial = { done: true, rewarded: true };
    if (first) {
      p.coins += TUTORIAL_REWARD.coins;
      p.freePacks = [...(p.freePacks ?? []), TUTORIAL_REWARD.pack];
    }
  });
  const lines = r ? [`Mini match: ${r.userScore} - ${r.cpuScore}`] : [];
  lines.push(first ? 'Tutorial complete! Your reward: coins and a FREE Gold pack in Ultimate Team.' : 'Tutorial complete. Rewards were already claimed.');
  return { title: 'Tutorial complete', lines, coins: first ? TUTORIAL_REWARD.coins : 0 };
}
