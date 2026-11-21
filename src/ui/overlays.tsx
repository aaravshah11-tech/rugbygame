import { useEffect, useRef, useState } from 'react';
import type { CommentaryTone, HudState, MiniGameRequest, PlaceKickRequest } from '../game/types';
import type { MatchEngine } from '../game/engine';
import type { Difficulty } from '../state/types';
import { haptic } from '../util/haptics';
import { audio } from '../util/audio';

// ---------------------------------------------------------------- score bug
export function ScoreBug({
  hud,
  left,
  right,
}: {
  hud: HudState;
  left: { short: string; color: string; score: number };
  right: { short: string; color: string; score: number };
}) {
  return (
    <div className="scorebug">
      <div className="team">
        <i style={{ background: left.color }} />
        {left.short}
      </div>
      <div className="score">
        {left.score} – {right.score}
      </div>
      <div className="team">
        {right.short}
        <i style={{ background: right.color }} />
      </div>
      <div className={`clock ${hud.timeUp ? 'up' : ''}`}>
        <small>{hud.half === 1 ? '1H' : '2H'}</small>
        {hud.timeUp ? 'TIME' : hud.clock}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- commentary
export interface Comm {
  id: number;
  text: string;
  tone: CommentaryTone;
  sub?: string;
}

export function Commentary({ items }: { items: Comm[] }) {
  return (
    <div className="commentary">
      {items.map((c) => (
        <div key={c.id} className={`comm ${c.tone}`}>
          {c.text}
          {c.sub && <small>{c.sub}</small>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- mini-games
const MINI_TEXT: Record<MiniGameRequest['kind'], { title: string; hint: string; action: string }> = {
  ruck: { title: 'Ruck — secure it!', hint: 'Tap in the green for quick ball', action: 'Secure' },
  counterRuck: { title: 'Counter-ruck!', hint: 'Tap in the green to jackal the ball', action: 'Jackal' },
  scrum: { title: 'Crouch · Bind · SET!', hint: 'Tap SET in the green to win a strong scrum', action: 'Set' },
  scrumDefend: { title: 'Crouch · Bind · SET!', hint: 'Time the hit to pressure their put-in', action: 'Set' },
  lineout: { title: 'Lineout throw', hint: 'Release in the green to hit your jumper', action: 'Throw' },
  lineoutDefend: { title: 'Contest the lineout', hint: 'Jump in the green to steal it', action: 'Jump' },
  maul: { title: 'Drive the maul!', hint: 'Tap as fast as you can', action: 'Drive!' },
  maulDefend: { title: 'Stop the maul!', hint: 'Tap as fast as you can to hold them up', action: 'Push!' },
};

export function MiniGame({ req, difficulty, onDone }: { req: MiniGameRequest; difficulty: Difficulty; onDone: () => void }) {
  const txt = MINI_TEXT[req.kind];
  const isTap = req.kind === 'maul' || req.kind === 'maulDefend';
  const zoneW = { easy: 0.3, medium: 0.22, hard: 0.15 }[difficulty];
  const zoneC = useRef(0.25 + Math.random() * 0.5);
  const [pos, setPos] = useState(0);
  const [taps, setTaps] = useState(0);
  const [stage, setStage] = useState(req.kind.startsWith('scrum') ? 0 : 3);
  const [resolved, setResolved] = useState<number | null>(null);
  const t0 = useRef(performance.now());
  const done = useRef(false);
  const tapsRef = useRef(0);

  const finish = (q: number) => {
    if (done.current) return;
    done.current = true;
    setResolved(q);
    req.resolve(q);
    setTimeout(onDone, 450);
  };

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = (performance.now() - t0.current) / 1000;
      if (stage < 3) {
        // Scrum calls: CROUCH... BIND... SET
        const s = Math.min(3, Math.floor(t / 0.55));
        if (s !== stage) {
          setStage(s);
          if (s === 3) t0.current = performance.now();
        }
      } else if (!isTap) {
        // marker ping-pongs across the bar
        const u = (t / 1.1) % 2;
        setPos(u < 1 ? u : 2 - u);
        if (!req.blocking && t > req.duration) finish(0.5);
      } else if (t > req.duration) {
        finish(Math.min(1, tapsRef.current / 18));
      }
      if (!done.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = () => {
    if (done.current) return;
    if (isTap) {
      tapsRef.current++;
      setTaps(tapsRef.current);
      req.onTap?.();
      haptic('light');
      return;
    }
    if (stage < 3) return;
    const off = Math.abs(pos - zoneC.current);
    const q = off <= zoneW / 2 ? 1 - (off / (zoneW / 2)) * 0.25 : Math.max(0, 0.7 - (off - zoneW / 2) * 2.2);
    audio.click();
    haptic(q > 0.75 ? 'tackle' : 'light');
    finish(q);
  };

  const calls = ['CROUCH', 'BIND', 'SET'];
  const qLabel = resolved === null ? '' : resolved >= 0.75 ? 'PERFECT' : resolved >= 0.5 ? 'GOOD' : 'MISTIMED';

  return (
    <div className={`mini ${req.blocking ? 'blocking' : ''}`} onPointerDown={req.blocking ? act : undefined}>
      <h3>{stage < 3 ? `${calls[stage]}…` : resolved !== null && !isTap ? qLabel : txt.title}</h3>
      {isTap ? (
        <div className="drive-meter">
          <i style={{ width: `${Math.min(100, (taps / 18) * 100)}%` }} />
        </div>
      ) : (
        <div className="bar">
          <div className="zone ok" style={{ left: `${(zoneC.current - zoneW) * 100}%`, width: `${zoneW * 200}%` }} />
          <div className="zone" style={{ left: `${(zoneC.current - zoneW / 2) * 100}%`, width: `${zoneW * 100}%` }} />
          {stage >= 3 && <div className="marker" style={{ left: `${pos * 100}%` }} />}
        </div>
      )}
      {!req.blocking && (
        <button className="btn primary tapbtn" onPointerDown={act}>
          {txt.action}
        </button>
      )}
      {req.blocking && <div className="hint">{txt.hint} — tap anywhere</div>}
      {!req.blocking && <div className="hint">{txt.hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- place kick
export function PlaceKickUI({ req, engine, onDone }: { req: PlaceKickRequest; engine: MatchEngine; onDone: () => void }) {
  const [stage, setStage] = useState<'aim' | 'power' | 'acc' | 'gone'>('aim');
  const [aim, setAim] = useState(0);
  const [meter, setMeter] = useState(0);
  const power = useRef(0);
  const start = useRef({ x: 0, aim: 0 });
  const t0 = useRef(0);
  const meterRef = useRef(0);

  useEffect(() => {
    if (stage !== 'power' && stage !== 'acc') return;
    t0.current = performance.now();
    let raf = 0;
    const loop = () => {
      const t = (performance.now() - t0.current) / 1000;
      let m: number;
      if (stage === 'power') {
        const u = (t / 1.0) % 2;
        m = u < 1 ? u : 2 - u;
      } else {
        m = power.current - t / 0.55;
        if (m < -0.05) {
          shoot(1.5);
          return;
        }
      }
      meterRef.current = m;
      setMeter(m);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const shoot = (acc: number) => {
    setStage('gone');
    engine.shootPlaceKick(aim, power.current, acc);
    setTimeout(onDone, 200);
  };

  const tap = () => {
    if (stage === 'power') {
      power.current = meterRef.current;
      setStage('acc');
      audio.click();
    } else if (stage === 'acc') {
      // accuracy band sits at 6%..13% of the meter
      const centre = 0.095;
      const off = (meterRef.current - centre) / 0.12;
      shoot(Math.max(-1.5, Math.min(1.5, off)));
    }
  };

  const windDeg = (Math.atan2(req.cross, req.along) * 180) / Math.PI;

  return (
    <div
      className="pk-layer"
      onPointerDown={(e) => {
        if (stage === 'aim') start.current = { x: e.clientX, aim };
        else tap();
      }}
      onPointerMove={(e) => {
        if (stage !== 'aim' || e.buttons === 0) return;
        const a = Math.max(-20, Math.min(20, start.current.aim + (e.clientX - start.current.x) / 9));
        setAim(a);
        engine.setPlaceAim(a);
      }}
    >
      <div className="wind">
        Wind
        <div className="arrow" style={{ transform: `rotate(${windDeg}deg)` }}>
          ↑
        </div>
        {Math.round(req.windSpeed)} km/h
        <div className="muted" style={{ fontSize: 10 }}>{Math.round(req.distance)}m out</div>
      </div>
      {(stage === 'power' || stage === 'acc') && (
        <div className="swing">
          <div className="acc" />
          <div className="ideal" style={{ bottom: '55%' }} />
          <div className="fill" style={{ height: `${Math.max(0, meter) * 100}%` }} />
        </div>
      )}
      <div className="pk-help">
        {stage === 'aim' && (
          <>
            <div style={{ fontSize: 20 }}>{req.kind === 'conversion' ? 'Conversion' : req.kind === 'penalty' ? 'Penalty kick' : 'Kicking practice'} · {req.kicker}</div>
            <div className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>Drag left / right to aim · allow for the wind</div>
            <button
              className="btn primary"
              style={{ pointerEvents: 'auto', minWidth: 160 }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setStage('power');
              }}
            >
              Kick
            </button>
          </>
        )}
        {stage === 'power' && <div style={{ fontSize: 20 }}>Tap to set power — white line is ideal</div>}
        {stage === 'acc' && <div style={{ fontSize: 20 }}>Tap in the accuracy band!</div>}
      </div>
    </div>
  );
}
