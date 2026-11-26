import { useEffect, useMemo, useRef, useState } from 'react';
import { posInfo } from '../../data/players';
import { audio } from '../../util/audio';
import { haptic } from '../../util/haptics';
import { CHEM, POS_CHANGES } from '../config';
import { UTCard } from '../Card';
import { view, type CardView, type OwnedCard } from '../pool';
import { autoBuild, chemistry, slotOvr, squadViews, teamRating } from '../squad';
import { cardByUid, updateUT, useUT } from '../store';
import { Sheet, TopBar, useToast } from '../ui';
import type { UTNav } from '../UTRoot';

/** Rugby formation on a landscape pitch (percent): forwards left, back three right. */
const SPOT: Record<number, [number, number]> = {
  // the classic rugby line-up diagram: forwards on top in three rows, backs fanning down to 15
  1: [14, 9], 2: [36, 9], 3: [58, 9],
  4: [25, 22], 5: [47, 22],
  6: [11, 35], 8: [33, 38], 7: [58, 35],
  9: [42, 53], 10: [55, 60], 12: [68, 67], 13: [81, 74],
  11: [11, 80], 14: [91, 82], 15: [50, 91],
};

type Where = { kind: 'xv' | 'bench'; i: number } | { kind: 'res'; uid: string };
const whereKey = (w: Where) => ('uid' in w ? `r:${w.uid}` : `${w.kind}:${w.i}`);

