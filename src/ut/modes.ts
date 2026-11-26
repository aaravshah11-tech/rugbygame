/**
 * Ultimate Team game modes: launching a match against an AI squad and applying the result
 * (coins, mode progress, objectives, evolutions, Team of the Week performers, club stats).
 */
import type { Go } from '../App';
import type { ChallengeSetup, EngineResult, MatchConfig, TeamSetup } from '../game/types';
import type { MatchOutcome } from '../screens/MatchScreen';
import { buildMatch } from '../state/teams';
import { getProfile } from '../state/store';
import type { Difficulty } from '../state/types';
import { hashString, makeRng } from '../util/rng';
import { REWARDS, SEASON } from './config';
import { addXp, packName, recordEvent, type Reward } from './progress';
import { aiSquad, aiTeam, utTeam, type AiSquad } from './squad';
import { addCoins, dayKey, getUT, updateUT, weekKey, type UTState } from './store';
import { posInfo } from '../data/players';

export type UTMode = 'battles' | 'rivals' | 'champions' | 'moments' | 'draft' | 'friendly';
export const MODE_NAME: Record<UTMode, string> = { battles: 'Squad Battles', rivals: 'Division Rivals', champions: 'Champions', moments: 'Moments', draft: 'Draft', friendly: 'Friendlies' };

/** Give a reward: coins now, packs into your unopened packs. */
export function grant(s: UTState, r: Reward): string {
  if (r.coins) addCoins(r.coins);
  if (r.pack) s.packs.push(r.pack);
  if (r.items) s.items.posChange += r.items;
  if (r.xp) addXp(s, r.xp);
  return [r.coins ? `+${r.coins.toLocaleString()} coins` : '', r.pack ? packName(r.pack) : '', r.items ? `${r.items} position change` : ''].filter(Boolean).join(' · ');
}

// ------------------------------------------------------------------ weekly resets
/** Roll weekly modes over: unclaimed weekly rewards stay claimable until the next week starts. */
export function weeklyRollover(s: UTState) {
  const w = weekKey();
  if (s.battles.week !== w) s.battles = { week: w, points: 0, played: 0, beaten: [], claimed: null, lastRank: battlesRank(s.battles.points).name };
  if (s.rivals.week !== w) {
    // keep your division; weekly progress resets
    s.rivals = { ...s.rivals, week: w, wins: 0, matches: 0, best: s.rivals.division, claimed: null };
  }
  if (s.champions.week !== w && !s.champions.active) s.champions = { week: w, qualified: false, active: false, played: 0, wins: 0, claimed: false };
  if (s.friendlies.date !== dayKey()) s.friendlies = { date: dayKey(), wins: 0 };
}

export const battlesRank = (points: number) => REWARDS.battles.ranks.find((r) => points >= r.points) ?? REWARDS.battles.ranks[REWARDS.battles.ranks.length - 1];

/** This week's Squad Battles opponents (the same all week). */
export function battlesOpponents(w = weekKey()): AiSquad[] {
  const rng = makeRng(hashString('battles-' + w));
  return Array.from({ length: REWARDS.battles.opponentsPerWeek }, (_, i) => aiSquad(`battles-${w}-${i}`, 70 + rng.int(0, 18)));
}

export function rivalsOpponent(s: UTState): AiSquad {
  const d = s.rivals.division;
  return aiSquad(`rivals-${s.rivals.week}-${d}-${s.rivals.matches}`, REWARDS.rivals.aiOvr.base + (10 - d) * REWARDS.rivals.aiOvr.step);
}
export function championsOpponent(s: UTState): AiSquad {
  const [lo, hi] = REWARDS.champions.aiOvr;
  return aiSquad(`champs-${s.champions.week}-${s.champions.played}`, lo + Math.round(((hi - lo) * s.champions.played) / REWARDS.champions.matches));
}

