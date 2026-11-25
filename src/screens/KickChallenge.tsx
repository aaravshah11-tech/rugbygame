import type { Go } from '../App';
import { TopBar } from '../ui/common';
import { BrandLogo, sponsorsOn } from '../ui/BrandLogo';
import { COMP_TITLE } from '../data/sponsors';
import { update, useProfile } from '../state/store';
import { buildMatch, nationTeam } from '../state/teams';
import type { MatchConfig } from '../game/types';
import type { MatchOutcome } from './MatchScreen';
import { audio } from '../util/audio';

/**
 * Goal-kicking levels. Spots are [x along the pitch, z across]: the try line is at x = 50,
 * so x = 35 is 15m out; z = ±33 is right on the touchline.
 */
const LEVELS: { id: string; name: string; desc: string; wind: number; reward: number; spots: [number, number][] }[] = [
  { id: 'easy', name: 'Easy', desc: 'In front of the posts, no wind', wind: 0, reward: 200, spots: [[35, 0], [33, 6], [31, -8], [30, 10], [28, -4]] },
  { id: 'medium', name: 'Medium', desc: 'Wider angles, a light breeze', wind: 10, reward: 400, spots: [[30, 0], [29, 14], [28, -16], [26, 8], [25, -20], [24, 18]] },
  { id: 'hard', name: 'Hard', desc: 'Out to the 15m line and further back', wind: 16, reward: 700, spots: [[26, -24], [25, 26], [22, 0], [22, -30], [20, 30], [18, -12], [18, 14]] },
  { id: 'vhard', name: 'Very Hard', desc: 'Touchline conversions in a stiff wind', wind: 22, reward: 1000, spots: [[16, 0], [16, 32], [14, -32], [12, 24], [12, -20], [10, 33], [8, -33], [8, 0]] },
  { id: 'extreme', name: 'Extreme', desc: 'Touchline to halfway, gale blowing', wind: 30, reward: 2000, spots: [[6, 33.5], [6, -33.5], [4, 0], [2, 28], [2, -28], [0, 33], [0, -33], [-2, 10], [-4, -20], [-5, 30]] },
];

export function KickChallenge({ go }: { go: Go }) {
  const p = useProfile();
  const prog = p.kickLevels ?? {};
  const play = (i: number) => {
    const lv = LEVELS[i];
    audio.click();
    const base = buildMatch(nationTeam('ENG'), nationTeam('FRA'), true, p, 'kicking');
    const cfg: MatchConfig = { ...base, kickChallenge: { level: lv.name, spots: lv.spots, windKmh: lv.wind } };
    go({
      name: 'match',
      cfg,
      back: { name: 'kicking' },
      onDrillDone: (score: number, total: number): MatchOutcome => {
        const passed = score >= total;
        let coins = 0;
        update((x) => {
          const kl = (x.kickLevels ??= {});
          const prev = kl[lv.id] ?? { best: 0, passed: false };
          if (passed && !prev.passed) {
            coins = lv.reward;
            x.coins += coins;
          }
          kl[lv.id] = { best: Math.max(prev.best, score), passed: prev.passed || passed };
        });
        if (passed) audio.coin();
        return {
          title: passed ? `${lv.name} complete!` : 'Missed one',
          lines: [`${score} / ${total} kicks`, passed ? (i + 1 < LEVELS.length ? `${LEVELS[i + 1].name} unlocked` : 'You beat Extreme!') : 'Make every kick to pass the level.'],
          coins,
        };
      },
    });
  };
  return (
    <div className="screen">
      <TopBar title="Kicking" accent="Challenge" onBack={() => go({ name: 'menu' })} />
      {sponsorsOn() && (
        <div className="presented-by">
          presented by <BrandLogo id={COMP_TITLE.kick} height={16} />
        </div>
      )}
      <p className="muted italic" style={{ margin: 0 }}>Conversions from every angle. Make every kick to pass a level and unlock the next.</p>
      <div className="scroll">
        <div className="challenge-grid">
          {LEVELS.map((lv, i) => {
            const st = prog[lv.id];
            const unlocked = i === 0 || !!prog[LEVELS[i - 1].id]?.passed;
            return (
              <div key={lv.id} className={`card challenge-card ${st?.passed ? 'won' : ''}`} style={{ opacity: unlocked ? 1 : 0.5 }}>
                <div className="row" style={{ alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>{lv.name}</h3>
                  <span className="coins" style={{ marginLeft: 'auto' }}>
                    <i className="coin-dot" />
                    {lv.reward}
                  </span>
                </div>
                <p className="muted" style={{ margin: '4px 0', fontSize: 13 }}>{lv.desc}</p>
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
                  {lv.spots.length} kicks · wind {Math.round(lv.wind / 1.609)} mph{st ? ` · best ${st.best}/${lv.spots.length}` : ''}
                </p>
                <button className={`btn ${st?.passed ? 'ghost' : 'primary'}`} disabled={!unlocked} onClick={() => play(i)}>
                  {!unlocked ? 'Locked 🔒' : st?.passed ? 'Passed ✓ — play again' : 'Start'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
