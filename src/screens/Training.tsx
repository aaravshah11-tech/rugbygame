import type { Go } from '../App';
import { TopBar } from '../ui/common';
import { useProfile } from '../state/store';
import { buildMatch, nationTeam } from '../state/teams';
import { finishDrill } from '../state/outcomes';
import type { Drill } from '../game/types';
import { audio } from '../util/audio';

const DRILLS: { id: Drill; name: string; desc: string; tips: string[]; accent: string }[] = [
  {
    id: 'passing',
    name: 'Passing',
    desc: 'Move the ball along the line. 10 completed passes.',
    tips: ['◀ PASS / PASS ▶ pass that way', 'Hold PASS for a long / skip pass', 'Swipe left/right on the right half for a quick pass', 'Passes must not go forward!'],
    accent: 'var(--neon)',
  },
  {
    id: 'tackling',
    name: 'Tackling',
    desc: 'Stop five attacking raids.',
    tips: ['Hold TACKLE to chase the carrier; tap it when you are close', 'DIVE reaches further but you hit the deck if you miss', 'SWITCH jumps to the defender nearest the ball', 'Hold SPRINT to close the gap'],
    accent: 'var(--pink)',
  },
  {
    id: 'kicking',
    name: 'Kicking',
    desc: 'Five place kicks from around the 22.',
    tips: ['Swipe from the ball to the posts to kick', 'Swipe direction aims; swipe speed is power', 'Curve your swipe to bend the ball against the wind', 'In open play: hold KICK, slide to aim, swipe up fast'],
    accent: 'var(--gold)',
  },
  {
    id: 'setpieces',
    name: 'Set Pieces',
    desc: 'Scrum, lineout, ruck and maul timing.',
    tips: ['Scrum: swipe UP on SET, then swipe UP fast to win the push', 'Lineout: pick a jumper, then tap or swipe in the green', 'Defending a lineout: guess where they will throw', 'Maul: swipe UP each time the arrow fills'],
    accent: 'var(--cyan)',
  },
];

export function Training({ go }: { go: Go }) {
  const p = useProfile();
  const start = (d: Drill) => {
    audio.click();
    const cfg = buildMatch(nationTeam('ENG'), nationTeam('FRA'), true, p, d);
    go({ name: 'match', cfg, back: { name: 'training' }, onDrillDone: (s, t) => finishDrill(d, s, t) });
  };
  return (
    <div className="screen">
      <TopBar title="Training" accent="Ground" onBack={() => go({ name: 'settings' })} />
      <div className="scroll">
        <div className="nation-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {DRILLS.map((d) => (
            <button key={d.id} className="tile" style={{ '--accent': d.accent, minHeight: 170, justifyContent: 'flex-start' } as React.CSSProperties} onClick={() => start(d.id)}>
              <span className="tag">{p.trainingDone[d.id] ? 'Completed ✓' : '+300 first clear'}</span>
              <h3>{d.name}</h3>
              <p>{d.desc}</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12, color: '#cfd6e3', fontFamily: 'system-ui, sans-serif', fontStyle: 'normal' }}>
                {d.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
