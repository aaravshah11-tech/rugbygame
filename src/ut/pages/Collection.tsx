import { useMemo, useState } from 'react';
import { CLUBS, NATIONS, SCHOOLS, nationById } from '../../data/nations';
import { POSITIONS } from '../../data/players';
import { TeamLogo } from '../../ui/logos';
import { audio } from '../../util/audio';
import { UTCard } from '../Card';
import { marketPrice } from '../market';
import { quickSellValue } from '../packs';
import { cardPool, view, type CardView } from '../pool';
import { recordEvent } from '../progress';
import { addCoins, removeCards, updateUT, useUT } from '../store';
import { Bar, Sheet, TopBar, useToast } from '../ui';
import type { UTNav } from '../UTRoot';
import { CardDetail } from './Squad';

/** Every card you own, sort and filter, collection % per team, and the duplicates pile. */
export function Collection({ nav }: { nav: UTNav }) {
  const s = useUT();
  const [tab, setTab] = useState<'cards' | 'teams' | 'storage'>('cards');
  const [pos, setPos] = useState(0);
  const [team, setTeam] = useState('');
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState<'ovr' | 'new' | 'name'>('ovr');
  const [pick, setPick] = useState<CardView | null>(null);
  const [detail, setDetail] = useState<CardView | null>(null);
  const [toast, say] = useToast();
  const inSquad = new Set([...s.xv, ...s.bench].filter(Boolean));
  const list = useMemo(() => {
    let vs = s.cards.map(view);
    if (pos) vs = vs.filter((v) => v.pos === pos);
    if (team) vs = vs.filter((v) => v.team === team || v.nation === team);
    if (kind) vs = vs.filter((v) => (kind === 'special' ? !!v.special : kind === 'rare' ? v.rare && !v.special : v.tier === kind && !v.special));
    return vs.sort((a, b) => (sort === 'ovr' ? b.ovr - a.ovr : sort === 'new' ? b.card.at - a.card.at : a.name.localeCompare(b.name)));
  }, [s.cards, pos, team, kind, sort]);
  const teams = [...NATIONS, ...CLUBS, ...SCHOOLS];
  const owned = new Set(s.cards.map((c) => c.base));
  const pool = cardPool();
  const totalPct = Math.round((100 * owned.size) / pool.length);

  const quickSell = (v: CardView) => {
    if (inSquad.has(v.card.uid)) return say('Take him out of your squad first');
    const coins = quickSellValue(v.card);
    updateUT((st) => {
      removeCards(st, new Set([v.card.uid]));
      recordEvent(st, 'quicksell');
    });
    addCoins(coins);
    audio.coin();
    setPick(null);
    say(`Quick sold for ${coins.toLocaleString()}`);
  };

  return (
    <>
      <TopBar title="Collection" sub={`${owned.size} / ${pool.length} players · ${totalPct}%`} onBack={() => nav.page('hub')} />
      <div className="ut-body">
        <div className="ut-tabs">
          {(['cards', 'teams', 'storage'] as const).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'cards' ? `My cards (${s.cards.length})` : t === 'teams' ? 'By team' : `Storage (${s.storage.length})`}
            </button>
          ))}
        </div>
        {tab === 'cards' && (
          <>
            <div className="ut-filters">
              <select aria-label="Position" value={pos} onChange={(e) => setPos(Number(e.target.value))}>
                <option value={0}>All positions</option>
                {POSITIONS.map((p) => (
                  <option key={p.num} value={p.num}>
                    {p.num} {p.name}
                  </option>
                ))}
              </select>
              <select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">All teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select aria-label="Card type" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">All types</option>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="bronze">Bronze</option>
                <option value="rare">Rare</option>
                <option value="special">Specials</option>
              </select>
              <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="ovr">Highest OVR</option>
                <option value="new">Newest</option>
                <option value="name">Name</option>
              </select>
              <span className="ut-muted">{list.length} cards</span>
            </div>
            <div className="ut-grid" style={{ ['--cw' as string]: '100px' }}>
              {list.map((v) => (
                <UTCard key={v.card.uid} card={v.card} size={100} onClick={() => setPick(v)} badge={inSquad.has(v.card.uid) ? 'XV' : undefined} />
              ))}
            </div>
          </>
        )}
        {tab === 'teams' && (
          <div className="ut-list">
            {teams.concat([{ ...nationById('ENG'), id: 'ICON', name: 'Icons' }]).map((t) => {
              const inTeam = pool.filter((c) => (t.id === 'ICON' ? c.league === 'ICON' : c.team === t.id && c.league !== 'ICON'));
              const have = inTeam.filter((c) => owned.has(c.id)).length;
              return (
                <div key={t.id} className="ut-item">
                  {t.id === 'ICON' ? <span style={{ width: 30, textAlign: 'center', fontWeight: 900 }}>★</span> : <TeamLogo id={t.id} size={30} />}
                  <div className="grow">
                    <b>{t.name}</b>
                    <Bar v={have} max={inTeam.length} />
                  </div>
                  <span className="ut-chip">
                    {have} / {inTeam.length} · {Math.round((100 * have) / Math.max(1, inTeam.length))}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {tab === 'storage' && (
          <>
            <p className="ut-muted">Duplicates you chose to keep. Swap one into your club, quick sell, or use them in SBCs.</p>
            {s.storage.length > 0 && (
              <button
                className="ut-btn small"
                onClick={() => {
                  const coins = s.storage.reduce((a, c) => a + quickSellValue(c), 0);
                  updateUT((st) => {
                    recordEvent(st, 'quicksell', st.storage.length);
                    st.storage = [];
                  });
                  addCoins(coins);
                  say(`Quick sold all for ${coins.toLocaleString()}`);
                }}
              >
                Quick sell all
              </button>
            )}
            <div className="ut-grid" style={{ ['--cw' as string]: '100px', marginTop: 10 }}>
              {s.storage.map((c) => (
                <div key={c.uid} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
                  <UTCard card={c} size={100} />
                  <div className="ut-row">
                    <button
                      className="ut-btn small"
                      onClick={() =>
                        updateUT((st) => {
                          st.storage = st.storage.filter((x) => x.uid !== c.uid);
                          st.cards.push(c);
                        })
                      }
                    >
                      To club
                    </button>
                    <button
                      className="ut-btn small"
                      onClick={() => {
                        updateUT((st) => (st.storage = st.storage.filter((x) => x.uid !== c.uid)));
                        addCoins(quickSellValue(c));
                      }}
                    >
                      {quickSellValue(c)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {pick && (
        <Sheet onClose={() => setPick(null)}>
          <div className="ut-row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <UTCard card={pick.card} size={130} />
            <div style={{ flex: 1 }}>
              <h2 className="ut-h" style={{ marginTop: 0 }}>{pick.player.first} {pick.player.last}</h2>
              <div className="ut-muted">Market value about {marketPrice(pick.card).toLocaleString()} · quick sell {quickSellValue(pick.card).toLocaleString()}</div>
              {pick.card.untradeable && <div className="ut-chip bad" style={{ marginTop: 4 }}>Untradeable</div>}
              <div className="ut-row" style={{ marginTop: 10 }}>
                <button className="ut-btn small" onClick={() => (setDetail(pick), setPick(null))}>
                  Details
                </button>
                <button className="ut-btn small" disabled={!!pick.card.untradeable} onClick={() => (nav.page('market'), setPick(null))}>
                  Transfer list
                </button>
                <button className="ut-btn small" onClick={() => (nav.page('evo'), setPick(null))}>
                  Evolve
                </button>
                <button className="ut-btn small danger" onClick={() => quickSell(pick)}>
                  Quick sell {quickSellValue(pick.card).toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        </Sheet>
      )}
      {detail && <CardDetail v={detail} onClose={() => setDetail(null)} />}
      {toast}
    </>
  );
}
