import { useState } from 'react';
import type { Go } from '../App';
import { NATIONS, nationById } from '../data/nations';
import { KitBadge, Seg, TopBar } from '../ui/common';
import { update, useProfile } from '../state/store';
import { buildMatch, nationTeam } from '../state/teams';
import { nationOvr } from '../state/tournaments';
import { finishQuick } from '../state/outcomes';
import type { Difficulty, HalfLength } from '../state/types';
import { audio } from '../util/audio';

export function QuickMatch({ go }: { go: Go }) {
  const p = useProfile();
  const [home, setHome] = useState('ENG');
  const [away, setAway] = useState('NZL');
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
    const cfg = buildMatch(nationTeam(home), nationTeam(away), true, p);
    go({ name: 'match', cfg, back: { name: 'quick' }, onFinish: (r) => finishQuick(cfg, r) });
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
          <div className="nation-grid">
            {NATIONS.map((n) => (
              <button key={n.id} className={`nation-btn ${n.id === home ? 'sel' : n.id === away ? 'sel2' : ''}`} onClick={() => pick(n.id)}>
                <KitBadge nation={n} />
                <span>
                  <b>{n.name}</b>
                  <small>OVR {nationOvr(n.id)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260 }}>
          <div className="row" style={{ justifyContent: 'space-around' }}>
            <button className="nation-btn sel" style={{ flexDirection: 'column', flex: 1 }} onClick={() => setPicking('home')}>
              <KitBadge nation={H} size={46} />
              <b>{H.short}</b>
            </button>
            <h2 style={{ color: 'var(--muted)' }}>VS</h2>
            <button className="nation-btn sel2" style={{ flexDirection: 'column', flex: 1 }} onClick={() => setPicking('away')}>
              <KitBadge nation={A} size={46} />
              <b>{A.short}</b>
            </button>
          </div>
          <div>
            <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Half length</div>
            <Seg<HalfLength>
              value={p.settings.halfLength}
              options={[{ v: 4, label: '4 min' }, { v: 6, label: '6 min' }, { v: 10, label: '10 min' }]}
              onChange={(v) => update((x) => (x.settings.halfLength = v))}
            />
          </div>
          <div>
            <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Difficulty</div>
            <Seg<Difficulty>
              value={p.settings.difficulty}
              options={[{ v: 'easy', label: 'Easy' }, { v: 'medium', label: 'Medium' }, { v: 'hard', label: 'Hard' }]}
              onChange={(v) => update((x) => (x.settings.difficulty = v))}
            />
          </div>
          <button className="btn primary" style={{ marginTop: 'auto', minHeight: 54, fontSize: 20 }} onClick={start}>
            Kick off
          </button>
        </div>
      </div>
    </div>
  );
}
