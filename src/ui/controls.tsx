import { useEffect, useRef, useState } from 'react';
import type { InputState, KickKind } from '../game/types';
import { haptic } from '../util/haptics';

/** Floating virtual joystick: appears wherever the thumb lands in the bottom-left zone. */
export function Joystick({ input }: { input: InputState }) {
  const zone = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pid = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const R = 56;

  const [sprinting, setSprinting] = useState(false);
  const end = () => {
    setSprinting(false);
    input.sprint = false;
    pid.current = null;
    setBase(null);
    setKnob({ x: 0, y: 0 });
    input.moveX = 0;
    input.moveY = 0;
  };

  useEffect(() => end, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={zone}
      className="joy-zone"
      onPointerDown={(e) => {
        if (pid.current !== null) return;
        pid.current = e.pointerId;
        try {
          zone.current!.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        const r = zone.current!.getBoundingClientRect();
        origin.current = { x: e.clientX, y: e.clientY };
        setBase({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pid.current) return;
        let dx = e.clientX - origin.current.x;
        let dy = e.clientY - origin.current.y;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          dx = (dx / d) * R;
          dy = (dy / d) * R;
        }
        setKnob({ x: dx, y: dy });
        input.moveX = dx / R;
        input.moveY = -dy / R;
        const sprint = Math.hypot(dx, dy) > R * 0.9;
        input.sprint = sprint;
        setSprinting(sprint);
      }}
      onPointerUp={(e) => e.pointerId === pid.current && end()}
      onPointerCancel={(e) => e.pointerId === pid.current && end()}
    >
      <div
        className="joy-base"
        style={{
          left: base ? base.x : 'calc(var(--sal) + 100px)',
          top: base ? base.y : 'calc(100% - var(--sab) - 95px)',
          opacity: base ? 1 : 0.5,
        }}
      >
        <div className={`joy-knob ${sprinting ? 'sprint' : ''}`} style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        {base && <div className="joy-hint">{sprinting ? 'SPRINT' : ''}</div>}
      </div>
    </div>
  );
}

type BtnProps = {
  label: string;
  sub?: string;
  size: 'big' | 'med' | 'sm';
  color: string;
  pos: { right: number; bottom: number };
  onDown?: (e: React.PointerEvent) => void;
  onMove?: (e: React.PointerEvent) => void;
  onUp?: (e: React.PointerEvent, cancelled: boolean) => void;
  children?: React.ReactNode;
};

function ActionButton({ label, sub, size, color, pos, onDown, onMove, onUp, children, hidden }: BtnProps & { hidden?: boolean }) {
  const [on, setOn] = useState(false);
  const pid = useRef<number | null>(null);
  return (
    <button
      className={`abtn ${size} c-${color} ${on ? 'on' : ''} ${hidden ? 'ctx-hidden' : ''}`}
      aria-hidden={hidden}
      style={{ right: pos.right, bottom: pos.bottom }}
      onPointerDown={(e) => {
        if (pid.current !== null) return;
        pid.current = e.pointerId;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
        setOn(true);
        haptic('light');
        onDown?.(e);
      }}
      onPointerMove={(e) => e.pointerId === pid.current && onMove?.(e)}
      onPointerUp={(e) => {
        if (e.pointerId !== pid.current) return;
        pid.current = null;
        setOn(false);
        onUp?.(e, false);
      }}
      onPointerCancel={(e) => {
        if (e.pointerId !== pid.current) return;
        pid.current = null;
        setOn(false);
        onUp?.(e, true);
      }}
    >
      {children}
      {label}
      {sub && <small>{sub}</small>}
    </button>
  );
}

// ---------------------------------------------------------------- icons
const Ball = ({ x = 12, y = 12, r = 0 }: { x?: number; y?: number; r?: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${r})`}>
    <ellipse rx="6.5" ry="4.2" fill="currentColor" />
    <path d="M-3 0 H3 M-1.5 -1.2 V1.2 M0 -1.2 V1.2 M1.5 -1.2 V1.2" stroke="var(--btn-bg, #c6ff1a)" strokeWidth="0.9" />
  </g>
);
const PassIcon = ({ dir }: { dir: -1 | 1 }) => (
  <svg viewBox="0 0 48 32" width="44" height="30" aria-hidden>
    <Ball x={dir < 0 ? 33 : 15} y={16} r={dir * -15} />
    <path d={dir < 0 ? 'M24 16 H6 M12 9 L5 16 L12 23' : 'M24 16 H42 M36 9 L43 16 L36 23'} stroke="currentColor" strokeWidth="3.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const KickIcon = () => (
  <svg viewBox="0 0 40 32" width="34" height="28" aria-hidden>
    <path d="M6 28 Q18 2 34 10" stroke="currentColor" strokeWidth="2.6" fill="none" strokeDasharray="3 3" strokeLinecap="round" />
    <Ball x={32} y={10} r={-30} />
  </svg>
);
const TackleIcon = () => (
  <svg viewBox="0 0 40 32" width="36" height="28" aria-hidden>
    <circle cx="11" cy="8" r="4" fill="currentColor" />
    <path d="M8 13 L20 18 L30 15 M14 15 L10 27 M20 18 L26 27" stroke="currentColor" strokeWidth="3.4" fill="none" strokeLinecap="round" />
    <circle cx="33" cy="10" r="3.5" fill="currentColor" opacity="0.6" />
  </svg>
);

/** Context buttons: attack set when the user has the ball, defence set otherwise. */
/** Swipe left/right on the right half of the screen to dodge (sidestep). */
/** Right-hand swipes with the ball: left/right = quick pass that way, up = sidestep. */
export function DodgeLayer({ input }: { input: InputState }) {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  return (
    <div
      className="dodge-layer"
      onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId })}
      onPointerUp={(e) => {
        const s0 = start.current;
        start.current = null;
        if (!s0 || s0.id !== e.pointerId || performance.now() - s0.t > 500) return;
        const dx = e.clientX - s0.x;
        const dy = e.clientY - s0.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          input.actions.push({ type: 'pass', long: false, dir: dx > 0 ? 1 : -1 });
          haptic('light');
        } else if (-dy > 40 && -dy > Math.abs(dx) * 1.2) {
          input.actions.push({ type: 'sidestep' });
          haptic('light');
        }
      }}
    />
  );
}

const AddPlayerIcon = () => (
  <svg viewBox="0 0 40 32" width="34" height="28" aria-hidden>
    <circle cx="14" cy="8" r="4" fill="currentColor" />
    <path d="M10 13 L22 19 L30 17 M14 16 L10 28 M22 19 L26 28" stroke="currentColor" strokeWidth="3.4" fill="none" strokeLinecap="round" />
    <path d="M33 4 V12 M29 8 H37" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

export function ActionButtons({
  input,
  attacking,
  ruck,
  canDrop = false,
  nearDef = false,
  offload = false,
  ruckDef = 'none',
  ruckBall = null,
  onKick,
  atBase = false,
  onBoxKick,
}: {
  input: InputState;
  attacking: boolean;
  ruck: 'attack' | 'defend' | null;
  canDrop?: boolean;
  nearDef?: boolean;
  offload?: boolean;
  ruckDef?: 'none' | 'contest' | 'fan';
  ruckBall?: 'quick' | 'slow' | 'danger' | null;
  onKick?: () => void;
  atBase?: boolean;
  onBoxKick?: () => void;
}) {
  const passStart = useRef(0);
  const sprint = {
    onDown: () => (input.sprintHold = true),
    onUp: () => (input.sprintHold = false),
  };
  useEffect(() => () => void (input.sprintHold = false), [input]);

  if (ruck) {
    const ballTag = ruckBall && (
      <div className={`ruck-ball rb-${ruckBall}`}>{ruckBall === 'quick' ? 'QUICK BALL' : ruckBall === 'slow' ? 'SLOW BALL' : 'TURNOVER DANGER'}</div>
    );
    if (ruck === 'attack') {
      return (
        <div className="actions">
          {ballTag}
          <ActionButton label="Add player" sub="faster ball" size="big" color="neon" pos={{ right: 0, bottom: 34 }} onDown={() => input.actions.push({ type: 'addPlayer' })}>
            <AddPlayerIcon />
          </ActionButton>
        </div>
      );
    }
    return (
      <div className="actions">
        {ballTag}
        <ActionButton
          label="Contest"
          sub={ruckDef === 'contest' ? 'tap tap tap!' : 'steal · penalty risk'}
          size="big"
          color="pink"
          hidden={ruckDef === 'fan'}
          pos={{ right: 0, bottom: 34 }}
          onDown={() => input.actions.push({ type: 'ruckContest' })}
        >
          <AddPlayerIcon />
        </ActionButton>
        <ActionButton label="Fan out" sub="all in the line" size="med" color="cyan" hidden={ruckDef !== 'none'} pos={{ right: 112, bottom: 0 }} onDown={() => input.actions.push({ type: 'ruckFan' })} />
      </div>
    );
  }

  if (!attacking) {
    return (
      <div className="actions">
        <ActionButton
          label="Tackle"
          sub="hold = hold up"
          size="big"
          color="pink"
          pos={{ right: 0, bottom: 34 }}
          onDown={() => {
            input.tackleHold = true;
            input.actions.push({ type: 'tackle' });
          }}
          onUp={() => (input.tackleHold = false)}
        >
          <TackleIcon />
        </ActionButton>
        <ActionButton label="Dive" size="med" color="gold" pos={{ right: 98, bottom: 0 }} onDown={() => input.actions.push({ type: 'dive' })} />
        <ActionButton label="Switch" size="sm" color="dark" pos={{ right: 110, bottom: 92 }} onDown={() => input.actions.push({ type: 'switch' })} />
        <ActionButton label="Sprint" size="sm" color="cyan" pos={{ right: 196, bottom: 8 }} {...sprint} />
      </div>
    );
  }

  if (atBase) {
    // Scrum-half at the base: spin pass either way, box kick, pick and go, or snipe.
    return (
      <div className="actions base-actions">
        <ActionButton label="Pass" sub="spin left" size="big" color="neon" pos={{ right: 104, bottom: 0 }} onDown={() => input.actions.push({ type: 'basePass', dir: -1 })}>
          <PassIcon dir={-1} />
        </ActionButton>
        <ActionButton label="Pass" sub="spin right" size="big" color="neon" pos={{ right: 0, bottom: 40 }} onDown={() => input.actions.push({ type: 'basePass', dir: 1 })}>
          <PassIcon dir={1} />
        </ActionButton>
        <ActionButton label="Box kick" sub="aim it" size="med" color="gold" pos={{ right: 14, bottom: 150 }} onDown={() => onBoxKick?.()}>
          <KickIcon />
        </ActionButton>
        <ActionButton label="Pick & go" size="sm" color="pink" pos={{ right: 112, bottom: 104 }} onDown={() => input.actions.push({ type: 'pickGo' })} />
        <ActionButton label="Snipe" size="sm" color="cyan" pos={{ right: 200, bottom: 12 }} onDown={() => input.actions.push({ type: 'snipe' })} />
      </div>
    );
  }

  return (
    <div className="actions">
      <ActionButton
        label={offload ? 'Offload!' : 'Pass'}
        sub={offload ? 'in the tackle' : 'hold = long'}
        size="big"
        color={offload ? 'gold' : 'neon'}
        pos={{ right: 0, bottom: 40 }}
        onDown={() => (passStart.current = performance.now())}
        onUp={(_e, cancelled) => {
          if (cancelled) return;
          // dir 0: the engine passes to the side the joystick points, or the best-placed runner
          input.actions.push({ type: 'pass', long: !offload && performance.now() - passStart.current > 320, dir: 0 });
        }}
      >
        <PassIcon dir={1} />
      </ActionButton>
      <ActionButton label="Sprint" size="med" color="cyan" pos={{ right: 104, bottom: 0 }} {...sprint} />
      <ActionButton label="Kick" sub="choose kick" size="med" color="gold" pos={{ right: 14, bottom: 150 }} onDown={() => onKick?.()}>
        <KickIcon />
      </ActionButton>
      <ActionButton label="Hand-off" size="sm" color="pink" hidden={!nearDef} pos={{ right: 200, bottom: 12 }} onDown={() => input.actions.push({ type: 'handoff' })} />
      <ActionButton label="Drop goal" size="sm" color="cyan" hidden={!canDrop} pos={{ right: 206, bottom: 96 }} onDown={() => input.actions.push({ type: 'dropgoal' })} />
    </div>
  );
}

export const KICKS: { kind: KickKind; label: string; desc: string; def: number; min: number; max: number }[] = [
  { kind: 'box', label: 'Box kick', desc: 'high from the 9', def: 22, min: 12, max: 35 },
  { kind: 'grubber', label: 'Grubber', desc: 'along the ground', def: 15, min: 6, max: 30 },
  { kind: 'chip', label: 'Chip', desc: 'over the line, regather', def: 10, min: 5, max: 18 },
  { kind: 'high', label: 'Up & under', desc: 'high, chase it', def: 25, min: 15, max: 40 },
  { kind: 'touch', label: 'Touch', desc: 'find the touchline', def: 32, min: 15, max: 55 },
  { kind: 'cross', label: 'Cross-field', desc: 'to the far wing', def: 30, min: 18, max: 45 },
  { kind: 'punt', label: 'Long kick', desc: 'for territory', def: 40, min: 15, max: 58 },
];

/**
 * Kick picker: choose a kick, then touch the pitch where you want it to land.
 * Hold to build power (green = right, red = overcooked), drag to move the spot, let go to kick.
 */
export function KickPicker({
  input,
  isNine,
  onClose,
  aimAt,
  preset,
}: {
  input: InputState;
  isNine: boolean;
  onClose: () => void;
  /** screen point -> metres to the landing spot (or null if off the pitch) */
  aimAt: (x: number, y: number, kind: KickKind) => number | null;
  /** start already armed with this kick (penalty to touch) and no cancel */
  preset?: KickKind;
}) {
  const [armed, setArmed] = useState<(typeof KICKS)[number] | null>(preset ? KICKS.find((k) => k.kind === preset)! : null);
  const [power, setPower] = useState(0);
  const [dist, setDist] = useState<number | null>(null);
  const st = useRef<{ t: number; id: number } | null>(null);
  const raf = useRef(0);
  const target = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (preset) Object.assign(input.kickAim, { active: true, kind: preset, dist: 30, angle: 0 });
    return () => {
      cancelAnimationFrame(raf.current);
      input.kickAim.active = false;
    };
  }, [input, preset]);
  if (!armed) {
    return (
      <div className="kick-picker" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="kick-chips">
          {KICKS.filter((k) => k.kind !== 'box' || isNine).map((k) => (
            <button
              key={k.kind}
              className="kick-chip"
              onPointerDown={() => {
                haptic('light');
                setArmed(k);
                Object.assign(input.kickAim, { active: true, kind: k.kind, dist: k.def, angle: 0 });
              }}
            >
              <b>{k.label}</b>
              <small>{k.desc}</small>
            </button>
          ))}
          <button className="kick-chip cancel" onPointerDown={onClose}>
            ✕
          </button>
        </div>
      </div>
    );
  }
  const k = armed;
  const point = (e: React.PointerEvent) => {
    const d = aimAt(e.clientX, e.clientY, k.kind);
    if (d !== null) {
      target.current = { x: e.clientX, y: e.clientY };
      setDist(d);
    }
  };
  return (
    <div
      className="kick-aim"
      onPointerDown={(e) => {
        st.current = { t: performance.now(), id: e.pointerId };
        point(e);
        const loop = () => {
          if (!st.current) return;
          setPower(Math.min(1.25, (performance.now() - st.current.t) / 1000));
          raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
      }}
      onPointerMove={(e) => {
        if (st.current && st.current.id === e.pointerId) point(e);
      }}
      onPointerUp={(e) => {
        const s0 = st.current;
        if (!s0 || s0.id !== e.pointerId) return;
        st.current = null;
        cancelAnimationFrame(raf.current);
        if (!target.current) return;
        const pw = Math.min(1.25, (performance.now() - s0.t) / 1000);
        input.actions.push({ type: 'kick', kind: k.kind, dist: dist ?? k.def, angle: 0, power: Math.max(0.3, pw), tx: NaN, tz: NaN });
        input.kickAim.active = false;
        onClose();
      }}
    >
      {target.current && st.current && <div className="kick-target" style={{ left: target.current.x, top: target.current.y }} />}
      <div className="kick-aim-hud">
        <b>{k.label.toUpperCase()}</b>
        {dist !== null ? ` · ${Math.round(dist)}m` : ''}
        <div className="kick-power">
          <div className="kick-power-fill" style={{ width: `${(Math.min(power, 1.25) / 1.25) * 100}%`, background: power > 1 ? '#ff3d5e' : power > 0.6 ? '#7dff3a' : '#ffb020' }} />
          <div className="kick-power-zone" />
        </div>
        <small>{dist === null ? 'Touch the pitch where you want it to land' : 'Hold for power (green zone) · slide to move the spot · let go to kick'}</small>
      </div>
      {!preset && (
        <button
          className="kick-chip cancel kick-aim-cancel"
          onPointerDown={(e) => {
            e.stopPropagation();
            input.kickAim.active = false;
            onClose();
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** CATCH: tap just before the high ball arrives for a clean take. */
export function CatchButton({ input }: { input: InputState }) {
  return (
    <button
      className="catch-btn"
      onPointerDown={() => {
        input.actions.push({ type: 'catch' });
        haptic('light');
      }}
    >
      <span className="catch-ring" />
      CATCH
    </button>
  );
}
