import { Seg } from './common';
import type { AttackStyle, DefenceStyle, KickStyle, Tactics } from '../state/types';

/** Attack / defence / kicking style pickers, used pre-match, in Settings and in the pause menu. */
export function TacticsPanel({ value, onChange }: { value: Tactics; onChange: (t: Tactics) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Attack</div>
        <Seg<AttackStyle>
          value={value.attack}
          options={[{ v: 'forwards', label: 'Forwards' }, { v: 'balanced', label: 'Balanced' }, { v: 'expansive', label: 'Expansive' }]}
          onChange={(v) => onChange({ ...value, attack: v })}
        />
      </div>
      <div>
        <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Defence</div>
        <Seg<DefenceStyle>
          value={value.defence}
          options={[{ v: 'drift', label: 'Drift' }, { v: 'balanced', label: 'Balanced' }, { v: 'blitz', label: 'Blitz' }]}
          onChange={(v) => onChange({ ...value, defence: v })}
        />
      </div>
      <div>
        <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Kicking</div>
        <Seg<KickStyle>
          value={value.kicking}
          options={[{ v: 'low', label: 'Low' }, { v: 'balanced', label: 'Balanced' }, { v: 'territory', label: 'Territory' }]}
          onChange={(v) => onChange({ ...value, kicking: v })}
        />
      </div>
      <div className="tac-sliders">
        <Slider label="Back-line depth" lo="Flat" hi="Deep" value={value.depth ?? 1} onChange={(v) => onChange({ ...value, depth: v })} />
        <Slider label="Width" lo="Tight" hi="Wide" value={value.width ?? 1} onChange={(v) => onChange({ ...value, width: v })} />
        <Slider label="Defensive line speed" lo="Sit" hi="Rush" value={value.lineSpeed ?? 1} onChange={(v) => onChange({ ...value, lineSpeed: v })} />
        <label>
          <div className="muted italic" style={{ fontSize: 12 }}>Players in each ruck: {value.ruckCommit ?? 2}</div>
          <input type="range" min={1} max={3} step={1} value={value.ruckCommit ?? 2} onChange={(e) => onChange({ ...value, ruckCommit: +e.target.value })} />
        </label>
      </div>
    </div>
  );
}

function Slider({ label, lo, hi, value, onChange }: { label: string; lo: string; hi: string; value: number; onChange: (v: number) => void }) {
  return (
    <label>
      <div className="muted italic" style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span>
          {lo} ↔ {hi}
        </span>
      </div>
      <input type="range" min={0.6} max={1.4} step={0.05} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}
