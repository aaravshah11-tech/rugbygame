import { useEffect, useMemo, useRef, useState } from 'react';
import { nationById } from '../../data/nations';
import { posInfo } from '../../data/players';
import { TeamLogo } from '../../ui/logos';
import { audio } from '../../util/audio';
import { haptic } from '../../util/haptics';
import { WALKOUT, type PackDef } from '../config';
import { UTCard } from '../Card';
import { quickSellValue, type PackResult } from '../packs';
import { view, type OwnedCard } from '../pool';
import { recordEvent } from '../progress';
import { addCoins, ownsVersion, updateUT, useUT } from '../store';
import { WalkoutScene } from '../walkout';

/** Glow colour for a pack: the best card's design. */
export function glowOf(c: OwnedCard): string {
  const v = view(c);
  const sp: Record<string, string> = { totw: '#f2c94c', icon: '#ffffff', hero: '#a46bff', potm: '#ff3d5e', fs: '#00f0ff', tots: '#2f7cff', showdown: '#ff4d6d', evo: '#2ee6c1' };
  if (v.special) return sp[v.special] ?? '#ffcf3a';
  return v.tier === 'gold' ? '#ffcf3a' : v.tier === 'silver' ? '#dfe6f0' : '#d08b52';
}

function Fireworks({ color }: { color: string }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: 4 }, (_, b) =>
        Array.from({ length: 22 }, (_, i) => {
          const a = (i / 22) * Math.PI * 2;
          const r = 80 + Math.random() * 90;
          return { x: 15 + b * 23 + Math.random() * 8, y: 18 + Math.random() * 30, dx: Math.cos(a) * r, dy: Math.sin(a) * r, delay: b * 0.35, c: i % 3 ? color : '#ffffff' };
        }),
      ).flat(),
    [color],
  );
  return (
    <div className="po-fw" aria-hidden>
      {sparks.map((p, i) => (
        <i key={i} style={{ left: `${p.x}%`, top: `${p.y}%`, ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px`, ['--c' as string]: p.c, animationDelay: `${p.delay}s` }} />
      ))}
    </div>
  );
}

function Walkout({ card, glow, onArrive }: { card: OwnedCard; glow: string; onArrive: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const v = view(card);
    const team = nationById(v.league === 'ICON' ? v.nation : v.team);
    const sc = new WalkoutScene(host.current!, team.kit, glow, onArrive, { num: v.pos, size: v.player.size, forward: v.pos <= 8 });
    return () => sc.dispose();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="po-walk" ref={host} />;
}

type Phase = 'drop' | 'lit' | 'flare' | 'nation' | 'pos' | 'club' | 'walk' | 'reveal' | 'summary';

/**
 * FC-style pack opening: the pack lands and glows in the colour of the best card, then flare →
 * nation → position → club → the card (fireworks for 85+, a walkout for 88+ and specials, a quick
 * flip for the rest). Skip / Open all jump straight to the summary.
 */
export function PackOpening({ def, results, onDone }: { def: PackDef; results: PackResult[]; onDone: () => void }) {
  const s = useUT();
  const multi = results.length > 1;
  const res = results[0];
  const best = res.best;
  const bv = view(best);
  const glow = glowOf(best);
  const big = bv.ovr >= 85 || !!bv.special;
  const walk = bv.ovr >= WALKOUT.minOvr || !!bv.special;
  const [phase, setPhase] = useState<Phase>(multi ? 'summary' : 'drop');
  const [flip, setFlip] = useState(0);
  // all cards from the pack(s), duplicates marked against the club as it was before opening
  const all = useMemo(() => results.flatMap((r) => r.cards), [results]);
  const dupes = useMemo(() => {
    const seen = new Set<string>();
    return new Set(
      all
        .filter((c) => {
          const k = c.base + (c.special ?? '');
          const d = ownsVersion(s, c) || seen.has(k);
          seen.add(k);
          return d;
        })
        .map((c) => c.uid),
    );
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = results.reduce((a, r) => a + r.items, 0);

  // timeline
  useEffect(() => {
    if (phase === 'summary' || phase === 'reveal' || phase === 'walk') return;
    const next: Record<string, [Phase, number]> = big
      ? { drop: ['lit', 900], lit: ['flare', 1300], flare: ['nation', 900], nation: ['pos', 1300], pos: ['club', 1100], club: [walk ? 'walk' : 'reveal', 1300] }
      : { drop: ['lit', 800], lit: ['reveal', 1000] };
    const n = next[phase];
    if (!n) return;
    const t = setTimeout(() => {
      setPhase(n[0]);
      if (n[0] === 'lit') audio.slam();
      if (n[0] === 'flare' || n[0] === 'reveal') haptic('tackle');
    }, n[1]);
    return () => clearTimeout(t);
  }, [phase, big, walk]);
  useEffect(() => {
    if (phase === 'reveal' && big) audio.cheer(0.9);
  }, [phase, big]);

  const finish = (dupeMode: 'sell' | 'store') => {
    let coins = 0;
    updateUT((st) => {
      for (const c of all) {
        if (dupes.has(c.uid)) {
          if (dupeMode === 'sell') {
            coins += quickSellValue(c);
            recordEvent(st, 'quicksell');
          } else st.storage.push(c);
        } else st.cards.push(c);
      }
      st.items.posChange += items;
    });
    if (coins) addCoins(coins);
    audio.coin();
    onDone();
  };

  const nation = nationById(bv.nation);
  const club = nationById(bv.league === 'ICON' ? bv.nation : bv.team);
  return (
    <div className={`po ${phase !== 'drop' ? 'lit' : ''}`} style={{ ['--glow' as string]: glow }} onClick={() => phase === 'reveal' && setPhase('summary')}>
      <div className="po-glow" />
      <div className="po-beams" />
      {(phase === 'drop' || phase === 'lit') && (
        <div className={`po-pack ${phase === 'lit' ? 'shake' : ''}`}>
          <div className="pack-art" style={{ '--c1': def.colors[0], '--c2': def.colors[1] } as React.CSSProperties}>
            <span className="tl">TRY LINE</span>
            <b>{def.name}</b>
          </div>
        </div>
      )}
      {phase === 'flare' && <div className="po-flare" />}
      {phase === 'nation' && (
        <div className="po-reveal">
          <div className="po-step">
            <TeamLogo id={bv.nation} size={110} />
          </div>
          <div className="po-step" style={{ fontSize: 30 }}>
            {nation.name}
          </div>
        </div>
      )}
      {phase === 'pos' && (
        <div className="po-reveal">
          <div className="po-step">
            {posInfo(bv.pos).short}
            <small>{posInfo(bv.pos).name}</small>
          </div>
        </div>
      )}
      {phase === 'club' && (
        <div className="po-reveal">
          <div className="po-step">
            <TeamLogo id={club.id} size={110} />
          </div>
          <div className="po-step" style={{ fontSize: 24 }}>
            {bv.league === 'ICON' ? 'ICON' : club.name}
          </div>
        </div>
      )}
      {phase === 'walk' && (
        <>
          <Walkout card={best} glow={glow} onArrive={() => setTimeout(() => setPhase('reveal'), 900)} />
          <div className="po-walk-text">{bv.name}</div>
        </>
      )}
      {phase === 'reveal' && (
        <>
          {big && <Fireworks color={glow} />}
          <div className="po-reveal">
            <div className={big ? 'po-card' : 'po-flip'}>
              <UTCard card={best} size={big ? 210 : 180} />
            </div>
            {res.walkout && <div className="ut-chip" style={{ background: glow, color: '#000' }}>WALKOUT!</div>}
          </div>
          <div className="po-tap">Tap to see the whole pack</div>
        </>
      )}
      {phase === 'summary' && (
        <div className="po-summary" onClick={(e) => e.stopPropagation()}>
          <div className="ut-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 className="ut-h" style={{ margin: 0 }}>
              {multi ? `${results.length} packs opened` : def.name}
              <small>
                {all.length} players{items ? ` · ${items} position change${items > 1 ? 's' : ''}` : ''} · {dupes.size} duplicate{dupes.size === 1 ? '' : 's'}
              </small>
            </h2>
          </div>
          <div className="ut-grid" style={{ ['--cw' as string]: '104px' }}>
            {all.map((c, i) => (
              <div key={c.uid} className={i === flip ? '' : ''} style={{ animation: `poFlip 0.4s ${Math.min(i, 20) * 0.04}s both` }}>
                <UTCard card={c} size={104} badge={dupes.has(c.uid) ? 'DUPE' : undefined} />
              </div>
            ))}
          </div>
          <div className="ut-row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="ut-btn primary" onClick={() => finish('sell')}>
              Send to club{dupes.size ? ` · quick sell ${dupes.size} dupes (${[...dupes].reduce((a, id) => a + quickSellValue(all.find((c) => c.uid === id)!), 0).toLocaleString()})` : ''}
            </button>
            {dupes.size > 0 && (
              <button className="ut-btn" onClick={() => finish('store')}>
                Keep dupes in storage
              </button>
            )}
          </div>
        </div>
      )}
      {phase !== 'summary' && (
        <div className="po-controls">
          <button
            className="ut-btn small"
            onClick={(e) => {
              e.stopPropagation();
              setFlip(0);
              setPhase('summary');
            }}
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
