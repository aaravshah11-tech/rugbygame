import { useEffect, useState } from 'react';
import type { Go } from '../App';
import { hashString, makeRng } from '../util/rng';
import { UT_START } from './config';
import { cardPool, type OwnedCard } from './pool';
import { collectFreePacks, newCard, restoreUT, startUT, updateUT, useUT } from './store';
import { weeklyRollover } from './modes';
import { refreshMarket, processSales } from './market';
import { addCoins } from './store';
import { recordEvent } from './progress';
import './ut.css';
import { Hub } from './pages/Hub';
import { Store } from './pages/Store';
import { SquadPage } from './pages/Squad';
import { Collection } from './pages/Collection';
import { Market } from './pages/Market';
import { SbcPage } from './pages/Sbc';
import { Objectives } from './pages/Objectives';
import { Battles, Champions, Draft, Friendlies, MomentsPage, Rivals } from './pages/Modes';
import { Evolutions } from './pages/Evolutions';
import { ClubPage } from './pages/Club';
import { Welcome } from './pages/Welcome';

export type UTPage = 'hub' | 'store' | 'squad' | 'collection' | 'market' | 'sbc' | 'objectives' | 'battles' | 'rivals' | 'champions' | 'moments' | 'draft' | 'friendly' | 'evo' | 'club';
export interface UTNav {
  go: Go;
  page: (p: UTPage) => void;
}

/** A playable starter XV + bench: in-position cards (OVR 60-70) mostly from one league. */
export function starterSquad(): OwnedCard[] {
  const rng = makeRng(Date.now() >>> 0);
  const [lo, hi] = UT_START.starterSquadOvr;
  const pool = cardPool().filter((c) => c.ovr >= lo && c.ovr <= hi && c.league !== 'ICON');
  const league = rng.chance(0.5) ? 'PREM' : 'INT';
  const used = new Set<string>();
  const slots = [...Array.from({ length: 15 }, (_, i) => i + 1), 2, 1, 3, 4, 7, 9, 10, 13];
  return slots.map((pos) => {
    let cands = pool.filter((c) => c.player.position === pos && !used.has(c.id) && c.league === league);
    if (!cands.length) cands = pool.filter((c) => c.player.position === pos && !used.has(c.id));
    if (!cands.length) cands = cardPool().filter((c) => c.player.position === pos && !used.has(c.id) && c.league !== 'ICON').sort((a, b) => a.ovr - b.ovr);
    const c = rng.pick(cands.slice(0, 40));
    used.add(c.id);
    return newCard(c.id, { untradeable: true });
  });
}

export function UTRoot({ go, page: initial }: { go: Go; page?: string }) {
  const s = useUT();
  const [page, setPage] = useState<UTPage>((initial as UTPage) ?? 'hub');
  useEffect(() => {
    void restoreUT();
    updateUT((st) => {
      weeklyRollover(st);
      refreshMarket(st);
      const { coins } = processSales(st);
      if (coins) {
        addCoins(coins);
        recordEvent(st, 'sold');
      }
    });
    if (s.started) collectFreePacks();
    void hashString;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const nav: UTNav = { go, page: (p) => setPage(p) };
  if (!s.started)
    return (
      <div className="ut-root">
        <Welcome
          onStart={(look) => {
            updateUT((st) => (st.club = { ...st.club, ...look }));
            startUT(starterSquad);
            collectFreePacks();
            setPage('store');
          }}
          onBack={() => go({ name: 'menu' })}
        />
      </div>
    );
  let el: React.ReactNode;
  switch (page) {
    case 'store':
      el = <Store nav={nav} />;
      break;
    case 'squad':
      el = <SquadPage nav={nav} />;
      break;
    case 'collection':
      el = <Collection nav={nav} />;
      break;
    case 'market':
      el = <Market nav={nav} />;
      break;
    case 'sbc':
      el = <SbcPage nav={nav} />;
      break;
    case 'objectives':
      el = <Objectives nav={nav} />;
      break;
    case 'battles':
      el = <Battles nav={nav} />;
      break;
    case 'rivals':
      el = <Rivals nav={nav} />;
      break;
    case 'champions':
      el = <Champions nav={nav} />;
      break;
    case 'moments':
      el = <MomentsPage nav={nav} />;
      break;
    case 'draft':
      el = <Draft nav={nav} />;
      break;
    case 'friendly':
      el = <Friendlies nav={nav} />;
      break;
    case 'evo':
      el = <Evolutions nav={nav} />;
      break;
    case 'club':
      el = <ClubPage nav={nav} />;
      break;
    default:
      el = <Hub nav={nav} />;
  }
  return <div className="ut-root">{el}</div>;
}
