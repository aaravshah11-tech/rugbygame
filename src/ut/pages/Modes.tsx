import { useMemo, useState } from 'react';
import { posInfo } from '../../data/players';
import type { Difficulty } from '../../state/types';
import { audio } from '../../util/audio';
import { hashString, makeRng } from '../../util/rng';
import { REWARDS } from '../config';
import { UTCard } from '../Card';
import { battlesOpponents, battlesRank, championsOpponent, grant, launch, MOMENTS, momentStars, rivalsOpponent, type UTMode } from '../modes';
import { packName, rewardText } from '../progress';
import { cardPool, view } from '../pool';
import { aiSquad, chemistry, clubKit, cardsTeam, teamRating, type AiSquad } from '../squad';
import { dayKey, newCard, spend, updateUT, useUT, weekKey } from '../store';
import { Bar, TopBar, useToast } from '../ui';
import type { UTNav } from '../UTRoot';
import { TeamLogo } from '../../ui/logos';

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'elite'];

function DiffPick({ v, set }: { v: Difficulty; set: (d: Difficulty) => void }) {
  return (
    <div className="ut-row">
      {DIFFS.map((d) => (
        <button key={d} className={`ut-btn small ${v === d ? 'primary' : ''}`} onClick={() => set(d)}>
          {d}
        </button>
      ))}
    </div>
  );
}

function Opp({ a, onPlay, done, extra }: { a: AiSquad; onPlay: () => void; done?: boolean; extra?: React.ReactNode }) {
  return (
    <div className={`ut-item ${done ? 'done' : ''}`}>
      <TeamLogo id={a.id} size={34} />
      <div className="grow">
        <b>{a.name}</b>
        <div className="ut-muted">
          Squad rating {a.ovr}
          {extra}
        </div>
      </div>
      {done && <span className="ut-chip good">Beaten</span>}
      <button className="ut-btn small primary" onClick={() => (audio.click(), onPlay())}>
        Play
      </button>
    </div>
  );
}

function useLaunch(nav: UTNav, page: string) {
  const [toast, say] = useToast();
  const play = (mode: UTMode, opp: AiSquad, difficulty: Difficulty, extra: Partial<Parameters<typeof launch>[1]> = {}) => {
    const err = launch(nav.go, { mode, opp, difficulty, page, ...extra });
    if (err) say(err);
  };
  return { play, toast, say };
}

// ------------------------------------------------------------------ Squad Battles
export function Battles({ nav }: { nav: UTNav }) {
  const s = useUT();
  const [diff, setDiff] = useState<Difficulty>('medium');
  const { play, toast, say } = useLaunch(nav, 'battles');
  const opps = useMemo(() => battlesOpponents(s.battles.week), [s.battles.week]);
  const rank = battlesRank(s.battles.points);
  const last = s.battles.lastRank ? REWARDS.battles.ranks.find((r) => r.name === s.battles.lastRank) : null;
  return (
    <>
      <TopBar title="Squad Battles" sub="Play AI squads · weekly ranking" onBack={() => nav.page('hub')} />
      <div className="ut-body">
        <div className="ut-panel ut-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontStyle: 'italic' }}>{s.battles.points.toLocaleString()} pts</b>
            <div className="ut-muted">
              This week: {rank.name} · {s.battles.played} played · rewards: {rank.coins.toLocaleString()} coins + {packName(rank.pack)}
            </div>
          </div>
          {last && s.battles.claimed !== s.battles.week && (
            <button
              className="ut-btn gold small"
              onClick={() => {
                updateUT((st) => {
                  grant(st, { coins: last.coins, pack: last.pack });
                  st.battles.claimed = st.battles.week;
                });
                say(`Last week (${last.name}) claimed`);
              }}
            >
              Claim last week: {last.name}
            </button>
          )}
        </div>
        <div className="ut-row" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
          <DiffPick v={diff} set={setDiff} />
          <span className="ut-muted">Win points: {REWARDS.battles.points[diff]} on {diff}</span>
        </div>
        <div className="ut-list">
          {opps.map((a) => (
            <Opp key={a.id} a={a} done={s.battles.beaten.includes(a.id)} onPlay={() => play('battles', a, diff)} />
          ))}
        </div>
        <h2 className="ut-h">Weekly ranks</h2>
        <div className="ut-list">
          {REWARDS.battles.ranks.map((r) => (
            <div key={r.name} className={`ut-item ${rank.name === r.name ? '' : 'done'}`}>
              <b className="grow">{r.name}</b>
              <span className="ut-muted">{r.points.toLocaleString()}+ pts</span>
              <span className="ut-chip good">{rewardText({ coins: r.coins, pack: r.pack })}</span>
            </div>
          ))}
        </div>
      </div>
      {toast}
    </>
  );
}

