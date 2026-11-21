import { useEffect, useRef, useState } from 'react';
import { MatchEngine } from '../game/engine';
import { createInput, type EngineEvent, type EngineResult, type HudState, type MatchConfig, type MiniGameRequest, type PenaltyChoice, type PlaceKickRequest, type SetPlayId } from '../game/types';
import { ActionButtons, Joystick } from '../ui/controls';
import { Commentary, MiniGame, PlaceKickUI, ScoreBug, type Comm } from '../ui/overlays';
import { audio } from '../util/audio';
import { update, useProfile } from '../state/store';
import type { CameraMode } from '../state/types';

export interface MatchOutcome {
  title: string;
  lines: string[];
  coins: number;
}

const SET_PLAYS: { id: SetPlayId; name: string; desc: string }[] = [
  { id: 'crash', name: 'Crash Ball', desc: 'Inside centre runs a hard line off you — next pass finds him' },
  { id: 'loop', name: 'Loop Play', desc: 'Pass to 12, fly-half loops round for the return' },
  { id: 'miss', name: 'Miss Pass Wide', desc: 'Skip 12 to 13, winger hugs the touchline' },
  { id: 'upandunder', name: 'Up & Under', desc: 'High hanging kick, back three chase' },
];

const emptyHud: HudState = {
  userScore: 0, cpuScore: 0, clock: '00:00', half: 1, attacking: false, canAct: false,
  controlledName: '', controlledNum: 0, stamina: 1, timeUp: false, phase: 'pre',
};

