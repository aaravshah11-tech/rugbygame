import { useState } from 'react';
import { TeamLogo } from '../ui/logos';
import type { Go } from '../App';
import { CLUBS, NATIONS, nationById } from '../data/nations';
import { Seg, TopBar } from '../ui/common';
import { update, useProfile } from '../state/store';
import { buildMatch, nationTeam } from '../state/teams';
import { nationOvr, simulateScore } from '../state/tournaments';
import { finishQuick } from '../state/outcomes';
import type { Difficulty, HalfLength, Weather } from '../state/types';
import { TacticsPanel } from '../ui/tactics';
import { audio } from '../util/audio';

export function QuickMatch({ go }: { go: Go }) {
  const p = useProfile();
  const [home, setHome] = useState(p.lastQuick?.home ?? 'ENG');
  const [away, setAway] = useState(p.lastQuick?.away ?? 'NZL');
  const [picking, setPicking] = useState<'home' | 'away'>('home');

  const pick = (id: string) => {
    audio.click();
    if (picking === 'home') {
      if (id === away) setAway(home);
      setHome(id);
      setPicking('away');
    } else {
      if (id === home) setHome(away);
      setAway(id);
      setPicking('home');
    }
  };

  const start = () => {
    audio.click();
    update((x) => (x.lastQuick = { home, away }));
    const cfg = buildMatch(nationTeam(home), nationTeam(away), true, p);
    go({ name: 'match', cfg, back: { name: 'quick' }, onFinish: (r) => finishQuick(cfg, r) });
  };

  const [simMsg, setSimMsg] = useState('');
  const simulate = () => {
    audio.click();
    const cfg = buildMatch(nationTeam(home), nationTeam(away), true, p);
    const sc = simulateScore(nationOvr(home), nationOvr(away));
    const out = finishQuick(cfg, {
      userScore: sc.homeScore, cpuScore: sc.awayScore, userTries: sc.homeTries, cpuTries: sc.awayTries,
      user: { tries: 0, tackles: 0, conversions: 0, passes: 0, penalties: 0, dropGoals: 0 },
    });
    setSimMsg(`${out.title} ${nationById(home).short} ${sc.homeScore} – ${sc.awayScore} ${nationById(away).short}${out.coins ? ` · +${out.coins} coins` : ''}`);
  };

  const H = nationById(home);
  const A = nationById(away);

  return (
    <div className="screen">
      <TopBar title="Quick" accent="Match" onBack={() => go({ name: 'menu' })} />
      <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        <div className="scroll" style={{ flex: 1.4 }}>
          <p className="muted italic" style={{ margin: '0 0 8px' }}>
            Tap to choose {picking === 'home' ? <b style={{ color: 'var(--neon)' }}>YOUR TEAM</b> : <b style={{ color: 'var(--pink)' }}>OPPONENT</b>}
          </p>
          {[
            { label: 'Nations', list: NATIONS },
            { label: 'Clubs', list: CLUBS },
          ].map((group) => (
            <div key={group.label} style={{ marginBottom: 10 }}>
              <div className="muted italic" style={{ fontSize: 12, margin: '2px 0 6px' }}>{group.label.toUpperCase()}</div>
              <div className="nation-grid">
                {group.list.map((n) => (
                  <button key={n.id} className={`nation-btn ${n.id === home ? 'sel' : n.id === away ? 'sel2' : ''}`} onClick={() => pick(n.id)}>
                    <TeamLogo id={n.id} />
                    <span>
                      <b>{n.name}</b>
                      <small>OVR {nationOvr(n.id)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260, minHeight: 0 }}>
          <div className="row qm-teams" style={{ justifyContent: 'space-around' }}>
            <button className="nation-btn sel" onClick={() => setPicking('home')}>
              <TeamLogo id={H.id} size={46} />
              <b>{H.short}</b>
            </button>
            <h2 style={{ color: 'var(--muted)' }}>VS</h2>
            <button className="nation-btn sel2" onClick={() => setPicking('away')}>
              <TeamLogo id={A.id} size={46} />
              <b>{A.short}</b>
            </button>
          </div>
          {/* options scroll on short screens; Kick off stays pinned below */}
          <div className="scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Half length</div>
              <Seg<HalfLength>
                value={p.settings.halfLength}
                options={[{ v: 3, label: '3 min' }, { v: 5, label: '5 min' }, { v: 8, label: '8 min' }]}
                onChange={(v) => update((x) => (x.settings.halfLength = v))}
              />
            </div>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Difficulty</div>
              <Seg<Difficulty>
                value={p.settings.difficulty}
                options={[{ v: 'easy', label: 'Easy' }, { v: 'medium', label: 'Med' }, { v: 'hard', label: 'Hard' }, { v: 'elite', label: 'Elite' }]}
                onChange={(v) => update((x) => (x.settings.difficulty = v))}
              />
            </div>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Weather</div>
              <Seg<Weather>
                value={p.settings.weather}
                options={[{ v: 'dry', label: 'Dry' }, { v: 'rain', label: 'Rain' }]}
                onChange={(v) => update((x) => (x.settings.weather = v))}
              />
            </div>
            <details className="tactics-drawer">
              <summary>Tactics</summary>
              <TacticsPanel value={p.settings.tactics} onChange={(t) => update((x) => (x.settings.tactics = t))} />
            </details>
            {simMsg && <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>{simMsg}</div>}
          </div>
          <div className="row" style={{ marginTop: 'auto', gap: 8 }}>
            <button className="btn ghost" style={{ minHeight: 54, whiteSpace: 'nowrap' }} onClick={simulate}>
              Simulate
            </button>
            <button className="btn primary grow" style={{ minHeight: 54, fontSize: 20, whiteSpace: 'nowrap' }} onClick={start}>
              Kick off
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
