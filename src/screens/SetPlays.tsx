import type { Go } from '../App';
import { TopBar } from '../ui/common';
import { BUILTIN_DIAGRAMS, CustomPlaysEditor, customDiagram, PlayDiagram } from '../ui/setplays';
import { update, useProfile } from '../state/store';
import { buildMatch, nationTeam } from '../state/teams';
import { audio } from '../util/audio';

/** The built-in moves (ids match the engine's set plays). */
export const PLAYBOOK: { id: string; name: string; desc: string; when: string }[] = [
  { id: 'crash', name: 'Crash Ball', desc: 'Your inside centre runs a hard line straight off the fly-half to win the gain line.', when: 'Close to their line, or to suck defenders in for the next phase.' },
  { id: 'loop', name: 'Loop Play', desc: 'Fly-half passes to 12 and loops round him for the return pass: an overlap out wide.', when: 'When their defence drifts and stands off.' },
  { id: 'miss', name: 'Skip Wide', desc: 'A long pass misses the inside centre and finds 13, with the winger hugging the touchline.', when: 'Lots of space on the open side.' },
  { id: 'switch', name: 'Switch Play', desc: 'The outside centre cuts back against the grain for an inside ball.', when: 'When they rush up and over-commit wide.' },
  { id: 'upandunder', name: 'Up & Under', desc: 'A high hanging kick from 10 with the back three chasing to win it back.', when: 'Wet days and when their full-back is under pressure.' },
];

/**
 * Set Plays: the playbook with animated diagrams, star your favourites (they come first in the
 * match MOVES strip), design your own, and practise them in a match.
 */
export function SetPlays({ go }: { go: Go }) {
  const p = useProfile();
  const favs = p.settings.favPlays ?? [];
  const custom = p.settings.customPlays ?? [];
  const toggleFav = (id: string) => {
    audio.click();
    update((q) => {
      const f = q.settings.favPlays ?? [];
      q.settings.favPlays = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    });
  };
  const practise = () => {
    audio.click();
    const cfg = buildMatch(nationTeam(p.lastQuick?.home ?? 'ENG'), nationTeam('ITA'), true, p);
    go({ name: 'match', cfg: { ...cfg, difficulty: 'easy', competition: 'training' }, back: { name: 'setplays' } });
  };
  return (
    <div className="screen">
      <TopBar title="Set" accent="Plays" onBack={() => go({ name: 'menu' })} />
      <div className="scroll">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <p className="muted" style={{ margin: 0, maxWidth: 520 }}>
            Call a move from the <b>MOVES</b> strip or the <b>SET PLAYS</b> button when you're attacking after a ruck. Star the ones you use most and they come first.
          </p>
          <button className="btn primary" onClick={practise}>
            Practise in a match
          </button>
        </div>
        <h2 className="section-title">Playbook</h2>
        <div className="playbook">
          {PLAYBOOK.map((pl) => (
            <div key={pl.id} className={`play-card ${favs.includes(pl.id) ? 'fav' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>{pl.name}</h3>
                <button className="btn ghost" aria-label={favs.includes(pl.id) ? 'Unstar' : 'Star'} onClick={() => toggleFav(pl.id)}>
                  {favs.includes(pl.id) ? '★' : '☆'}
                </button>
              </div>
              <PlayDiagram d={BUILTIN_DIAGRAMS[pl.id]} w={230} />
              <p>{pl.desc}</p>
              <p style={{ color: 'var(--neon)' }}>Use it: {pl.when}</p>
            </div>
          ))}
          {custom.map((c) => (
            <div key={c.id} className={`play-card ${favs.includes('custom:' + c.id) ? 'fav' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>{c.name}</h3>
                <button className="btn ghost" aria-label="Star" onClick={() => toggleFav('custom:' + c.id)}>
                  {favs.includes('custom:' + c.id) ? '★' : '☆'}
                </button>
              </div>
              <PlayDiagram d={customDiagram(c)} w={230} />
              <p>Your play: passes {c.steps.map((s) => s.num).join(' → ')}</p>
            </div>
          ))}
        </div>
        <h2 className="section-title" style={{ marginTop: 16 }}>
          Design your own <small className="muted">up to 6 · drag runners, tap passers in order</small>
        </h2>
        <CustomPlaysEditor plays={custom} onChange={(pl) => update((q) => (q.settings.customPlays = pl))} />
      </div>
    </div>
  );
}
