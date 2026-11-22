import { useEffect, useRef, useState } from 'react';
import { MatchEngine } from '../game/engine';
import { loadPlayerAsset } from '../game/view/assets';
import { createInput, type EngineEvent, type EngineResult, type HudState, type MatchConfig, type MiniGameRequest, type PenaltyChoice, type PlaceKickRequest, type SetPlayId } from '../game/types';
import { ActionButtons, CatchButton, DodgeLayer, Joystick, KickPicker } from '../ui/controls';
import { MiniGame, PlaceKickUI, ScoreBug, ScrumBattle, type Comm } from '../ui/overlays';
import { audio } from '../util/audio';
import { TacticsPanel } from '../ui/tactics';
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
  { id: 'miss', name: 'Skip Wide', desc: 'Long pass to the outside backs, winger hugs the touchline' },
  { id: 'switch', name: 'Switch Play', desc: 'Outside centre cuts back for an inside ball' },
  { id: 'upandunder', name: 'Up & Under', desc: 'High hanging kick, back three chase' },
];

const emptyHud: HudState = {
  userScore: 0, cpuScore: 0, clock: '00:00', half: 1, attacking: false, canAct: false,
  controlledName: '', controlledNum: 0, stamina: 1, timeUp: false, phase: 'pre', phaseNum: 0, ruck: null, canDrop: false, mph: 0, scrum: null, nearDef: false, offload: false, ruckDef: 'none', ruckBall: null, catchPrompt: false, wind: { deg: 0, kmh: 0 }, isNine: false, call: null, advantage: null, sinBin: [],
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
  const [pauseTab, setPauseTab] = useState<'menu' | 'tactics' | 'subs'>('menu');
  const [plays, setPlays] = useState(false);
  const [drill, setDrill] = useState<{ text: string; progress: string } | null>(null);
  const [kickMenu, setKickMenu] = useState(false);
  const [intro, setIntro] = useState<null | { title: string; sub: string }>(null);
  const [fullStats, setFullStats] = useState<import('../game/types').MatchStats | null>(null);
  const [tmo, setTmo] = useState<null | 'check' | 'try' | 'notry'>(null);
  const [pops, setPops] = useState<{ id: number; text: string; tone: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tryBanner, setTryBanner] = useState<{ id: number; scorer: string; team: string; user: boolean } | null>(null);
  const [replay, setReplay] = useState(false);
  const [howTo, setHowTo] = useState(false);
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
          if (e.result.match) setFullStats(e.result.match);
          setTimeout(() => setOutcome(onFinish ? onFinish(e.result) : { title: 'Full time', lines: [], coins: 0 }), 1800);
          break;
        case 'try': {
          const id = ++commId.current;
          setTryBanner({ id, scorer: e.scorer, team: e.team, user: e.userScored });
          setComms([]);
          setTimeout(() => setTryBanner((b) => (b && b.id === id ? null : b)), 2600);
          break;
        }
        case 'replay':
          setReplay(e.active);
          break;
        case 'drill':
          setDrill({ text: e.text, progress: e.progress });
          break;
        case 'intro':
          setIntro(e.on ? { title: e.title, sub: e.sub } : null);
          break;
        case 'tmo':
          setTmo(e.stage);
          if (e.stage !== 'check') setTimeout(() => setTmo(null), 1500);
          break;
        case 'pop': {
          const id = ++commId.current;
          setPops((p) => [...p.slice(-1), { id, text: e.text, tone: e.tone }]);
          setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1100);
          break;
        }
        case 'drillDone':
          if (finished.current) return;
          finished.current = true;
          setOutcome(onDrillDone ? onDrillDone(e.score, e.total) : { title: 'Drill complete', lines: [], coins: 0 });
          break;
      }
    };
    let eng: MatchEngine | null = null;
    let cancelled = false;
    audio.stopMusic();
    void loadPlayerAsset().then((asset) => {
      if (cancelled) return;
      eng = new MatchEngine(host.current!, cfg, input.current, onEvent, asset);
      engine.current = eng;
      if (import.meta.env.DEV) (window as unknown as { __engine: MatchEngine }).__engine = eng;
      setLoading(false);
      eng.start();
      let seen = false;
      try {
        seen = localStorage.getItem('tl-howto') === '1';
      } catch {
        /* private mode */
      }
      if (!cfg.drill && !seen) {
        eng.setPaused(true);
        setHowTo(true);
      }
    });
    const vis = () => {
      if (document.hidden && eng) {
        setPaused(true);
        eng.setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', vis);
      eng?.dispose();
      engine.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = (p: boolean) => {
    audio.click();
    setPaused(p);
    engine.current?.setPaused(p);
  };

  const userIsHome = cfg.userIsHome;
  const userSide = { id: cfg.user.id, short: cfg.user.short, color: cfg.user.kit.primary, score: hud.userScore };
  const cpuSide = { id: cfg.cpu.id, short: cfg.cpu.short, color: cfg.cpu.kit.primary, score: hud.cpuScore };
  const showControls = !loading && !howTo && !replay && !tryBanner && hud.phase !== 'dead' && hud.phase !== 'maul' && hud.phase !== 'scrum' && hud.phase !== 'lineout' && !pk && !(mini && mini.blocking) && !penalty && !halftime && !outcome && cfg.drill !== 'kicking' && cfg.drill !== 'setpieces';

  return (
    <div className={`match-root ${profile.settings.leftHanded ? 'left-handed' : ''}`} style={{ ['--btn-scale' as string]: profile.settings.buttonScale ?? 1 }}>
      <div ref={host} className="match-canvas" />
      <div className="vignette" />
      {loading && (
        <div className="gate" style={{ background: 'var(--bg)' }}>
          <div className="logo">
            TRY <span>LINE</span>
          </div>
          <div className="muted italic">Warming up the players…</div>
        </div>
      )}
      {intro && (
        <div className="intro-card" onPointerDown={() => engine.current?.skipIntro()}>
          <div className="intro-title">{intro.title}</div>
          <div className="intro-sub">{intro.sub}</div>
          <div className="intro-skip">Tap to skip</div>
        </div>
      )}
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
        {!cfg.drill && !loading && hud.phase !== 'pre' && (
          <div className={`phase-chip ${hud.attacking ? '' : 'def'}`}>
            <b>{hud.attacking ? 'Attacking' : 'Defending'}</b>
            {hud.attacking && hud.phaseNum > 0 && <span>Phase {hud.phaseNum + 1}</span>}
            {hud.phase === 'ruck' && <span>Ruck</span>}
            {comms.length > 0 && !tryBanner && (
              <span className="call">
                {comms[comms.length - 1].text}
                {comms[comms.length - 1].sub ? ` · ${comms[comms.length - 1].sub}` : ''}
              </span>
            )}
          </div>
        )}
        {showControls && hud.attacking && (hud.ruck === 'attack' || hud.phaseNum > 0) && hud.canAct && !cfg.drill && (
          <button className="setplays-btn pill-bottom" onClick={() => (audio.click(), setPlays(true))}>
            Set Plays
          </button>
        )}
        {tryBanner && (
          <div className={`try-banner ${tryBanner.user ? '' : 'them'}`} key={tryBanner.id}>
            <div className="try-word">TRY!</div>
            <div className="try-sub">
              {tryBanner.scorer} · {tryBanner.team}
            </div>
          </div>
        )}
        {replay && (
          <button className="replay-tag" onClick={() => engine.current?.skipReplay()}>
            <span className="rec" /> REPLAY <small>tap to skip</small>
          </button>
        )}
        {pops.map((p) => (
          <div key={p.id} className={`pop-text pop-${p.tone}`}>
            {p.text}
          </div>
        ))}
        {kickMenu && showControls && hud.attacking && !hud.ruck && <KickPicker input={input.current} isNine={hud.isNine} onClose={() => setKickMenu(false)} />}
        {showControls && hud.catchPrompt && <CatchButton input={input.current} />}
        {hud.advantage && <div className={`adv-chip ${hud.advantage}`}>ADVANTAGE {hud.advantage === 'user' ? cfg.user.short : cfg.cpu.short}</div>}
        {hud.sinBin.length > 0 && (
          <div className="sinbin">
            {hud.sinBin.map((b, i) => (
              <div key={i}>
                <i className="ycard" /> {b.team} {b.name} <b>{b.left}</b>
              </div>
            ))}
          </div>
        )}
        {tmo && (
          <div className={`tmo tmo-${tmo}`}>
            <small>TMO REVIEW</small>
            {tmo === 'check' ? 'CHECKING THE GROUNDING…' : tmo === 'try' ? 'TRY!' : 'NO TRY'}
          </div>
        )}
        {hud.call && !mini && (
          <div className="scrum-choose">
            <div className="scrum-choose-title">{hud.call.title}</div>
            <div className="scrum-choose-row">
              {hud.call.opts.map((o) => (
                <button key={o.id} className="scrum-play call-play" onPointerDown={() => input.current.actions.push({ type: 'call', id: o.id })}>
                  <b>{o.label}</b>
                  {o.sub && <small>{o.sub}</small>}
                </button>
              ))}
            </div>
          </div>
        )}
        {!cfg.drill && hud.wind.kmh > 0 && (
          <div className="wind-chip">
            <span style={{ transform: `rotate(${hud.wind.deg}deg)` }}>↑</span>
            {hud.wind.kmh} km/h
          </div>
        )}
        {hud.scrum && !mini && <ScrumBattle s={hud.scrum} input={input.current} userShort={cfg.user.short} cpuShort={cfg.cpu.short} />}
        {showControls && <Joystick input={input.current} />}
        {showControls && hud.attacking && !hud.ruck && <DodgeLayer input={input.current} />}
        {showControls && <ActionButtons input={input.current} attacking={hud.attacking} ruck={hud.ruck} ruckDef={hud.ruckDef} ruckBall={hud.ruckBall} onKick={() => setKickMenu(true)} canDrop={hud.canDrop} nearDef={hud.nearDef} offload={hud.offload} />}
        {showControls && !cfg.drill && <div className="mph">{hud.mph}<small>mph</small></div>}
        {mini && <MiniGame key={mini.id} req={mini} difficulty={cfg.difficulty} onDone={() => setMini(null)} />}
        {pk && engine.current && <PlaceKickUI key={pk.kind + pk.distance} req={pk} engine={engine.current} onDone={() => {}} />}
      </div>

      {howTo && (
        <div className="sheet">
          <div className="card howto" style={{ textAlign: 'center' }}>
            <h2>How to play</h2>
            <div className="howto-grid" style={{ textAlign: 'left' }}>
              <div>
                <b>Run</b>Floating stick on the left; push to the edge to sprint. Swipe left/right on the right side to dodge.
              </div>
              <div>
                <b>◀ Pass · Pass ▶ · Kick</b>Arrows show who gets the pass (hold = long). KICK / GRUB: tap, or hold and drag to place the landing ring. DROP GOAL appears in range.
              </div>
              <div>
                <b>Rucks</b>The arc fills until the ball is out. ADD PLAYER secures it (attacking) or contests it (defending).
              </div>
              <div>
                <b>Defending</b>Hold STAND to chase and tackle; DIVE from further out. You switch to the defender nearest the ball.
              </div>
              <div>
                <b>Set pieces</b>Scrum: swipe UP on SET, then keep swiping UP to win the push and call the play. Lineout: pick a jumper, swipe DOWN. Maul: swipe UP when the arrow is full.
              </div>
              <div>
                <b>Kicks at goal</b>Swipe from the ball to the posts. Speed is power; curve your swipe to beat the wind.
              </div>
            </div>
            <button
              className="btn primary"
              style={{ minWidth: 180 }}
              onClick={() => {
                try {
                  localStorage.setItem('tl-howto', '1');
                } catch {
                  /* private mode */
                }
                setHowTo(false);
                engine.current?.setPaused(false);
              }}
            >
              Play
            </button>
          </div>
        </div>
      )}

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
              <button className="btn ghost" onClick={() => (penalty.resolve('scrum'), setPenalty(null))}>
                Scrum
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
            {engine.current && <StatsTable st={engine.current.matchStats()} user={cfg.user.short} cpu={cfg.cpu.short} />}
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
          <div className="card" style={{ textAlign: 'center', maxHeight: '88vh', overflowY: 'auto' }}>
            <h2>Paused</h2>
            <div className="tabs" style={{ justifyContent: 'center', marginBottom: 10 }}>
              {(['menu', 'tactics', 'subs'] as const).map((t) => (
                <button key={t} className={`tab ${pauseTab === t ? 'on' : ''}`} onClick={() => setPauseTab(t)}>
                  {t === 'menu' ? 'Match' : t === 'tactics' ? 'Tactics' : 'Subs'}
                </button>
              ))}
            </div>
            {pauseTab === 'tactics' && (
              <div style={{ textAlign: 'left', marginBottom: 12 }}>
                <TacticsPanel
                  value={profile.settings.tactics}
                  onChange={(t) => {
                    update((p) => (p.settings.tactics = t));
                    engine.current?.setTactics(t);
                  }}
                />
              </div>
            )}
            {pauseTab === 'subs' && engine.current && <SubsPanel engine={engine.current} />}
            {pauseTab === 'menu' && <>
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
                  {m === 'broadcast' ? 'Broadcast' : m === 'close' ? 'Behind' : 'Side-on'}
                </button>
              ))}
            </div>
            </>}
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => pause(false)}>
                Resume
              </button>
              <button
                className="btn"
                onClick={() => {
                  setPaused(false); // close the pause sheet; the engine stays paused until "Play"
                  setHowTo(true);
                }}
              >
                How to play
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
            {fullStats && !cfg.drill && <StatsTable st={fullStats} user={cfg.user.short} cpu={cfg.cpu.short} potm />}
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

