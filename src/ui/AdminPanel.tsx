import { useMemo, useState } from 'react';
import { update, useProfile } from '../state/store';
import { audio } from '../util/audio';
import { PACKS, SEASON, SPECIALS, type SpecialType } from '../ut/config';
import { cardPool } from '../ut/pool';
import { newCard, updateUT, useUT } from '../ut/store';
import { UTCard } from '../ut/Card';
import { packName } from '../ut/progress';

/**
 * Admin panel (owner only): opened by double-tapping the ball on the menu and entering the
 * passcode. Coins, packs, any player card, season pass XP and a few resets.
 * The code only stops casual players on this device: it is in the game's code, not a real lock.
 */
const PASSCODE = '2011';
const UNLOCK_KEY = 'tl-admin-ok';

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [ok, setOk] = useState(() => sessionStorage.getItem(UNLOCK_KEY) === '1');
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);
  if (!ok) {
    return (
      <div className="sheet" onClick={onClose}>
        <div className="card admin-lock" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: 320 }}>
          <h2>Admin</h2>
          <p className="muted">Enter the passcode</p>
          <div className="admin-dots">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={i < code.length ? 'on' : ''} />
            ))}
          </div>
          {wrong && <p style={{ color: '#ff6b81', margin: '4px 0' }}>Wrong passcode</p>}
          <div className="admin-pad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
              <button
                key={k}
                className="btn ghost"
                onClick={() => {
                  audio.click();
                  setWrong(false);
                  if (k === 'C') return setCode('');
                  if (k === '⌫') return setCode(code.slice(0, -1));
                  const next = (code + k).slice(0, 4);
                  setCode(next);
                  if (next.length === 4) {
                    if (next === PASSCODE) {
                      sessionStorage.setItem(UNLOCK_KEY, '1');
                      audio.coin();
                      setOk(true);
                    } else {
                      setWrong(true);
                      setTimeout(() => setCode(''), 400);
                    }
                  }
                }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return <Admin onClose={onClose} />;
}

function Admin({ onClose }: { onClose: () => void }) {
  const p = useProfile();
  const ut = useUT();
  const [amount, setAmount] = useState(100000);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [special, setSpecial] = useState<SpecialType | ''>('');
  const say = (m: string) => {
    setMsg(m);
    audio.coin();
  };
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return cardPool()
      .filter((c) => `${c.player.first} ${c.player.last} ${c.team}`.toLowerCase().includes(t))
      .slice(0, 12);
  }, [q]);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card admin" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', textAlign: 'left' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Admin</h2>
          <button className="btn ghost" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {msg && <p className="save-msg">{msg}</p>}

        <h3 className="admin-h">Coins · balance {p.coins.toLocaleString()}</h3>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {[10000, 100000, 1000000].map((n) => (
            <button key={n} className="btn cyan" onClick={() => (update((x) => (x.coins += n)), say(`+${n.toLocaleString()} coins`))}>
              +{n.toLocaleString()}
            </button>
          ))}
          <input type="number" aria-label="Amount" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="admin-input" />
          <button className="btn primary" onClick={() => (update((x) => (x.coins = Math.max(0, x.coins + amount))), say(`${amount >= 0 ? '+' : ''}${amount.toLocaleString()} coins`))}>
            Add
          </button>
          <button className="btn ghost" onClick={() => (update((x) => (x.coins = Math.max(0, amount))), say(`Balance set to ${Math.max(0, amount).toLocaleString()}`))}>
            Set to
          </button>
        </div>

        <h3 className="admin-h">Ultimate Team packs {ut.started ? `· ${ut.packs.length} unopened` : '· start Ultimate Team first'}</h3>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {PACKS.filter((x) => x.inStore).map((d) => (
            <button key={d.id} className="btn ghost" disabled={!ut.started} onClick={() => (updateUT((s) => s.packs.push(d.id)), say(`${packName(d.id)} added to My Packs`))}>
              + {d.name}
            </button>
          ))}
          <button className="btn ghost" disabled={!ut.started} onClick={() => (updateUT((s) => (s.items.posChange += 5)), say('+5 position changes'))}>
            + 5 position changes
          </button>
        </div>

        <h3 className="admin-h">Give a player card</h3>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <input placeholder="Search a name or team (e.g. Shah, Dupont, NZL)" value={q} onChange={(e) => setQ(e.target.value)} className="admin-input" style={{ flex: 1, minWidth: 220 }} />
          <select aria-label="Card version" value={special} onChange={(e) => setSpecial(e.target.value as SpecialType | '')} className="admin-input">
            <option value="">Normal card</option>
            {(Object.keys(SPECIALS) as SpecialType[])
              .filter((k) => k !== 'icon' && k !== 'evo')
              .map((k) => (
                <option key={k} value={k}>
                  {SPECIALS[k].name}
                </option>
              ))}
          </select>
        </div>
        <div className="admin-cards">
          {results.map((c) => {
            const card = newCard(c.id, special && c.league !== 'ICON' ? { special } : {});
            return (
              <UTCard
                key={c.id + special}
                card={card}
                size={84}
                onClick={() => {
                  if (!ut.started) return setMsg('Start Ultimate Team first');
                  updateUT((s) => s.cards.push(newCard(c.id, special && c.league !== 'ICON' ? { special } : {})));
                  say(`${c.player.first} ${c.player.last} added to your club`);
                }}
              />
            );
          })}
        </div>

        <h3 className="admin-h">Progress</h3>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="btn ghost" disabled={!ut.started} onClick={() => (updateUT((s) => (s.season.xp = SEASON.levels * SEASON.xpPerLevel)), say('Season pass maxed: claim the rewards in Objectives'))}>
            Max season pass
          </button>
          <button className="btn ghost" disabled={!ut.started} onClick={() => (updateUT((s) => (s.rivals = { ...s.rivals, division: 1, best: 1, points: 0 })), say('Rivals: Division 1'))}>
            Rivals to Division 1
          </button>
          <button className="btn ghost" disabled={!ut.started} onClick={() => (updateUT((s) => (s.champions = { ...s.champions, qualified: true })), say('Qualified for Champions'))}>
            Qualify for Champions
          </button>
          <button className="btn ghost" onClick={() => (update((x) => (x.daily.pendingReward = 1000)), say('Daily reward ready to claim'))}>
            Daily reward ready
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>Changes only affect this device's save.</p>
      </div>
    </div>
  );
}