// ------------------------------------------------------------------ Division Rivals
const rivalsDiff = (d: number): Difficulty => (d >= 8 ? 'easy' : d >= 5 ? 'medium' : d >= 2 ? 'hard' : 'elite');
export function Rivals({ nav }: { nav: UTNav }) {
  const s = useUT();
  const { play, toast, say } = useLaunch(nav, 'rivals');
  const R = REWARDS.rivals;
  const opp = rivalsOpponent(s);
  const reward = R.weekly(s.rivals.best);
  return (
    <>
      <TopBar title="Division Rivals" sub="Climb from Division 10 to Division 1" onBack={() => nav.page('hub')} />
      <div className="ut-body">
        <div className="ut-row" style={{ gap: 4, marginBottom: 10 }}>
          {Array.from({ length: R.divisions }, (_, i) => R.divisions - i).map((d) => (
            <div key={d} className="ut-chip" style={{ flex: 1, justifyContent: 'center', padding: '8px 0', background: d === s.rivals.division ? 'var(--neon)' : d > s.rivals.division ? 'rgba(125,255,58,0.18)' : 'rgba(255,255,255,0.06)', color: d === s.rivals.division ? '#0b0f1a' : undefined }}>
              {d}
            </div>
          ))}
        </div>
        <div className="ut-panel" style={{ marginBottom: 10 }}>
          <div className="ut-row" style={{ justifyContent: 'space-between' }}>
            <b>Division {s.rivals.division}</b>
            <span className="ut-muted">
              {s.rivals.points} / {R.promote} points to promotion · win +{R.win}, draw +{R.draw}, loss {R.loss}
              {R.safeDivisions.includes(s.rivals.division) ? ' · no relegation here' : ' · relegation below 0'}
            </span>
          </div>
          <Bar v={Math.max(0, s.rivals.points)} max={R.promote} />
          <div className="ut-muted" style={{ marginTop: 6 }}>
            This week: {s.rivals.wins} wins from {s.rivals.matches} · best division {s.rivals.best} · weekly reward {rewardText(reward)} · Champions: {s.champions.qualified ? 'QUALIFIED' : `${Math.max(0, R.qualify - s.rivals.wins)} more wins`}
          </div>
          {s.rivals.matches >= 5 && s.rivals.claimed !== s.rivals.week && (
            <button
              className="ut-btn gold small"
              style={{ marginTop: 8 }}
              onClick={() => {
                updateUT((st) => {
                  grant(st, reward);
                  st.rivals.claimed = st.rivals.week;
                });
                say('Weekly Rivals rewards claimed');
              }}
            >
              Claim weekly rewards
            </button>
          )}
        </div>
        <h2 className="ut-h">
          Next opponent <small>gets stronger every division · difficulty {rivalsDiff(s.rivals.division)}</small>
        </h2>
        <Opp a={opp} onPlay={() => play('rivals', opp, rivalsDiff(s.rivals.division))} />
      </div>
      {toast}
    </>
  );
}

