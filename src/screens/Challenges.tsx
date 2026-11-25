import { useMemo } from 'react';
import type { Go } from '../App';
import { TopBar } from '../ui/common';
import { TeamLogo } from '../ui/logos';
import { nationById } from '../data/nations';
import { getProfile, update, useProfile } from '../state/store';
import { buildMatch, nationTeam } from '../state/teams';
import type { ChallengeSetup, EngineResult, MatchConfig } from '../game/types';
import type { MatchOutcome } from './MatchScreen';
import { makeRng } from '../util/rng';
import { audio } from '../util/audio';

interface Scenario extends ChallengeSetup {
  desc: string;
  user: string;
  cpu: string;
  reward: number;
}

/** Scenario pool; three are picked each day. */
const POOL: Scenario[] = [
  { id: 'comeback10', title: 'The Comeback', desc: 'Down 10 points with 5 minutes left. Win it.', user: 'ENG', cpu: 'NZL', score: [12, 22], secondHalfAt: 2100, startX: 0, goal: 'win', reward: 800 },
  { id: 'own22', title: 'Length of the Field', desc: 'Scrum on your own 22. Score a try from there.', user: 'FRA', cpu: 'IRE', score: [17, 17], secondHalfAt: 2160, startX: -28, goal: 'tryFromOwn22', reward: 600 },
  { id: 'holdout', title: 'Hold the Line', desc: 'Defend a 5-point lead with a scrum on your line. Don’t concede.', user: 'IRE', cpu: 'RSA', score: [20, 15], secondHalfAt: 2220, goal: 'holdOut', reward: 700 },
  { id: 'twotries', title: 'Double Trouble', desc: 'Score two tries in the last 10 minutes.', user: 'SCO', cpu: 'AUS', score: [10, 10], secondHalfAt: 1800, startX: 0, goal: 'scoreTries', target: 2, reward: 900 },
  { id: 'underdog', title: 'Giant Killers', desc: 'Japan trail South Africa by 3 with 6 to go. Win it.', user: 'JPN', cpu: 'RSA', score: [26, 29], secondHalfAt: 2040, startX: 0, goal: 'win', reward: 1000 },
  { id: 'lastplay', title: 'Last Play', desc: 'Two points down, 90 seconds left, ball in their half. Win it.', user: 'WAL', cpu: 'ENG', score: [18, 20], secondHalfAt: 2310, startX: 12, goal: 'win', reward: 800 },
  { id: 'prem', title: 'Derby Day', desc: 'Bath trail Bristol by 7 with 8 minutes left. Win the derby.', user: 'BTH', cpu: 'BRS', score: [14, 21], secondHalfAt: 1920, startX: 0, goal: 'win', reward: 700 },
  { id: 'fijiflair', title: 'Fiji Flair', desc: 'Score two tries with Fiji before full time.', user: 'FIJ', cpu: 'FRA', score: [7, 19], secondHalfAt: 1680, startX: 0, goal: 'scoreTries', target: 2, reward: 900 },
];

const today = () => new Date().toISOString().slice(0, 10);

function daily(date: string): Scenario[] {
  const rng = makeRng(Number(date.replace(/-/g, '')) * 13 + 7);
  const pool = [...POOL];
  return [0, 1, 2].map(() => pool.splice(rng.int(0, pool.length - 1), 1)[0]);
}

function finishChallenge(cfg: MatchConfig, sc: Scenario, r: EngineResult): MatchOutcome {
  const ok = !!r.challenge;
  let coins = 0;
  update((p) => {
    const d = today();
    const done = p.scenarios && p.scenarios.date === d ? p.scenarios.done : [];
    if (ok && !done.includes(sc.id)) {
      coins = sc.reward;
      p.coins += coins;
      p.scenarios = { date: d, done: [...done, sc.id] };
    }
  });
  if (ok) audio.coin();
  void cfg;
  return { title: ok ? 'Challenge complete!' : 'Challenge failed', lines: [sc.desc, `Final score ${r.userScore} – ${r.cpuScore}`], coins };
}

export function Challenges({ go }: { go: Go }) {
  const p = useProfile();
  const list = useMemo(() => daily(today()), []);
  const done = p.scenarios && p.scenarios.date === today() ? p.scenarios.done : [];
  const play = (sc: Scenario) => {
    audio.click();
    const base = buildMatch(nationTeam(sc.user), nationTeam(sc.cpu), true, getProfile());
    base.competition = 'challenge';
    const cfg: MatchConfig = { ...base, challenge: sc };
    go({ name: 'match', cfg, back: { name: 'challenges' }, onFinish: (r) => finishChallenge(cfg, sc, r) });
  };
  return (
    <div className="screen">
      <TopBar title="Daily" accent="Challenges" onBack={() => go({ name: 'menu' })} />
      <p className="muted italic" style={{ margin: 0 }}>Three new scenarios every day. Complete one for coins.</p>
      <div className="scroll">
        <div className="challenge-grid">
          {list.map((sc) => {
            const won = done.includes(sc.id);
            return (
              <div key={sc.id} className={`card challenge-card ${won ? 'won' : ''}`}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <TeamLogo id={sc.user} size={34} />
                  <b className="muted">v</b>
                  <TeamLogo id={sc.cpu} size={34} />
                  <span className="coins" style={{ marginLeft: 'auto' }}>
                    <i className="coin-dot" />
                    {sc.reward}
                  </span>
                </div>
                <h3 style={{ margin: '8px 0 2px' }}>{sc.title}</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>{sc.desc}</p>
                <p className="muted" style={{ margin: '4px 0 8px', fontSize: 12 }}>
                  {nationById(sc.user).name} {sc.score?.[0] ?? 0} – {sc.score?.[1] ?? 0} {nationById(sc.cpu).name}
                </p>
                <button className={`btn ${won ? 'ghost' : 'primary'}`} onClick={() => play(sc)}>
                  {won ? 'Completed ✓ — play again' : 'Play'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
