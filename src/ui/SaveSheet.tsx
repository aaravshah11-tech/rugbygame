import { useRef, useState } from 'react';
import { getProfile, saveNow } from '../state/store';
import { exportBackup, getUT, importBackup, saveUTNow } from '../ut/store';
import { audio } from '../util/audio';

/**
 * Save game: everything is saved on this device as you play; this saves it right now and lets you
 * keep a save file (your Ultimate Team club, set plays, settings, trophies and progress) to load
 * again later or on another phone.
 */
export function SaveSheet({ onClose }: { onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const p = getProfile();
  const ut = getUT();
  const name = ut.started ? ut.club.name : 'Try Line';
  const download = () => {
    saveNow();
    saveUTNow();
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `try-line-save-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    audio.coin();
    setMsg('Save file downloaded. Keep it safe: Load save brings it all back.');
  };
  return (
    <div className="sheet" onClick={onClose}>
      <div className="card save-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="sheet-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Save game</h2>
          <button className="btn back" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <ul className="save-list">
          <li>
            <b>Ultimate Team</b> {ut.started ? `${ut.club.name} · ${ut.cards.length} cards · ${ut.packs.length} packs` : 'not started yet'}
          </li>
          <li>
            <b>Set plays</b> {(p.settings.customPlays ?? []).length} of your own
          </li>
          <li>
            <b>Progress</b> {p.coins.toLocaleString()} coins · {p.stats.matches} matches · {p.trophies.championship + p.trophies.worldCup + p.trophies.seasons + (p.trophies.league ?? 0) + (p.trophies.prem ?? 0)} trophies
          </li>
          <li>
            <b>Settings</b> controls, button layout, tactics
          </li>
        </ul>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            className="btn primary"
            onClick={() => {
              saveNow();
              saveUTNow();
              audio.coin();
              setMsg(`Saved on this device at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
            }}
          >
            Save now
          </button>
          <button className="btn cyan" onClick={download}>
            Download save file
          </button>
          <button className="btn ghost" onClick={() => file.current?.click()}>
            Load save
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const ok = importBackup(await f.text());
              setMsg(ok ? 'Save loaded!' : 'That file is not a Try Line save.');
              if (ok) audio.coin();
            }}
          />
        </div>
        {msg && <p className="save-msg">{msg}</p>}
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>The game also saves by itself on this device as you play. A save file lets you move your team to another phone or keep a backup.</p>
      </div>
    </div>
  );
}