// ------------------------------------------------------------------ moments
export interface MomentDef {
  id: string;
  name: string;
  desc: string;
  challenge: Omit<ChallengeSetup, 'id' | 'title'>;
  oppOvr: number;
}
export const MOMENTS: MomentDef[] = [
  { id: 'lineout-try', name: 'Lineout Strike', desc: 'Score a try from a lineout 15m out, 5 minutes left', challenge: { startX: 35, start: 'lineout', secondHalfAt: 2100, goal: 'scoreTries', target: 1 }, oppOvr: 78 },
  { id: 'hold-lead', name: 'See It Out', desc: 'Defend a 5-point lead for the last 2 minutes', challenge: { score: [20, 15], secondHalfAt: 2280, goal: 'win' }, oppOvr: 82 },
  { id: 'comeback', name: 'The Comeback', desc: '7 points down with 5 minutes to play: win it', challenge: { score: [10, 17], secondHalfAt: 2100, goal: 'win' }, oppOvr: 80 },
  { id: 'own-22', name: 'Length of the Field', desc: 'Score from your own 22', challenge: { startX: -28, goal: 'tryFromOwn22', secondHalfAt: 2040 }, oppOvr: 76 },
  { id: 'goal-line', name: 'Goal-Line Stand', desc: 'Hold them out on your own line', challenge: { goal: 'holdOut', secondHalfAt: 2220 }, oppOvr: 84 },
  { id: 'two-tries', name: 'Double Trouble', desc: 'Score 2 tries in the last 10 minutes', challenge: { score: [0, 0], secondHalfAt: 1800, goal: 'scoreTries', target: 2 }, oppOvr: 78 },
  { id: 'scrum-5', name: 'Five-Metre Scrum', desc: 'Score from a scrum 5m out', challenge: { startX: 45, secondHalfAt: 2160, goal: 'scoreTries', target: 1 }, oppOvr: 82 },
];
const STARS: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3, elite: 3 };
export const momentStars = (s: UTState) => Object.values(s.moments).reduce((a, b) => a + b, 0);

// ------------------------------------------------------------------ launching
export interface LaunchOpts {
  mode: UTMode;
  opp: AiSquad;
  difficulty: Difficulty;
  /** UT page to come back to */
  page: string;
  /** play with these cards instead of your club (draft) */
  team?: TeamSetup;
  moment?: MomentDef;
}

export function launch(go: Go, o: LaunchOpts): string | null {
  const s = getUT();
  const user = o.team ?? utTeam(s);
  if (!user) return 'Your XV has empty shirts: fill every position in Squad first.';
  const p = getProfile();
  const cfg: MatchConfig = buildMatch(user, aiTeam(o.opp), true, p);
  cfg.difficulty = o.difficulty;
  cfg.competition = 'club';
  cfg.venue = s.club.stadium;
  cfg.importance = o.mode === 'champions' ? 1 : o.mode === 'rivals' ? 0.9 : o.mode === 'friendly' ? 0.68 : 0.8;
  if (o.mode === 'champions') cfg.timeOfDay = 'night';
  if (o.moment) cfg.challenge = { id: o.moment.id, title: o.moment.name, ...o.moment.challenge } as ChallengeSetup;
  go({ name: 'match', cfg, back: { name: 'ut', page: o.page }, onFinish: (r) => applyResult(o, r) });
  return null;
}

