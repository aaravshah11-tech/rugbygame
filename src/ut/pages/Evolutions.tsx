import { useState } from 'react';
import { audio } from '../../util/audio';
import { UTCard } from '../Card';
import { view, type OwnedCard } from '../pool';
import { EVOS, evoReady, recordEvent, type EvoDef } from '../progress';
import { updateUT, useUT } from '../store';
import { Bar, Sheet, TopBar, useToast } from '../ui';
import type { UTNav } from '../UTRoot';

/** Evolutions: pick an eligible card, complete its tasks, and it levels up (+stats, new design). */
export function Evolutions({ nav }: { nav: UTNav }) {
  const s = useUT();
  const [pick, setPick] = useState<EvoDef | null>(null);
  const [toast, say] = useToast();
  const evolving = new Set(s.evo.map((e) => e.cardUid));

  const levelUp = (e: (typeof s.evo)[number]) => {
    const def = EVOS.find((x) => x.id === e.id)!;
    updateUT((st) => {
      const i = st.cards.findIndex((c) => c.uid === e.cardUid);
      if (i < 0) return;
      const c = st.cards[i];
      const lvl = c.evo?.level ?? 0;
      const step = def.levels[lvl];
      const boost = { ...(c.evo?.boost ?? {}) };
      for (const [k, v] of Object.entries(step.boost)) boost[k as keyof typeof boost] = (boost[k as keyof typeof boost] ?? 0) + (v ?? 0);
      st.cards[i] = { ...c, evo: { id: def.id, level: lvl + 1, boost, ovrBonus: (c.evo?.ovrBonus ?? 0) + step.ovr } };
      const ee = st.evo.find((x) => x.cardUid === e.cardUid)!;
      ee.progress = {};
      if (lvl + 1 >= def.levels.length) st.evo = st.evo.filter((x) => x.cardUid !== e.cardUid);
      recordEvent(st, 'evoLevel');
    });
    audio.coin();
    say('Evolution level up!');
  };

  return (
    <>
      <TopBar title="Evolutions" sub="Upgrade your players" onBack={() => nav.page('hub')} />
      <div className="ut-body">
        {s.evo.length > 0 && (
          <>
            <h2 className="ut-h">In progress</h2>
            <div className="ut-list">
              {s.evo.map((e) => {
                const def = EVOS.find((x) => x.id === e.id)!;
                const c = s.cards.find((x) => x.uid === e.cardUid);
                if (!c) return null;
                const lvl = c.evo?.level ?? 0;
                const step = def.levels[lvl];
                return (
                  <div key={e.cardUid} className="ut-item">
                    <UTCard card={c} size={70} />
                    <div className="grow">
                      <b>{def.name}</b> <span className="ut-muted">level {lvl + 1} of {def.levels.length}</span>
                      {step?.tasks.map((t) => (
                        <div key={t.label} className="ut-muted">
                          {t.label}: {e.progress[t.event] ?? 0} / {t.target}
                          <Bar v={e.progress[t.event] ?? 0} max={t.target} />
                        </div>
                      ))}
                      <div className="ut-muted">Next: {Object.entries(step?.boost ?? {}).map(([k, v]) => `+${v} ${k}`).join(', ')} · +{step?.ovr} OVR</div>
                    </div>
                    <button className="ut-btn small primary" disabled={!evoReady(s, e)} onClick={() => levelUp(e)}>
                      Level up
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <h2 className="ut-h">Available evolutions</h2>
        <div className="ut-list">
          {EVOS.map((d) => {
            const n = s.cards.filter((c) => !evolving.has(c.uid) && !c.evo && d.eligible(view(c))).length;
            return (
              <div key={d.id} className="ut-item">
                <div className="grow">
                  <b>{d.name}</b>
                  <div className="ut-muted">
                    {d.desc} · {d.rule} · {d.levels.length} levels, up to +{d.levels.reduce((a, l) => a + l.ovr, 0)} OVR
                  </div>
                </div>
                <span className="ut-chip">{n} eligible</span>
                <button className="ut-btn small primary" disabled={!n} onClick={() => setPick(d)}>
                  Choose player
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {pick && (
        <Sheet onClose={() => setPick(null)}>
          <h2 className="ut-h" style={{ marginTop: 0 }}>
            {pick.name} <small>{pick.rule}</small>
          </h2>
          <div className="ut-grid" style={{ ['--cw' as string]: '88px' }}>
            {s.cards
              .filter((c: OwnedCard) => !evolving.has(c.uid) && !c.evo && pick.eligible(view(c)))
              .sort((a, b) => view(b).ovr - view(a).ovr)
              .map((c) => (
                <UTCard
                  key={c.uid}
                  card={c}
                  size={88}
                  onClick={() => {
                    updateUT((st) => st.evo.push({ cardUid: c.uid, id: pick.id, progress: {} }));
                    setPick(null);
                    say(`${view(c).name} started ${pick.name}`);
                  }}
                />
              ))}
          </div>
        </Sheet>
      )}
      {toast}
    </>
  );
}
