import { useEffect, useRef, useState } from 'react';
import type { Go } from '../App';
import { MenuScene } from '../game/menuScene';
import { CLUB_NATION } from '../data/nations';
import { claimChallenge, claimLoginReward, LOGIN_REWARDS, useProfile } from '../state/store';
import { audio } from '../util/audio';
import { isStandalone } from '../util/device';

let dailyShown = false;

export function MainMenu({ go }: { go: Go }) {
  const host = useRef<HTMLDivElement>(null);
  const p = useProfile();
  const [daily, setDaily] = useState(false);
  const [installTip, setInstallTip] = useState(!isStandalone() && !sessionStorage.getItem('tl-install-tip'));

  useEffect(() => {
    const scene = new MenuScene(host.current!, CLUB_NATION.kit);
    audio.startMusic();
    return () => scene.dispose();
  }, []);

  useEffect(() => {
    if (!installTip) return;
    const t = setTimeout(() => {
      sessionStorage.setItem('tl-install-tip', '1');
      setInstallTip(false);
    }, 6000);
    return () => clearTimeout(t);
  }, [installTip]);

  useEffect(() => {
    if (p.daily.pendingReward > 0 && !dailyShown) {
      dailyShown = true;
      setDaily(true);
    }
  }, [p.daily.pendingReward]);

  const nav = (r: Parameters<Go>[0]) => {
    audio.click();
    go(r);
  };
  const unclaimed = p.daily.challenges.filter((c) => !c.claimed && c.progress >= c.target).length + (p.daily.pendingReward > 0 ? 1 : 0);

  return (
    <div className="screen" style={{ padding: 0, background: 'var(--bg)' }}>
      <div ref={host} className="menu-bg" />
      <div className="menu-layer">
        <div className="row">
          <div className="logo grow">
            TRY <span>LINE</span>
          </div>
          <button className="btn ghost" onClick={() => (audio.click(), setDaily(true))} style={{ position: 'relative' }}>
            Daily
            {unclaimed > 0 && <span className="pill win">{unclaimed}</span>}
          </button>
          <button className="btn ghost back" aria-label="Settings" onClick={() => nav({ name: 'settings' })}>
            ⚙
          </button>
          <span className="coins">
            <i className="coin-dot" />
            {p.coins.toLocaleString()}
          </span>
        </div>
        <div className="muted italic" style={{ fontSize: 13, marginTop: 2 }}>
          {p.stats.matches} played · {p.stats.wins} won · {p.trophies.championship + p.trophies.worldCup + p.trophies.seasons} trophies
        </div>

        <div className="menu-grid">
          <button className="tile wide" style={{ '--accent': 'var(--neon)' } as React.CSSProperties} onClick={() => nav({ name: 'quick' })}>
            <span className="tag">Any team</span>
            <h3>Quick Match</h3>
            <p>Every nation and club, straight onto the pitch</p>
          </button>
          <button className="tile" style={{ '--accent': 'var(--pink)' } as React.CSSProperties} onClick={() => nav({ name: 'comp', kind: 'league' })}>
            <span className="tag">North v South</span>
            <h3>Nations League</h3>
          </button>
          <button className="tile" style={{ '--accent': 'var(--cyan)' } as React.CSSProperties} onClick={() => nav({ name: 'comp', kind: 'six' })}>
            <span className="tag">6 nations</span>
            <h3>Nations Championship</h3>
          </button>
          <button className="tile wide" style={{ '--accent': 'var(--gold)' } as React.CSSProperties} onClick={() => nav({ name: 'comp', kind: 'prem' })}>
            <span className="tag">10 clubs</span>
            <h3>The Prem</h3>
            <p>League, then semi-finals and the final</p>
          </button>
        </div>
        <div className="menu-mini">
          <button onClick={() => nav({ name: 'worldcup' })}>
            <b>World Cup</b>
            <small>pools · knockouts</small>
          </button>
          <button onClick={() => nav({ name: 'squad' })}>
            <b>Squad</b>
            <small>cards · XP · packs</small>
          </button>
          <button onClick={() => nav({ name: 'challenges' })}>
            <b>Challenges</b>
            <small>daily scenarios</small>
          </button>
          <button onClick={() => nav({ name: 'kicking' })}>
            <b>Kicking</b>
            <small>easy → extreme</small>
          </button>
          <button onClick={() => nav({ name: 'training' })}>
            <b>Training</b>
            <small>tutorials</small>
          </button>
        </div>
      </div>

      {installTip && !daily && (
        <div className="toast" onClick={() => (sessionStorage.setItem('tl-install-tip', '1'), setInstallTip(false))}>
          Tip: Share → Add to Home Screen to play full screen ✕
        </div>
      )}

      {daily && (
        <div className="sheet" onClick={() => setDaily(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2 className="grow">Daily Rewards</h2>
              <button className="btn back" onClick={() => setDaily(false)}>
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: '4px 0 8px' }}>Login streak: day {p.daily.streak} of 7</p>
            <div className="row" style={{ gap: 6 }}>
              {LOGIN_REWARDS.map((r, i) => (
                <div
                  key={i}
                  className="card"
                  style={{
                    padding: 6,
                    flex: 1,
                    textAlign: 'center',
                    borderColor: i + 1 === p.daily.streak ? 'var(--neon)' : undefined,
                    opacity: i + 1 < p.daily.streak || (i + 1 === p.daily.streak && p.daily.pendingReward === 0) ? 0.45 : 1,
                  }}
                >
                  <div className="muted" style={{ fontSize: 10 }}>DAY {i + 1}</div>
                  <b style={{ color: 'var(--gold)', fontSize: 13 }}>{r}</b>
                </div>
              ))}
            </div>
            {p.daily.pendingReward > 0 && (
              <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={claimLoginReward}>
                Claim {p.daily.pendingReward} coins
              </button>
            )}
            <h3 style={{ marginTop: 14 }}>Today's challenges</h3>
            {p.daily.challenges.map((c) => (
              <div key={c.id} className="row" style={{ marginTop: 8 }}>
                <div className="grow">
                  <b className="italic">{c.label}</b>
                  <div className="stam" style={{ width: '100%', marginTop: 4 }}>
                    <i style={{ width: `${(c.progress / c.target) * 100}%` }} />
                  </div>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  {c.progress}/{c.target}
                </span>
                <button className="btn primary" style={{ minWidth: 96 }} disabled={c.claimed || c.progress < c.target} onClick={() => claimChallenge(c.id)}>
                  {c.claimed ? 'Done' : `+${c.reward}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
