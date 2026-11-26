import { useRef, useState } from 'react';
import { VENUES } from '../../data/venues';
import { nationById } from '../../data/nations';
import { audio } from '../../util/audio';
import { UTCard } from '../Card';
import { baseCard } from '../pool';
import { exportBackup, importBackup, newCard, updateUT, useUT, type ClubLook } from '../store';
import { ClubBadge, TopBar, useToast } from '../ui';
import type { UTNav } from '../UTRoot';

const SWATCH = ['#0e1b45', '#b3122e', '#0f7a3c', '#111111', '#f2c230', '#5b2a86', '#e2621b', '#ffffff', '#1e8bc3', '#7a0f20', '#c6ff1a', '#2ee6c1', '#6d1830', '#9aa3b1'];

/** Club: name, badge, kit, home stadium; club stats and top try scorers; save backup. */
export function ClubPage({ nav }: { nav: UTNav }) {
  const s = useUT();
  const c = s.club;
  const [tab, setTab] = useState<'look' | 'stats' | 'backup'>('look');
  const [toast, say] = useToast();
  const file = useRef<HTMLInputElement>(null);
  const set = (fn: (c: ClubLook) => void) => updateUT((st) => fn(st.club));
  const scorers = Object.entries(s.stats.scorers).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const swatches = (cur: string, pick: (v: string) => void) => (
    <div className="ut-row">
      {SWATCH.map((col) => (
        <button key={col} aria-label={`Colour ${col}`} onClick={() => pick(col)} style={{ width: 26, height: 26, borderRadius: 7, background: col, border: cur === col ? '3px solid #fff' : '1px solid rgba(255,255,255,0.3)' }} />
      ))}
    </div>
  );
  return (
    <>
      <TopBar title="Club" sub={c.name} onBack={() => nav.page('hub')} />
      <div className="ut-body">
        <div className="ut-tabs">
          {(['look', 'stats', 'backup'] as const).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'look' ? 'Customise' : t === 'stats' ? 'Stats' : 'Backup'}
            </button>
          ))}
        </div>
        {tab === 'look' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'start' }}>
            <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
              <ClubBadge c={c.badge} size={120} />
              <div style={{ width: 90, height: 60, borderRadius: 10, background: c.kit.pattern === 'hoops' ? `repeating-linear-gradient(180deg, ${c.kit.primary} 0 10px, ${c.kit.secondary} 10px 20px)` : c.kit.pattern === 'stripes' ? `repeating-linear-gradient(90deg, ${c.kit.primary} 0 10px, ${c.kit.secondary} 10px 20px)` : c.kit.pattern === 'halves' ? `linear-gradient(90deg, ${c.kit.primary} 50%, ${c.kit.secondary} 50%)` : c.kit.pattern === 'sash' ? `linear-gradient(135deg, ${c.kit.primary} 40%, ${c.kit.secondary} 40% 60%, ${c.kit.primary} 60%)` : c.kit.pattern === 'chevron' ? `linear-gradient(160deg, ${c.kit.primary} 45%, ${c.kit.secondary} 45% 55%, ${c.kit.primary} 55%)` : c.kit.primary, border: '2px solid rgba(255,255,255,0.3)' }} aria-label="Kit" />
            </div>
            <div className="ut-panel" style={{ display: 'grid', gap: 8 }}>
              <label className="ut-muted">
                Club name
                <input value={c.name} maxLength={22} onChange={(e) => set((x) => (x.name = e.target.value))} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', font: 'inherit' }} />
              </label>
              <div className="ut-muted">Badge shape</div>
              <div className="ut-row">
                {(['shield', 'round', 'diamond', 'crest'] as const).map((sh) => (
                  <button key={sh} className={`ut-btn small ${c.badge.shape === sh ? 'primary' : ''}`} onClick={() => set((x) => (x.badge.shape = sh))}>
                    {sh}
                  </button>
                ))}
              </div>
              <div className="ut-muted">Emblem</div>
              <div className="ut-row">
                {(['bolt', 'star', 'lion', 'wave', 'crown', 'ball', 'stag', 'rose'] as const).map((em) => (
                  <button key={em} className={`ut-btn small ${c.badge.emblem === em ? 'primary' : ''}`} onClick={() => set((x) => (x.badge.emblem = em))}>
                    {em}
                  </button>
                ))}
              </div>
              <div className="ut-muted">Badge colours</div>
              {swatches(c.badge.c1, (v) => set((x) => (x.badge.c1 = v)))}
              {swatches(c.badge.c2, (v) => set((x) => (x.badge.c2 = v)))}
              <div className="ut-muted">Kit</div>
              {swatches(c.kit.primary, (v) => set((x) => (x.kit.primary = v)))}
              {swatches(c.kit.secondary, (v) => set((x) => (x.kit.secondary = v)))}
              <div className="ut-row">
                {(['plain', 'hoops', 'stripes', 'sash', 'chevron', 'halves'] as const).map((p) => (
                  <button key={p} className={`ut-btn small ${c.kit.pattern === p ? 'primary' : ''}`} onClick={() => set((x) => (x.kit.pattern = p))}>
                    {p}
                  </button>
                ))}
              </div>
              <label className="ut-muted">
                Home stadium
                <select value={c.stadium} onChange={(e) => set((x) => (x.stadium = e.target.value))} style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 10, background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
                  {Object.entries(VENUES).map(([id, v]) => (
                    <option key={id} value={id} style={{ background: '#10162a' }}>
                      {v.name} ({nationById(id).name})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
        {tab === 'stats' && (
          <>
            <div className="ut-clubhead" style={{ flexWrap: 'wrap', gap: 8 }}>
              {[
                ['Played', s.stats.played],
                ['Won', s.stats.wins],
                ['Drawn', s.stats.draws],
                ['Lost', s.stats.losses],
                ['Tries', s.stats.tries],
                ['Win %', s.stats.played ? Math.round((100 * s.stats.wins) / s.stats.played) : 0],
              ].map(([k, v]) => (
                <div key={k} className="stat">
                  <b>{v}</b>
                  <small>{String(k).toUpperCase()}</small>
                </div>
              ))}
            </div>
            <h2 className="ut-h">Top try scorers</h2>
            {scorers.length === 0 && <p className="ut-muted">Play Ultimate Team matches to fill this in.</p>}
            <div className="ut-list">
              {scorers.map(([base, n], i) => {
                const b = baseCard(base);
                return (
                  <div key={base} className="ut-item">
                    <b style={{ width: 20 }}>{i + 1}</b>
                    {b && <UTCard card={newCard(base)} size={46} />}
                    <b className="grow">{b ? `${b.player.first} ${b.player.last}` : base}</b>
                    <span className="ut-chip good">
                      {n} tr{n === 1 ? 'y' : 'ies'} · {s.stats.apps[base] ?? 0} apps
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {tab === 'backup' && (
          <div className="ut-panel">
            <p>Everything is saved on this device automatically (and mirrored to the browser database). Export a backup file to keep your club safe, or move it to another device.</p>
            <div className="ut-row">
              <button
                className="ut-btn primary"
                onClick={() => {
                  const blob = new Blob([exportBackup()], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `try-line-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                  audio.click();
                }}
              >
                Export backup
              </button>
              <button className="ut-btn" onClick={() => file.current?.click()}>
                Import backup
              </button>
              <input
                ref={file}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  say(importBackup(await f.text()) ? 'Backup restored' : 'That file is not a Try Line backup');
                }}
              />
            </div>
          </div>
        )}
      </div>
      {toast}
    </>
  );
}
