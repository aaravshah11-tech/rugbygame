import { useEffect, useRef, useState } from 'react';
import type { Go } from '../App';
import { NATIONS, CLUB_NATION, type Nation } from '../data/nations';
import { KitBadge, TopBar } from '../ui/common';
import { SquadViewerScene } from '../game/view/squadViewer';
import type { AnimName } from '../game/view/assets';
import { audio } from '../util/audio';

const ANIMS: { id: AnimName; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'walk', label: 'Jog' },
  { id: 'run', label: 'Sprint' },
  { id: 'pass', label: 'Pass' },
  { id: 'kick', label: 'Kick' },
  { id: 'tackle', label: 'Tackle' },
  { id: 'dive', label: 'Dive' },
  { id: 'fall', label: 'Fall' },
  { id: 'getup', label: 'Get up' },
  { id: 'celebrate', label: 'Celebrate' },
  { id: 'bind', label: 'Ruck' },
];

/** Debug screen: check every player model, kit and animation before playing. */
export function SquadViewer({ go }: { go: Go }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SquadViewerScene | null>(null);
  const [team, setTeam] = useState<Nation>(NATIONS[0]);
  const [anim, setAnim] = useState<AnimName>('idle');
  const [status, setStatus] = useState('Loading players…');

  useEffect(() => {
    const s = new SquadViewerScene(host.current!, setStatus);
    scene.current = s;
    void s.showTeam(team.kit);
    return () => s.dispose();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen" style={{ padding: 0 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'relative', padding: 'calc(var(--sat) + 10px) calc(var(--sar) + 14px) 0 calc(var(--sal) + 14px)', display: 'flex', flexDirection: 'column', gap: 8, height: '100%', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <TopBar title="Squad" accent="Viewer" onBack={() => go({ name: 'settings' })} />
        </div>
        <div className="tabs" style={{ pointerEvents: 'auto' }}>
          {[...NATIONS, CLUB_NATION].map((n) => (
            <button
              key={n.id}
              className={`tab ${team.id === n.id ? 'on' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => {
                audio.click();
                setTeam(n);
                void scene.current?.showTeam(n.kit);
              }}
            >
              <KitBadge nation={n} size={20} />
              {n.short}
            </button>
          ))}
        </div>
        <div className="muted italic" style={{ fontSize: 12 }}>{status} · back row forwards 1–8, front row backs 9–15</div>
        <div className="tabs" style={{ marginTop: 'auto', marginBottom: 'calc(var(--sab) + 10px)', pointerEvents: 'auto' }}>
          {ANIMS.map((a) => (
            <button
              key={a.id}
              className={`tab ${anim === a.id ? 'on' : ''}`}
              onClick={() => {
                audio.click();
                setAnim(a.id);
                scene.current?.play(a.id);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
