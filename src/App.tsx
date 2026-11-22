import { useEffect, useState } from 'react';
import { DeviceGate } from './ui/DeviceGate';
import { MainMenu } from './screens/MainMenu';
import { QuickMatch } from './screens/QuickMatch';
import { Championship } from './screens/Championship';
import { WorldCup } from './screens/WorldCup';
import { SquadBuilder } from './screens/SquadBuilder';
import { Training } from './screens/Training';
import { Settings } from './screens/Settings';
import { SquadViewer } from './screens/SquadViewer';
import { Competition } from './screens/Competition';
import type { CompKind } from './state/comps';
import { loadPlayerAsset } from './game/view/assets';
import { MatchScreen, type MatchOutcome } from './screens/MatchScreen';
import type { EngineResult, MatchConfig } from './game/types';
import { applySettings, restoreFromIdb, runDailyCheck } from './state/store';
import { unlockAudio } from './util/audio';

export type Route =
  | { name: 'menu' }
  | { name: 'quick' }
  | { name: 'championship' }
  | { name: 'worldcup' }
  | { name: 'squad'; tab?: string }
  | { name: 'training' }
  | { name: 'settings' }
  | { name: 'viewer' }
  | { name: 'comp'; kind: CompKind }
  | {
      name: 'match';
      cfg: MatchConfig;
      back: Route;
      onFinish?: (r: EngineResult) => MatchOutcome;
      onDrillDone?: (score: number, total: number) => MatchOutcome;
    };

export type Go = (r: Route) => void;

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'menu' });

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
      screen = <SquadBuilder go={go} initialTab={route.tab} />;
      break;
    case 'training':
      screen = <Training go={go} />;
      break;
    case 'settings':
      screen = <Settings go={go} />;
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
