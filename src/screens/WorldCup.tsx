import { useState } from 'react';
import { TeamLogo } from '../ui/logos';
import type { Go } from '../App';
import { NATIONS, nationById } from '../data/nations';
import { TopBar } from '../ui/common';
import { update, useProfile } from '../state/store';
import { buildMatch, nationTeam } from '../state/teams';
import { createWorldCup, finishWorldCup, nationOvr, worldCupUserFixture } from '../state/tournaments';
import { finishWorldCup as finishWcMatch } from '../state/outcomes';
import { FixtureRow, StandingsTable } from './Championship';
import { audio } from '../util/audio';

export function WorldCup({ go }: { go: Go }) {
  const p = useProfile();
  const w = p.worldCup;
  const [tab, setTab] = useState('A');

  if (!w) {
    return (
      <div className="screen">
        <TopBar title="World" accent="Cup" onBack={() => go({ name: 'menu' })} />
        <p className="muted italic" style={{ margin: 0 }}>14 nations · 4 pools · quarter-finals, semis, final. Choose your nation.</p>
        <div className="scroll">
          <div className="nation-grid">
            {NATIONS.map((n) => (
              <button
                key={n.id}
                className="nation-btn"
                onClick={() => {
                  audio.click();
                  update((x) => (x.worldCup = createWorldCup(n.id)));
                }}
              >
                <TeamLogo id={n.id} />
                <span>
                  <b>{n.name}</b>
                  <small>OVR {nationOvr(n.id)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const next = worldCupUserFixture(w);
  const play = () => {
    if (!next) return;
    audio.click();
    const userHome = next.home === w.user;
    const cfg = buildMatch(nationTeam(w.user), nationTeam(userHome ? next.away : next.home), userHome, p);
    const fid = next.id;
    go({ name: 'match', cfg, back: { name: 'worldcup' }, onFinish: (r) => finishWcMatch(cfg, fid, r) });
  };

  const ko = ['QF', 'SF', 'Final'];
  const stageLabel = w.stage === 'group' ? 'Pool stage' : w.stage === 'done' ? 'Complete' : w.stage === 'QF' ? 'Quarter-finals' : w.stage === 'SF' ? 'Semi-finals' : 'Final';

  return (
    <div className="screen">
      <TopBar
        title="World Cup"
        accent={stageLabel}
        onBack={() => go({ name: 'menu' })}
        right={
          <button className="btn ghost" onClick={() => confirm('Abandon this World Cup?') && update((x) => (x.worldCup = null))}>
            Quit
          </button>
        }
      />
      <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 1.3, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="tabs">
            {w.groups.map((g) => (
              <button key={g.name} className={`tab ${tab === g.name ? 'on' : ''}`} onClick={() => setTab(g.name)}>
                Pool {g.name}
              </button>
            ))}
            <button className={`tab ${tab === 'KO' ? 'on' : ''}`} onClick={() => setTab('KO')}>
              Knockouts
            </button>
          </div>
          <div className="scroll" style={{ marginTop: 8 }}>
            {tab === 'KO' ? (
              ko.map((s) => {
                const fx = w.fixtures.filter((f) => f.stage === s);
                return (
                  <div key={s} style={{ marginBottom: 10 }}>
                    <div className="muted italic" style={{ fontSize: 12 }}>{s === 'QF' ? 'QUARTER-FINALS' : s === 'SF' ? 'SEMI-FINALS' : 'FINAL'}</div>
                    {fx.length ? fx.map((f) => <FixtureRow key={f.id} f={f} user={w.user} />) : <div className="muted" style={{ fontSize: 13 }}>To be decided</div>}
                  </div>
                );
              })
            ) : (
              (() => {
                const g = w.groups.find((x) => x.name === tab)!;
                const fx = w.fixtures.filter((f) => f.stage === `Group ${g.name}`);
                return (
                  <>
                    <StandingsTable teams={g.teams} fixtures={fx} user={w.user} highlightTop={2} />
                    <div style={{ marginTop: 8 }}>
                      {fx.map((f) => (
                        <FixtureRow key={f.id} f={f} user={w.user} />
                      ))}
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center', justifyContent: 'center' }}>
          {w.stage === 'done' ? (
            <>
              <div className="trophy">🏆</div>
              <h2>{w.champion === w.user ? 'World Champions!' : `${nationById(w.champion!).name} are champions`}</h2>
              <button className="btn primary" onClick={() => update((x) => (x.worldCup = null))}>
                New World Cup
              </button>
            </>
          ) : w.eliminated ? (
            <>
              <h2>Eliminated</h2>
              <p className="muted">{nationById(w.user).name} are out. See who lifts the trophy?</p>
              <button className="btn primary" onClick={() => update((x) => x.worldCup && finishWorldCup(x.worldCup))}>
                Simulate the rest
              </button>
            </>
          ) : (
            <>
              <TeamLogo id={w.user} size={60} />
              <h3>{nationById(w.user).name}</h3>
              {next && (
                <p className="muted">
                  Next: {next.stage} vs {nationById(next.home === w.user ? next.away : next.home).name}
                </p>
              )}
              <button className="btn primary" style={{ minHeight: 54, fontSize: 19, width: '100%' }} disabled={!next} onClick={play}>
                Play match
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
