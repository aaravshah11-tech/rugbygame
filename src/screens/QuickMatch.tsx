import { useEffect, useRef, useState } from 'react';
import { KitPreviewScene } from '../game/view/kitPreview';
import { stadiumFor } from '../game/stadium/index';
import { nationSquad } from '../data/players';
import { TeamLogo } from '../ui/logos';
import type { Go } from '../App';
import { CLUBS, NATIONS, SCHOOLS, nationById } from '../data/nations';
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

  // swipe on the showcase: next / previous team for the side being picked
  const order = [...NATIONS, ...CLUBS, ...SCHOOLS].map((n) => n.id);
  const swipeTeam = (dir: 1 | -1) => {
    const cur = picking === 'home' ? home : away;
    const other = picking === 'home' ? away : home;
    let i = order.indexOf(cur);
    do i = (i + dir + order.length) % order.length;
    while (order[i] === other);
    if (picking === 'home') setHome(order[i]);
    else setAway(order[i]);
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
            { label: 'Schools', list: SCHOOLS },
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
        <TeamShowcase id={picking === 'home' ? home : away} side={picking} onSwipe={(dir) => swipeTeam(dir)} />
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
          <button className="venue-chip" onClick={() => go({ name: 'stadiums', start: home, back: { name: 'quick' } })}>
            <span>🏟</span> {stadiumFor(home).name} <em>View stadium ›</em>
          </button>
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

const BARS: { label: string; of: (r: Record<string, number>) => number }[] = [
  { label: 'Attack', of: (r) => (r.passing + r.handling) / 2 },
  { label: 'Defence', of: (r) => r.tackling },
  { label: 'Power', of: (r) => r.strength },
  { label: 'Pace', of: (r) => r.pace },
  { label: 'Kicking', of: (r) => r.kicking },
];

/** The team being picked: 3D player in the kit, badge, rating bars. Swipe to change team. */
function TeamShowcase({ id, side, onSwipe }: { id: string; side: 'home' | 'away'; onSwipe: (dir: 1 | -1) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<KitPreviewScene | null>(null);
  const n = nationById(id);
  const accent = side === 'home' ? '#c6ff1a' : '#ff3d6e';
  useEffect(() => {
    const s = new KitPreviewScene(host.current!);
    scene.current = s;
    return () => s.dispose();
  }, []);
  useEffect(() => {
    void scene.current?.showKit(n.kit, accent);
  }, [id, accent]); // eslint-disable-line react-hooks/exhaustive-deps
  const starters = nationSquad(id).starters;
  const avg = (f: (r: Record<string, number>) => number) => Math.round(starters.reduce((a, p) => a + f(p.ratings), 0) / starters.length);
  const down = useRef<number | null>(null);
  return (
    <div
      className={`showcase ${side}`}
      onPointerDown={(e) => (down.current = e.clientX)}
      onPointerUp={(e) => {
        if (down.current === null) return;
        const dx = e.clientX - down.current;
        down.current = null;
        if (Math.abs(dx) > 40) onSwipe(dx < 0 ? 1 : -1);
      }}
    >
      <div ref={host} className="showcase-3d" />
      <div className="showcase-head" key={id}>
        <TeamLogo id={id} size={44} />
        <div>
          <small>{side === 'home' ? 'Your team' : 'Opponent'}</small>
          <b>{n.name}</b>
        </div>
        <span className="showcase-ovr">{nationOvr(id)}</span>
      </div>
      <div className="showcase-bars" key={id + '-bars'}>
        {BARS.map((b, i) => {
          const v = avg(b.of);
          return (
            <div key={b.label} className="sbar">
              <span>{b.label}</span>
              <i>
                <em style={{ width: `${Math.max(4, ((v - 40) / 55) * 100)}%`, animationDelay: `${i * 0.06}s` }} />
              </i>
              <b>{v}</b>
            </div>
          );
        })}
      </div>
      <div className="showcase-swipe">
        <button aria-label="Previous team" onClick={() => onSwipe(-1)}>‹</button>
        <span>swipe</span>
        <button aria-label="Next team" onClick={() => onSwipe(1)}>›</button>
      </div>
    </div>
  );
}
