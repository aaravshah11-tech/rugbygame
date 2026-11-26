import { useMemo, useState } from 'react';
import { posInfo } from '../../data/players';
import { audio } from '../../util/audio';
import { SEASON } from '../config';
import { UTCard } from '../Card';
import { grant } from '../modes';
import { view, type OwnedCard } from '../pool';
import { addXp, autoFillSbc, checkSbc, packName, recordEvent, SBCS, sbcCandidates, type SbcDef } from '../progress';
import { newCard, removeCards, updateUT, useUT } from '../store';
import { Sheet, TopBar, useToast } from '../ui';
import type { UTNav } from '../UTRoot';

const rewardLabel = (d: SbcDef) => (d.reward.pack ? packName(d.reward.pack) : d.reward.card ? `${d.reward.card.special.toUpperCase()} player card` : '');

/** Squad Building Challenges: swap cards you own for packs and special players. */
export function SbcPage({ nav }: { nav: UTNav }) {
  const s = useUT();
  const [open, setOpen] = useState<SbcDef | null>(null);
  const groups = ['Players', 'Upgrades', 'Challenges', 'Icons'] as const;
  return (
    <>
      <TopBar title="SBC" sub="Squad Building Challenges" onBack={() => (open ? setOpen(null) : nav.page('hub'))} />
      <div className="ut-body">
        {open ? (
          <SbcBuilder def={open} onDone={() => setOpen(null)} />
        ) : (
          groups.map((g) => (
            <div key={g}>
              <h2 className="ut-h">{g}</h2>
              <div className="ut-list">
                {SBCS.filter((d) => d.group === g).map((d) => {
                  const done = s.sbc[d.id] ?? 0;
                  const left = d.repeat - done;
                  return (
                    <button key={d.id} className={`ut-item ${left <= 0 ? 'done' : ''}`} style={{ border: 0, color: '#fff', font: 'inherit', textAlign: 'left' }} disabled={left <= 0} onClick={() => (audio.click(), setOpen(d))}>
                      {d.reward.card ? <UTCard card={newCard(d.reward.card.base, { special: d.reward.card.special })} size={54} /> : <span className="ut-chip">{d.req.count}</span>}
                      <div className="grow">
                        <b>{d.name}</b>
                        <div className="ut-muted">{d.desc}</div>
                      </div>
                      <span className="ut-chip good">{rewardLabel(d)}</span>
                      <span className="ut-chip">{left <= 0 ? 'Done' : d.repeat > 1 ? `${done}/${d.repeat}` : 'Once'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function SbcBuilder({ def, onDone }: { def: SbcDef; onDone: () => void }) {
  const s = useUT();
  const [slots, setSlots] = useState<(OwnedCard | null)[]>(() => Array(def.req.count).fill(null));
  const [choose, setChoose] = useState<number | null>(null);
  const [toast, say] = useToast();
  const pool = useMemo(() => sbcCandidates(s), [s]);
  const chk = checkSbc(def, slots);
  const used = new Set(slots.filter(Boolean).map((c) => c!.uid));
  const usedBase = new Set(slots.filter(Boolean).map((c) => c!.base));

  const submit = () => {
    if (!chk.ok) return;
    const ids = new Set(slots.map((c) => c!.uid));
    let got = '';
    updateUT((st) => {
      removeCards(st, ids);
      st.sbc[def.id] = (st.sbc[def.id] ?? 0) + 1;
      recordEvent(st, 'sbc');
      addXp(st, SEASON.xp.sbc);
      if (def.reward.pack) got = grant(st, { pack: def.reward.pack });
      if (def.reward.card) {
        st.cards.push(newCard(def.reward.card.base, { special: def.reward.card.special, untradeable: true }));
        got = 'special card added to your club';
      }
    });
    audio.coin();
    say(`SBC complete! ${got}`);
    setTimeout(onDone, 900);
  };

  return (
    <>
      <div className="ut-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="ut-h" style={{ marginTop: 0 }}>{def.name}</h2>
          <div className="ut-muted">
            Reward: <b style={{ color: '#9dff6a' }}>{rewardLabel(def)}</b> · cards you hand in are used up · your XV and bench are never used
          </div>
        </div>
        <div className="ut-row">
          <button className="ut-btn small" onClick={() => setSlots(autoFillSbc(def, pool))}>
            Auto-fill cheapest
          </button>
          <button className="ut-btn small" onClick={() => setSlots(Array(def.req.count).fill(null))}>
            Clear
          </button>
        </div>
      </div>
      <div className="ut-squad" style={{ marginTop: 8 }}>
        <div className="ut-grid" style={{ ['--cw' as string]: '74px' }}>
          {slots.map((c, i) => (
            <div key={i} style={{ display: 'grid', justifyItems: 'center', gap: 2 }} onClick={() => setChoose(i)}>
              {c ? <UTCard card={c} size={74} /> : <div className="ut-slot" style={{ position: 'relative', transform: 'none' }}><div className="empty" style={{ width: 74, height: 104 }}>{def.req.xv ? posInfo(i + 1).short : '+'}</div></div>}
              {def.req.xv && <small className="ut-muted">{i + 1}</small>}
            </div>
          ))}
        </div>
        <div className="ut-side">
          <div className="ut-panel">
            <b>Requirements</b>
            <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
              {chk.lines.map((l) => (
                <li key={l.text} style={{ color: l.ok ? '#9dff6a' : '#ff8aa0' }}>
                  {l.ok ? '✓' : '✗'} {l.text}
                </li>
              ))}
            </ul>
          </div>
          <button className="ut-btn primary" disabled={!chk.ok} onClick={submit}>
            Submit
          </button>
        </div>
      </div>
      {choose !== null && (
        <Sheet onClose={() => setChoose(null)}>
          <h2 className="ut-h" style={{ marginTop: 0 }}>
            {def.req.xv ? `Shirt ${choose + 1}: ${posInfo(choose + 1).name}` : `Slot ${choose + 1}`} <small>{pool.length} cards outside your squad</small>
          </h2>
          <div className="ut-grid" style={{ ['--cw' as string]: '78px' }}>
            {slots[choose] && (
              <button className="ut-btn small" onClick={() => (setSlots(slots.map((x, i) => (i === choose ? null : x))), setChoose(null))}>
                Empty slot
              </button>
            )}
            {pool
              .filter((c) => !used.has(c.uid) && !usedBase.has(c.base))
              .sort((a, b) => (def.req.xv ? Number(view(b).pos === choose + 1) - Number(view(a).pos === choose + 1) : 0) || view(a).ovr - view(b).ovr)
              .slice(0, 80)
              .map((c) => (
                <UTCard key={c.uid} card={c} size={78} onClick={() => (setSlots(slots.map((x, i) => (i === choose ? c : x))), setChoose(null))} />
              ))}
          </div>
        </Sheet>
      )}
      {toast}
    </>
  );
}
