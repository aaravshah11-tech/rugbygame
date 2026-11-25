import { useEffect, useMemo, useRef, useState } from 'react';
import { TeamLogo } from '../ui/logos';
import type { Go } from '../App';
import { nationById } from '../data/nations';
import {
  effectiveRatings,
  fullName,
  playerOvr,
  posInfo,
  randomCard,
  rarityOf,
  RATING_KEYS,
  RATING_LABEL,
  type Player,
  type Rarity,
  type Rating,
} from '../data/players';
import { PlayerCard, TopBar } from '../ui/common';
import { STAFF, update, useProfile } from '../state/store';
import { buildMatch, chemistry, clubOvr, clubPlayers, clubTeam, nationTeam, staffBoost } from '../state/teams';
import { createSeason } from '../state/tournaments';
import { finishSeason } from '../state/outcomes';
import { makeRng } from '../util/rng';
import { audio } from '../util/audio';
import { haptic } from '../util/haptics';

type Tab = 'xv' | 'bench' | 'staff' | 'trade' | 'packs' | 'season';

/** Formation layout on a horizontal pitch (percent): forwards left, back three right. */
const FORMATION: Record<number, [number, number]> = {
  1: [9, 22], 2: [9, 50], 3: [9, 78],
  4: [21, 38], 5: [21, 62],
  6: [33, 16], 7: [33, 84], 8: [35, 50],
  9: [48, 50], 10: [60, 38],
  12: [71, 30], 13: [79, 58],
  11: [83, 10], 14: [87, 90],
  15: [93, 50],
};

export const sellPrice = (p: Player) => Math.round(Math.max(0, playerOvr(p) - 50) ** 2 * 2.2 + 80);
const buyPrice = (p: Player) => Math.round(sellPrice(p) * 2.6);
const trainCost = (p: Player, k: Rating) => 150 * (1 + (p.training[k] ?? 0));

const PACKS: { id: Rarity; name: string; cost: number; count: number; desc: string; bg: string }[] = [
  { id: 'bronze', name: 'Bronze Pack', cost: 500, count: 3, desc: '3 players · small silver chance', bg: 'linear-gradient(160deg,#f0b37e,#8a4f22)' },
  { id: 'silver', name: 'Silver Pack', cost: 1500, count: 4, desc: '4 players · 15% gold chance', bg: 'linear-gradient(160deg,#ffffff,#7f8a9c)' },
  { id: 'gold', name: 'Gold Pack', cost: 4000, count: 5, desc: '5 players · at least 1 gold', bg: 'linear-gradient(160deg,#ffe58a,#b07a10)' },
];

function openPack(kind: Rarity): Player[] {
  const rng = makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  const def = PACKS.find((p) => p.id === kind)!;
  const out: Player[] = [];
  for (let i = 0; i < def.count; i++) {
    let r: Rarity = kind;
    if (kind === 'bronze') r = rng.chance(0.12) ? 'silver' : 'bronze';
    if (kind === 'silver') r = rng.chance(0.15) ? 'gold' : 'silver';
    if (kind === 'gold') r = i === 0 || rng.chance(0.45) ? 'gold' : 'silver';
    out.push(randomCard(r, rng, true));
  }
  return out.sort((a, b) => playerOvr(b) - playerOvr(a));
}

function marketFor(date: string): Player[] {
  const rng = makeRng(Number(date.replace(/-/g, '')) * 7 + 3);
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const c = randomCard(i < 1 ? "gold" : i < 3 ? "silver" : "bronze", rng, true);
    return { ...c, id: `mkt-${date}-${i}` };
  });
}

interface DragState {
  from: string; // 's:3', 'b:2', 'r:<id>'
  card: Player;
  x: number;
  y: number;
  over: string | null;
}

