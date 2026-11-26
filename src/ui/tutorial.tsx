import { useEffect, useMemo, useState } from 'react';
import { MATCH_TIPS, TUT_STEPS, type Gesture, type TipId } from '../tutorial/steps';
import { audio } from '../util/audio';

export interface TutState {
  step: number;
  task: number;
  stepDone: boolean;
  finished: boolean;
}

/** Find the on-screen rect a gesture points at. */
function targetRect(g: Gesture): DOMRect | null {
  const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
  if (g.kind === 'tap' || g.kind === 'hold' || g.kind === 'mash') {
    const el = q(`.abtn[data-k="${g.target}"]:not(.ctx-hidden)`) ?? (g.target.startsWith('pass') ? q('.abtn[data-k^="pass"]') : null);
    return el ? el.getBoundingClientRect() : null;
  }
  if (g.kind === 'joystick') {
    const el = q('.joy-base');
    return el ? el.getBoundingClientRect() : null;
  }
  return null;
}

/** A ghost finger demonstrating the gesture: tap, hold, drag the stick, or swipe. */
function GhostFinger({ g }: { g: Gesture }) {
  const [pos, setPos] = useState<{ x0: number; y0: number; x1: number; y1: number; anim: string } | null>(null);
  useEffect(() => {
    const measure = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (g.kind === 'none') return setPos(null);
      if (g.kind === 'kick-swipe') {
        // KICK not tapped yet: point at it; once the swipe layer is up, show the swipe
        const layer = document.querySelector('.kick-swipe');
        if (!layer) {
          const r = document.querySelector('.abtn[data-k="kick"]')?.getBoundingClientRect();
          return setPos(r ? { x0: r.x + r.width / 2, y0: r.y + r.height / 2, x1: 0, y1: 0, anim: 'tap' } : null);
        }
        const len = g.size === 'small' ? 0.08 : g.size === 'medium' ? 0.19 : 0.42;
        return setPos({ x0: W * 0.5, y0: H * 0.78, x1: W * 0.5, y1: H * (0.78 - len), anim: 'swipe' });
      }
      if (g.kind === 'conversion') return setPos({ x0: W * 0.5, y0: H * 0.8, x1: W * 0.52, y1: H * 0.36, anim: 'swipe' });
      if (g.kind === 'swipe-up') return setPos({ x0: W * 0.72, y0: H * 0.7, x1: W * 0.72, y1: H * 0.45, anim: 'swipe' });
      const r = targetRect(g);
      if (!r) return setPos(null);
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (g.kind === 'joystick') return setPos({ x0: cx, y0: cy, x1: cx + 34, y1: cy - 42, anim: 'drag' });
      setPos({ x0: cx, y0: cy, x1: cx, y1: cy, anim: g.kind === 'hold' ? 'hold' : g.kind === 'mash' ? 'mash' : 'tap' });
    };
    measure();
    const t = setInterval(measure, 400);
    return () => clearInterval(t);
  }, [g]);
  if (!pos) return null;
  return (
    <div
      className={`ghost-finger gf-${pos.anim}`}
      style={{ '--x0': `${pos.x0}px`, '--y0': `${pos.y0}px`, '--x1': `${pos.x1}px`, '--y1': `${pos.y1}px` } as React.CSSProperties}
      aria-hidden
    >
      <svg viewBox="0 0 40 52" width="40" height="52">
        <path
          d="M15 4 a4 4 0 0 1 8 0 V22 l2-1 a4 4 0 0 1 6 2 l1 1 a4 4 0 0 1 6 3 V36 c0 8-6 14-14 14 h-2 c-6 0-10-3-13-8 L2 30 a4 4 0 0 1 6-5 l7 6 Z"
          fill="#fff"
          stroke="#111"
          strokeWidth="2"
        />
      </svg>
      <i className="gf-ring" />
    </div>
  );
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.6 + Math.random() * 1.4,
        color: ['#c6ff1a', '#ff3d7f', '#2ee6ff', '#ffcf3a', '#ffffff'][i % 5],
        rot: Math.random() * 360,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: b.color, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  );
}

/**
 * Tutorial HUD: progress bar, the current instruction, glowing buttons, a ghost finger, skip with
 * "are you sure?", a big tick when a step is done and confetti for the first try.
 */
export function TutorialOverlay({ s, onSkipStep, onSkipAll, onMiniMatch }: { s: TutState; onSkipStep: () => void; onSkipAll: () => void; onMiniMatch: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const step = TUT_STEPS[s.step];
  const task = step?.tasks[Math.min(s.task, step.tasks.length - 1)];
  const glow = !s.stepDone && task?.glow ? task.glow.join(' ') : '';
  useEffect(() => {
    document.documentElement.dataset.tutGlow = glow;
    return () => void delete document.documentElement.dataset.tutGlow;
  }, [glow]);
  useEffect(() => {
    if (s.stepDone) audio.coin();
  }, [s.stepDone, s.step]);
  if (!step) return null;
  const last = s.finished;
  return (
    <div className="tut">
      <div className="tut-progress">
        {TUT_STEPS.map((x, i) => (
          <i key={x.id} className={i < s.step || (i === s.step && s.stepDone) ? 'done' : i === s.step ? 'cur' : ''} />
        ))}
      </div>
      {!last && (
        <div className={`tut-card ${s.stepDone ? 'done' : ''}`}>
          <div className="tut-head">
            <small>
              Step {s.step + 1} / {TUT_STEPS.length}
              {step.tasks.length > 1 && !s.stepDone ? ` · ${Math.min(s.task + 1, step.tasks.length)} of ${step.tasks.length}` : ''}
            </small>
            <b>{step.title}</b>
            <button className="tut-skip" onClick={() => (audio.click(), setConfirm(true))}>
              Skip
            </button>
          </div>
          <p className="tut-text" key={`${s.step}-${s.task}-${s.stepDone}`}>
            {s.stepDone ? '✓ Step complete!' : task?.text}
          </p>
        </div>
      )}
      {!last && !s.stepDone && task && <GhostFinger key={`${s.step}-${s.task}`} g={task.gesture} />}
      {s.stepDone && <div className="tut-tick">✓</div>}
      {s.stepDone && step.id === 'try' && <Confetti />}
      {last && (
        <div className="sheet">
          <div className="card" style={{ textAlign: 'center', maxWidth: 460 }}>
            <small className="muted">Step {TUT_STEPS.length} / {TUT_STEPS.length}</small>
            <h2>Mini match</h2>
            <p>{TUT_STEPS[TUT_STEPS.length - 1].tasks[0].text}</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => (audio.click(), onMiniMatch())}>
                Kick off
              </button>
              <button className="btn ghost" onClick={() => (audio.click(), onSkipAll())}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
      {confirm && (
        <div className="sheet" onClick={() => setConfirm(false)}>
          <div className="card" style={{ textAlign: 'center', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h2>Are you sure?</h2>
            <p className="muted">You can replay the tutorial any time from Settings or Training.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => (audio.click(), setConfirm(false), onSkipStep())}>
                Skip this step
              </button>
              <button className="btn danger" onClick={() => (audio.click(), setConfirm(false), onSkipAll())}>
                Skip tutorial
              </button>
              <button className="btn primary" onClick={() => (audio.click(), setConfirm(false))}>
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A small dismissible hint the first time something happens in a match. */
export function MatchTip({ id, onClose }: { id: TipId; onClose: () => void }) {
  const tip = MATCH_TIPS[id];
  useEffect(() => {
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="match-tip" role="status">
      <b>TIP · {tip.title}</b>
      <span>{tip.text}</span>
      <button aria-label="Dismiss tip" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
