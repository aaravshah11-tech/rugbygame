import { useEffect, useState } from 'react';
import type { Go } from '../App';
import { Seg, TopBar } from '../ui/common';
import { resetProfile, update, useProfile } from '../state/store';
import type { CameraMode, Difficulty, HalfLength, RulesMode } from '../state/types';
import { TacticsPanel } from '../ui/tactics';
import { CustomPlaysEditor } from '../ui/setplays';
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
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Reduce motion</div>
              <Seg<'on' | 'off'>
                value={s.reduceMotion ? 'on' : 'off'}
                options={[{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }]}
                onChange={(v) => update((x) => (x.settings.reduceMotion = v === 'on'))}
              />
            </div>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Real sponsors</div>
              <Seg<'on' | 'off'>
                value={s.realSponsors === false ? 'off' : 'on'}
                options={[{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }]}
                onChange={(v) => update((x) => (x.settings.realSponsors = v === 'on'))}
              />
            </div>
          </div>
          <div className="card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>Gameplay</h3>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Difficulty</div>
              <Seg<Difficulty>
                value={s.difficulty}
                options={[{ v: 'easy', label: 'Easy' }, { v: 'medium', label: 'Med' }, { v: 'hard', label: 'Hard' }, { v: 'elite', label: 'Elite' }]}
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
                options={[{ v: 3, label: '3 min' }, { v: 5, label: '5 min' }, { v: 8, label: '8 min' }]}
                onChange={(v) => update((x) => (x.settings.halfLength = v))}
              />
            </div>
          </div>
          <div className="card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>Rules &amp; controls</h3>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Rules</div>
              <Seg<RulesMode>
                value={s.rules}
                options={[{ v: 'arcade', label: 'Arcade' }, { v: 'standard', label: 'Standard' }, { v: 'sim', label: 'Simulation' }]}
                onChange={(v) => update((x) => (x.settings.rules = v))}
              />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Arcade: fewer penalties, no cards or TMO. Simulation: strict refereeing, forward passes, more cards.</div>
            </div>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Auto-switch defender</div>
              <Seg<'on' | 'off'> value={s.autoSwitch ? 'on' : 'off'} options={[{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }]} onChange={(v) => update((x) => (x.settings.autoSwitch = v === 'on'))} />
            </div>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Hand</div>
              <Seg<'r' | 'l'> value={s.leftHanded ? 'l' : 'r'} options={[{ v: 'r', label: 'Right-handed' }, { v: 'l', label: 'Left-handed' }]} onChange={(v) => update((x) => (x.settings.leftHanded = v === 'l'))} />
            </div>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Kick controls</div>
              <Seg<'swipe' | 'aim'>
                value={s.kickControls ?? 'swipe'}
                options={[{ v: 'swipe', label: 'Swipe (hold, aim, swipe up)' }, { v: 'aim', label: 'Aim & power' }]}
                onChange={(v) => update((x) => (x.settings.kickControls = v))}
              />
            </div>
            <div>
              <div className="muted italic" style={{ fontSize: 12, marginBottom: 4 }}>Pass buttons</div>
              <Seg<'two' | 'one'>
                value={s.passButtons ?? 'two'}
                options={[{ v: 'two', label: 'Left + right' }, { v: 'one', label: 'One smart PASS' }]}
                onChange={(v) => update((x) => (x.settings.passButtons = v))}
              />
            </div>
            <button className="btn cyan" onClick={() => go({ name: 'controls' })}>
              Edit control layout (move / resize buttons)
            </button>
            <label>
              <div className="muted italic" style={{ fontSize: 12 }}>Button size ({Math.round(s.buttonScale * 100)}%)</div>
              <input type="range" min={0.8} max={1.3} step={0.05} value={s.buttonScale} onChange={(e) => update((x) => (x.settings.buttonScale = +e.target.value))} />
            </label>
          </div>
          <div className="card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>Tactics</h3>
            <TacticsPanel value={s.tactics} onChange={(t) => update((x) => (x.settings.tactics = t))} />
          </div>
          <div className="card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>My set plays</h3>
            <CustomPlaysEditor plays={s.customPlays ?? []} onChange={(pl) => update((x) => (x.settings.customPlays = pl))} />
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
            <button className="btn primary" onClick={() => go({ name: 'tutorial' })}>
              Replay tutorial
            </button>
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