/** Squad screen: drag cards (or tap one, then another) to swap; chemistry diamonds under each card. */
export function SquadPage({ nav }: { nav: UTNav }) {
  const s = useUT();
  const { xv, bench } = squadViews(s);
  const chem = chemistry(xv);
  const rating = teamRating(xv, bench);
  const [sel, setSel] = useState<Where | null>(null);
  const [detail, setDetail] = useState<CardView | null>(null);
  const [drag, setDrag] = useState<{ from: Where; card: OwnedCard; x: number; y: number; over: string | null } | null>(null);
  const [toast, say] = useToast();
  const [resSort, setResSort] = useState<'ovr' | 'pos'>('ovr');
  const inSquad = new Set([...s.xv, ...s.bench].filter(Boolean));
  const reserves = useMemo(
    () =>
      s.cards
        .filter((c) => !inSquad.has(c.uid))
        .map(view)
        .sort((a, b) => (resSort === 'ovr' ? b.ovr - a.ovr : a.pos - b.pos || b.ovr - a.ovr)),
    [s.cards, s.xv, s.bench, resSort], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const longPress = useRef<number | null>(null);
  // cards scale with the pitch so the rows never overlap
  const pitchRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(56);
  useEffect(() => {
    const el = pitchRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardW(Math.max(40, Math.min(74, Math.round(el.clientHeight * 0.085)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const uidAt = (w: Where) => ('uid' in w ? w.uid : w.kind === 'xv' ? s.xv[w.i] : s.bench[w.i]);
  const swap = (a: Where, b: Where) => {
    if (whereKey(a) === whereKey(b)) return;
    const ua = uidAt(a);
    const ub = uidAt(b);
    // the same player can't be in the squad twice
    const baseOf = (u: string | null) => (u ? cardByUid(s, u)?.base : null);
    if (a.kind === 'res' && b.kind !== 'res') {
      const base = baseOf(ua);
      const bi = 'uid' in b ? -1 : b.kind === 'xv' ? b.i : 15 + b.i;
      const clash = [...s.xv, ...s.bench].some((u, i) => u && u !== ub && baseOf(u) === base && i !== bi);
      if (clash) return say('That player is already in your squad');
    }
    updateUT((st) => {
      const set = (w: Where, u: string | null) => {
        if ('uid' in w) return;
        if (w.kind === 'xv') st.xv[w.i] = u;
        else st.bench[w.i] = u;
      };
      if (a.kind === 'res' && b.kind === 'res') return;
      if (a.kind === 'res') set(b, ua);
      else if (b.kind === 'res') set(a, ub);
      else {
        set(a, ub);
        set(b, ua);
      }
    });
    haptic('light');
    audio.click();
  };
  const tapCard = (w: Where) => {
    if (!sel) {
      setSel(w);
      return;
    }
    swap(sel, w);
    setSel(null);
  };

  // drag and drop (pointer): pick up after a small move, drop on any slot
  const startDrag = (e: React.PointerEvent, from: Where, card: OwnedCard | null) => {
    if (!card) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
      started = true;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-slot]') as HTMLElement | null;
      setDrag({ from, card, x: ev.clientX, y: ev.clientY, over: el?.dataset.slot ?? null });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!started) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-slot]') as HTMLElement | null;
      setDrag(null);
      const k = el?.dataset.slot;
      if (!k) return;
      const [kind, v] = k.split(':');
      const to: Where = kind === 'r' ? { kind: 'res', uid: v } : { kind: kind as 'xv' | 'bench', i: Number(v) };
      swap(from, to);
      setSel(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const slotEl = (w: Where, v: CardView | null, size: number, label: string, chemN?: number, oop?: boolean) => {
    const k = whereKey(w);
    return (
      <div
        className={`ut-slot ${sel && whereKey(sel) === k ? 'sel' : ''} ${drag?.over === k ? 'over' : ''}`}
        data-slot={k}
        style={w.kind === 'xv' ? { left: `${SPOT[w.i + 1][0]}%`, top: `${SPOT[w.i + 1][1]}%` } : { position: 'relative', transform: 'none' }}
        onPointerDown={(e) => {
          startDrag(e, w, v?.card ?? null);
          if (v) longPress.current = window.setTimeout(() => setDetail(v), 550);
        }}
        onPointerUp={() => longPress.current && clearTimeout(longPress.current)}
        onPointerLeave={() => longPress.current && clearTimeout(longPress.current)}
        onClick={() => tapCard(w)}
      >
        {v ? <UTCard card={v.card} size={size} /> : <div className="empty">{label}</div>}
        {oop && <span className="oop">{posInfo(v!.pos).short}</span>}
        {chemN !== undefined && (
          <div className="chem" aria-label={`${chemN} chemistry`}>
            {[0, 1, 2].map((i) => (
              <i key={i} className={i < chemN ? 'on' : ''} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const selView = sel ? (() => {
    const u = uidAt(sel);
    const c = u ? cardByUid(s, u) : null;
    return c ? view(c) : null;
  })() : null;

  return (
    <>
      <TopBar title="Squad" sub={s.club.name} onBack={() => nav.page('hub')} />
      <div className="ut-body">
        <div className="ut-squad">
          <div>
            <div className="ut-pitch" ref={pitchRef}>
              <span className="ut-pitch-tag fw">FORWARDS</span>
              <span className="ut-pitch-tag bk">BACKS</span>
              <span className="ut-pitch-row" style={{ top: '9%' }}>FRONT ROW</span>
              <span className="ut-pitch-row" style={{ top: '22%' }}>SECOND ROW</span>
              <span className="ut-pitch-row" style={{ top: '36%' }}>BACK ROW</span>
              {xv.map((v, i) => slotEl({ kind: 'xv', i }, v, cardW, String(i + 1), chem.each[i], !!v && v.pos !== i + 1))}
            </div>
            <div className="ut-h" style={{ marginTop: 8 }}>
              Bench <small>drag or tap two cards to swap · hold a card for details</small>
            </div>
            <div className="ut-bench">{bench.map((v, i) => slotEl({ kind: 'bench', i }, v, 60, `R${i + 1}`))}</div>
          </div>
          <div className="ut-side">
            <div className="ut-panel ut-row" style={{ justifyContent: 'space-around' }}>
              <div className="chem-total">
                <b style={{ color: '#fff' }}>{rating}</b>
                <small>RATING</small>
              </div>
              <div className="chem-total">
                <b>{chem.total}</b>
                <small>/ {CHEM.max} CHEM</small>
              </div>
            </div>
            <button
              className="ut-btn primary"
              onClick={() => {
                const b = autoBuild(s.cards);
                updateUT((st) => {
                  st.xv = b.xv;
                  st.bench = b.bench;
                });
                audio.coin();
                say('Best squad picked');
              }}
            >
              Auto-build best squad
            </button>
            {selView && (
              <div className="ut-panel">
                <b>{selView.name}</b> <span className="ut-muted">{posInfo(selView.pos).name} · OVR {selView.ovr}</span>
                <div className="ut-row" style={{ marginTop: 6 }}>
                  <button className="ut-btn small" onClick={() => setDetail(selView)}>
                    Details
                  </button>
                  {sel?.kind !== 'res' && (
                    <button
                      className="ut-btn small"
                      onClick={() => {
                        const w = sel!;
                        updateUT((st) => {
                          if ('uid' in w) return;
                          if (w.kind === 'xv') st.xv[w.i] = null;
                          else st.bench[w.i] = null;
                        });
                        setSel(null);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="ut-h" style={{ margin: '4px 0 0' }}>
              Reserves <small>{reserves.length}</small>
              <button className="ut-btn small" onClick={() => setResSort(resSort === 'ovr' ? 'pos' : 'ovr')}>
                by {resSort === 'ovr' ? 'OVR' : 'position'}
              </button>
            </div>
            <div className="ut-grid" style={{ ['--cw' as string]: '62px', maxHeight: 260, overflowY: 'auto', padding: 4 }}>
              {reserves.map((v) => (
                <div key={v.card.uid}>{slotEl({ kind: 'res', uid: v.card.uid }, v, 62, '')}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {drag && (
        <div className="ut-drag" style={{ left: drag.x, top: drag.y }}>
          <UTCard card={drag.card} size={58} />
        </div>
      )}
      {detail && <CardDetail v={detail} onClose={() => setDetail(null)} slot={sel && !('uid' in sel) && sel.kind === 'xv' ? sel.i + 1 : undefined} />}
      {toast}
    </>
  );
}

/** Full card view: all ratings, chemistry links and the position change item. */
export function CardDetail({ v, onClose, slot }: { v: CardView; onClose: () => void; slot?: number }) {
  const s = useUT();
  const options = POS_CHANGES[v.pos] ?? [];
  return (
    <Sheet onClose={onClose}>
      <div className="ut-row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <UTCard card={v.card} size={150} />
        <div className="grow" style={{ flex: 1, minWidth: 180 }}>
          <h2 className="ut-h" style={{ marginTop: 0 }}>
            {v.player.first} {v.player.last}
          </h2>
          <div className="ut-muted">
            {posInfo(v.pos).name}
            {v.pos !== v.player.position ? ` (natural ${posInfo(v.player.position).short})` : ''} · {v.league === 'ICON' ? 'Icon' : v.team} · {v.rare ? 'Rare ' : ''}
            {v.special ?? v.tier}
            {slot ? ` · in shirt ${slot}: ${slotOvr(v, slot)}` : ''}
          </div>
          <table style={{ marginTop: 8, fontSize: 13, borderSpacing: '10px 2px' }}>
            <tbody>
              {(Object.entries(v.ratings) as [string, number][]).map(([k, n]) => (
                <tr key={k}>
                  <td style={{ textTransform: 'capitalize', color: '#9aa6ba' }}>{k}</td>
                  <td style={{ fontWeight: 900 }}>{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {v.league !== 'ICON' && options.length > 0 && (
            <>
              <div className="ut-muted" style={{ marginTop: 8 }}>
                Position change ({s.items.posChange} left):
              </div>
              <div className="ut-row">
                {options.map((p) => (
                  <button
                    key={p}
                    className="ut-btn small"
                    disabled={s.items.posChange < 1}
                    onClick={() => {
                      updateUT((st) => {
                        const c = st.cards.find((x) => x.uid === v.card.uid);
                        if (!c || st.items.posChange < 1) return;
                        st.items.posChange--;
                        const i = st.cards.indexOf(c);
                        st.cards[i] = { ...c, pos: p };
                      });
                      onClose();
                    }}
                  >
                    → {posInfo(p).short}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
