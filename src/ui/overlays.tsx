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

// ---------------------------------------------------------------- mini-games (swipe gestures)
type SwipeDir = 'up' | 'down';
interface MiniSpec {
  title: string;
  hint: string;
  dir: SwipeDir;
  /** timing bar: swipe while the marker is in the green */
  timed: boolean;
  /** repeated swipes (maul) */
  repeat?: boolean;
  /** choose a lineout jumper first */
  pick?: boolean;
  calls?: boolean;
  /** defending lineout: guess FRONT / MIDDLE / FAR */
  guess?: boolean;
}
const MINI: Record<MiniGameRequest['kind'], MiniSpec> = {
  scrum: { title: 'Scrum', hint: 'Swipe UP on "SET" when the marker is in the green', dir: 'up', timed: true, calls: true },
  scrumDefend: { title: 'Scrum', hint: 'Swipe UP in the green to drive against their put-in', dir: 'up', timed: true, calls: true },
  lineout: { title: 'Lineout', hint: 'Pick your jumper, then swipe DOWN in the green to throw', dir: 'down', timed: true, pick: true },
  lineoutDefend: { title: 'Contest the lineout', hint: 'Choose a range to contest: guess where they will throw', dir: 'up', timed: false, guess: true },
  ruck: { title: 'Ruck', hint: 'Swipe UP in the green to secure quick ball', dir: 'up', timed: true },
  counterRuck: { title: 'Contest the ruck', hint: 'Swipe UP fast to jackal the ball', dir: 'up', timed: false },
  maul: { title: 'Maul!', hint: 'Swipe UP when the arrow is full to push the maul', dir: 'up', timed: false, repeat: true },
  maulDefend: { title: 'Maul!', hint: 'Swipe UP when the arrow is full to push them back', dir: 'up', timed: false, repeat: true },
};
const JUMPERS = [
  { id: 'front', label: 'Front', zone: 1.3, bonus: -0.06, desc: 'Safe, short throw' },
  { id: 'middle', label: 'Middle', zone: 1, bonus: 0, desc: 'Balanced' },
  { id: 'back', label: 'Back', zone: 0.72, bonus: 0.1, desc: 'Hard to steal, tricky throw' },
];

