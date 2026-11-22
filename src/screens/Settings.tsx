import { useEffect, useState } from 'react';
import type { Go } from '../App';
import { Seg, TopBar } from '../ui/common';
import { resetProfile, update, useProfile } from '../state/store';
import type { CameraMode, Difficulty, HalfLength } from '../state/types';
import { currentUser, pullProfile, pushProfile, sendMagicLink, signOut, syncAvailable } from '../state/sync';
import { audio } from '../util/audio';
import { haptic } from '../util/haptics';

export function Settings({ go }: { go: Go }) {
  const p = useProfile();
  const s = p.settings;
  const [user, setUser] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (syncAvailable) currentUser().then(setUser).catch(() => {});
  }, []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg('Working…');
    try {
      await fn();
      setMsg(ok);
      setUser(await currentUser());
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="screen">
      <TopBar title="Settings" onBack={() => go({ name: 'menu' })} />
      <div className="scroll">
        <div className="row" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>Audio &amp; feel</h3>
            <label>
              <div className="muted italic" style={{ fontSize: 12 }}>Music volume</div>
              <input type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => update((x) => (x.settings.music = +e.target.value))} />
            </label>
            <label>
              <div className="muted italic" style={{ fontSize: 12 }}>SFX volume</div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.sfx}
                onChange={(e) => update((x) => (x.settings.sfx = +e.target.value))}
                onPointerUp={() => audio.thud(0.6)}
              />
            </label>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Haptics</div>
              <Seg<'on' | 'off'>
                value={s.haptics ? 'on' : 'off'}
                options={[{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }]}
                onChange={(v) => {
                  update((x) => (x.settings.haptics = v === 'on'));
                  if (v === 'on') setTimeout(() => haptic('bighit'), 50);
                }}
              />
            </div>
          </div>
          <div className="card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>Gameplay</h3>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Difficulty</div>
              <Seg<Difficulty>
                value={s.difficulty}
                options={[{ v: 'easy', label: 'Easy' }, { v: 'medium', label: 'Medium' }, { v: 'hard', label: 'Hard' }]}
                onChange={(v) => update((x) => (x.settings.difficulty = v))}
              />
            </div>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Camera angle</div>
              <Seg<CameraMode>
                value={s.camera}
                options={[{ v: 'broadcast', label: 'Broadcast' }, { v: 'close', label: 'Behind' }, { v: 'sideline', label: 'Side-on' }]}
                onChange={(v) => update((x) => (x.settings.camera = v))}
              />
            </div>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Graphics quality</div>
              <Seg<'auto' | 'low' | 'medium' | 'high'>
                value={s.graphics ?? 'auto'}
                options={[{ v: 'auto', label: 'Auto' }, { v: 'low', label: 'Low' }, { v: 'medium', label: 'Med' }, { v: 'high', label: 'High' }]}
                onChange={(v) => update((x) => (x.settings.graphics = v))}
              />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Low: no real-time shadows or bloom, lighter crowd, 30fps. Auto steps down if the frame rate drops.</div>
            </div>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Half length</div>
              <Seg<HalfLength>
                value={s.halfLength}
                options={[{ v: 4, label: '4 min' }, { v: 6, label: '6 min' }, { v: 10, label: '10 min' }]}
                onChange={(v) => update((x) => (x.settings.halfLength = v))}
              />
            </div>
          </div>
          <div className="card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>Account &amp; save</h3>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Progress is saved on this device automatically.</p>
            {syncAvailable ? (
              user ? (
                <>
                  <div className="muted" style={{ fontSize: 13 }}>Signed in as {user}</div>
                  <div className="row">
                    <button className="btn primary grow" onClick={() => run(pushProfile, 'Uploaded to the cloud')}>
                      Upload
                    </button>
                    <button className="btn cyan grow" onClick={() => run(pullProfile, 'Downloaded from the cloud')}>
                      Download
                    </button>
                  </div>
                  <button className="btn ghost" onClick={() => run(signOut, 'Signed out')}>
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button className="btn primary" disabled={!email.includes('@')} onClick={() => run(() => sendMagicLink(email), 'Check your email for a sign-in link')}>
                    Email me a sign-in link
                  </button>
                </>
              )
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Cloud sync isn't set up for this build.</p>
            )}
            {msg && <div style={{ fontSize: 13, color: 'var(--cyan)' }}>{msg}</div>}
            <button className="btn ghost" onClick={() => go({ name: 'training' })}>
              Training (tutorials)
            </button>
            <button className="btn ghost" onClick={() => go({ name: 'viewer' })}>
              Squad Viewer (debug)
            </button>
            <button
              className="btn danger"
              style={{ marginTop: 'auto' }}
              onClick={() => {
                if (confirm('Reset all progress? This cannot be undone.')) resetProfile();
              }}
            >
              Reset progress
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
