import { useState } from 'react';
import { VENUES } from '../../data/venues';
import { UT_START } from '../config';
import { ClubBadge, TopBar } from '../ui';
import type { ClubLook } from '../store';
import { audio } from '../../util/audio';

const SWATCH = ['#0e1b45', '#b3122e', '#0f7a3c', '#111111', '#f2c230', '#5b2a86', '#e2621b', '#ffffff', '#1e8bc3', '#7a0f20', '#c6ff1a', '#2ee6c1'];

/** First visit: name your club, pick a badge, then open the starter pack. */
export function Welcome({ onStart, onBack }: { onStart: (look: Partial<ClubLook>) => void; onBack: () => void }) {
  const [name, setName] = useState('Try Line FC');
  const [badge, setBadge] = useState<ClubLook['badge']>({ shape: 'shield', c1: '#0e1b45', c2: '#c6ff1a', emblem: 'bolt' });
  return (
    <>
      <TopBar title="Ultimate Team" sub="Welcome to" onBack={onBack} />
      <div className="ut-body" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'center' }}>
        <div style={{ display: 'grid', placeItems: 'center', gap: 8 }}>
          <ClubBadge c={badge} size={130} />
          <b style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, textTransform: 'uppercase' }}>{name || 'Your club'}</b>
        </div>
        <div className="ut-panel">
          <h2 className="ut-h" style={{ marginTop: 0 }}>Build your dream XV</h2>
          <p className="ut-muted">
            Open packs, build chemistry, take on Squad Battles, Rivals and Champions, complete SBCs and evolve your players. You start with{' '}
            <b style={{ color: '#fff' }}>{UT_START.coins.toLocaleString()} coins</b>, a starter squad and a Starter Pack. In-game coins only.
          </p>
          <div className="ut-row" style={{ marginBottom: 8 }}>
            <input className="ut-input" aria-label="Club name" value={name} maxLength={22} onChange={(e) => setName(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', font: 'inherit' }} />
          </div>
          <div className="ut-row" style={{ marginBottom: 6 }}>
            {(['shield', 'round', 'diamond', 'crest'] as const).map((sh) => (
              <button key={sh} className={`ut-btn small ${badge.shape === sh ? 'primary' : ''}`} onClick={() => setBadge({ ...badge, shape: sh })}>
                {sh}
              </button>
            ))}
          </div>
          <div className="ut-row" style={{ marginBottom: 6 }}>
            {(['bolt', 'star', 'lion', 'wave', 'crown', 'ball', 'stag', 'rose'] as const).map((em) => (
              <button key={em} className={`ut-btn small ${badge.emblem === em ? 'primary' : ''}`} onClick={() => setBadge({ ...badge, emblem: em })}>
                {em}
              </button>
            ))}
          </div>
          <div className="ut-row" style={{ marginBottom: 12 }}>
            {SWATCH.map((c) => (
              <button key={c} aria-label={`Colour ${c}`} onClick={(e) => setBadge(e.shiftKey || badge.c1 === c ? { ...badge, c2: c } : { ...badge, c1: c })} style={{ width: 24, height: 24, borderRadius: 6, border: badge.c1 === c ? '2px solid #fff' : badge.c2 === c ? '2px dashed #fff' : '1px solid rgba(255,255,255,0.3)', background: c }} />
            ))}
          </div>
          <button
            className="ut-btn primary"
            onClick={() => {
              audio.click();
              const n = name.trim() || 'Try Line FC';
              onStart({ name: n, short: n.replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase().padEnd(3, 'X'), badge, kit: { primary: badge.c1, secondary: badge.c2, pattern: 'chevron' }, stadium: Object.keys(VENUES)[0] });
            }}
          >
            Create club
          </button>
        </div>
      </div>
    </>
  );
}