export function MatchScreen({
  cfg,
  onFinish,
  onDrillDone,
  onExit,
}: {
  cfg: MatchConfig;
  onFinish?: (r: EngineResult) => MatchOutcome;
  onDrillDone?: (score: number, total: number) => MatchOutcome;
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<MatchEngine | null>(null);
  const input = useRef(createInput());
  const profile = useProfile();
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [comms, setComms] = useState<Comm[]>([]);
  const [mini, setMini] = useState<MiniGameRequest | null>(null);
  const [pk, setPk] = useState<PlaceKickRequest | null>(null);
  const [penalty, setPenalty] = useState<{ canKick: boolean; resolve: (c: PenaltyChoice) => void } | null>(null);
  const [halftime, setHalftime] = useState(false);
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null);
  const [paused, setPaused] = useState(false);
  const [plays, setPlays] = useState(false);
  const [drill, setDrill] = useState<{ text: string; progress: string } | null>(null);
  const commId = useRef(0);
  const finished = useRef(false);

  useEffect(() => {
    const onEvent = (e: EngineEvent) => {
      switch (e.type) {
        case 'hud':
          setHud(e.hud);
          break;
        case 'commentary': {
          const id = ++commId.current;
          setComms((c) => [...c.slice(-1), { id, text: e.text, tone: e.tone, sub: e.sub }]);
          setTimeout(() => setComms((c) => c.filter((x) => x.id !== id)), 2300);
          break;
        }
        case 'minigame':
          setMini(e.req);
          break;
        case 'minigameCancel':
          setMini((m) => (m && !m.blocking ? null : m));
          break;
        case 'placekick':
          setPk(e.req);
          break;
        case 'placekickDone':
          setPk(null);
          break;
        case 'penalty':
          setPenalty({ canKick: e.canKick, resolve: e.resolve });
          break;
        case 'halftime':
          setTimeout(() => setHalftime(true), 1500);
          break;
        case 'end':
          if (finished.current) return;
          finished.current = true;
          setTimeout(() => setOutcome(onFinish ? onFinish(e.result) : { title: 'Full time', lines: [], coins: 0 }), 1800);
          break;
        case 'drill':
          setDrill({ text: e.text, progress: e.progress });
          break;
        case 'drillDone':
          if (finished.current) return;
          finished.current = true;
          setOutcome(onDrillDone ? onDrillDone(e.score, e.total) : { title: 'Drill complete', lines: [], coins: 0 });
          break;
      }
    };
    const eng = new MatchEngine(host.current!, cfg, input.current, onEvent);
    engine.current = eng;
    audio.stopMusic();
    eng.start();
    const vis = () => {
      if (document.hidden) {
        setPaused(true);
        eng.setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      eng.dispose();
      engine.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = (p: boolean) => {
    audio.click();
    setPaused(p);
    engine.current?.setPaused(p);
  };

  const userIsHome = cfg.userIsHome;
  const userSide = { short: cfg.user.short, color: cfg.user.kit.primary, score: hud.userScore };
  const cpuSide = { short: cfg.cpu.short, color: cfg.cpu.kit.primary, score: hud.cpuScore };
  const showControls = !pk && !(mini && mini.blocking) && !penalty && !halftime && !outcome && cfg.drill !== 'kicking' && cfg.drill !== 'setpieces';

  return (
    <div className="match-root">
      <div ref={host} className="match-canvas" />
      <div className="hud">
        {!cfg.drill && <ScoreBug hud={hud} left={userIsHome ? userSide : cpuSide} right={userIsHome ? cpuSide : userSide} />}
        {drill && cfg.drill && (
          <div className="drill-bar">
            <b>{drill.progress}</b>
            <div>{drill.text}</div>
          </div>
        )}
        {showControls && hud.controlledName && (
          <div className="ctrl-name">
            <span style={{ color: hud.attacking ? 'var(--neon)' : 'var(--pink)' }}>#{hud.controlledNum}</span>
            {hud.controlledName}
            <span className="stam">
              <i style={{ width: `${hud.stamina * 100}%` }} />
            </span>
          </div>
        )}
        <button className="pause-btn" aria-label="Pause" onClick={() => pause(true)}>
          ❚❚
        </button>
        {showControls && hud.attacking && hud.canAct && !cfg.drill && (
          <button className="setplays-btn" onClick={() => (audio.click(), setPlays(true))}>
            Set Plays
          </button>
        )}
        <Commentary items={comms} />
        {showControls && <Joystick input={input.current} />}
        {showControls && <ActionButtons input={input.current} attacking={hud.attacking} />}
        {mini && <MiniGame key={mini.id} req={mini} difficulty={cfg.difficulty} onDone={() => setMini(null)} />}
        {pk && engine.current && <PlaceKickUI key={pk.kind + pk.distance} req={pk} engine={engine.current} onDone={() => {}} />}
      </div>

      {plays && (
        <div className="sheet" onClick={() => setPlays(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2>Set Plays</h2>
            <div className="setplay-grid">
              {SET_PLAYS.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => {
                    input.current.actions.push({ type: 'setplay', id: sp.id });
                    setPlays(false);
                  }}
                >
                  <b>{sp.name}</b>
                  <small>{sp.desc}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {penalty && (
        <div className="sheet">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Penalty to {cfg.user.name}</h2>
            <p className="muted">Choose your option</p>
            <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={!penalty.canKick} onClick={() => (penalty.resolve('goal'), setPenalty(null))}>
                Kick at goal
              </button>
              <button className="btn cyan" onClick={() => (penalty.resolve('touch'), setPenalty(null))}>
                Kick to touch
              </button>
              <button className="btn" onClick={() => (penalty.resolve('tap'), setPenalty(null))}>
                Tap &amp; go
              </button>
            </div>
          </div>
        </div>
      )}

      {halftime && (
        <div className="sheet">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Half Time</h2>
            <div className="result-score">
              {cfg.user.short} {hud.userScore} – {hud.cpuScore} {cfg.cpu.short}
            </div>
            <button
              className="btn primary"
              onClick={() => {
                setHalftime(false);
                engine.current?.continueSecondHalf();
              }}
            >
              Second half
            </button>
          </div>
        </div>
      )}

      {paused && !outcome && (
        <div className="sheet">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Paused</h2>
            <p className="muted">Camera</p>
            <div className="seg" style={{ marginBottom: 12 }}>
              {(['broadcast', 'sideline', 'close'] as CameraMode[]).map((m) => (
                <button
                  key={m}
                  className={profile.settings.camera === m ? 'on' : ''}
                  onClick={() => {
                    update((p) => (p.settings.camera = m));
                    engine.current?.setCamera(m);
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => pause(false)}>
                Resume
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  audio.click();
                  onExit();
                }}
              >
                Quit {cfg.drill ? 'drill' : 'match'}
              </button>
            </div>
            {!cfg.drill && <p className="muted" style={{ fontSize: 12 }}>Quitting forfeits the match — no result is recorded.</p>}
          </div>
        </div>
      )}

      {outcome && (
        <div className="sheet">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>{outcome.title}</h2>
            {!cfg.drill && (
              <div className="result-score">
                {cfg.user.short} {hud.userScore} – {hud.cpuScore} {cfg.cpu.short}
              </div>
            )}
            {outcome.lines.map((l, i) => (
              <div key={i} className="muted">
                {l}
              </div>
            ))}
            {outcome.coins > 0 && (
              <p>
                <span className="coins">
                  <i className="coin-dot" />+{outcome.coins}
                </span>
              </p>
            )}
            <button
              className="btn primary"
              onClick={() => {
                audio.click();
                onExit();
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