export function MiniGame({ req, difficulty, onDone }: { req: MiniGameRequest; difficulty: Difficulty; onDone: () => void }) {
  const spec = MINI[req.kind];
  const [jumper, setJumper] = useState<(typeof JUMPERS)[number] | null>(spec.pick ? null : JUMPERS[1]);
  const zoneW = { easy: 0.3, medium: 0.22, hard: 0.15 }[difficulty] * (jumper?.zone ?? 1);
  const zoneC = useRef(0.3 + Math.random() * 0.4);
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const [stage, setStage] = useState(spec.calls ? 0 : 3);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [nudge, setNudge] = useState('');
  const t0 = useRef(performance.now());
  const stageRef = useRef(spec.calls ? 0 : 3);
  const done = useRef(false);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const countRef = useRef(0);
  const ready = stage >= 3 && !!jumper;
  // maul: an arrow meter fills; swipe when it's full
  const [fill, setFill] = useState(0);
  const fillRef = useRef(0);
  const goodRef = useRef(0);
  useEffect(() => {
    if (!spec.repeat) return;
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      fillRef.current = Math.min(1, fillRef.current + (now - last) / 800);
      last = now;
      setFill(fillRef.current);
      if (!done.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cpuRange = useRef(Math.floor(Math.random() * 3));

  const finish = (q: number, label?: string) => {
    if (done.current) return;
    done.current = true;
    setResult(label ?? (q >= 0.75 ? 'PERFECT!' : q >= 0.5 ? 'GOOD' : 'MISTIMED'));
    req.resolve(Math.max(0, Math.min(1, q)));
    setTimeout(onDone, 650);
  };

  useEffect(() => {
    if (!jumper) return;
    t0.current = performance.now();
    let raf = 0;
    const loop = () => {
      const t = (performance.now() - t0.current) / 1000;
      if (stageRef.current < 3) {
        // referee calls: CROUCH, BIND, SET (0.6s each), then the timing bar starts
        const st = Math.min(3, Math.floor(t / 0.6));
        if (st !== stageRef.current) {
          stageRef.current = st;
          setStage(st);
          if (st === 3) t0.current = performance.now();
        }
      } else if (spec.timed) {
        const u = (t / 1.3) % 2;
        posRef.current = u < 1 ? u : 2 - u;
        setPos(posRef.current);
        if (!req.blocking && t > req.duration) finish(0.5, '—');
      } else if (!spec.guess && t > (req.duration || 3) + (spec.repeat ? 1.5 : 0)) {
        if (spec.repeat) finish(Math.min(1, countRef.current / 9), `${countRef.current} DRIVES`);
        else finish(0.4, 'TOO SLOW');
      }
      if (!done.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [jumper]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSwipe = (dy: number, ms: number) => {
    if (done.current || !ready || spec.guess) return;
    const okDir = spec.dir === 'up' ? dy > 40 : dy < -40;
    if (!okDir) {
      setNudge(spec.dir === 'up' ? 'Swipe UP ↑' : 'Swipe DOWN ↓');
      return;
    }
    setNudge('');
    haptic('light');
    if (spec.repeat) {
      const full = fillRef.current >= 0.95;
      fillRef.current = 0;
      countRef.current++;
      setCount(countRef.current);
      if (full) {
        goodRef.current++;
        for (let i = 0; i < 4; i++) req.onTap?.();
        setNudge('PUSH!');
      } else setNudge('Too early, wait for the arrow to fill');
      if (countRef.current >= 3) finish(goodRef.current / 3, goodRef.current >= 2 ? 'DRIVEN!' : 'HELD');
      return;
    }
    if (!spec.timed) {
      // speed of the swipe decides the jackal
      const speed = Math.abs(dy) / Math.max(30, ms);
      finish(Math.min(1, speed / 1.4), speed > 1.1 ? 'JACKAL!' : 'TOO SOFT');
      return;
    }
    const off = Math.abs(posRef.current - zoneC.current);
    let q = off <= zoneW / 2 ? 1 - (off / (zoneW / 2)) * 0.25 : Math.max(0, 0.7 - (off - zoneW / 2) * 2.2);
    q = Math.max(0, Math.min(1, q + (jumper?.bonus ?? 0) * (q > 0.6 ? 1 : 0)));
    audio.click();
    haptic(q > 0.75 ? 'tackle' : 'light');
    finish(q);
  };

  const calls = ['CROUCH', 'BIND', 'SET'];
  const arrow = spec.dir === 'up' ? '↑' : '↓';

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s0 = start.current;
      start.current = null;
      if (s0) onSwipe(s0.y - e.clientY, performance.now() - s0.t);
    },
    onPointerCancel: () => (start.current = null),
  };

  return (
    <>
    {(req.blocking || spec.repeat) && <div className="swipe-layer" {...handlers} />}
    <div
      className={`mini swipe ${req.blocking ? 'blocking' : ''}`}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      }}
      onPointerUp={(e) => {
        const s0 = start.current;
        start.current = null;
        if (s0) onSwipe(s0.y - e.clientY, performance.now() - s0.t);
      }}
      onPointerCancel={() => (start.current = null)}
    >
      <h3>{result ?? (stage < 3 ? `${calls[stage]}…` : spec.title)}</h3>
      {spec.pick && !jumper && (
        <div className="jumpers">
          {JUMPERS.map((j) => (
            <button
              key={j.id}
              className="btn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                audio.click();
                setJumper(j);
              }}
            >
              {j.label}
              <small>{j.desc}</small>
            </button>
          ))}
        </div>
      )}
      {spec.timed && jumper && (
        <div className="bar">
          <div className="zone ok" style={{ left: `${(zoneC.current - zoneW) * 100}%`, width: `${zoneW * 200}%` }} />
          <div className="zone" style={{ left: `${(zoneC.current - zoneW / 2) * 100}%`, width: `${zoneW * 100}%` }} />
          {stage >= 3 && <div className="marker" style={{ left: `${pos * 100}%` }} />}
        </div>
      )}
      {spec.repeat && (
        <div className={`maul-arrow ${fill >= 0.95 ? 'full' : ''}`}>
          <i style={{ height: `${fill * 100}%` }} />
          <span>{fill >= 0.95 ? 'SWIPE!' : `${count}/3`}</span>
        </div>
      )}
      {spec.guess && !result && (
        <div className="jumpers">
          {['Front', 'Middle', 'Far'].map((label, i) => (
            <button
              key={label}
              className="btn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                audio.click();
                const hit = i === cpuRange.current;
                finish(hit ? 0.95 : 0.2, hit ? 'READ IT!' : `THEY WENT ${['FRONT', 'MIDDLE', 'FAR'][cpuRange.current]}`);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {ready && !result && !spec.guess && <div className={`swipe-cue ${spec.dir}`}>{arrow}</div>}
      <div className="hint">{nudge || (spec.pick && !jumper ? 'Choose where to throw' : spec.hint)}</div>
    </div>
    </>
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
