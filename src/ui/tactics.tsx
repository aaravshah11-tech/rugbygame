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
    </div>
  );
}
