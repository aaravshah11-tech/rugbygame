import { useMemo, useState } from 'react';
import { audio } from '../../util/audio';
import { SEASON } from '../config';
import { UTCard } from '../Card';
import { grant } from '../modes';
import { currentPromo, promoPlayers, totwPlayers } from '../packs';
import { dailyObjectives, passReward, rewardText, seasonLevel, SEASON_OBJECTIVES, weeklyObjectives, type ObjectiveDef } from '../progress';
import { newCard, updateUT, useUT } from '../store';
import { Bar, TopBar, useToast } from '../ui';
import type { UTNav } from '../UTRoot';

/** Daily, weekly and season objectives, the free 40-level season pass, and this week's promos. */
export function Objectives({ nav }: { nav: UTNav }) {
  const s = useUT();
  const [tab, setTab] = useState<'daily' | 'weekly' | 'season' | 'pass' | 'promos'>('daily');
  const [toast, say] = useToast();
  const lvl = seasonLevel(s.season.xp);
  const promo = currentPromo();
  const totw = useMemo(() => totwPlayers(s), [s.performers]); // eslint-disable-line react-hooks/exhaustive-deps
  const promoList = useMemo(() => promoPlayers(), []);

  const claim = (o: ObjectiveDef) => {
    let got = '';
    updateUT((st) => {
      if (st.objectives.claimed.includes(o.id)) return;
      st.objectives.claimed.push(o.id);
      got = grant(st, { ...o.reward, xp: (o.reward.xp ?? 0) + SEASON.xp.objective });
    });
    audio.coin();
    say(`Claimed: ${got}`);
  };
  const list = (objs: ObjectiveDef[]) => (
    <div className="ut-list">
      {objs.map((o) => {
        const p = s.objectives.progress[o.id] ?? 0;
        const claimed = s.objectives.claimed.includes(o.id);
        return (
          <div key={o.id} className={`ut-item ${claimed ? 'done' : ''}`}>
            <div className="grow">
              <b>{o.label}</b>
              <div className="ut-muted">{rewardText(o.reward)}</div>
              <Bar v={p} max={o.target} />
            </div>
            <span className="ut-chip">
              {p} / {o.target}
            </span>
            <button className="ut-btn small primary" disabled={claimed || p < o.target} onClick={() => claim(o)}>
              {claimed ? 'Claimed' : 'Claim'}
            </button>
          </div>
        );
      })}
    </div>
  );
  return (
    <>
      <TopBar title="Objectives" sub={`Season level ${lvl} / ${SEASON.levels}`} onBack={() => nav.page('hub')} />
      <div className="ut-body">
        <div className="ut-tabs">
          {(['daily', 'weekly', 'season', 'pass', 'promos'] as const).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'pass' ? 'Season pass' : t === 'promos' ? 'Promos & TOTW' : t}
            </button>
          ))}
        </div>
        {tab === 'daily' && list(dailyObjectives())}
        {tab === 'weekly' && list(weeklyObjectives())}
        {tab === 'season' && list(SEASON_OBJECTIVES)}
        {tab === 'pass' && (
          <>
            <div className="ut-panel" style={{ marginBottom: 10 }}>
              <div className="ut-row" style={{ justifyContent: 'space-between' }}>
                <b>Level {lvl}</b>
                <span className="ut-muted">
                  {s.season.xp % SEASON.xpPerLevel} / {SEASON.xpPerLevel} XP to level {Math.min(SEASON.levels, lvl + 1)} · free rewards for everyone, no paid track
                </span>
              </div>
              <Bar v={s.season.xp % SEASON.xpPerLevel} max={SEASON.xpPerLevel} color="#2ee6ff" />
            </div>
            <div className="ut-pass">
              {Array.from({ length: SEASON.levels }, (_, i) => i + 1).map((L) => {
                const got = s.season.claimed.includes(L);
                const r = passReward(L);
                return (
                  <div key={L} className={`lvl ${got ? 'got' : ''} ${L === lvl + 1 ? 'cur' : ''}`}>
                    <b>{L}</b>
                    <small>{rewardText(r)}</small>
                    <button
                      className="ut-btn small primary"
                      disabled={got || L > lvl}
                      onClick={() => {
                        let t = '';
                        updateUT((st) => {
                          if (st.season.claimed.includes(L)) return;
                          st.season.claimed.push(L);
                          t = grant(st, r);
                        });
                        audio.coin();
                        say(`Level ${L}: ${t}`);
                      }}
                    >
                      {got ? '✓' : L > lvl ? '🔒' : 'Claim'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {tab === 'promos' && (
          <>
            <h2 className="ut-h">
              Team of the Week <small>your own top performers this week, plus in-form stars · in Promo and special packs</small>
            </h2>
            <div className="ut-grid" style={{ ['--cw' as string]: '92px' }}>
              {totw.map((b) => (
                <UTCard key={b.id} card={newCard(b.id, { special: 'totw' })} size={92} />
              ))}
            </div>
            <h2 className="ut-h">
              {promo.name} <small>{promo.blurb} · Promo Pack guarantees one</small>
            </h2>
            <div className="ut-grid" style={{ ['--cw' as string]: '92px' }}>
              {promoList.map((b) => (
                <UTCard key={b.id} card={newCard(b.id, { special: promo.id })} size={92} />
              ))}
            </div>
            <button className="ut-btn gold" style={{ marginTop: 12 }} onClick={() => nav.page('store')}>
              Go to the Store
            </button>
          </>
        )}
      </div>
      {toast}
    </>
  );
}
