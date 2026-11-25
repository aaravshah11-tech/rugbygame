import { useState } from 'react';
import { TeamLogo } from '../ui/logos';
import type { Go } from '../App';
import { CHAMPIONSHIP_NATIONS, nationById } from '../data/nations';
import { TopBar } from '../ui/common';
import { update, useProfile } from '../state/store';
import { buildMatch, nationTeam } from '../state/teams';
import { championshipUserFixture, computeTable, createChampionship, nationOvr } from '../state/tournaments';
import { finishChampionship } from '../state/outcomes';
import type { Fixture } from '../state/types';
import { audio } from '../util/audio';

export function FixtureRow({ f, user }: { f: Fixture; user: string }) {
  const H = nationById(f.home);
  const A = nationById(f.away);
  const mine = f.home === user || f.away === user;
  let pill: React.ReactNode = null;
  if (f.played && mine) {
    const us = f.home === user ? f.homeScore! : f.awayScore!;
    const them = f.home === user ? f.awayScore! : f.homeScore!;
    pill = <span className={`pill ${us > them ? 'win' : us < them ? 'loss' : ''}`}>{us > them ? 'W' : us < them ? 'L' : 'D'}</span>;
  }
  return (
    <div className={`fx ${mine ? 'mine' : ''}`} style={{ '--h': H.kit.primary, '--a': A.kit.primary } as React.CSSProperties}>
      <TeamLogo id={H.id} size={24} />
      <span className="grow fx-name">{H.short}</span>
      <span className={`fx-score ${f.played ? 'ft' : ''}`}>{f.played ? `${f.homeScore} – ${f.awayScore}` : 'v'}</span>
      <span className="grow fx-name" style={{ textAlign: 'right' }}>{A.short}</span>
      <TeamLogo id={A.id} size={24} />
      <span className="fx-pill">{pill}</span>
    </div>
  );
}

export function StandingsTable({ teams, fixtures, user, highlightTop = 0 }: { teams: string[]; fixtures: Fixture[]; user: string; highlightTop?: number }) {
  const rows = computeTable(teams, fixtures);
  return (
    <table className="t">
      <thead>
        <tr>
          <th className="l">Team</th>
          <th>P</th>
          <th>W</th>
          <th>D</th>
          <th>L</th>
          <th>+/-</th>
          <th>BP</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.team} className={r.team === user ? 'me' : ''} style={i < highlightTop ? { background: 'rgba(33,230,193,0.08)' } : undefined}>
            <td className="l">
              <span className="row" style={{ gap: 6 }}>
                <TeamLogo id={r.team} size={18} />
                {nationById(r.team).short}
              </span>
            </td>
            <td>{r.p}</td>
            <td>{r.w}</td>
            <td>{r.d}</td>
            <td>{r.l}</td>
            <td>{r.pf - r.pa}</td>
            <td>{r.bp}</td>
            <td>{r.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Championship({ go }: { go: Go }) {
  const p = useProfile();
  const c = p.championship;
  const [tab, setTab] = useState<'table' | 'fixtures'>('table');

  if (!c) {
    return (
      <div className="screen">
        <TopBar title="Nations" accent="Championship" onBack={() => go({ name: 'menu' })} />
        <p className="muted italic" style={{ margin: 0 }}>Six nations, five rounds, one trophy. Pick your team.</p>
        <div className="nation-grid">
          {CHAMPIONSHIP_NATIONS.map((id) => (
            <button
              key={id}
              className="nation-btn"
              style={{ minHeight: 70 }}
              onClick={() => {
                audio.click();
                update((x) => (x.championship = createChampionship(id)));
              }}
            >
              <TeamLogo id={id} size={44} />
              <span>
                <b>{nationById(id).name}</b>
                <small>OVR {nationOvr(id)}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const next = championshipUserFixture(c);
  const play = () => {
    if (!next) return;
    audio.click();
    const userHome = next.home === c.user;
    const cfg = buildMatch(nationTeam(c.user), nationTeam(userHome ? next.away : next.home), userHome, p);
    const fid = next.id;
    go({ name: 'match', cfg, back: { name: 'championship' }, onFinish: (r) => finishChampionship(cfg, fid, r) });
  };

  if (c.finished) {
    const won = c.champion === c.user;
    return (
      <div className="screen" style={{ alignItems: 'center' }}>
        <TopBar title="Nations" accent="Championship" onBack={() => go({ name: 'menu' })} />
        <div className="row" style={{ flex: 1, minHeight: 0, width: '100%', alignItems: 'stretch' }}>
          <div className="card" style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <div className="trophy">🏆</div>
            <h2>{won ? 'Champions!' : `${nationById(c.champion!).name} win`}</h2>
            <p className="muted">{won ? 'The trophy is yours.' : 'Better luck next time.'}</p>
            <button className="btn primary" onClick={() => update((x) => (x.championship = null))}>
              New championship
            </button>
          </div>
          <div className="card scroll" style={{ flex: 1.2 }}>
            <StandingsTable teams={c.teams} fixtures={c.fixtures} user={c.user} />
          </div>
        </div>
      </div>
    );
  }

  const roundFixtures = c.fixtures.filter((f) => f.stage === `R${c.round}`);
  return (
    <div className="screen">
      <TopBar
        title="Nations"
        accent={`Round ${c.round}/5`}
        onBack={() => go({ name: 'menu' })}
        right={
          <button className="btn ghost" onClick={() => confirm('Abandon this championship?') && update((x) => (x.championship = null))}>
            Quit
          </button>
        }
      />
      <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 1.2, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="tabs">
            <button className={`tab ${tab === 'table' ? 'on' : ''}`} onClick={() => setTab('table')}>
              Table
            </button>
            <button className={`tab ${tab === 'fixtures' ? 'on' : ''}`} onClick={() => setTab('fixtures')}>
              Fixtures
            </button>
          </div>
          <div className="scroll" style={{ marginTop: 8 }}>
            {tab === 'table' ? (
              <StandingsTable teams={c.teams} fixtures={c.fixtures} user={c.user} />
            ) : (
              [1, 2, 3, 4, 5].map((r) => (
                <div key={r} style={{ marginBottom: 8 }}>
                  <div className="muted italic" style={{ fontSize: 12 }}>ROUND {r}</div>
                  {c.fixtures.filter((f) => f.stage === `R${r}`).map((f) => (
                    <FixtureRow key={f.id} f={f} user={c.user} />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3>This round</h3>
          {roundFixtures.map((f) => (
            <FixtureRow key={f.id} f={f} user={c.user} />
          ))}
          <button className="btn primary" style={{ marginTop: 'auto', minHeight: 54, fontSize: 19 }} onClick={play} disabled={!next}>
            Play {next ? `vs ${nationById(next.home === c.user ? next.away : next.home).short}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
