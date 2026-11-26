import { useState } from 'react';
import { audio } from '../../util/audio';
import { PACKS, WALKOUT, type PackDef } from '../config';
import { currentPromo, openPack, packDef, type PackResult } from '../packs';
import { packName, recordEvent, addXp } from '../progress';
import { newCard, spend, updateUT, useUT } from '../store';
import type { OwnedCard } from '../pool';
import { SEASON } from '../config';
import { Sheet, TopBar, useToast } from '../ui';
import type { UTNav } from '../UTRoot';
import { PackOpening } from './PackOpening';

/** What a pack can contain, worded from the config. */
function oddsLines(d: PackDef): string[] {
  const out: string[] = [`${d.count} players, at least ${d.rares} Rare`];
  let left = 1;
  for (const [lo, hi, p] of d.best) {
    const share = left * Math.min(1, p);
    left -= share;
    if (share > 0.001) out.push(`Best card ${lo}-${hi}: ${Math.round(share * 100)}%`);
  }
  if (d.special) out.push(`Special card (TOTW / Hero / Future Stars / TOTS / promo): ${Math.round(d.special * 100)}%`);
  if (d.guarantee === 'icon') out.push('Guaranteed Icon');
  if (d.guarantee === 'promo') out.push(`Guaranteed ${currentPromo().name} card`);
  if (d.items) out.push(`${d.items} position change item${d.items > 1 ? 's' : ''}`);
  out.push(`Walkout (an extra ${WALKOUT.minOvr}+ player): ${Math.round(WALKOUT.chance * 100)}%`);
  return out;
}

const PackArt = ({ d, w = 104 }: { d: PackDef; w?: number }) => (
  <div className="pack-art" style={{ '--c1': d.colors[0], '--c2': d.colors[1], width: w, height: w * 1.4 } as React.CSSProperties}>
    <span className="tl">TRY LINE</span>
    <b>{d.name}</b>
  </div>
);

/** Pack store and your unopened packs. Coins only. */
export function Store({ nav }: { nav: UTNav }) {
  const s = useUT();
  const [info, setInfo] = useState<PackDef | null>(null);
  const [opening, setOpening] = useState<{ def: PackDef; results: PackResult[] } | null>(null);
  const [toast, say] = useToast();
  // dev builds: window.__utOpen(['ICON-lomu', ...], 'tots') opens a pack with these cards (screenshots / tests)
  if (import.meta.env.DEV)
    Object.assign(window, {
      __utOpen: (ids: (string | [string, OwnedCard['special']])[], special?: OwnedCard['special']) => {
        const cards = ids.map((id, i) => (Array.isArray(id) ? newCard(id[0], { special: id[1] }) : newCard(id, i === 0 && special ? { special } : {})));
        setOpening({ def: packDef('ultimate'), results: [{ cards, best: cards[0], walkout: true, items: 0 }] });
      },
    });
  const mine = s.packs.reduce<Record<string, number>>((a, id) => ((a[id] = (a[id] ?? 0) + 1), a), {});

  const open = (ids: string[]) => {
    const results = ids.map((id) => openPack(packDef(id)));
    updateUT((st) => {
      for (const id of ids) {
        const i = st.packs.indexOf(id);
        if (i >= 0) st.packs.splice(i, 1);
        recordEvent(st, 'pack');
        addXp(st, SEASON.xp.pack);
      }
    });
    setOpening({ def: packDef(ids[0]), results });
  };
  const buy = (d: PackDef) => {
    if (!spend(d.price)) return say('Not enough coins');
    audio.coin();
    updateUT((st) => st.packs.push(d.id));
    open([d.id]);
  };
  return (
    <>
      <TopBar title="Store" sub="Ultimate Team" onBack={() => nav.page('hub')} />
      <div className="ut-body">
        {s.packs.length > 0 && (
          <>
            <h2 className="ut-h">
              My packs <small>{s.packs.length} unopened</small>
              {s.packs.length > 1 && (
                <button className="ut-btn small gold" onClick={() => (audio.click(), open([...s.packs]))}>
                  Open all
                </button>
              )}
            </h2>
            <div className="ut-packs" style={{ marginBottom: 6 }}>
              {Object.entries(mine).map(([id, n]) => {
                const d = packDef(id);
                return (
                  <button key={id} className="ut-pack" onClick={() => (audio.click(), open([id]))}>
                    {n > 1 && <span className="count ut-chip good">×{n}</span>}
                    <PackArt d={d} />
                    <b>Open</b>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <h2 className="ut-h">
          Packs <small>coins only · odds on every pack's ⓘ</small>
        </h2>
        <div className="ut-packs">
          {PACKS.filter((p) => p.inStore).map((d) => (
            <div key={d.id} className="ut-pack">
              <button className="info" aria-label={`${d.name} odds`} onClick={() => setInfo(d)}>
                i
              </button>
              <button style={{ border: 0, background: 'none', padding: 0 }} onClick={() => buy(d)} aria-label={`Buy ${d.name}`}>
                <PackArt d={d} />
              </button>
              <small style={{ textAlign: 'center', color: '#cfd6e3', fontSize: 11, minHeight: 28 }}>{d.blurb}</small>
              <button className="ut-btn small gold" onClick={() => buy(d)}>
                {d.price.toLocaleString()}
              </button>
            </div>
          ))}
        </div>
        <h2 className="ut-h">Items</h2>
        <div className="ut-item">
          <div className="grow">
            <b>Position change</b>
            <div className="ut-muted">Move a card to a neighbouring position (e.g. lock → blindside). You have {s.items.posChange}.</div>
          </div>
          <button
            className="ut-btn small gold"
            onClick={() => {
              if (!spend(1_500)) return say('Not enough coins');
              updateUT((st) => st.items.posChange++);
              say('Position change added');
            }}
          >
            1,500
          </button>
        </div>
      </div>
      {info && (
        <Sheet onClose={() => setInfo(null)}>
          <div className="ut-row" style={{ gap: 14 }}>
            <PackArt d={info} w={90} />
            <div>
              <h2 className="ut-h" style={{ marginTop: 0 }}>{info.name}</h2>
              <div className="ut-muted">{info.price.toLocaleString()} coins</div>
            </div>
          </div>
          <ul style={{ margin: '10px 0', paddingLeft: 18, lineHeight: 1.6 }}>
            {oddsLines(info).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="ut-row" style={{ justifyContent: 'flex-end' }}>
            <button className="ut-btn" onClick={() => setInfo(null)}>
              Close
            </button>
          </div>
        </Sheet>
      )}
      {opening && (
        <PackOpening
          def={opening.def}
          results={opening.results}
          onDone={() => {
            setOpening(null);
            say(`${opening.results.length > 1 ? `${opening.results.length} packs` : packName(opening.def.id)} added to your club`);
          }}
        />
      )}
      {toast}
    </>
  );
}
