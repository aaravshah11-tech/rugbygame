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

// ---------------------------------------------------------------- place kick (swipe)
/**
 * Swipe up through the ball: the swipe's direction aims, its speed sets the power,
 * and bending the swipe curls the kick. The wind is shown top-right.
 */
export function PlaceKickUI({ req, engine, onDone }: { req: PlaceKickRequest; engine: MatchEngine; onDone: () => void }) {
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const [msg, setMsg] = useState('');
  const [gone, setGone] = useState(false);
  const pts = useRef<{ x: number; y: number; t: number }[]>([]);
  const active = useRef(false);

  const aimFrom = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x;
    const dy = a.y - b.y;
    return Math.max(-25, Math.min(25, ((Math.atan2(dx, Math.max(1, dy)) * 180) / Math.PI) * 0.8));
  };

  const release = () => {
    if (!active.current) return;
    active.current = false;
    const p = pts.current;
    if (p.length < 2) return;
    const a = p[0];
    const b = p[p.length - 1];
    const dy = a.y - b.y;
    if (dy < 50) {
      setMsg('Swipe further up through the ball');
      setTrail([]);
      return;
    }
    let len = 0;
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    // use the last ~120ms of the swipe for speed so slow starts don't kill the power
    const tail = p.filter((q) => q.t >= b.t - 120);
    const t0 = tail[0] ?? a;
    let tailLen = 0;
    for (let i = 1; i < tail.length; i++) tailLen += Math.hypot(tail[i].x - tail[i - 1].x, tail[i].y - tail[i - 1].y);
    const speed = Math.max(tailLen / Math.max(16, b.t - t0.t), len / Math.max(16, b.t - a.t)); // px per ms
    const vh = window.innerHeight;
    // power: mostly swipe speed, partly swipe length, so a firm flick of ~1/3 screen is ideal
    const speedTerm = speed / (vh * 0.0038);
    const lengthTerm = dy / (vh * 0.45);
    const strength = Math.max(0, Math.min(1.25, speedTerm * 0.65 + lengthTerm * 0.35));
    // curl: how far the swipe bows away from a straight line (+ = bows right)
    const lx = b.x - a.x;
    const ly = b.y - a.y;
    let dev = 0;
    for (const q of p) {
      const d = (lx * (q.y - a.y) - ly * (q.x - a.x)) / Math.max(1, Math.hypot(lx, ly));
      if (Math.abs(d) > Math.abs(dev)) dev = d;
    }
    const curl = Math.max(-1, Math.min(1, dev / (Math.hypot(lx, ly) * 0.25)));
    const aim = aimFrom(a, b);
    setGone(true);
    setMsg(strength < 0.6 ? 'Too soft…' : strength > 1.1 ? 'Big boot!' : 'Sweet strike!');
    engine.shootPlaceKick(aim, strength * 0.6, (Math.random() - 0.5) * 0.25, curl);
    audio.click();
    setTimeout(onDone, 200);
  };

  const windDeg = (Math.atan2(req.cross, req.along) * 180) / Math.PI;

  return (
    <div
      className="pk-layer"
      onPointerDown={(e) => {
        if (gone) return;
        active.current = true;
        pts.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
        setTrail([{ x: e.clientX, y: e.clientY }]);
        setMsg('');
      }}
      onPointerMove={(e) => {
        if (!active.current) return;
        pts.current.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        setTrail(pts.current.map(({ x, y }) => ({ x, y })));
        engine.setPlaceAim(aimFrom(pts.current[0], pts.current[pts.current.length - 1]));
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="wind">
        Wind
        <div className="arrow" style={{ transform: `rotate(${windDeg}deg)` }}>
          ↑
        </div>
        {Math.round(req.windSpeed)} km/h
        <div className="muted" style={{ fontSize: 10 }}>{Math.round(req.distance)}m out</div>
      </div>
      <svg className="swipe-trail" width="100%" height="100%">
        {trail.length > 1 && <polyline points={trail.map((q) => `${q.x},${q.y}`).join(' ')} />}
      </svg>
      {!gone && (
        <div className="swipe-hint">
          <div className="swipe-ball" />
          <div className="swipe-arrow">↑</div>
        </div>
      )}
      <div className="pk-help top">
        <div style={{ fontSize: 18 }}>
          {req.kind === 'conversion' ? 'Conversion' : req.kind === 'penalty' ? 'Penalty kick' : 'Kicking practice'} · {req.kicker}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {msg || 'Swipe up through the ball · direction aims · speed is power · curve to bend it'}
        </div>
      </div>
    </div>
  );
}