// ------------------------------------------------------------------ Champions
export function Champions({ nav }: { nav: UTNav }) {
  const s = useUT();
  const { play, toast, say } = useLaunch(nav, 'champions');
  const C = REWARDS.champions;
  const c = s.champions;
  const tier = C.tiers.find((t) => c.wins >= t.wins)!;
  const finished = c.played >= C.matches;
  return (
    <>
      <TopBar title="Champions" sub="The weekend league" onBack={() => nav.page('hub')} />
      <div className="ut-body">
        {!c.qualified ? (
          <div className="ut-panel">
            <h2 className="ut-h" style={{ marginTop: 0 }}>Not qualified yet</h2>
            <p className="ut-muted">
              Win {REWARDS.rivals.qualify} Division Rivals matches this week to qualify ({s.rivals.wins} so far). Then play {C.matches} matches against the strongest AI squads for big rewards.
            </p>
            <button className="ut-btn primary" onClick={() => nav.page('rivals')}>
              Go to Rivals
            </button>
          </div>
        ) : (
          <>
            <div className="ut-panel" style={{ marginBottom: 10 }}>
              <div className="ut-row" style={{ justifyContent: 'space-between' }}>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontStyle: 'italic' }}>
                  {c.wins} W · {c.played - c.wins} L
                </b>
                <span className="ut-muted">
                  {c.played} / {C.matches} played · current tier {tier.name}
                </span>
              </div>
              <Bar v={c.played} max={C.matches} />
            </div>
            {!c.active && c.played === 0 && (
              <button className="ut-btn primary" onClick={() => updateUT((st) => (st.champions.active = true))}>
                Start Champions
              </button>
            )}
            {c.active && !finished && (
              <>
                <h2 className="ut-h">Match {c.played + 1}</h2>
                <Opp a={championsOpponent(s)} onPlay={() => play('champions', championsOpponent(s), 'hard')} />
              </>
            )}
            {finished && !c.claimed && (
              <button
                className="ut-btn gold"
                onClick={() => {
                  updateUT((st) => {
                    grant(st, { coins: tier.coins, pack: tier.pack });
                    if (tier.extra) grant(st, { pack: tier.extra });
                    st.champions.claimed = true;
                  });
                  say(`${tier.name} rewards claimed`);
                }}
              >
                Claim {tier.name} rewards
              </button>
            )}
          </>
        )}
        <h2 className="ut-h">Reward tiers</h2>
        <div className="ut-list">
          {C.tiers.map((t) => (
            <div key={t.name} className="ut-item">
              <b className="grow">{t.name}</b>
              <span className="ut-muted">{t.wins}+ wins</span>
              <span className="ut-chip good">{rewardText({ coins: t.coins, pack: t.pack })}{t.extra ? ` + ${packName(t.extra)}` : ''}</span>
            </div>
          ))}
        </div>
      </div>
      {toast}
    </>
  );
}

