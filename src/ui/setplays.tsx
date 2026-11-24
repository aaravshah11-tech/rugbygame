import { useState } from 'react';
import type { CustomPlay } from '../state/types';
import { uid } from '../util/rng';

const RUNNERS: { num: number; label: string }[] = [
  { num: 10, label: '10 Fly-half' },
  { num: 12, label: '12 Inside centre' },
  { num: 13, label: '13 Outside centre' },
  { num: 15, label: '15 Fullback' },
  { num: 11, label: '11 Left wing' },
  { num: 14, label: '14 Right wing' },
  { num: 8, label: '8 Number 8' },
  { num: 7, label: '7 Openside' },
];
const LINES: { id: CustomPlay['steps'][number]['line']; label: string; desc: string }[] = [
  { id: 'crash', label: 'Crash', desc: 'hard line straight up' },
  { id: 'out', label: 'Out-ball', desc: 'arcs wide of you' },
  { id: 'switch', label: 'Switch', desc: 'cuts back inside' },
  { id: 'loop', label: 'Loop', desc: 'round the last receiver' },
  { id: 'wide', label: 'Wide', desc: 'hugs the touchline' },
];

/** Build up to six of your own set plays: up to three passes, each to a runner on a chosen line. */
export function CustomPlaysEditor({ plays, onChange }: { plays: CustomPlay[]; onChange: (p: CustomPlay[]) => void }) {
  const [draft, setDraft] = useState<CustomPlay | null>(null);
  if (draft) {
    const setStep = (i: number, patch: Partial<CustomPlay['steps'][number]>) =>
      setDraft({ ...draft, steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
    return (
      <div className="play-editor">
        <input value={draft.name} maxLength={18} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Play name" />
        {draft.steps.map((st, i) => (
          <div key={i} className="play-step">
            <div className="muted italic" style={{ fontSize: 12 }}>Pass {i + 1} to</div>
            <select value={st.num} onChange={(e) => setStep(i, { num: +e.target.value })}>
              {RUNNERS.map((r) => (
                <option key={r.num} value={r.num}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="play-lines">
              {LINES.map((l) => (
                <button key={l.id} className={st.line === l.id ? 'on' : ''} onClick={() => setStep(i, { line: l.id })} title={l.desc}>
                  {l.label}
                </button>
              ))}
            </div>
            {draft.steps.length > 1 && (
              <button className="btn ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}>
                Remove
              </button>
            )}
          </div>
        ))}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {draft.steps.length < 3 && (
            <button className="btn ghost" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { num: 13, line: 'out' }] })}>
              + Add pass
            </button>
          )}
          <button
            className="btn primary"
            disabled={!draft.name.trim()}
            onClick={() => {
              const rest = plays.filter((p) => p.id !== draft.id);
              onChange([...rest, { ...draft, name: draft.name.trim() }].slice(-6));
              setDraft(null);
            }}
          >
            Save play
          </button>
          <button className="btn ghost" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="play-editor">
      {plays.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No plays yet. Make one: pick who gets each pass and the line they run.</div>}
      {plays.map((p) => (
        <div key={p.id} className="play-row">
          <b>{p.name}</b>
          <small>{p.steps.map((s) => `${s.num} ${s.line}`).join(' → ')}</small>
          <button className="btn ghost" onClick={() => setDraft(p)}>
            Edit
          </button>
          <button className="btn ghost" onClick={() => onChange(plays.filter((x) => x.id !== p.id))}>
            ✕
          </button>
        </div>
      ))}
      {plays.length < 6 && (
        <button className="btn cyan" onClick={() => setDraft({ id: uid(), name: '', steps: [{ num: 12, line: 'crash' }] })}>
          + New set play
        </button>
      )}
    </div>
  );
}
