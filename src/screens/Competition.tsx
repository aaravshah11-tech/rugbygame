import { useState } from 'react';
import { TeamLogo } from '../ui/logos';
import type { Go } from '../App';
import { nationById } from '../data/nations';
import { TopBar } from '../ui/common';
import { update, useProfile } from '../state/store';
import { buildMatch, nationTeam, occasion } from '../state/teams';
import { nationOvr, simulateScore } from '../state/tournaments';
import { COMP_INFO, compUserFixture, createComp, finishComp, type CompKind } from '../state/comps';
import { finishCompMatch } from '../state/outcomes';
import { FixtureRow, StandingsTable } from './Championship';
import { audio } from '../util/audio';

const STAGE_LABEL: Record<string, string> = { SF: 'SEMI-FINALS', Final: 'FINAL', FW: 'FINALS WEEKEND (2nd v 2nd … 6th v 6th)' };

/** Nations Championship, Nations League and The Prem share this screen. */
export function Competition({ go, kind }: { go: Go; kind: CompKind }) {
  const p = useProfile();
  const c = p.comps[kind] ?? null;
  const info = COMP_INFO[kind];
  const [tab, setTab] = useState<string>('table0');
  const [simMsg, setSimMsg] = useState('');

  if (!c) {
    return (
      <div className="screen">
        <TopBar title={info.title} accent={info.accent} onBack={() => go({ name: 'menu' })} />
        <p className="muted italic" style={{ margin: 0 }}>{info.blurb} Pick your team.</p>
        <div className="scroll">
          <div className="nation-grid">
            {info.teams.map((id) => (
              <button
                key={id}
                className="nation-btn"
                onClick={() => {
                  audio.click();
                  update((x) => (x.comps[kind] = createComp(kind, id)));
                }}
              >
                <TeamLogo id={id} />
                <span>
                  <b>{nationById(id).name}</b>
                  <small>OVR {nationOvr(id)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const next = compUserFixture(c);
  const play = () => {
    if (!next) return;
    audio.click();
    const userHome = next.home === c.user;
    const cfg = buildMatch(nationTeam(c.user), nationTeam(userHome ? next.away : next.home), userHome, p);
    cfg.competition = kind;
    Object.assign(cfg, occasion(next.stage));
    const fid = next.id;
    go({ name: 'match', cfg, back: { name: 'comp', kind }, onFinish: (r) => finishCompMatch(cfg, kind, fid, r) });
  };

  const simulate = () => {
    if (!next) return;
    audio.click();
    const userHome = next.home === c.user;
    const cfg = buildMatch(nationTeam(c.user), nationTeam(userHome ? next.away : next.home), userHome, p);
    const sc = simulateScore(nationOvr(next.home), nationOvr(next.away), !next.stage.startsWith('R'));
    const us = userHome ? sc.homeScore : sc.awayScore;
    const them = userHome ? sc.awayScore : sc.homeScore;
    const out = finishCompMatch(cfg, kind, next.id, {
      userScore: us, cpuScore: them, userTries: userHome ? sc.homeTries : sc.awayTries, cpuTries: userHome ? sc.awayTries : sc.homeTries,
      user: { tries: 0, tackles: 0, conversions: 0, passes: 0, penalties: 0, dropGoals: 0 },
    });
    setSimMsg(`${nationById(c.user).name} ${us} – ${them} ${nationById(userHome ? next.away : next.home).name}. ${out.lines.slice(1).join(' ')}`);
  };

  const league = c.fixtures.filter((f) => f.stage.startsWith('R'));
  const knockouts = c.fixtures.filter((f) => !f.stage.startsWith('R'));
  const stageText = c.stage === 'league' ? `Round ${Math.min(c.round, c.rounds)}/${c.rounds}` : c.stage === 'semi' ? 'Semi-finals' : c.stage === 'final' ? 'Final' : 'Complete';
  const tabs = [...c.groups.map((g, i) => ({ id: `table${i}`, label: c.groups.length > 1 ? g.name : 'Table' })), { id: 'fixtures', label: 'Fixtures' }];

  return (
    <div className="screen">
      <TopBar
        title={`${info.title} ${info.accent}`}
        accent={stageText}
        onBack={() => go({ name: 'menu' })}
        right={
          <button className="btn ghost" onClick={() => confirm('Abandon this competition?') && update((x) => (x.comps[kind] = null))}>
            Quit
          </button>
        }
      />
      <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 1.3, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="tabs">
            {tabs.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="scroll" style={{ marginTop: 8 }}>
            {tab === 'fixtures' ? (
              <>
                {knockouts.length > 0 &&
                  ['SF', 'Final', 'FW'].map((st) =>
                    knockouts.some((f) => f.stage === st) ? (
                      <div key={st} style={{ marginBottom: 8 }}>
                        <div className="muted italic" style={{ fontSize: 12 }}>{STAGE_LABEL[st]}</div>
                        {knockouts.filter((f) => f.stage === st).map((f) => (
                          <FixtureRow key={f.id} f={f} user={c.user} />
                        ))}
                      </div>
                    ) : null,
                  )}
                {Array.from({ length: c.rounds }, (_, i) => i + 1).map((r) => (
                  <div key={r} style={{ marginBottom: 8 }}>
                    <div className="muted italic" style={{ fontSize: 12 }}>ROUND {r}</div>
                    {league.filter((f) => f.stage === `R${r}`).map((f) => (
                      <FixtureRow key={f.id} f={f} user={c.user} />
                    ))}
                  </div>
                ))}
              </>
            ) : (
              (() => {
                const g = c.groups[Number(tab.replace('table', '')) || 0];
                const top = kind === 'prem' ? 4 : kind === 'league' ? 1 : 0;
                return <StandingsTable teams={g.teams} fixtures={league} user={c.user} highlightTop={top} />;
              })()
            )}
          </div>
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center', justifyContent: 'center' }}>
          {c.stage === 'done' ? (
            <>
              <div className="trophy">🏆</div>
              <h2>{c.champion === c.user ? 'Champions!' : `${nationById(c.champion!).name} win`}</h2>
              <button className="btn primary" onClick={() => update((x) => (x.comps[kind] = null))}>
                Play again
              </button>
            </>
          ) : c.eliminated ? (
            <>
              <h2>Out</h2>
              <p className="muted">{nationById(c.user).name} are out. See who wins?</p>
              <button className="btn primary" onClick={() => update((x) => x.comps[kind] && finishComp(x.comps[kind]!))}>
                Simulate the rest
              </button>
            </>
          ) : (
            <>
              <TeamLogo id={c.user} size={56} />
              <h3>{nationById(c.user).name}</h3>
              {next && (
                <p className="muted">
                  {next.stage.startsWith('R') ? `Round ${next.stage.slice(1)}` : next.stage === 'SF' ? 'Semi-final' : next.stage === 'FW' ? 'Finals weekend' : 'Final'} ·{' '}
                  {next.home === c.user ? 'Home' : 'Away'} v {nationById(next.home === c.user ? next.away : next.home).name}
                </p>
              )}
              <button className="btn primary" style={{ minHeight: 54, fontSize: 19, width: '100%' }} disabled={!next} onClick={play}>
                Play match
              </button>
              <button className="btn ghost" style={{ width: '100%' }} disabled={!next} onClick={simulate}>
                Simulate result
              </button>
              {simMsg && <div className="muted" style={{ fontSize: 13 }}>{simMsg}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
