import { useEffect, useRef, useState } from 'react';
import type { Go, Route } from '../App';
import { nationById } from '../data/nations';
import { STADIUM_SPECS, type StadiumWeather, type TimeOfDay } from '../game/stadium/index';
import { StadiumViewerScene } from '../game/view/stadiumViewer';
import { useProfile } from '../state/store';
import { Seg, TopBar } from '../ui/common';
import { TeamLogo } from '../ui/logos';

const IDS = Object.keys(STADIUM_SPECS);
const TIER_LABEL = { club: 'Club ground', medium: 'Medium ground', large: 'Large stadium', national: 'National arena' } as const;

/** Stadiums gallery: swipe between every ground, orbit it, change the time of day and weather. */
export function Stadiums({ go, start, back }: { go: Go; start?: string; back: Route }) {
  const p = useProfile();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<StadiumViewerScene | null>(null);
  const [i, setI] = useState(Math.max(0, IDS.indexOf(start ?? 'ENG')));
  const [time, setTime] = useState<TimeOfDay>('golden');
  const [weather, setWeather] = useState<StadiumWeather>('dry');
  const [busy, setBusy] = useState(true);
  const spec = STADIUM_SPECS[IDS[i]];

  useEffect(() => {
    const s = new StadiumViewerScene(host.current!, p.settings.graphics);
    scene.current = s;
    if (import.meta.env.DEV) Object.assign(window, { __stadiums: s });
    return () => s.dispose();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setBusy(true);
    // let the "building" label paint before the (synchronous) build
    const t = setTimeout(() => {
      scene.current?.show(spec, time, weather);
      setBusy(false);
    }, 30);
    return () => clearTimeout(t);
  }, [spec, time, weather]);

  const step = (d: number) => setI((x) => (x + d + IDS.length) % IDS.length);
  const drag = useRef<{ x: number; y: number; x0: number; moved: boolean } | null>(null);

  return (
    <div className="screen stadiums" style={{ padding: 0 }}>
      <div
        ref={host}
        className="stadium-stage"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, x0: e.clientX, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          scene.current?.drag(e.clientX - d.x, e.clientY - d.y);
          if (Math.abs(e.clientX - d.x0) > 8) d.moved = true;
          d.x = e.clientX;
          d.y = e.clientY;
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => scene.current?.zoom(e.deltaY > 0 ? 1.08 : 0.92)}
      />
      <div className="stadium-ui">
        <TopBar title="Stadiums" accent={`${i + 1}/${IDS.length}`} onBack={() => go(back)} />
        <div className="stadium-info card">
          <div className="row" style={{ gap: 10 }}>
            <TeamLogo id={spec.id} size={40} />
            <div className="grow">
              <h3>{spec.name}</h3>
              <small className="muted">
                {spec.city} · {spec.capacity.toLocaleString()} · {TIER_LABEL[spec.tier]}
              </small>
            </div>
          </div>
          <p className="stadium-note">{spec.signature.note}</p>
          <small className="muted">Home of {nationById(spec.id).name}</small>
        </div>
        <div className="stadium-controls">
          <button className="btn ghost" aria-label="Previous stadium" onClick={() => step(-1)}>
            ‹
          </button>
          <Seg<TimeOfDay> value={time} options={[{ v: 'afternoon', label: 'Day' }, { v: 'golden', label: 'Sunset' }, { v: 'night', label: 'Night' }]} onChange={setTime} />
          <Seg<StadiumWeather> value={weather} options={[{ v: 'dry', label: 'Dry' }, { v: 'rain', label: 'Rain' }, { v: 'snow', label: 'Snow' }]} onChange={setWeather} />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost" aria-label="Zoom in" onClick={() => scene.current?.zoom(0.85)}>
              +
            </button>
            <button className="btn ghost" aria-label="Zoom out" onClick={() => scene.current?.zoom(1.18)}>
              −
            </button>
          </div>
          <button className="btn ghost" aria-label="Next stadium" onClick={() => step(1)}>
            ›
          </button>
        </div>
        {busy && <div className="stadium-busy">Building {spec.name}…</div>}
      </div>
    </div>
  );
}
