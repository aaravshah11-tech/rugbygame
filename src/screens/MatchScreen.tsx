import { rand } from '../util/rng';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MatchEngine } from '../game/engine';
import { loadPlayerAsset } from '../game/view/assets';
import { createInput, type KickKind, type EngineEvent, type EngineResult, type HudState, type MatchConfig, type MiniGameRequest, type PenaltyChoice, type PlaceKickRequest, type SetPlayId } from '../game/types';
import { ActionButtons, setControlLayout, CatchButton, DodgeLayer, Joystick, KICKS, KickPicker, KickTypeChooser } from '../ui/controls';
import { MiniGame, PlaceKickUI, PROMPT_TIMEOUT, ScoreBug, ScrumBattle, usePromptTimeout, type Comm } from '../ui/overlays';
import { audio } from '../util/audio';
import { TeamLogo } from '../ui/logos';
import { BrandLogo } from '../ui/BrandLogo';
import { COMP_TITLE, SPONSOR_BY_ID, TEAM_DEALS } from '../data/sponsors';
import type { MatchSponsors } from '../sponsors/manager';
import { TacticsPanel } from '../ui/tactics';
import { CustomPlaysEditor } from '../ui/setplays';
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
  controlledName: '', controlledNum: 0, stamina: 1, timeUp: false, phase: 'pre', phaseNum: 0, ruck: null, canDrop: false, mph: 0, scrum: null, nearDef: false, offload: false, ruckDef: 'none', ruckBall: null, catchPrompt: false, wind: { deg: 0, mph: 0 }, isNine: false, call: null, penTouch: false, atBase: false, nineWait: false, chargePrompt: null, canDiveTry: false, kickoffAim: false, maulDefend: false, advantage: null, sinBin: [],
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
  setControlLayout(profile.settings.controlLayout);
  const [kickMenu, setKickMenu] = useState(false);
  const contestStart = useRef<{ y: number; t: number } | null>(null);
  const [designing, setDesigning] = useState(false);
  const [kickKind, setKickKind] = useState<KickKind>('punt');
  const [intro, setIntro] = useState<null | { title: string; sub: string }>(null);
  const [fullStats, setFullStats] = useState<import('../game/types').MatchStats | null>(null);
  const [tmo, setTmo] = useState<null | 'check' | 'try' | 'notry'>(null);
  const [pops, setPops] = useState<{ id: number; text: string; tone: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sp, setSp] = useState<MatchSponsors | null>(null);
  // loading screen: the competition's title sponsor and the home side's partners, rotating
  const loadingBrands = useMemo(() => {
    if (cfg.realSponsors === false) return [];
    const home = cfg.userIsHome ? cfg.user.id : cfg.cpu.id;
    const ids = [COMP_TITLE[cfg.competition ?? 'quick'], ...(TEAM_DEALS[home]?.partners ?? [])].filter((id, i, a) => id && a.indexOf(id) === i);
    return ids.map((id) => SPONSOR_BY_ID[id]).filter(Boolean);
  }, [cfg]);
  const [brandI, setBrandI] = useState(0);
  useEffect(() => {
    if (!loading || loadingBrands.length < 2) return;
    const t = setInterval(() => setBrandI((i) => i + 1), 1100);
    return () => clearInterval(t);
  }, [loading, loadingBrands.length]);
  const [tryBanner, setTryBanner] = useState<{ id: number; scorer: string; team: string; user: boolean } | null>(null);
  const [replay, setReplay] = useState(false);
  const [howTo, setHowTo] = useState(false);
  // a penalty decision left too long goes to the obvious option
  usePromptTimeout(PROMPT_TIMEOUT.penaltyChoice, paused || howTo, () => {
    if (!penalty) return;
    penalty.resolve(penalty.canKick ? 'goal' : 'touch');
    setPenalty(null);
  }, !!penalty);
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
      setSp(eng.sponsors);
      if (import.meta.env.DEV) Object.assign(window, { __engine: eng, __rand: rand });
      setLoading(false);
      let seen = false;
      try {
        seen = localStorage.getItem('tl-howto') === '1';
      } catch {
        /* private mode */
      }
      const firstTime = !cfg.drill && !cfg.challenge && !seen;
      // first match: How to Play comes first; the intro only starts once it's closed
      eng.start(firstTime);
      if (firstTime) {
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
          {loadingBrands.length > 0 && (
            <div className="loading-partners">
              <small>Official partners</small>
              <div className="loading-brand" key={brandI}>
                <BrandLogo sponsor={loadingBrands[brandI % loadingBrands.length]} height={30} />
              </div>
            </div>
          )}
        </div>
      )}
      {intro && !howTo && (
        <div className="intro-card" onPointerDown={() => engine.current?.skipIntro()}>
          {cfg.drill || cfg.challenge ? (
            <>
              <div className="intro-title">{intro.title}</div>
              <div className="intro-sub">{intro.sub}</div>
            </>
          ) : (
            // broadcast-style versus card: badges slam in from each side
            <div className="vs">
              {[userIsHome ? cfg.user : cfg.cpu, userIsHome ? cfg.cpu : cfg.user].map((t, i) => (
                <div key={t.id} className={`vs-team ${i ? 'r' : 'l'}`} style={{ '--kit': t.kit.primary } as React.CSSProperties}>
                  <TeamLogo id={t.id} size={64} />
                  <b>{t.name}</b>
                </div>
              ))}
              <div className="vs-v">V</div>
              <div className="vs-venue">
                <span className="vs-wx" aria-label={cfg.weather === 'rain' ? 'Rain' : 'Dry'}>{cfg.weather === 'rain' ? '🌧' : '☾'}</span>
                {intro.sub}
              </div>
              {sp && (
                <div className="vs-sponsor">
                  <small>In association with</small> <BrandLogo sponsor={sp.title} height={20} />
                </div>
              )}
              <button className="btn primary vs-go" onPointerDown={(e) => (e.stopPropagation(), engine.current?.skipIntro())}>
                Kick off
              </button>
            </div>
          )}
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
        {showControls && !kickMenu && hud.attacking && !hud.ruck && hud.canAct && !cfg.drill && (
          <div className="moves-strip">
            <small>MOVES</small>
            {[
              { id: 'crash' as SetPlayId, name: 'Crash' },
              { id: 'loop' as SetPlayId, name: 'Loop' },
              { id: 'miss' as SetPlayId, name: 'Skip' },
              { id: 'switch' as SetPlayId, name: 'Switch' },
              ...(cfg.customPlays ?? []).map((cp) => ({ id: `custom:${cp.id}` as SetPlayId, name: cp.name })),
            ].map((m) => (
              <button
                key={m.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  audio.click();
                  input.current.actions.push({ type: 'setplay', id: m.id });
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
        {tryBanner && <div className={`try-flash ${tryBanner.user ? '' : 'them'}`} key={'f' + tryBanner.id} />}
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
        {replay && sp && (
          <div className="replay-sting" style={{ '--b': sp.replay.colors.bg } as React.CSSProperties}>
            <small>Replay brought to you by</small>
            <BrandLogo sponsor={sp.replay} height={22} />
          </div>
        )}
        {sp && !cfg.drill && !loading && hud.phase !== 'pre' && (
          <div className="bug-sponsor">
            <small>in association with</small> <BrandLogo sponsor={sp.title} height={13} />
          </div>
        )}
        {pops.map((p) => (
          <div key={p.id} className={`pop-text pop-${p.tone}`}>
            {p.text}
          </div>
        ))}
        {kickMenu && hud.attacking && (profile.settings.kickControls ?? 'swipe') === 'swipe' && (
          <KickTypeChooser kind={kickKind} isNine={hud.isNine} onPick={(k) => (setKickKind(k), setKickMenu(false))} onClose={() => setKickMenu(false)} />
        )}
        {kickMenu && hud.attacking && profile.settings.kickControls === 'aim' && (
          <KickPicker
            input={input.current}
            isNine={hud.isNine}
            kind={kickKind}
            setKind={setKickKind}
            powerMode
            aimAt={(x, y, k) => engine.current?.aimKickAt(x, y, k) ?? null}
            onClose={(kicked) => {
              setKickMenu(false);
              engine.current?.setAimFreeze(false);
              if (!kicked) engine.current?.clearKickTarget();
            }}
          />
        )}
        {hud.atBase && (
          <div className="base-tag">
            <b>#9 AT THE BASE</b> {hud.controlledName}
          </div>
        )}
        {hud.chargePrompt && (
          <div className={`charge-layer ${hud.chargePrompt}`} onPointerDown={() => input.current.actions.push({ type: 'charge' })}>
            <div className="charge-banner">
              <small>THEIR CONVERSION</small>
              {hud.chargePrompt === 'wait' ? 'WAIT FOR THE RUN-UP…' : 'CHARGE! TAP!'}
            </div>
            <div className={`charge-btn ${hud.chargePrompt}`}>
              CHARGE
              <small>{hud.chargePrompt === 'wait' ? 'too early = wasted' : 'GO NOW!'}</small>
            </div>
          </div>
        )}
        {showControls && !paused && hud.canDiveTry && (
          <button className="dive-try-btn" onPointerDown={() => input.current.actions.push({ type: 'diveTry' })}>
            DIVE!
            <small>for the line</small>
          </button>
        )}
        {hud.maulDefend && (
          <button className="collapse-btn" onPointerDown={() => input.current.actions.push({ type: 'collapseMaul' })}>
            COLLAPSE
            <small>stop the drive · penalty risk</small>
          </button>
        )}
        {hud.nineWait && <div className="base-tag wait">WAITING FOR THE 9…</div>}
        {hud.penTouch && !penalty && (
          <KickPicker key="pen" input={input.current} isNine={false} kind="touch" locked title="Kick for touch" aimAt={(x, y, k) => engine.current?.aimKickAt(x, y, k) ?? null}
            flick={(dx, dy, k) => engine.current?.aimKickFlick(dx, dy, k) ?? null} onClose={() => {}} />
        )}
        {hud.kickoffAim && (
          <KickPicker key="ko" input={input.current} isNine={false} kind="high" locked title="Kick-off" aimAt={(x, y, k) => engine.current?.aimKickAt(x, y, k) ?? null}
            flick={(dx, dy, k) => engine.current?.aimKickFlick(dx, dy, k) ?? null} onClose={() => {}} />
        )}
        {showControls && hud.catchPrompt && (
          <>
            <div
              className="contest-layer"
              onPointerDown={(e) => (contestStart.current = { y: e.clientY, t: performance.now() })}
              onPointerUp={(e) => {
                const c0 = contestStart.current;
                contestStart.current = null;
                if (c0 && c0.y - e.clientY > 30 && performance.now() - c0.t < 600) input.current.actions.push({ type: 'catch' });
              }}
            >
              <span>SWIPE UP TO GO UP FOR IT</span>
            </div>
            <CatchButton input={input.current} />
          </>
        )}
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
        {!cfg.drill && hud.wind.mph > 0 && (
          <div className="wind-chip">
            <span style={{ transform: `rotate(${hud.wind.deg}deg)` }}>↑</span>
            {hud.wind.mph} mph
          </div>
        )}
        {hud.scrum && !mini && <ScrumBattle s={hud.scrum} input={input.current} userShort={cfg.user.short} cpuShort={cfg.cpu.short} />}
        {showControls && <Joystick input={input.current} />}
        {showControls && hud.attacking && !hud.ruck && <DodgeLayer input={input.current} />}
        {showControls && <ActionButtons input={input.current} attacking={hud.attacking} ruck={hud.ruck} ruckDef={hud.ruckDef} ruckBall={hud.ruckBall} onKick={(k) => {
              if (k) setKickKind(k);
              setKickMenu(true);
              if (profile.settings.kickControls === 'aim') engine.current?.setAimFreeze(true);
            }}
            kickMode={profile.settings.kickControls ?? 'swipe'}
            passMode={profile.settings.passButtons ?? 'two'}
            onKickHold={(on) => engine.current?.setKickHold(on)}
            kickKind={kickKind}
            kickLabel={kickKind === 'punt' ? 'hold · swipe up' : KICKS.find((k) => k.kind === kickKind)?.label}
            atBase={hud.atBase} canDrop={hud.canDrop} nearDef={hud.nearDef} offload={hud.offload} />}
        {showControls && !cfg.drill && <div className="mph">{hud.mph}<small>mph</small></div>}
        {mini && <MiniGame key={mini.id} req={mini} difficulty={cfg.difficulty} paused={paused || howTo} onDone={() => setMini(null)} />}
        {pk && engine.current && <PlaceKickUI key={pk.kind + pk.distance} req={pk} engine={engine.current} paused={paused || howTo} onDone={() => {}} />}
      </div>

      {howTo && (
        <div className="sheet">
          <div className="card howto" style={{ textAlign: 'center' }}>
            <h2>How to play</h2>
            <div className="howto-grid" style={{ textAlign: 'left' }}>
              <div>
                <b>Run</b>The stick appears where your left thumb lands. Push it to the edge or hold SPRINT to sprint. STEP (or swipe up on the right) sidesteps; HAND-OFF lights up when a defender is close.
              </div>
              <div>
                <b>Pass</b>
                {profile.settings.passButtons === 'one'
                  ? 'PASS goes to the side you push the stick, or the best runner. '
                  : '◀ PASS and PASS ▶ pass that way. '}
                Hold for a long pass; swipe left/right on the right half for a quick one. The ! marks who is calling for it. In a tackle, PASS becomes OFFLOAD.
              </div>
              <div>
                <b>Kick</b>
                {profile.settings.kickControls === 'aim'
                  ? 'KICK pauses play: pick the kick, touch where it should land, hold to fill the power bar into the green, let go. '
                  : 'Hold KICK, slide to aim, then swipe up fast: the faster the swipe, the longer the kick. Tap KICK to choose the kick type. '}
                DROP GOAL appears in range.
              </div>
              <div>
                <b>Rucks</b>Your 9 waits at the base: spin PASS left or right, BOX KICK, PICK &amp; GO or SNIPE. ADD PLAYER for quicker ball. Defending: CONTEST (tap fast) or FAN OUT.
              </div>
              <div>
                <b>Defending</b>Hold TACKLE to chase the carrier and tackle him, DIVE for extra reach, SWITCH to change player. Swipe up (or CATCH) to contest high balls; CHARGE their conversions once the kicker runs in.
              </div>
              <div>
                <b>Set pieces</b>Scrum: swipe UP on SET, then keep swiping UP to push and call the play. Lineout: pick Front / Middle / Back, tap in the green, then PASS, RUN or MAUL. Maul: swipe UP each time the arrow fills; COLLAPSE when defending.
              </div>
              <div>
                <b>Kicks at goal</b>Swipe from the ball to the posts: speed is power, curve it to beat the wind. On conversions you can move the ball back for a better angle.
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
                engine.current?.beginIntro();
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
              {[...SET_PLAYS, ...(cfg.customPlays ?? []).map((cp) => ({ id: `custom:${cp.id}` as SetPlayId, name: cp.name, desc: cp.steps.map((x) => `${x.num} ${x.line}`).join(' → ') }))].map((sp) => (
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
            <button
              className="btn cyan"
              style={{ marginTop: 10 }}
              onClick={(e) => {
                e.stopPropagation();
                setPlays(false);
                setDesigning(true);
                engine.current?.setPaused(true);
              }}
            >
              + Design a play on the pitch
            </button>
          </div>
        </div>
      )}

      {designing && (
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="card" style={{ minWidth: 320, maxHeight: '88vh', overflowY: 'auto' }}>
          <h3>My set plays</h3>
          <CustomPlaysEditor
            plays={profile.settings.customPlays ?? []}
            onChange={(pl) => {
              update((p) => (p.settings.customPlays = pl));
              cfg.customPlays = pl;
              engine.current?.setCustomPlays(pl);
            }}
          />
          </div>
          <button className="btn primary design-done" onClick={() => (setDesigning(false), engine.current?.setPaused(false))}>
            Done
          </button>
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
            {engine.current && <StatsTable st={engine.current.matchStats()} user={cfg.user.short} cpu={cfg.cpu.short} sp={sp} />}
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
              {!cfg.drill && (
                <button
                  className="btn cyan"
                  onClick={() => {
                    audio.click();
                    pause(false);
                    engine.current?.simulateRest();
                  }}
                >
                  Simulate result
                </button>
              )}
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
        <div className="sheet fulltime">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>{outcome.title}</h2>
            {!cfg.drill && (
              <div className="result-score">
                {cfg.user.short} {hud.userScore} – {hud.cpuScore} {cfg.cpu.short}
              </div>
            )}
            {fullStats && !cfg.drill && <StatsTable st={fullStats} user={cfg.user.short} cpu={cfg.cpu.short} potm sp={sp} />}
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

function StatsTable({ st, user, cpu, potm = false, sp = null }: { st: import('../game/types').MatchStats; user: string; cpu: string; potm?: boolean; sp?: MatchSponsors | null }) {
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
      {sp && (
        <div className="stats-powered">
          Powered by <BrandLogo sponsor={sp.stats} height={12} />
        </div>
      )}
      <div className="stats-head">
        <b>{user}</b>
        <span />
        <b>{cpu}</b>
      </div>
      {rows.map(([label, [a, b], unit], i) => {
        const t = a + b || 1;
        return (
          <div key={label} className="stats-row" style={{ '--i': i } as React.CSSProperties}>
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
          {sp && (
            <span className="potm-sponsor">
              presented by <BrandLogo sponsor={sp.potm} height={14} />
            </span>
          )}
          <b>{st.potm.name}</b> <span>({st.potm.team})</span>
          {st.potm.line && <div className="muted">{st.potm.line}</div>}
        </div>
      )}
    </div>
  );
}
