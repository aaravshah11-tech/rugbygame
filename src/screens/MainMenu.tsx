import { useEffect, useMemo, useRef, useState } from 'react';
import type { Go, Route } from '../App';
import { MenuScene } from '../game/menuScene';
import { CLUB_NATION, nationById } from '../data/nations';
import { venueFor } from '../data/venues';
import { claimChallenge, claimLoginReward, LOGIN_REWARDS, reduceMotion, useProfile } from '../state/store';
import { clubOvr } from '../state/teams';
import type { Profile } from '../state/types';
import { TeamLogo } from '../ui/logos';
import { IconCards, IconCrown, IconGear, IconGift, IconGlobe, IconPosts, IconShield, IconTarget, IconTrophy, IconWhistle } from '../ui/icons';
import { audio } from '../util/audio';
import { isStandalone } from '../util/device';

let dailyShown = false;
const today = () => new Date().toISOString().slice(0, 10);
/** the launch intro plays once per app launch */
let introPlayed = false;

// ---------------------------------------------------------------- derived display data
/** A level for show, earned from what's already in the save: matches, wins, tries, trophies, drills. */
function levelOf(p: Profile) {
  const trophies = p.trophies.championship + p.trophies.worldCup + p.trophies.seasons + (p.trophies.league ?? 0) + (p.trophies.prem ?? 0);
  let xp = p.stats.matches * 120 + p.stats.wins * 180 + p.stats.tries * 30 + p.stats.tackles * 2 + trophies * 600 + Object.keys(p.trainingDone).length * 150;
  let level = 1;
  let need = 800;
  while (xp >= need) {
    xp -= need;
    level++;
    need = 800 + (level - 1) * 200;
  }
  return { level, frac: xp / need };
}

function compHint(p: Profile, kind: 'six' | 'league' | 'prem'): string {
  const c = p.comps[kind];
  if (!c) return 'Pick a team to start';
  if (c.stage === 'done') return c.champion === c.user ? 'Champions!' : 'Season complete';
  if (c.stage === 'league') return `Round ${Math.min(c.round, c.rounds)} of ${c.rounds}`;
  return c.stage === 'final' ? 'The final' : 'Semi-finals';
}

function wcHint(p: Profile): string {
  const w = p.worldCup;
  if (!w) return 'Pick a nation';
  if (w.stage === 'done') return w.champion === w.user ? 'World champions!' : 'Tournament over';
  if (w.eliminated) return 'Knocked out';
  return { group: 'Pool stage', QF: 'Quarter-finals', SF: 'Semi-finals', Final: 'The final' }[w.stage];
}

interface ModeTile {
  key: string;
  title: string;
  sub: string;
  hint: string;
  accent: string;
  icon: (p: { className?: string }) => React.ReactElement;
  route: Route;
}

