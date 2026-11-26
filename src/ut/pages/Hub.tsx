import { useMemo } from 'react';
import { audio } from '../../util/audio';
import { REWARDS, SEASON } from '../config';
import { UTCard } from '../Card';
import { battlesRank, momentStars } from '../modes';
import { currentPromo, promoPlayers } from '../packs';
import { allObjectives, seasonLevel } from '../progress';
import { chemistry, squadViews, teamRating } from '../squad';
import { newCard, useUT } from '../store';
import { ClubBadge, TopBar } from '../ui';
import type { UTNav, UTPage } from '../UTRoot';

/** Ultimate Team home: your club, the promo, the store and every mode. */
export function Hub({ nav }: { nav: UTNav }) {
  const s = useUT();
  const { xv, bench } = squadViews(s);
  const rating = teamRating(xv, bench);
  const chem = chemistry(xv).total;
  const promo = currentPromo();
  const promoCard = useMemo(() => {
    const p = promoPlayers()[0];
    return p ? newCard(p.id, { special: promo.id }) : null;
  }, [promo.id]);
  const objs = allObjectives();
  const done = objs.filter((o) => (s.objectives.progress[o.id] ?? 0) >= o.target && !s.objectives.claimed.includes(o.id)).length;
  const go = (p: UTPage) => {
    audio.click();
    nav.page(p);
  };
  const tile = (p: UTPage, title: string, sub: string, tag: string, colors: [string, string], cls = '', art?: React.ReactNode) => (
    <button className={`ut-tile ${cls}`} style={{ '--t1': colors[0], '--t2': colors[1] } as React.CSSProperties} onClick={() => go(p)}>
      <span className="tag">{tag}</span>
      {art && <span className="art">{art}</span>}
      <h3>{title}</h3>
      <p>{sub}</p>
    </button>
  );
  return (
    <>
      <TopBar title={s.club.name} sub="Ultimate Team" onBack={() => nav.go({ name: 'menu' })} />
      <div className="ut-body">
        <div className="ut-clubhead" style={{ marginBottom: 10 }}>
          <ClubBadge c={s.club.badge} size={52} />
          <div className="stat">
            <b>{rating}</b>
            <small>RATING</small>
          </div>
          <div className="stat">
            <b style={{ color: '#2ee6ff' }}>{chem}</b>
            <small>CHEM / 45</small>
          </div>
          <div className="stat">
            <b>{s.cards.length}</b>
            <small>CARDS</small>
          </div>
          <div className="stat">
            <b>{seasonLevel(s.season.xp)}</b>
            <small>SEASON LVL</small>
          </div>
          {s.packs.length > 0 && (
            <button className="ut-btn gold" onClick={() => go('store')}>
              {s.packs.length} unopened pack{s.packs.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <button className="ut-promo" style={{ '--p1': promo.colors[0], '--p2': promo.colors[1], marginBottom: 10 } as React.CSSProperties} onClick={() => go('store')}>
          {promoCard && <UTCard card={promoCard} size={58} />}
          <div>
            <small style={{ letterSpacing: '0.2em', fontWeight: 900, fontSize: 10 }}>PROMO · LIVE NOW</small>
            <h3>{promo.name}</h3>
            <span style={{ fontSize: 12, opacity: 0.85 }}>{promo.blurb} · plus Team of the Week from your own matches</span>
          </div>
        </button>
        <div className="ut-hub">
          {tile('squad', 'Squad', `Rating ${rating} · Chem ${chem}/45`, 'Your XV', ['#1d4f2c', '#0b1d12'], 'big', xv[9] ? <UTCard card={xv[9].card} size={70} /> : undefined)}
          {tile('store', 'Store', `${s.packs.length} to open · 9 packs`, 'Packs', ['#7a5200', '#2a1b00'])}
          {tile('battles', 'Squad Battles', `${s.battles.points.toLocaleString()} pts · ${battlesRank(s.battles.points).name}`, 'Play AI', ['#163a7a', '#0a1430'])}
          {tile('rivals', 'Division Rivals', `Division ${s.rivals.division} · ${s.rivals.points}/${REWARDS.rivals.promote} pts`, 'Climb', ['#6b1220', '#22060b'])}
          {tile('champions', 'Champions', s.champions.qualified ? (s.champions.active ? `${s.champions.wins}W from ${s.champions.played}` : 'Qualified!') : `Win ${REWARDS.rivals.qualify} Rivals to qualify (${s.rivals.wins})`, 'Weekend league', ['#2a2a2a', '#0a0a0a'])}
          {tile('moments', 'Moments', `${momentStars(s)} stars`, 'Scenarios', ['#5b2a86', '#1b0a2e'])}
          {tile('draft', 'Draft', s.draft?.active ? `${s.draft.wins} wins · in progress` : `Entry ${REWARDS.draft.entry.toLocaleString()}`, '4 in a row', ['#0b5e66', '#041d20'])}
          {tile('friendly', 'Friendlies', `${s.friendlies.wins}/${REWARDS.friendlies.dailyWins} daily wins`, 'No risk', ['#33402a', '#0e140a'])}
          {tile('sbc', 'SBC', 'Squad Building Challenges', 'Swap cards', ['#8a3b00', '#2b1200'])}
          {tile('objectives', 'Objectives', done ? `${done} to claim · Season ${seasonLevel(s.season.xp)}/${SEASON.levels}` : `Season level ${seasonLevel(s.season.xp)}/${SEASON.levels}`, done ? 'Rewards ready' : 'Season pass', ['#0f4c3a', '#06180f'])}
          {tile('market', 'Transfer Market', 'Buy and sell cards', 'Market', ['#1e3a5f', '#0a1422'])}
          {tile('evo', 'Evolutions', s.evo.length ? `${s.evo.length} evolving` : 'Upgrade a player', 'Evo', ['#0d6b5c', '#03201b'])}
          {tile('collection', 'Collection', `${new Set(s.cards.map((c) => c.base)).size} players owned`, 'Club', ['#3a3f4f', '#12141c'])}
          {tile('club', 'Club', 'Badge, kit, stadium, stats, backup', 'Customise', ['#40324f', '#140f1c'])}
        </div>
      </div>
    </>
  );
}