/** Apply a finished UT match: everything that depends on it moves on. Returns the result card. */
export function applyResult(o: LaunchOpts, r: EngineResult): MatchOutcome {
  const lines: string[] = [];
  let coins = 0;
  const won = r.userScore > r.cpuScore;
  const drawn = r.userScore === r.cpuScore;
  const moment = o.mode === 'moments';
  updateUT((s) => {
    weeklyRollover(s);
    // club stats and per-card bookkeeping (not for moments or draft: those aren't your club)
    const inClub = (id: string) => s.cards.find((c) => c.uid === id);
    if (!moment) {
      s.stats.played++;
      if (won) s.stats.wins++;
      else if (drawn) s.stats.draws++;
      else s.stats.losses++;
      s.stats.tries += r.userTries;
    }
    if (s.performers.week !== weekKey()) s.performers = { week: weekKey(), scores: {} };
    for (const pl of r.players ?? []) {
      const c = inClub(pl.id);
      if (!c) continue;
      s.stats.apps[c.base] = (s.stats.apps[c.base] ?? 0) + 1;
      if (pl.tries) s.stats.scorers[c.base] = (s.stats.scorers[c.base] ?? 0) + pl.tries;
      s.performers.scores[c.base] = (s.performers.scores[c.base] ?? 0) + pl.tries * 3 + pl.tackles * 0.3 + (won ? 1 : 0);
      recordEvent(s, 'match', 1, c.uid);
      if (won) recordEvent(s, 'win', 1, c.uid);
      if (pl.tries) {
        recordEvent(s, 'try', pl.tries, c.uid);
        if (pl.num === 11 || pl.num === 14) recordEvent(s, 'wingTry', pl.tries);
        if (posInfo(pl.num).group !== 'half' && pl.num <= 8) recordEvent(s, 'forwardTry', pl.tries);
      }
    }
    if (!(r.players ?? []).some((pl) => inClub(pl.id))) {
      // draft / simulated: team-level objectives still count
      recordEvent(s, 'match');
      if (won) recordEvent(s, 'win');
      recordEvent(s, 'try', r.userTries);
    }
    recordEvent(s, 'tackle', r.user.tackles);
    recordEvent(s, 'conversion', r.user.conversions);
    addXp(s, SEASON.xp.match + (won ? SEASON.xp.win : 0) + r.userTries * SEASON.xp.try);

    // base coins for any match
    if (!moment) {
      coins = won ? REWARDS.match.win : drawn ? REWARDS.match.draw : REWARDS.match.loss;
      coins += r.userTries * REWARDS.match.perTry;
    }

    switch (o.mode) {
      case 'battles': {
        const pts = Math.round((REWARDS.battles.points[o.difficulty] ?? 400) * (won ? 1 : drawn ? 0.5 : 0.15) + r.userTries * REWARDS.battles.perTry);
        s.battles.points += pts;
        s.battles.played++;
        if (won && !s.battles.beaten.includes(o.opp.id)) s.battles.beaten.push(o.opp.id);
        if (won) recordEvent(s, 'battlesWin');
        lines.push(`Squad Battles: +${pts} points (${s.battles.points.toLocaleString()} this week, ${battlesRank(s.battles.points).name})`);
        break;
      }
      case 'rivals': {
        const R = REWARDS.rivals;
        s.rivals.matches++;
        const delta = won ? R.win : drawn ? R.draw : R.loss;
        s.rivals.points += delta;
        if (won) {
          s.rivals.wins++;
          recordEvent(s, 'rivalsWin');
        }
        lines.push(`Division ${s.rivals.division}: ${delta >= 0 ? '+' : ''}${delta} points (${s.rivals.points} / ${R.promote})`);
        if (s.rivals.points >= R.promote && s.rivals.division > 1) {
          s.rivals.division--;
          s.rivals.points = 0;
          lines.push(`PROMOTED to Division ${s.rivals.division}!`);
        } else if (s.rivals.points >= R.promote) {
          s.rivals.points = R.promote;
          lines.push('Division 1: the top. Keep winning for Champions qualification.');
        } else if (s.rivals.points < 0) {
          if (R.safeDivisions.includes(s.rivals.division)) s.rivals.points = 0;
          else {
            s.rivals.division++;
            s.rivals.points = Math.floor(R.promote / 2);
            lines.push(`Relegated to Division ${s.rivals.division}.`);
          }
        }
        s.rivals.best = Math.min(s.rivals.best, s.rivals.division);
        if (!s.champions.qualified && s.rivals.wins >= R.qualify) {
          s.champions.qualified = true;
          lines.push('QUALIFIED for Champions this weekend!');
        }
        break;
      }
      case 'champions': {
        s.champions.played++;
        if (won) {
          s.champions.wins++;
          recordEvent(s, 'championsWin');
        }
        lines.push(`Champions: ${s.champions.wins} wins from ${s.champions.played} / ${REWARDS.champions.matches}`);
        if (s.champions.played >= REWARDS.champions.matches) {
          s.champions.active = false;
          lines.push('Champions finished: claim your rewards.');
        }
        coins = Math.round(coins * 1.5);
        break;
      }
      case 'draft': {
        const d = s.draft;
        if (d) {
          if (won) {
            d.wins++;
            recordEvent(s, 'draftWin');
            lines.push(`Draft: ${d.wins} / ${REWARDS.draft.wins} wins`);
            if (d.wins >= REWARDS.draft.wins) d.active = false;
          } else {
            d.lost = true;
            d.active = false;
            lines.push(`Draft over: ${d.wins} wins.`);
          }
        }
        break;
      }
      case 'friendly': {
        if (won && s.friendlies.wins < REWARDS.friendlies.dailyWins) {
          s.friendlies.wins++;
          coins += REWARDS.friendlies.winCoins;
          recordEvent(s, 'friendlyWin');
          lines.push(`Daily friendly win ${s.friendlies.wins} / ${REWARDS.friendlies.dailyWins}`);
          if (s.friendlies.wins === REWARDS.friendlies.dailyWins) {
            s.packs.push(REWARDS.friendlies.pack);
            lines.push(`Daily reward: ${packName(REWARDS.friendlies.pack)}`);
          }
        } else lines.push('Friendly: no risk, no record.');
        break;
      }
      case 'moments': {
        const done = r.challenge === true;
        const stars = done ? STARS[o.difficulty] : 0;
        const id = o.moment!.id;
        const before = s.moments[id] ?? 0;
        if (stars > before) {
          s.moments[id] = stars;
          recordEvent(s, 'momentStar', stars - before);
        }
        lines.push(done ? `Moment complete: ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} (${o.difficulty})` : 'Moment failed: try again.');
        break;
      }
    }
    if (coins) addCoins(coins);
  });
  const title = moment ? (r.challenge ? 'Moment complete' : 'Moment failed') : won ? 'Victory' : drawn ? 'Draw' : 'Defeat';
  return { title, lines, coins };
}