/** Pick a tired player, then a replacement from the bench. */
function SubsPanel({ engine }: { engine: MatchEngine }) {
  const [sel, setSel] = useState<number | null>(null);
  const [, force] = useState(0);
  const sq = engine.squad();
  return (
    <div style={{ textAlign: 'left', marginBottom: 12 }}>
      <div className="muted italic" style={{ fontSize: 12, marginBottom: 6 }}>{sel ? `Replace #${sel} with…` : 'Tap a player to take off'}</div>
      {sel === null ? (
        <div className="subs-grid">
          {sq.field.map((f) => (
            <button key={f.num} className="sub-row" disabled={f.off} onClick={() => setSel(f.num)}>
              <b>{f.num}</b>
              <span>{f.name}</span>
              <i className="stam" style={{ width: `${Math.round(f.stamina * 100)}%`, background: f.stamina < 0.4 ? '#ff3d5e' : f.stamina < 0.7 ? '#ffb020' : '#7dff3a' }} />
            </button>
          ))}
        </div>
      ) : (
        <div className="subs-grid">
          {sq.bench.length === 0 && <div className="muted">No replacements left.</div>}
          {sq.bench.map((b) => (
            <button
              key={b.idx}
              className="sub-row"
              onClick={() => {
                engine.substitute(sel, b.idx);
                setSel(null);
                force((x) => x + 1);
              }}
            >
              <b>{b.pos}</b>
              <span>{b.name}</span>
              <small>OVR {b.ovr}</small>
            </button>
          ))}
          <button className="btn ghost" onClick={() => setSel(null)}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}

function StatsTable({ st, user, cpu, potm = false }: { st: import('../game/types').MatchStats; user: string; cpu: string; potm?: boolean }) {
  const rows: [string, [number, number], string?][] = [
    ['Possession', st.possession, '%'],
    ['Territory', st.territory, '%'],
    ['Tackles made', st.tackles],
    ['Tackles missed', st.missed],
    ['Metres gained', st.metres],
    ['Line breaks', st.lineBreaks],
    ['Turnovers won', st.turnovers],
    ['Penalties conceded', st.penalties],
  ];
  return (
    <div className="stats-table">
      <div className="stats-head">
        <b>{user}</b>
        <span />
        <b>{cpu}</b>
      </div>
      {rows.map(([label, [a, b], unit]) => {
        const t = a + b || 1;
        return (
          <div key={label} className="stats-row">
            <b>{a}{unit}</b>
            <div>
              <small>{label}</small>
              <div className="stats-bar">
                <i style={{ width: `${(a / t) * 100}%` }} />
              </div>
            </div>
            <b>{b}{unit}</b>
          </div>
        );
      })}
      {potm && st.potm && (
        <div className="potm">
          <small>PLAYER OF THE MATCH</small>
          <b>{st.potm.name}</b> <span>({st.potm.team})</span>
          {st.potm.line && <div className="muted">{st.potm.line}</div>}
        </div>
      )}
    </div>
  );
}
