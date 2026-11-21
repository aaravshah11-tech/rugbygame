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

  const end = () => {
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
        <div className="joy-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
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

/** Context buttons: attack set when the user has the ball, defence set otherwise. */
export function ActionButtons({ input, attacking }: { input: InputState; attacking: boolean }) {
  const passStart = useRef({ x: 0, t: 0 });
  const [passDir, setPassDir] = useState<-1 | 0 | 1>(0);
  const kickStart = useRef({ x: 0, t: 0 });
  const [kickPower, setKickPower] = useState(0);
  const kickRaf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(kickRaf.current), []);

  const sprint = (
    <ActionButton
      label="Sprint"
      size="med"
      color="white"
      pos={{ right: 168, bottom: 6 }}
      onDown={() => (input.sprint = true)}
      onUp={() => (input.sprint = false)}
    />
  );

  if (!attacking) {
    return (
      <div className="actions">
        <ActionButton label="Tackle" size="big" color="pink" pos={{ right: 0, bottom: 36 }} onDown={() => input.actions.push({ type: 'tackle' })} />
        <ActionButton label="Dive" sub="tackle" size="med" color="gold" pos={{ right: 92, bottom: 0 }} onDown={() => input.actions.push({ type: 'dive' })} />
        <ActionButton label="Switch" size="med" color="cyan" pos={{ right: 96, bottom: 76 }} onDown={() => input.actions.push({ type: 'switch' })} />
        {sprint}
      </div>
    );
  }

  const meterStyle = {
    background: `conic-gradient(var(--neon) ${kickPower * 360}deg, rgba(255,255,255,0.12) 0deg)`,
    WebkitMask: 'radial-gradient(circle, transparent 60%, #000 61%)',
    mask: 'radial-gradient(circle, transparent 60%, #000 61%)',
  } as React.CSSProperties;

  return (
    <div className="actions">
      <ActionButton
        label="Pass"
        sub={passDir === 0 ? 'tap · hold long' : passDir < 0 ? '◀ left' : 'right ▶'}
        size="big"
        color="neon"
        pos={{ right: 0, bottom: 36 }}
        onDown={(e) => {
          passStart.current = { x: e.clientX, t: performance.now() };
          setPassDir(0);
        }}
        onMove={(e) => {
          const dx = e.clientX - passStart.current.x;
          setPassDir(dx > 18 ? 1 : dx < -18 ? -1 : 0);
        }}
        onUp={(e, cancelled) => {
          if (cancelled) return;
          const dx = e.clientX - passStart.current.x;
          const dir = dx > 18 ? 1 : dx < -18 ? -1 : 0;
          const long = performance.now() - passStart.current.t > 320;
          input.actions.push({ type: 'pass', long, dir });
          setPassDir(0);
        }}
      />
      <ActionButton
        label="Kick"
        sub="hold · drag aim"
        size="med"
        color="gold"
        pos={{ right: 92, bottom: 0 }}
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
          const { power, aim } = input.kickAim;
          input.kickAim.active = false;
          setKickPower(0);
          if (!cancelled) input.actions.push({ type: 'kick', power: Math.max(0.15, power), aim });
        }}
      >
        <span className="meter" style={meterStyle} />
      </ActionButton>
      <ActionButton label="Step" sub="sidestep" size="sm" color="cyan" pos={{ right: 100, bottom: 80 }} onDown={() => input.actions.push({ type: 'sidestep' })} />
      <ActionButton label="Fend" sub="hand-off" size="sm" color="dark" pos={{ right: 26, bottom: 132 }} onDown={() => input.actions.push({ type: 'handoff' })} />
      {sprint}
    </div>
  );
}
