import { useEffect, useState } from 'react';
import { DeviceGate } from './ui/DeviceGate';
import { MainMenu } from './screens/MainMenu';
import { QuickMatch } from './screens/QuickMatch';
import { Championship } from './screens/Championship';
import { WorldCup } from './screens/WorldCup';
import { Challenges } from './screens/Challenges';
import { KickChallenge } from './screens/KickChallenge';
import { ControlsEditor } from './screens/ControlsEditor';
import { Training } from './screens/Training';
import { UTRoot } from './ut/UTRoot';
import { Settings } from './screens/Settings';
import { SquadViewer } from './screens/SquadViewer';
import { Stadiums } from './screens/Stadiums';
import { Competition } from './screens/Competition';
import type { CompKind } from './state/comps';
import { loadPlayerAsset } from './game/view/assets';
import { MatchScreen, type MatchOutcome } from './screens/MatchScreen';
import type { EngineResult, MatchConfig } from './game/types';
import { applySettings, getProfile, restoreFromIdb, runDailyCheck } from './state/store';
import { buildMatch, nationTeam, tutorialConfig, tutorialMatchConfig } from './state/teams';
import { finishTutorial } from './state/outcomes';
import { unlockAudio } from './util/audio';

export type Route =
  | { name: 'menu' }
  | { name: 'quick' }
  | { name: 'championship' }
  | { name: 'worldcup' }
  | { name: 'squad'; tab?: string }
  | { name: 'training' }
  | { name: 'tutorial' }
  | { name: 'ut'; page?: string }
  | { name: 'challenges' }
  | { name: 'kicking' }
  | { name: 'controls' }
  | { name: 'settings' }
  | { name: 'viewer' }
  | { name: 'stadiums'; start?: string; back: Route }
  | { name: 'comp'; kind: CompKind }
  | {
      name: 'match';
      cfg: MatchConfig;
      back: Route;
      onFinish?: (r: EngineResult) => MatchOutcome;
      onDrillDone?: (score: number, total: number) => MatchOutcome;
    };

export type Go = (r: Route) => void;

/** Dev builds: ?devmatch=ENG starts a match at that team's ground straight away (stadium checks). */
function devRoute(): Route {
  const q0 = new URLSearchParams(location.search);
  const id = import.meta.env.DEV ? q0.get('devmatch') : null;
  if (!id) {
    // first time the game is opened: the guided tutorial (?notut skips it, for tests)
    const p = getProfile();
    if (!p.tutorial?.done && p.stats.matches === 0 && !q0.has('notut')) return { name: 'tutorial' };
    if (import.meta.env.DEV && q0.has('tutorial')) return { name: 'tutorial' };
    return { name: 'menu' };
  }
  const opp = id === 'NZL' ? 'ENG' : 'NZL';
  const q = new URLSearchParams(location.search);
  const cfg = buildMatch(nationTeam(id), nationTeam(opp), true, getProfile());
  const tod = q.get('tod');
  if (tod === 'afternoon' || tod === 'golden' || tod === 'night') cfg.timeOfDay = tod;
  if (q.get('wx') === 'rain') cfg.weather = 'rain';
  if (q.get('imp')) cfg.importance = Number(q.get('imp'));
  if (q.get('sponsors') === 'off') cfg.realSponsors = false;
  const gfx = q.get('gfx');
  if (gfx === 'low' || gfx === 'medium' || gfx === 'high') cfg.quality = gfx;
  return { name: 'match', cfg, back: { name: 'menu' } };
}

export function App() {
  const [route, setRoute] = useState<Route>(devRoute);

  useEffect(() => {
    applySettings();
    void loadPlayerAsset(); // start downloading the player model straight away
    void restoreFromIdb().then(runDailyCheck);
    // iOS: audio can only start from a user gesture.
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchend', unlock);
    };
  }, []);

  const go: Go = (r) => setRoute(r);

  let screen: React.ReactNode;
  switch (route.name) {
    case 'menu':
      screen = <MainMenu go={go} />;
      break;
    case 'quick':
      screen = <QuickMatch go={go} />;
      break;
    case 'championship':
      screen = <Championship go={go} />;
      break;
    case 'worldcup':
      screen = <WorldCup go={go} />;
      break;
    case 'squad':
    case 'ut':
      // the old Squad mode grew into Ultimate Team (its cards are migrated on first open)
      screen = <UTRoot key="ut" go={go} page={route.name === 'ut' ? route.page : undefined} />;
      break;
    case 'training':
      screen = <Training go={go} />;
      break;
    case 'tutorial': {
      const p = getProfile();
      screen = (
        <MatchScreen
          key="tutorial"
          cfg={tutorialConfig(p)}
          onExit={() => go({ name: 'menu' })}
          onTutorialMatch={() => go({ name: 'match', cfg: tutorialMatchConfig(p), back: { name: 'menu' }, onFinish: (r) => finishTutorial(r) })}
        />
      );
      break;
    }
    case 'challenges':
      screen = <Challenges go={go} />;
      break;
    case 'kicking':
      screen = <KickChallenge go={go} />;
      break;
    case 'controls':
      screen = <ControlsEditor go={go} />;
      break;
    case 'settings':
      screen = <Settings go={go} />;
      break;
    case 'stadiums':
      screen = <Stadiums go={go} start={route.start} back={route.back} />;
      break;
    case 'viewer':
      screen = <SquadViewer go={go} />;
      break;
    case 'comp':
      screen = <Competition key={route.kind} go={go} kind={route.kind} />;
      break;
    case 'match':
      screen = <MatchScreen cfg={route.cfg} onFinish={route.onFinish} onDrillDone={route.onDrillDone} onExit={() => go(route.back)} />;
      break;
  }

  return <DeviceGate>{screen}</DeviceGate>;
}
