import { useEffect, useMemo, useState } from 'react';
import { CLUBS, NATIONS, SCHOOLS } from '../../data/nations';
import { POSITIONS } from '../../data/players';
import { audio } from '../../util/audio';
import { MARKET } from '../config';
import { UTCard } from '../Card';
import { listCard, marketPrice, processSales, refreshMarket, roundPrice } from '../market';
import { view, type OwnedCard } from '../pool';
import { recordEvent } from '../progress';
import { addCoins, newCard, removeCards, spend, updateUT, useUT, type Listing } from '../store';
import { Sheet, TopBar, useToast } from '../ui';
import type { UTNav } from '../UTRoot';

const trend = (c: OwnedCard) => {
  const now = marketPrice(c);
  const before = marketPrice(c, Date.now() - 3.6e6);
  return now > before ? '▲' : now < before ? '▼' : '•';
};

/** Offline transfer market: AI listings, your transfer list and a watch list. Coins only. */
export function Market({ nav }: { nav: UTNav }) {
  const s = useUT();
  const [tab, setTab] = useState<'search' | 'sell' | 'watch'>('search');
  const [pos, setPos] = useState(0);
  const [team, setTeam] = useState('');
  const [kind, setKind] = useState('');
  const [min, setMin] = useState(60);
  const [max, setMax] = useState(99);
  const [price, setPrice] = useState(0);
  const [buying, setBuying] = useState<Listing | null>(null);
  const [selling, setSelling] = useState<OwnedCard | null>(null);
  const [ask, setAsk] = useState(0);
  const [toast, say] = useToast();
  // listings refresh every few minutes; your listings sell over time
  useEffect(() => {
    const tick = () => {
      let coins = 0;
      let n = 0;
      updateUT((st) => {
        refreshMarket(st);
        const r = processSales(st);
        coins = r.coins;
        n = r.sold.length;
        if (n) recordEvent(st, 'sold', n);
      });
      if (coins) {
        addCoins(coins);
        audio.coin();
        say(`${n} card${n > 1 ? 's' : ''} sold: +${coins.toLocaleString()} after tax`);
      }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(
    () =>
      s.market.listings
        .filter((l) => {
          const v = view(l.card);
          return (!pos || v.pos === pos) && (!team || v.team === team || v.nation === team) && v.ovr >= min && v.ovr <= max && (!price || l.price <= price) && (!kind || (kind === 'special' ? !!v.special : kind === 'icon' ? v.league === 'ICON' : v.tier === kind && !v.special));
        })
        .sort((a, b) => view(b.card).ovr - view(a.card).ovr),
    [s.market.listings, pos, team, kind, min, max, price],
  );
  const teams = [...NATIONS, ...CLUBS, ...SCHOOLS];
  const listed = new Set(s.market.mine.map((l) => l.card.uid));
  const inSquad = new Set([...s.xv, ...s.bench].filter(Boolean));
  const sellable = s.cards.filter((c) => !c.untradeable && !inSquad.has(c.uid) && !listed.has(c.uid)).sort((a, b) => view(b).ovr - view(a).ovr);

  const buy = (l: Listing) => {
    if (!spend(l.price)) return say('Not enough coins');
    updateUT((st) => {
      st.market.listings = st.market.listings.filter((x) => x.id !== l.id);
      st.market.watch = st.market.watch.filter((x) => x !== l.id);
      st.cards.push(newCard(l.card.base, { special: l.card.special }));
      recordEvent(st, 'bought');
    });
    audio.coin();
    setBuying(null);
    say(`Bought ${view(l.card).name}`);
  };

  const row = (l: Listing, mine = false) => {
    const v = view(l.card);
    const watched = s.market.watch.includes(l.id);
    const left = Math.max(0, 60 - Math.floor((Date.now() - l.at) / 60000));
    return (
      <div key={l.id} className="ut-item">
        <UTCard card={l.card} size={56} />
        <div className="grow">
          <b>{v.name}</b> <span className="ut-muted">{v.ovr} · {v.special ?? (v.rare ? 'Rare ' : '') + v.tier}</span>
          <div className="ut-muted">
            {mine ? `Listed ${Math.floor((Date.now() - l.at) / 60000)} min ago` : `${left} min left`} · value {marketPrice(l.card).toLocaleString()} {trend(l.card)}
          </div>
        </div>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{l.price.toLocaleString()}</b>
        {mine ? (
          <button
            className="ut-btn small"
            onClick={() =>
              updateUT((st) => {
                st.market.mine = st.market.mine.filter((x) => x.id !== l.id);
                st.cards.push(l.card);
              })
            }
          >
            Remove
          </button>
        ) : (
          <>
            <button className="ut-btn small" aria-label={watched ? 'Unwatch' : 'Watch'} onClick={() => updateUT((st) => (st.market.watch = watched ? st.market.watch.filter((x) => x !== l.id) : [...st.market.watch, l.id]))}>
              {watched ? '★' : '☆'}
            </button>
            <button className="ut-btn small gold" onClick={() => setBuying(l)}>
              Buy
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <TopBar title="Transfer Market" sub="Ultimate Team" onBack={() => nav.page('hub')} />
      <div className="ut-body">
        <div className="ut-tabs">
          <button className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>
            Search ({s.market.listings.length})
          </button>
          <button className={tab === 'sell' ? 'on' : ''} onClick={() => setTab('sell')}>
            Transfer list ({s.market.mine.length})
          </button>
          <button className={tab === 'watch' ? 'on' : ''} onClick={() => setTab('watch')}>
            Watch list ({s.market.watch.length})
          </button>
        </div>
        {tab === 'search' && (
          <>
            <div className="ut-filters">
              <select aria-label="Position" value={pos} onChange={(e) => setPos(Number(e.target.value))}>
                <option value={0}>Any position</option>
                {POSITIONS.map((p) => (
                  <option key={p.num} value={p.num}>
                    {p.short} {p.name}
                  </option>
                ))}
              </select>
              <select aria-label="Nation or club" value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">Any nation / club</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select aria-label="Card type" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Any type</option>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="bronze">Bronze</option>
                <option value="special">Specials</option>
                <option value="icon">Icons</option>
              </select>
              <label className="ut-muted">
                OVR <input type="number" aria-label="Min OVR" value={min} min={40} max={99} style={{ width: 52 }} onChange={(e) => setMin(Number(e.target.value))} /> –{' '}
                <input type="number" aria-label="Max OVR" value={max} min={40} max={99} style={{ width: 52 }} onChange={(e) => setMax(Number(e.target.value))} />
              </label>
              <label className="ut-muted">
                Max price <input type="number" aria-label="Max price" value={price || ''} placeholder="any" style={{ width: 90 }} onChange={(e) => setPrice(Number(e.target.value))} />
              </label>
            </div>
            <div className="ut-muted" style={{ marginBottom: 6 }}>New listings every {MARKET.refreshMin} minutes · prices drift with demand · {results.length} results</div>
            <div className="ut-list">{results.map((l) => row(l))}</div>
          </>
        )}
        {tab === 'sell' && (
          <>
            <div className="ut-list" style={{ marginBottom: 12 }}>
              {s.market.mine.length ? s.market.mine.map((l) => row(l, true)) : <p className="ut-muted">Nothing listed. AI buyers pick up cards over time; cheaper than market value sells faster. {Math.round(MARKET.tax * 100)}% tax on sales.</p>}
            </div>
            <h2 className="ut-h">List a card <small>not in your squad, tradeable</small></h2>
            <div className="ut-grid" style={{ ['--cw' as string]: '86px' }}>
              {sellable.map((c) => (
                <UTCard
                  key={c.uid}
                  card={c}
                  size={86}
                  onClick={() => {
                    setSelling(c);
                    setAsk(marketPrice(c));
                  }}
                />
              ))}
            </div>
          </>
        )}
        {tab === 'watch' && <div className="ut-list">{s.market.listings.filter((l) => s.market.watch.includes(l.id)).map((l) => row(l))}</div>}
      </div>
      {buying && (
        <Sheet onClose={() => setBuying(null)}>
          <div className="ut-row" style={{ gap: 14 }}>
            <UTCard card={buying.card} size={130} />
            <div>
              <h2 className="ut-h" style={{ marginTop: 0 }}>Buy now</h2>
              <p>
                {view(buying.card).name} for <b>{buying.price.toLocaleString()}</b> coins?
              </p>
              <div className="ut-row">
                <button className="ut-btn gold" onClick={() => buy(buying)}>
                  Buy
                </button>
                <button className="ut-btn" onClick={() => setBuying(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Sheet>
      )}
      {selling && (
        <Sheet onClose={() => setSelling(null)}>
          <div className="ut-row" style={{ gap: 14 }}>
            <UTCard card={selling} size={130} />
            <div style={{ flex: 1 }}>
              <h2 className="ut-h" style={{ marginTop: 0 }}>List on the market</h2>
              <div className="ut-muted">Market value {marketPrice(selling).toLocaleString()} {trend(selling)}</div>
              <div className="ut-row" style={{ margin: '8px 0' }}>
                {[0.85, 1, 1.15].map((m) => (
                  <button key={m} className={`ut-btn small ${ask === roundPrice(marketPrice(selling) * m) ? 'primary' : ''}`} onClick={() => setAsk(roundPrice(marketPrice(selling) * m))}>
                    {roundPrice(marketPrice(selling) * m).toLocaleString()}
                  </button>
                ))}
              </div>
              <input type="number" aria-label="Asking price" value={ask} onChange={(e) => setAsk(Number(e.target.value))} style={{ width: 140, padding: 6, borderRadius: 8 }} />
              <div className="ut-muted">You get {Math.round(ask * (1 - MARKET.tax)).toLocaleString()} after {Math.round(MARKET.tax * 100)}% tax</div>
              <div className="ut-row" style={{ marginTop: 8 }}>
                <button
                  className="ut-btn primary"
                  onClick={() => {
                    const c = selling;
                    updateUT((st) => {
                      removeCards(st, new Set([c.uid]));
                      listCard(st, c, ask);
                    });
                    setSelling(null);
                    say('Listed');
                  }}
                >
                  List for {ask.toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        </Sheet>
      )}
      {toast}
    </>
  );
}
