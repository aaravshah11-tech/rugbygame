import { useRef, useState } from 'react';
import type { CustomPlay } from '../state/types';
import { uid } from '../util/rng';

/** Build up to six of your own set plays: up to three passes, each to a runner on a chosen line. */
export function CustomPlaysEditor({ plays, onChange }: { plays: CustomPlay[]; onChange: (p: CustomPlay[]) => void }) {
  const [draft, setDraft] = useState<CustomPlay | null>(null);
  if (draft) {
    return (
      <div className="play-editor full">
        <input value={draft.name} maxLength={18} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Play name" />
        <PitchPlayEditor play={draft} onChange={setDraft} />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>

          <button
            className="btn primary"
            disabled={!draft.name.trim() || draft.steps.length === 0}
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
          <small>{p.runs && p.runs.length ? `passes ${p.steps.map((s) => s.num).join(' → ')} · ${p.runs.length} runs drawn` : p.steps.map((s) => `${s.num} ${s.line}`).join(' → ')}</small>
          <button className="btn ghost" onClick={() => setDraft(p)}>
            Edit
          </button>
          <button className="btn ghost" onClick={() => onChange(plays.filter((x) => x.id !== p.id))}>
            ✕
          </button>
        </div>
      ))}
      {plays.length < 6 && (
        <button className="btn cyan" onClick={() => setDraft({ id: uid(), name: '', steps: [], runs: [] })}>
          + New set play
        </button>
      )}
    </div>
  );
}

/** Where everyone stands just after a breakdown (metres from the ruck: x forward, z towards the open side). */
const START: Record<number, { x: number; z: number }> = {
  9: { x: -2.1, z: 0 },
  10: { x: -6, z: 8 },
  12: { x: -7.5, z: 14 },
  13: { x: -9, z: 20 },
  14: { x: -10, z: 27 },
  15: { x: -16, z: 11 },
  11: { x: -9, z: -13 },
  1: { x: -3.2, z: -3.5 },
  2: { x: -3.2, z: 3.5 },
  3: { x: -4.2, z: -5.2 },
  4: { x: -4.2, z: 5.2 },
  5: { x: -3.6, z: -7 },
  6: { x: -3.6, z: 7 },
  7: { x: -0.6, z: -0.6 },
  8: { x: -0.6, z: 0.6 },
};
const S = 10; // svg units per metre
const toSvg = (p: { x: number; z: number }) => ({ cx: p.z * S, cy: -p.x * S });

/**
 * The line-up after a breakdown on a pitch diagram. Drag a player to where he should run;
 * tap players in order to set who gets each pass (1, 2, 3).
 */
export function PitchPlayEditor({ play, onChange }: { play: CustomPlay; onChange: (p: CustomPlay) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ num: number; moved: boolean; x0: number; y0: number } | null>(null);
  const [, force] = useState(0);
  const runs = new Map((play.runs ?? []).map((r) => [r.num, r]));
  const order = play.steps.map((s) => s.num);
  const toPitch = (e: React.PointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: Math.max(-20, Math.min(18, -pt.y / S)), z: Math.max(-18, Math.min(34, pt.x / S)) };
  };
  const setRun = (num: number, p: { x: number; z: number }) => {
    const rest = (play.runs ?? []).filter((r) => r.num !== num);
    onChange({ ...play, runs: [...rest, { num, dx: +p.x.toFixed(1), dz: +p.z.toFixed(1) }] });
  };
  const togglePass = (num: number) => {
    if (num === 9) return;
    const steps = order.includes(num) ? play.steps.filter((s) => s.num !== num) : play.steps.length < 3 ? [...play.steps, { num, line: 'out' as const }] : play.steps;
    onChange({ ...play, steps });
  };
  return (
    <div className="pitch-editor">
      <svg
        ref={svg}
        viewBox="-200 -190 560 400"
        className="pitch-svg"
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) d.moved = true;
          if (d.moved) setRun(d.num, toPitch(e));
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) togglePass(d.num);
          force((x) => x + 1);
        }}
      >
        {/* pitch: grass stripes, try line ahead, touchline on the open side */}
        <rect x={-200} y={-190} width={560} height={400} fill="#2f6b2a" />
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={-200} y={-190 + i * 50} width={560} height={25} fill="#2a6226" />
        ))}
        <line x1={-200} x2={360} y1={-180} y2={-180} stroke="#fff" strokeWidth={2} opacity={0.8} />
        <text x={-190} y={-184} fill="#fff" fontSize={11} opacity={0.8}>
          ATTACKING →
        </text>
        <line x1={345} x2={345} y1={-190} y2={210} stroke="#fff" strokeWidth={2} opacity={0.7} />
        <text x={250} y={200} fill="#fff" fontSize={11} opacity={0.8}>
          OPEN SIDE
        </text>
        {/* gain line */}
        <line x1={-200} x2={360} y1={0} y2={0} stroke="#fff" strokeDasharray="6 6" opacity={0.35} />
        {/* the ruck */}
        <ellipse cx={0} cy={-2} rx={16} ry={12} fill="#14181f" opacity={0.75} />
        <text x={-12} y={20} fill="#fff" fontSize={10}>
          RUCK
        </text>
        {/* runs */}
        {Object.entries(START).map(([k, st]) => {
          const num = +k;
          const r = runs.get(num);
          if (!r) return null;
          const a = toSvg(st);
          const b = toSvg({ x: r.dx, z: r.dz });
          return <line key={`r${num}`} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke="#c6ff1a" strokeWidth={3} strokeDasharray="8 5" markerEnd="url(#arr)" />;
        })}
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#c6ff1a" />
          </marker>
        </defs>
        {/* players (at their run's end if they have one) */}
        {Object.entries(START).map(([k, st]) => {
          const num = +k;
          const r = runs.get(num);
          const at = toSvg(r ? { x: r.dx, z: r.dz } : st);
          const pass = order.indexOf(num);
          return (
            <g
              key={num}
              transform={`translate(${at.cx} ${at.cy})`}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => {
                (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                drag.current = { num, moved: false, x0: e.clientX, y0: e.clientY };
              }}
            >
              {r && <circle r={14} fill="none" stroke="#c6ff1a" strokeWidth={2} />}
              <circle r={11} fill={num === 9 ? '#21e6c1' : num <= 8 ? '#e9edf3' : '#ffffff'} stroke="#0b0f17" strokeWidth={2} />
              <text y={4} textAnchor="middle" fontSize={11} fontWeight={900} fill="#0b0f17">
                {num}
              </text>
              {pass >= 0 && (
                <g transform="translate(11 -11)">
                  <circle r={8} fill="#ffcf3a" />
                  <text y={4} textAnchor="middle" fontSize={10} fontWeight={900} fill="#0b0f17">
                    {pass + 1}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="muted" style={{ fontSize: 12 }}>
        Drag a player to where he should run. Tap players in order to choose who gets pass 1, 2, 3 (yellow numbers). The 9 starts with the ball.
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn ghost" onClick={() => onChange({ ...play, runs: [] })}>
          Reset runs
        </button>
        <button className="btn ghost" onClick={() => onChange({ ...play, steps: [] })}>
          Clear passes
        </button>
      </div>
    </div>
  );
}