// ------------------------------------------------------------------ Moments
export function MomentsPage({ nav }: { nav: UTNav }) {
  const s = useUT();
  const [diff, setDiff] = useState<Difficulty>('medium');
  const { play, toast, say } = useLaunch(nav, 'moments');
  const stars = momentStars(s);
  return (
    <>
      <TopBar title="Moments" sub={`${stars} stars`} onBack={() => nav.page('hub')} />
      <div className="ut-body">
        <div className="ut-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <DiffPick v={diff} set={setDiff} />
          <span className="ut-muted">Stars: Easy ★ · Medium ★★ · Hard ★★★</span>
        </div>
        <div className="ut-list">
          {MOMENTS.map((m) => {
            const got = s.moments[m.id] ?? 0;
            return (
              <div key={m.id} className="ut-item">
                <div className="grow">
                  <b>{m.name}</b>
                  <div className="ut-muted">{m.desc}</div>
                </div>
                <span className="ut-chip" style={{ color: '#ffcf3a' }}>
                  {'★'.repeat(got)}
                  {'☆'.repeat(3 - got)}
                </span>
                <button className="ut-btn small primary" onClick={() => play('moments', aiSquad('moment-' + m.id, m.oppOvr), diff, { moment: m })}>
                  Play
                </button>
              </div>
            );
          })}
        </div>
        <h2 className="ut-h">Star rewards</h2>
        <div className="ut-list">
          {REWARDS.moments.milestones.map((ms, i) => {
            const claimed = s.momentRewards.includes(i);
            return (
              <div key={i} className={`ut-item ${claimed ? 'done' : ''}`}>
                <b className="grow">{ms.stars} stars</b>
                <span className="ut-chip good">{packName(ms.pack)}</span>
                <button
                  className="ut-btn small primary"
                  disabled={claimed || stars < ms.stars}
                  onClick={() => {
                    updateUT((st) => {
                      st.momentRewards.push(i);
                      grant(st, { pack: ms.pack });
                    });
                    say(`${packName(ms.pack)} unlocked`);
                  }}
                >
                  {claimed ? 'Claimed' : 'Claim'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {toast}
    </>
  );
}

// ------------------------------------------------------------------ Draft
/** 5 options for a shirt: in-position cards, mostly gold, a few specials (seeded per draft). */
function draftOptions(seed: string, slot: number): string[] {
  const rng = makeRng(hashString(seed));
  const cands = cardPool().filter((c) => c.player.position === slot && c.ovr >= 76);
  const out: string[] = [];
  while (out.length < REWARDS.draft.options && cands.length) out.push(cands.splice(rng.int(0, cands.length - 1), 1)[0].id);
  return out;
}

export function Draft({ nav }: { nav: UTNav }) {
  const s = useUT();
  const { play, toast, say } = useLaunch(nav, 'draft');
  const D = REWARDS.draft;
  const d = s.draft;
  const seedBase = useMemo(() => `${dayKey()}-${Date.now() % 100000}`, []);
  if (!d) {
    return (
      <>
        <TopBar title="Draft" sub="Pick a team, win 4 in a row" onBack={() => nav.page('hub')} />
        <div className="ut-body">
          <div className="ut-panel">
            <p>Choose 1 of {D.options} players for every shirt, then play up to {D.wins} matches against stronger and stronger sides. One loss and it's over. Rewards by wins:</p>
            <div className="ut-list" style={{ marginBottom: 10 }}>
              {D.rewards.map((r, i) => (
                <div key={i} className="ut-item">
                  <b className="grow">{i} win{i === 1 ? '' : 's'}</b>
                  <span className="ut-chip good">{rewardText(r)}</span>
                </div>
              ))}
            </div>
            <button
              className="ut-btn primary"
              onClick={() => {
                if (!spend(D.entry)) return say('Not enough coins');
                updateUT((st) => (st.draft = { picks: Array(15).fill(null), options: draftOptions(seedBase + '-1', 1), slot: 1, wins: 0, active: true, lost: false }));
              }}
            >
              Enter for {D.entry.toLocaleString()} coins
            </button>
          </div>
        </div>
        {toast}
      </>
    );
  }
  const picking = d.slot <= 15 && d.options;
  const cards = d.picks.map((b) => (b ? view(newCard(b)) : null));
  const full = cards.every(Boolean);
  const draftTeam = () => {
    const views = cards.filter(Boolean) as ReturnType<typeof view>[];
    // a bench of in-form reserves
    const rng = makeRng(hashString('draft-bench-' + d.picks.join()));
    const bench = [2, 1, 3, 4, 7, 9, 10, 13].map((pos) => {
      const c = rng.pick(cardPool().filter((x) => x.player.position === pos && x.ovr >= 74 && x.ovr <= 82 && !d.picks.includes(x.id)));
      return view(newCard(c.id));
    });
    return cardsTeam('DRF', 'Draft XV', clubKit(s.club), [...views, ...bench]);
  };
  const finished = !d.active;
  const reward = D.rewards[Math.min(d.wins, D.rewards.length - 1)];
  return (
    <>
      <TopBar title="Draft" sub={picking ? `Shirt ${d.slot}: ${posInfo(d.slot).name}` : `${d.wins} / ${D.wins} wins`} onBack={() => nav.page('hub')} />
      <div className="ut-body">
        {picking ? (
          <>
            <h2 className="ut-h">
              Pick your {posInfo(d.slot).name} <small>{d.slot} / 15</small>
            </h2>
            <div className="ut-row" style={{ justifyContent: 'center', gap: 14 }}>
              {d.options!.map((b) => (
                <UTCard
                  key={b}
                  card={newCard(b)}
                  size={128}
                  onClick={() =>
                    updateUT((st) => {
                      const dd = st.draft!;
                      dd.picks[dd.slot - 1] = b;
                      dd.slot++;
                      dd.options = dd.slot <= 15 ? draftOptions(`${seedBase}-${dd.slot}`, dd.slot) : null;
                    })
                  }
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="ut-panel ut-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <span>
                Rating <b>{teamRating(cards, [])}</b> · Chem <b style={{ color: '#2ee6ff' }}>{chemistry(cards).total}</b>
              </span>
              <span className="ut-muted">Wins {d.wins} / {D.wins} · reward now: {rewardText(reward)}</span>
            </div>
            {!finished && full && (
              <Opp
                a={aiSquad(`draft-${seedBase}-${d.wins}`, D.aiOvr[d.wins])}
                extra={` · round ${d.wins + 1}`}
                onPlay={() => play('draft', aiSquad(`draft-${seedBase}-${d.wins}`, D.aiOvr[d.wins]), d.wins >= 2 ? 'hard' : 'medium', { team: draftTeam() })}
              />
            )}
            {finished && (
              <button
                className="ut-btn gold"
                onClick={() => {
                  updateUT((st) => {
                    grant(st, reward);
                    st.draft = null;
                  });
                  say(`Draft rewards: ${rewardText(reward)}`);
                }}
              >
                Claim {d.wins}-win rewards
              </button>
            )}
          </>
        )}
        <h2 className="ut-h">Your draft XV</h2>
        <div className="ut-grid" style={{ ['--cw' as string]: '70px' }}>
          {cards.map((v, i) => (v ? <UTCard key={i} card={v.card} size={70} /> : <div key={i} className="ut-slot" style={{ position: 'relative', transform: 'none' }}><div className="empty">{posInfo(i + 1).short}</div></div>))}
        </div>
      </div>
      {toast}
    </>
  );
}

// ------------------------------------------------------------------ Friendlies
export function Friendlies({ nav }: { nav: UTNav }) {
  const s = useUT();
  const [diff, setDiff] = useState<Difficulty>('medium');
  const { play, toast } = useLaunch(nav, 'friendly');
  const F = REWARDS.friendlies;
  const opps = useMemo(() => [72, 78, 84].map((o, i) => aiSquad(`friendly-${dayKey()}-${i}`, o)), []);
  return (
    <>
      <TopBar title="Friendlies" sub="No risk · daily rewards" onBack={() => nav.page('hub')} />
      <div className="ut-body">
        <div className="ut-panel" style={{ marginBottom: 10 }}>
          <b>
            Daily wins {s.friendlies.wins} / {F.dailyWins}
          </b>
          <div className="ut-muted">
            Each daily win: {F.winCoins.toLocaleString()} coins · all {F.dailyWins}: {packName(F.pack)} · results don't count anywhere else · week {weekKey()}
          </div>
          <Bar v={s.friendlies.wins} max={F.dailyWins} />
        </div>
        <DiffPick v={diff} set={setDiff} />
        <div className="ut-list" style={{ marginTop: 8 }}>
          {opps.map((a) => (
            <Opp key={a.id} a={a} onPlay={() => play('friendly', a, diff)} />
          ))}
        </div>
      </div>
      {toast}
    </>
  );
}