function useCountUp(target: number, animate: boolean) {
  const [v, setV] = useState(animate ? 0 : target);
  const from = useRef(animate ? 0 : target);
  useEffect(() => {
    if (!animate) {
      setV(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    const dur = 900;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - (1 - k) ** 3;
      setV(Math.round(a + (target - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);
  return v;
}

// ---------------------------------------------------------------- launch intro
function LaunchIntro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    // floodlight banks clunk on one by one, then the logo slams in
    [0.12, 0.38, 0.64].forEach((d) => audio.clunk(d));
    audio.slam(0.95);
    // dev: ?introhold keeps it up for screenshots
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('introhold')) return;
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="launch" onPointerDown={onDone} role="button" aria-label="Skip intro">
      <div className="launch-lights">
        <i style={{ animationDelay: '0.12s' }} />
        <i style={{ animationDelay: '0.38s' }} />
        <i style={{ animationDelay: '0.64s' }} />
      </div>
      <div className="launch-logo">
        TRY <span>LINE</span>
      </div>
      <div className="launch-flash" />
      <small className="launch-skip">Tap to skip</small>
    </div>
  );
}

// ---------------------------------------------------------------- menu
export function MainMenu({ go }: { go: Go }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MenuScene | null>(null);
  const p = useProfile();
  const motion = !reduceMotion();
  const [intro, setIntro] = useState(!introPlayed && motion);
  const [daily, setDaily] = useState(false);
  const [installTip, setInstallTip] = useState(!isStandalone() && !sessionStorage.getItem('tl-install-tip'));
  const fav = nationById(p.lastQuick?.home ?? CLUB_NATION.id);
  const favKit = (p.lastQuick ? fav : CLUB_NATION).kit;

  useEffect(() => {
    const s = new MenuScene(host.current!, favKit, { reduceMotion: !motion, intro: !introPlayed && motion });
    scene.current = s;
    if (import.meta.env.DEV) Object.assign(window, { __menu: s });
    audio.startMusic();
    return () => {
      scene.current = null;
      s.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const endIntro = useMemo(
    () => () => {
      introPlayed = true;
      setIntro(false);
      scene.current?.lightsOn();
    },
    [],
  );
  useEffect(() => {
    if (!motion) introPlayed = true;
  }, [motion]);

  useEffect(() => {
    if (!installTip) return;
    const t = setTimeout(() => {
      sessionStorage.setItem('tl-install-tip', '1');
      setInstallTip(false);
    }, 6000);
    return () => clearTimeout(t);
  }, [installTip]);

  // Daily Rewards opens by itself at most once per day (after the intro); after that it's behind the DAILY button.
  useEffect(() => {
    if (intro || p.daily.pendingReward <= 0 || dailyShown) return;
    dailyShown = true;
    const d = new Date().toISOString().slice(0, 10);
    let last = '';
    try {
      last = localStorage.getItem('tl-daily-auto') ?? '';
      localStorage.setItem('tl-daily-auto', d);
    } catch {
      /* private mode */
    }
    if (last !== d) setDaily(true);
  }, [p.daily.pendingReward, intro]);

  const nav = (r: Route) => {
    audio.click();
    go(r);
  };
  const unclaimed = p.daily.challenges.filter((c) => !c.claimed && c.progress >= c.target).length + (p.daily.pendingReward > 0 ? 1 : 0);
  const lv = levelOf(p);
  const coins = useCountUp(p.coins, motion);

  // hero fixture: the teams last played in Quick Match (or the classic)
  const home = p.lastQuick?.home ?? 'ENG';
  const away = p.lastQuick?.away ?? 'NZL';
  const H = nationById(home);
  const A = nationById(away);

  const scenDone = p.scenarios && p.scenarios.date === today() ? p.scenarios.done.length : 0;
  const kickPassed = Object.values(p.kickLevels ?? {}).filter((k) => k.passed).length;
  const drills = Object.keys(p.trainingDone).length;
  const tiles: ModeTile[] = [
    { key: 'league', title: 'Nations League', sub: 'North v South', hint: compHint(p, 'league'), accent: 'var(--pink)', icon: IconGlobe, route: { name: 'comp', kind: 'league' } },
    { key: 'six', title: 'Nations Championship', sub: 'Six nations', hint: compHint(p, 'six'), accent: 'var(--cyan)', icon: IconCrown, route: { name: 'comp', kind: 'six' } },
    { key: 'prem', title: 'The Prem', sub: '10 clubs', hint: compHint(p, 'prem'), accent: 'var(--gold)', icon: IconShield, route: { name: 'comp', kind: 'prem' } },
    { key: 'wc', title: 'World Cup', sub: 'Pools · knockouts', hint: wcHint(p), accent: '#5aa0ff', icon: IconTrophy, route: { name: 'worldcup' } },
    { key: 'squad', title: 'Squad', sub: 'Cards · packs', hint: `Squad OVR ${clubOvr(p)} · ${p.club.cards.length} cards`, accent: 'var(--elite)', icon: IconCards, route: { name: 'squad' } },
    { key: 'ch', title: 'Challenges', sub: 'Daily scenarios', hint: scenDone >= 3 ? 'All done today' : `${3 - scenDone} challenge${3 - scenDone === 1 ? '' : 's'} left`, accent: '#ff8a3d', icon: IconTarget, route: { name: 'challenges' } },
    { key: 'kick', title: 'Kicking', sub: 'Easy → extreme', hint: `${kickPassed} of 5 levels passed`, accent: 'var(--neon)', icon: IconPosts, route: { name: 'kicking' } },
    { key: 'train', title: 'Training', sub: 'Tutorials', hint: drills >= 4 ? 'All drills cleared' : `${drills} of 4 drills cleared`, accent: '#7de3ff', icon: IconWhistle, route: { name: 'training' } },
  ];

  // carousel: the tile nearest the left edge is "focused"
  const rail = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(0);
  const onRail = () => {
    const el = rail.current;
    if (!el) return;
    const kids = [...el.children] as HTMLElement[];
    const x = el.scrollLeft;
    let best = 0;
    let bd = Infinity;
    kids.forEach((k, i) => {
      const d = Math.abs(k.offsetLeft - el.offsetLeft - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setFocus(best);
  };

  // ticker: the player's own recent results and record
  const ticker = useMemo(() => {
    const items: string[] = [];
    const recent = p.recent ?? [];
    recent.forEach((r, i) => {
      const hs = nationById(r.home).short;
      const as = nationById(r.away).short;
      items.push(`${i === 0 ? 'Last match' : 'Result'}: ${hs} ${r.homeScore}–${r.awayScore} ${as} · ${r.tries} ${r.tries === 1 ? 'try' : 'tries'}`);
    });
    const s = p.stats;
    if (s.matches) {
      items.push(`Record: W${s.wins} D${s.draws} L${s.losses}`);
      items.push(`${s.tries} tries · ${s.tackles} tackles`);
    } else items.push('Welcome to Try Line · play a Quick Match to start your record');
    const t = p.trophies.championship + p.trophies.worldCup + p.trophies.seasons + (p.trophies.league ?? 0) + (p.trophies.prem ?? 0);
    if (t) items.push(`${t} ${t === 1 ? 'trophy' : 'trophies'} in the cabinet`);
    items.push(`Daily streak: day ${Math.max(1, p.daily.streak)} of 7`);
    return items;
  }, [p.recent, p.stats, p.trophies, p.daily.streak]);

  // the player on the right: drag for parallax, tap for a celebration
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  return (
    <div className={`screen menu ${intro ? 'pre' : 'in'}`} style={{ padding: 0 }}>
      <div ref={host} className="menu-bg" />
      <div className="menu-shade" />
      <div
        className="menu-player-hit"
        aria-label="Player"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          scene.current?.requestTilt();
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.hypot(dx, dy) > 8) d.moved = true;
          scene.current?.dragParallax(dx / innerWidth, dy / innerHeight);
        }}
        onPointerUp={() => {
          if (drag.current && !drag.current.moved) scene.current?.celebrate();
          drag.current = null;
          scene.current?.dragParallax(0, 0, true);
        }}
        onPointerCancel={() => {
          drag.current = null;
          scene.current?.dragParallax(0, 0, true);
        }}
      />

      <div className="menu-layer2">
        <header className="mtop">
          <div className="mlogo" aria-label="Try Line">
            <span className="t">TRY</span>
            <span className="l">LINE</span>
          </div>
          <div className="mlevel" title={`Level ${lv.level}`}>
            <b>LV {lv.level}</b>
            <span className="xp">
              <i style={{ width: `${Math.round(lv.frac * 100)}%` }} />
            </span>
          </div>
          <div className="grow" />
          <button className="mchip" onClick={() => (audio.click(), setDaily(true))} aria-label="Daily rewards">
            <IconGift className="ic" />
            <span>Daily</span>
            {unclaimed > 0 && <em className="badge">{unclaimed}</em>}
          </button>
          <span className="coins">
            <span className="coin-dot" />
            {coins.toLocaleString()}
          </span>
          <button className="mchip icon" aria-label="Settings" onClick={() => nav({ name: 'settings' })}>
            <IconGear className="ic" />
          </button>
        </header>

        <button className="hero" onClick={() => nav({ name: 'quick' })} style={{ '--h': H.kit.primary, '--a': A.kit.primary } as React.CSSProperties}>
          <span className="hero-glow" />
          <span className="hero-label">Quick Match · any team</span>
          <span className="hero-play">
            PLAY <span className="arrow">▶</span>
          </span>
          <span className="hero-fix">
            <span className="hero-team">
              <TeamLogo id={home} size={34} />
              {H.short}
            </span>
            <span className="v">v</span>
            <span className="hero-team">
              <TeamLogo id={away} size={34} />
              {A.short}
            </span>
          </span>
          <span className="hero-venue">{venueFor(home).name}</span>
        </button>

        <div className="rail" ref={rail} onScroll={onRail}>
          {tiles.map((t, i) => (
            <button
              key={t.key}
              className={`mtile ${i === focus ? 'focus' : ''}`}
              style={{ '--accent': t.accent, '--i': i } as React.CSSProperties}
              onClick={() => nav(t.route)}
            >
              <t.icon className="mtile-ic" />
              <span className="mtile-sub">{t.sub}</span>
              <h3>{t.title}</h3>
              <span className="mtile-hint">{t.hint}</span>
            </button>
          ))}
        </div>

        <div className="ticker" aria-label="Your recent results">
          <span className="ticker-tag">Live</span>
          <div className="ticker-track">
            <div className="ticker-run">
              {[...ticker, ...ticker].map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {intro && <LaunchIntro onDone={endIntro} />}

      {installTip && !daily && !intro && (
        <div className="toast" onClick={() => (sessionStorage.setItem('tl-install-tip', '1'), setInstallTip(false))}>
          Tip: Share → Add to Home Screen to play full screen ✕
        </div>
      )}

      {daily && (
        <div className="sheet" onClick={() => setDaily(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2 className="grow">Daily Rewards</h2>
              <button className="btn back" onClick={() => setDaily(false)}>
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: '4px 0 8px' }}>Login streak: day {p.daily.streak} of 7</p>
            <div className="row" style={{ gap: 6 }}>
              {LOGIN_REWARDS.map((r, i) => (
                <div
                  key={i}
                  className={`day-chip ${i + 1 === p.daily.streak ? 'now' : ''}`}
                  style={{ opacity: i + 1 < p.daily.streak || (i + 1 === p.daily.streak && p.daily.pendingReward === 0) ? 0.45 : 1 }}
                >
                  <small>DAY {i + 1}</small>
                  <b>{r}</b>
                </div>
              ))}
            </div>
            {p.daily.pendingReward > 0 && (
              <button className="btn primary" style={{ width: '100%', marginTop: 10 }} onClick={claimLoginReward}>
                Claim {p.daily.pendingReward} coins
              </button>
            )}
            <h3 style={{ marginTop: 16 }}>Today's challenges</h3>
            {p.daily.challenges.map((c) => (
              <div key={c.id} className="row" style={{ marginTop: 8 }}>
                <div className="grow">
                  <b className="italic">{c.label}</b>
                  <div className="stam" style={{ width: '100%', marginTop: 4 }}>
                    <i style={{ width: `${(c.progress / c.target) * 100}%` }} />
                  </div>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  {c.progress}/{c.target}
                </span>
                <button className="btn primary" style={{ minWidth: 96 }} disabled={c.claimed || c.progress < c.target} onClick={() => claimChallenge(c.id)}>
                  {c.claimed ? 'Done' : `+${c.reward}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
