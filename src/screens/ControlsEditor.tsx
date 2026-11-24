import { useEffect, useState } from 'react';
import type { Go } from '../App';
import { Seg, TopBar } from '../ui/common';
import { update, useProfile } from '../state/store';
import { createInput } from '../game/types';
import { ActionButtons, setControlLayout, setLayoutEditing, type ControlLayout } from '../ui/controls';

/** Move and resize the in-match buttons. Drag a button; tap one and use the slider to size it. */
export function ControlsEditor({ go }: { go: Go }) {
  const p = useProfile();
  const [map, setMap] = useState<ControlLayout>(p.settings.controlLayout ?? {});
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<'attack' | 'defence' | 'base'>('attack');
  const [input] = useState(createInput);
  // edit mode must be on before the buttons render
  setControlLayout(map);
  setLayoutEditing({ selected: sel, onChange: (m, k) => (setMap(m), setSel(k)) });
  useEffect(() => () => setLayoutEditing(null), []);
  const save = () => {
    update((x) => (x.settings.controlLayout = map));
    setLayoutEditing(null);
    go({ name: 'settings' });
  };
  const cur = sel ? map[sel] ?? { dx: 0, dy: 0, s: 1 } : null;
  return (
    <div className="screen controls-editor">
      <TopBar title="Control" accent="Layout" onBack={save} />
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Seg<'attack' | 'defence' | 'base'>
          value={mode}
          options={[{ v: 'attack', label: 'Attack' }, { v: 'base', label: 'At the ruck (9)' }, { v: 'defence', label: 'Defence' }]}
          onChange={setMode}
        />
        {cur && sel && (
          <label style={{ minWidth: 200 }}>
            <div className="muted italic" style={{ fontSize: 12 }}>Size {Math.round(cur.s * 100)}%</div>
            <input type="range" min={0.7} max={1.5} step={0.05} value={cur.s} onChange={(e) => setMap({ ...map, [sel]: { ...cur, s: +e.target.value } })} />
          </label>
        )}
        <button className="btn ghost" onClick={() => (setMap({}), setSel(null))}>
          Reset
        </button>
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>Drag any button to move it. Tap a button, then use the slider to resize it.</div>
      <div className="controls-stage">
        <ActionButtons key={mode} input={input} attacking={mode !== 'defence'} ruck={null} atBase={mode === 'base'} canDrop nearDef />
      </div>
    </div>
  );
}
