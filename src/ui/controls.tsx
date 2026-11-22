import { useEffect, useRef, useState } from 'react';
import type { InputState } from '../game/types';
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

function ActionButton({ label, sub, size, color, pos, onDown, onMove, onUp, children }: BtnProps) {
  const [on, setOn] = useState(false);
  const pid = useRef<number | null>(null);
  return (
    <button
      className={`abtn ${size} c-${color} ${on ? 'on' : ''}`}
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
export function DodgeLayer({ input }: { input: InputState }) {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  return (
    <div
      className="dodge-layer"
      onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId })}
      onPointerUp={(e) => {
        const s0 = start.current;
        start.current = null;
        if (!s0 || s0.id !== e.pointerId) return;
        const dx = e.clientX - s0.x;
        const dy = e.clientY - s0.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3 && performance.now() - s0.t < 500) {
          input.actions.push({ type: 'dodge', dir: dx > 0 ? 1 : -1 });
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

export function ActionButtons({ input, attacking, ruck }: { input: InputState; attacking: boolean; ruck: 'attack' | 'defend' | null }) {
  const kickStart = useRef({ x: 0, t: 0 });
  const passStart = useRef(0);
  const [kickPower, setKickPower] = useState(0);
  const kickRaf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(kickRaf.current), []);

  if (ruck) {
    return (
      <div className="actions">
        <ActionButton label="Add player" size="big" color={ruck === 'attack' ? 'neon' : 'pink'} pos={{ right: 0, bottom: 34 }} onDown={() => input.actions.push({ type: 'addPlayer' })}>
          <AddPlayerIcon />
        </ActionButton>
      </div>
    );
  }

  if (!attacking) {
    return (
      <div className="actions">
        <ActionButton
          label="Stand"
          sub="hold to tackle"
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
      </div>
    );
  }

  const meterStyle = {
    background: `conic-gradient(var(--neon) ${kickPower * 360}deg, rgba(255,255,255,0.12) 0deg)`,
    WebkitMask: 'radial-gradient(circle, transparent 60%, #000 61%)',
    mask: 'radial-gradient(circle, transparent 60%, #000 61%)',
  } as React.CSSProperties;

  const pass = (dir: -1 | 1) => ({
    onDown: () => (passStart.current = performance.now()),
    onUp: (_e: React.PointerEvent, cancelled: boolean) => {
      if (cancelled) return;
      input.actions.push({ type: 'pass', long: performance.now() - passStart.current > 320, dir });
    },
  });

  return (
    <div className="actions">
      <ActionButton label="Pass" sub="hold = long" size="big" color="neon" pos={{ right: 104, bottom: 0 }} {...pass(-1)}>
        <PassIcon dir={-1} />
      </ActionButton>
      <ActionButton label="Pass" sub="hold = long" size="big" color="neon" pos={{ right: 0, bottom: 46 }} {...pass(1)}>
        <PassIcon dir={1} />
      </ActionButton>
      <ActionButton
        label="Kick"
        size="med"
        color="gold"
        pos={{ right: 14, bottom: 146 }}
        onDown={(e) => {
          kickStart.current = { x: e.clientX, t: performance.now() };
          input.kickAim.active = true;
          input.kickAim.aim = 0;
          const tick = () => {
            const p = Math.min(1, (performance.now() - kickStart.current.t) / 1100);
            input.kickAim.power = p;
            setKickPower(p);
            kickRaf.current = requestAnimationFrame(tick);
          };
          tick();
        }}
        onMove={(e) => {
          input.kickAim.aim = Math.max(-1, Math.min(1, (e.clientX - kickStart.current.x) / 80));
        }}
        onUp={(_e, cancelled) => {
          cancelAnimationFrame(kickRaf.current);
          const held = performance.now() - kickStart.current.t;
          const { aim } = input.kickAim;
          input.kickAim.active = false;
          setKickPower(0);
          // tap = a solid default punt; hold = power meter + drag to aim
          const power = held < 220 ? 0.7 : Math.max(0.15, input.kickAim.power);
          if (!cancelled) input.actions.push({ type: 'kick', power, aim });
        }}
      >
        <span className="meter" style={meterStyle} />
        <KickIcon />
      </ActionButton>
    </div>
  );
}