export function SquadBuilder({ go, initialTab }: { go: Go; initialTab?: string }) {
  const p = useProfile();
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'xv');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [detail, setDetail] = useState<Player | null>(null);
  const [reveal, setReveal] = useState<Player[] | null>(null);
  const [toast, setToast] = useState('');
  const dragRef = useRef<DragState | null>(null);
  const pending = useRef<{ from: string; card: Player; x: number; y: number } | null>(null);

  const starters = clubPlayers(p);
  const byId = useMemo(() => new Map(p.club.cards.map((c) => [c.id, c])), [p.club.cards]);
  const bench = p.club.bench.map((id) => (id ? byId.get(id) ?? null : null));
  const used = new Set([...p.club.starting, ...p.club.bench].filter(Boolean) as string[]);
  const reserves = p.club.cards.filter((c) => !used.has(c.id)).sort((a, b) => playerOvr(b) - playerOvr(a));
  const boost = staffBoost(p);
  const chem = chemistry(starters);
  const ovr = clubOvr(p);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(''), 1800);
  };

  // ---------- drag and drop (pointer based, works with touch) ----------
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const pd = pending.current;
      if (pd && !dragRef.current) {
        if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) < 8) return;
        dragRef.current = { from: pd.from, card: pd.card, x: e.clientX, y: e.clientY, over: null };
        haptic('light');
      }
      const d = dragRef.current;
      if (!d) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const over = el?.closest('[data-slot]')?.getAttribute('data-slot') ?? null;
      dragRef.current = { ...d, x: e.clientX, y: e.clientY, over };
      setDrag(dragRef.current);
    };
    const up = () => {
      const pd = pending.current;
      const d = dragRef.current;
      pending.current = null;
      dragRef.current = null;
      setDrag(null);
      if (!d) {
        if (pd) setDetail(pd.card);
        return;
      }
      if (d.over && d.over !== d.from) drop(d.from, d.over);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  const startDrag = (from: string, card: Player | null) => (e: React.PointerEvent) => {
    if (!card) return;
    pending.current = { from, card, x: e.clientX, y: e.clientY };
  };

  const drop = (from: string, to: string) => {
    audio.click();
    update((x) => {
      const get = (k: string): string | null => {
        const [t, v] = k.split(':');
        if (t === 's') return x.club.starting[+v];
        if (t === 'b') return x.club.bench[+v];
        return v || null;
      };
      const set = (k: string, id: string | null) => {
        const [t, v] = k.split(':');
        if (t === 's') x.club.starting[+v] = id;
        if (t === 'b') x.club.bench[+v] = id;
      };
      const a = get(from);
      if (to === 'r:') {
        set(from, null);
        return;
      }
      const b = get(to);
      if (from.startsWith('r:')) {
        set(to, a);
        return;
      }
      if (to.startsWith('r:')) {
        set(from, b);
        return;
      }
      set(from, b);
      set(to, a);
    });
    haptic('tackle');
  };

  const autoPick = () => {
    audio.click();
    update((x) => {
      const pool = [...x.club.cards];
      const taken = new Set<string>();
      const best = (slot: number) => {
        let pick: Player | null = null;
        let score = -1;
        for (const c of pool) {
          if (taken.has(c.id)) continue;
          const s = playerOvr(c, slot);
          if (s > score) {
            score = s;
            pick = c;
          }
        }
        if (pick) taken.add(pick.id);
        return pick?.id ?? null;
      };
      x.club.starting = Array.from({ length: 15 }, (_, i) => best(i + 1));
      x.club.bench = [2, 1, 4, 7, 9, 10, 12, 15].map((s) => best(s));
    });
    flash('Best XV selected');
  };

  // ---------- season ----------
  const season = p.club.season;
  const playSeason = () => {
    const team = clubTeam(p);
    if (!team) {
      flash('Fill all 15 starting spots first');
      setTab('xv');
      return;
    }
    let s = season;
    if (!s || s.finished) {
      update((x) => (x.club.season = createSeason()));
      s = createSeason();
      return;
    }
    const f = s.fixtures[s.index];
    const cfg = buildMatch(team, nationTeam(f.away), true, p);
    const fid = f.id;
    audio.click();
    go({ name: 'match', cfg, back: { name: 'squad', tab: 'season' }, onFinish: (r) => finishSeason(cfg, fid, r) });
  };

  const today = new Date().toISOString().slice(0, 10);
  const market = useMemo(() => marketFor(today), [today]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'xv', label: 'Starting XV' },
    { id: 'bench', label: 'Bench' },
    { id: 'staff', label: 'Staff' },
    { id: 'trade', label: 'Trade' },
    { id: 'packs', label: 'Packs' },
    { id: 'season', label: 'Season' },
  ];

  const reserveList = (
    <div className="scroll" data-slot="r:" style={{ minWidth: 0 }}>
      <div className="muted italic" style={{ fontSize: 11, marginBottom: 4 }}>RESERVES · drag onto a position · tap for details</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {reserves.map((c) => (
          <div key={c.id} data-slot={`r:${c.id}`} style={{ zoom: 0.78 } as React.CSSProperties}>
            <PlayerCard player={c} className={drag?.card.id === c.id ? 'drag' : ''} onPointerDown={startDrag(`r:${c.id}`, c)} />
          </div>
        ))}
        {!reserves.length && <div className="muted" style={{ fontSize: 13 }}>No reserves — open packs to collect more players.</div>}
      </div>
    </div>
  );

  return (
    <div className="screen">
      <TopBar
        title="Squad"
        accent="Builder"
        onBack={() => go({ name: 'menu' })}
        right={
          <div className="row" style={{ gap: 6 }}>
            <span className="pill" style={{ fontSize: 13 }}>
              OVR <b style={{ color: 'var(--neon)' }}>{ovr}</b>
            </span>
            <span className="pill" style={{ fontSize: 13 }}>
              CHEM <b style={{ color: chem >= 75 ? 'var(--neon)' : chem >= 45 ? 'var(--gold)' : 'var(--pink)' }}>{chem}</b>
            </span>
          </div>
        }
      />
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => (audio.click(), setTab(t.id))}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'xv' && (
        <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          <div className="pitch" style={{ flex: 2.2 }}>
            {starters.map((pl, i) => {
              const [x, y] = FORMATION[i + 1];
              const key = `s:${i}`;
              return (
                <div key={i} className="slot" data-slot={key} style={{ left: `${x}%`, top: `${y}%` }}>
                  <PlayerCard
                    player={pl}
                    slot={i + 1}
                    boost={boost}
                    className={`${drag?.from === key ? 'drag' : ''} ${drag?.over === key ? 'drop' : ''}`}
                    onPointerDown={startDrag(key, pl)}
                  />
                </div>
              );
            })}
          </div>
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <button className="btn cyan" onClick={autoPick}>
              Auto-pick best XV
            </button>
            {reserveList}
          </div>
        </div>
      )}

      {tab === 'bench' && (
        <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          <div className="card" style={{ flex: 1.4 }}>
            <div className="muted italic" style={{ fontSize: 11, marginBottom: 6 }}>REPLACEMENTS 16–23</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {bench.map((pl, i) => {
                const key = `b:${i}`;
                return (
                  <div key={i} data-slot={key}>
                    <PlayerCard player={pl} className={`${drag?.from === key ? 'drag' : ''} ${drag?.over === key ? 'drop' : ''}`} onPointerDown={startDrag(key, pl)} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card" style={{ flex: 1, display: 'flex', minWidth: 0 }}>
            {reserveList}
          </div>
        </div>
      )}

      {tab === 'staff' && (
        <div className="scroll">
          <p className="muted" style={{ margin: '0 0 8px' }}>Coaches boost every player in your squad during matches.</p>
          <div className="nation-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {STAFF.map((s) => {
              const hired = p.club.staff.includes(s.id);
              return (
                <div key={s.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="row">
                    <h3 className="grow" style={{ fontSize: 18 }}>{s.name}</h3>
                    <span className="pill">{s.role}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>{s.desc}</div>
                  <button
                    className={`btn ${hired ? '' : 'primary'}`}
                    disabled={hired || p.coins < s.cost}
                    onClick={() => {
                      update((x) => {
                        x.coins -= s.cost;
                        x.club.staff.push(s.id);
                      });
                      audio.coin();
                      flash(`${s.name} hired`);
                    }}
                  >
                    {hired ? 'Hired ✓' : `Hire · ${s.cost}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'trade' && (
        <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          <div className="card scroll" style={{ flex: 1 }}>
            <h3>Transfer market</h3>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>New listings every day.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {market.map((c) => {
                const owned = p.club.cards.some((x) => x.id === c.id);
                return (
                  <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    <PlayerCard player={c} onClick={() => setDetail(c)} />
                    <button
                      className="btn primary"
                      style={{ minHeight: 34, padding: '0 8px', fontSize: 12 }}
                      disabled={owned || p.coins < buyPrice(c)}
                      onClick={() => {
                        update((x) => {
                          x.coins -= buyPrice(c);
                          x.club.cards.push({ ...c });
                        });
                        audio.coin();
                        flash(`Signed ${fullName(c)}`);
                      }}
                    >
                      {owned ? 'Signed' : buyPrice(c)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card scroll" style={{ flex: 1 }}>
            <h3>Sell reserves</h3>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>Players in your XV or bench can't be sold.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {reserves.map((c) => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                  <PlayerCard player={c} onClick={() => setDetail(c)} />
                  <button
                    className="btn"
                    style={{ minHeight: 34, padding: '0 8px', fontSize: 12 }}
                    onClick={() => {
                      update((x) => {
                        x.coins += sellPrice(c);
                        x.club.cards = x.club.cards.filter((y) => y.id !== c.id);
                      });
                      audio.coin();
                    }}
                  >
                    Sell {sellPrice(c)}
                  </button>
                </div>
              ))}
              {!reserves.length && <div className="muted">No reserves to sell.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'packs' && (
        <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          {PACKS.map((pk) => (
            <div key={pk.id} className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="pack" style={{ background: pk.bg, flex: 1 }}>
                <h2 style={{ fontSize: 24 }}>{pk.name}</h2>
                <span style={{ fontSize: 12 }}>{pk.desc}</span>
              </div>
              <button
                className="btn primary"
                disabled={p.coins < pk.cost}
                onClick={() => {
                  const cards = openPack(pk.id);
                  update((x) => {
                    x.coins -= pk.cost;
                    x.club.cards.push(...cards);
                  });
                  audio.cheer(0.4);
                  haptic('bighit');
                  setReveal(cards);
                }}
              >
                <i className="coin-dot" /> {pk.cost.toLocaleString()}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'season' && (
        <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          <div className="card scroll" style={{ flex: 1.3 }}>
            <h3>Season {p.club.seasonsPlayed + 1}</h3>
            {!season && <p className="muted">Eight matches against nations of rising strength. Win 6 to take the title and a 3,000 coin bonus.</p>}
            {season?.fixtures.map((f, i) => {
              const n = nationById(f.away);
              const res = f.played ? (f.homeScore! > f.awayScore! ? 'W' : f.homeScore! < f.awayScore! ? 'L' : 'D') : null;
              return (
                <div key={f.id} className="row" style={{ padding: '6px 0', borderTop: '1px solid var(--line)', opacity: i > season.index ? 0.6 : 1 }}>
                  <span className="muted" style={{ width: 28 }}>{f.stage}</span>
                  <TeamLogo id={n.id} size={24} />
                  <b className="grow italic">{n.name}</b>
                  <span>{f.played ? `${f.homeScore} – ${f.awayScore}` : i === season.index ? 'NEXT' : ''}</span>
                  {res && <span className={`pill ${res === 'W' ? 'win' : res === 'L' ? 'loss' : ''}`}>{res}</span>}
                </div>
              );
            })}
          </div>
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'center', justifyContent: 'center' }}>
            {season && <div className="result-score" style={{ fontSize: 34 }}>{season.wins}W {season.draws}D {season.losses}L</div>}
            <div className="muted">Squad OVR {ovr} · Chemistry {chem}</div>
            <div className="muted" style={{ fontSize: 12 }}>Chemistry adds up to +4 to every rating in matches.</div>
            <button className="btn primary" style={{ minHeight: 54, fontSize: 19 }} onClick={playSeason}>
              {!season || season.finished ? 'Start new season' : `Play ${nationById(season.fixtures[season.index].away).short}`}
            </button>
          </div>
        </div>
      )}

      {drag && <PlayerCard player={drag.card} className="ghost" style={{ left: drag.x - 37, top: drag.y - 49 }} />}

      {detail && <PlayerDetail player={byId.get(detail.id) ?? detail} owned={byId.has(detail.id)} onClose={() => setDetail(null)} />}

      {reveal && (
        <div className="sheet packs-reveal-sheet" onClick={() => setReveal(null)}>
          <div className="card" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <h2>Pack opened!</h2>
            <div className="reveal" style={{ margin: '14px 0' }}>
              {reveal.map((c, i) => {
                const o = playerOvr(c);
                return (
                  <div key={c.id} className={`reveal-slot ${o >= 88 ? 'elite' : rarityOf(o)}`} style={{ '--d': `${0.2 + i * 0.35}s` } as React.CSSProperties}>
                    <span className="burst" />
                    <PlayerCard player={c} className="big" />
                  </div>
                );
              })}
            </div>
            <button className="btn primary" onClick={() => setReveal(null)}>
              Add to club
            </button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PlayerDetail({ player, owned, onClose }: { player: Player; owned: boolean; onClose: () => void }) {
  const p = useProfile();
  const r = effectiveRatings(player);
  const nation = nationById(player.nation);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <PlayerCard player={player} />
          <div className="grow">
            <h2 style={{ fontSize: 22 }}>{fullName(player)}</h2>
            <div className="row muted" style={{ gap: 6, fontSize: 13 }}>
              <TeamLogo id={nation.id} size={18} /> {nation.name} · {posInfo(player.position).name}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Level {player.level} · {player.xp}/300 XP · <span style={{ textTransform: 'capitalize' }}>{rarityOf(playerOvr(player))}</span>
            </div>
          </div>
          <button className="btn back" onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginTop: 10 }}>
          {RATING_KEYS.map((k) => {
            const trained = player.training[k] ?? 0;
            const cost = trainCost(player, k);
            return (
              <div key={k} className="row" style={{ gap: 8 }}>
                <b className="italic" style={{ width: 34 }}>{RATING_LABEL[k]}</b>
                <div className="stam grow" style={{ width: 'auto', height: 8 }}>
                  <i style={{ width: `${r[k]}%`, background: r[k] >= 80 ? 'var(--neon)' : r[k] >= 65 ? 'var(--gold)' : 'var(--pink)' }} />
                </div>
                <b style={{ width: 24 }}>{r[k]}</b>
                {owned && (
                  <button
                    className="btn primary"
                    style={{ minHeight: 34, padding: '0 8px', fontSize: 11 }}
                    disabled={trained >= 10 || p.coins < cost}
                    onClick={() => {
                      update((x) => {
                        const c = x.club.cards.find((y) => y.id === player.id);
                        if (!c) return;
                        x.coins -= cost;
                        c.training[k] = (c.training[k] ?? 0) + 1;
                      });
                      audio.coin();
                    }}
                  >
                    +1 · {cost}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {owned && <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Training upgrades cost coins (max +10 per stat). Players also level up from Season XP.</p>}
      </div>
    </div>
  );
}

