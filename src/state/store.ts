import { resolveQuality } from '../game/view/quality';
import { useSyncExternalStore } from 'react';
import { makeRng, uid } from '../util/rng';
import { randomCard, type Player } from '../data/players';
import type { Challenge, ChallengeKind, MatchResult, Profile, StaffMember } from './types';
import { audio } from '../util/audio';
import { setHapticsEnabled } from '../util/haptics';

const KEY = 'tryline.profile.v1';
const today = () => new Date().toISOString().slice(0, 10);

export const STAFF: StaffMember[] = [
  { id: 'attack', name: 'Attack Coach', role: 'Attack', desc: '+3 Passing, +2 Handling for the whole squad', boost: { passing: 3, handling: 2 }, cost: 1500 },
  { id: 'defence', name: 'Defence Coach', role: 'Defence', desc: '+4 Tackling for the whole squad', boost: { tackling: 4 }, cost: 1500 },
  { id: 'kicking', name: 'Kicking Coach', role: 'Kicking', desc: '+5 Kicking for the whole squad', boost: { kicking: 5 }, cost: 1200 },
  { id: 'scrum', name: 'Scrum Coach', role: 'Forwards', desc: '+4 Strength for the whole squad', boost: { strength: 4 }, cost: 1400 },
  { id: 'fitness', name: 'Fitness Coach', role: 'Conditioning', desc: '+3 Pace for the whole squad', boost: { pace: 3 }, cost: 1800 },
];

export const LOGIN_REWARDS = [100, 150, 200, 300, 400, 500, 1000];

const CHALLENGE_POOL: { kind: ChallengeKind; label: (n: number) => string; target: number; reward: number }[] = [
  { kind: 'win', label: () => 'Win a match', target: 1, reward: 400 },
  { kind: 'tries', label: (n) => `Score ${n} tries`, target: 3, reward: 350 },
  { kind: 'tackles', label: (n) => `Make ${n} tackles`, target: 10, reward: 300 },
  { kind: 'conversions', label: (n) => `Kick ${n} conversions`, target: 2, reward: 300 },
  { kind: 'hardWin', label: () => 'Win a match on Hard', target: 1, reward: 700 },
  { kind: 'passes', label: (n) => `Complete ${n} passes`, target: 25, reward: 250 },
  { kind: 'matches', label: (n) => `Play ${n} matches`, target: 2, reward: 300 },
];

function makeChallenges(date: string): Challenge[] {
  const rng = makeRng(Number(date.replace(/-/g, '')));
  const pool = [...CHALLENGE_POOL];
  const out: Challenge[] = [];
  for (let i = 0; i < 3; i++) {
    const c = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    out.push({ id: uid(), kind: c.kind, label: c.label(c.target), target: c.target, progress: 0, reward: c.reward, claimed: false });
  }
  return out;
}

/** A new club starts with a full squad of bronze cards plus a few silvers. */
function starterClub(): Profile['club'] {
  const rng = makeRng(Date.now() >>> 0);
  const cards: Player[] = [];
  for (let pos = 1; pos <= 15; pos++) {
    let c = randomCard(pos === 10 || pos === 9 ? 'silver' : 'bronze', rng);
    c = { ...c, position: pos };
    cards.push(c);
  }
  const benchPos = [2, 1, 4, 7, 9, 10, 12, 15];
  for (const pos of benchPos) cards.push({ ...randomCard('bronze', rng), position: pos });
  return {
    cards,
    starting: cards.slice(0, 15).map((c) => c.id),
    bench: cards.slice(15, 23).map((c) => c.id),
    staff: [],
    season: null,
    seasonsPlayed: 0,
  };
}

function freshProfile(): Profile {
  const d = today();
  return {
    version: 1,
    coins: 1500,
    settings: { music: 0.5, sfx: 0.8, haptics: true, difficulty: 'medium', camera: 'broadcast', halfLength: 5, graphics: 'auto', weather: 'dry', tactics: { attack: 'balanced', defence: 'balanced', kicking: 'balanced' }, rules: 'standard', autoSwitch: true, leftHanded: false, buttonScale: 1 },
    club: starterClub(),
    championship: null,
    worldCup: null,
    comps: {},
    daily: { lastLogin: '', streak: 0, pendingReward: 0, challengesDate: d, challenges: makeChallenges(d) },
    stats: { matches: 0, wins: 0, draws: 0, losses: 0, tries: 0, tackles: 0 },
    trophies: { championship: 0, worldCup: 0, seasons: 0 },
    trainingDone: {},
    updatedAt: Date.now(),
  };
}

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      if (p.version === 1) {
        const out: Profile = { ...freshProfile(), ...p, settings: { ...freshProfile().settings, ...p.settings } };
        // older saves used 4/6/10 minute halves
        if (![3, 5, 8].includes(out.settings.halfLength)) out.settings.halfLength = 5;
        return out;
      }
    }
  } catch {
    /* corrupted or unavailable */
  }
  return freshProfile();
}

let profile: Profile = load();
const listeners = new Set<() => void>();

// ---------- IndexedDB mirror (survives localStorage eviction) ----------
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tryline', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(value: string) {
  try {
    const db = await idb();
    db.transaction('kv', 'readwrite').objectStore('kv').put(value, KEY);
  } catch {
    /* ignore */
  }
}
async function idbGet(): Promise<string | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction('kv').objectStore('kv').get(KEY);
      r.onsuccess = () => resolve((r.result as string) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** If localStorage was cleared but IndexedDB still has a save, restore it. */
export async function restoreFromIdb() {
  if (localStorage.getItem(KEY)) return;
  const raw = await idbGet();
  if (!raw) return;
  try {
    const p = JSON.parse(raw) as Profile;
    if (p.version === 1) replaceProfile(p);
  } catch {
    /* ignore */
  }
}

let saveTimer: number | null = null;
function persist() {
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    const raw = JSON.stringify(profile);
    try {
      localStorage.setItem(KEY, raw);
    } catch {
      /* storage full or blocked */
    }
    void idbPut(raw);
  }, 250);
}

/** Write the save straight away (the Save button), instead of waiting for the next tick. */
export function saveNow() {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const raw = JSON.stringify(profile);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* storage full or blocked: IndexedDB still has it */
  }
  void idbPut(raw);
}

function emit() {
  for (const l of listeners) l();
}

export function getProfile() {
  return profile;
}

/** Mutate the profile in place; a new top-level object is created so React re-renders. */
export function update(fn: (p: Profile) => void) {
  fn(profile);
  profile = { ...profile, updatedAt: Date.now() };
  applySettings();
  persist();
  emit();
}

export function replaceProfile(p: Profile) {
  profile = { ...freshProfile(), ...p };
  applySettings();
  persist();
  emit();
}

export function resetProfile() {
  replaceProfile(freshProfile());
}

export function useProfile(): Profile {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => profile,
  );
}

export function applySettings() {
  audio.setVolumes(profile.settings.music, profile.settings.sfx);
  setHapticsEnabled(profile.settings.haptics);
  // the stylesheet reads these: data-motion="reduce" cuts big animations, data-gfx="low" the blur and glow
  const root = document.documentElement;
  root.dataset.motion = reduceMotion() ? 'reduce' : 'full';
  root.dataset.gfx = resolveQuality(profile.settings.graphics);
}

/** The player's Reduce Motion setting, or the iOS/OS preference. */
export function reduceMotion(): boolean {
  return !!profile.settings.reduceMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// ---------- daily login + challenges ----------
export function runDailyCheck() {
  const d = today();
  update((p) => {
    if (p.daily.challengesDate !== d) {
      p.daily.challengesDate = d;
      p.daily.challenges = makeChallenges(d);
    }
    if (p.daily.lastLogin !== d) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      p.daily.streak = p.daily.lastLogin === yesterday ? (p.daily.streak % 7) + 1 : 1;
      p.daily.lastLogin = d;
      p.daily.pendingReward = LOGIN_REWARDS[p.daily.streak - 1];
    }
  });
}

export function claimLoginReward() {
  update((p) => {
    p.coins += p.daily.pendingReward;
    p.daily.pendingReward = 0;
  });
  audio.coin();
}

export function claimChallenge(id: string) {
  update((p) => {
    const c = p.daily.challenges.find((x) => x.id === id);
    if (c && !c.claimed && c.progress >= c.target) {
      c.claimed = true;
      p.coins += c.reward;
    }
  });
  audio.coin();
}

const DIFF_MULT = { easy: 0.8, medium: 1, hard: 1.4, elite: 1.8 } as const;

/** Applies a finished match to stats, challenges and coins. Returns coins earned. */
export function recordMatch(r: MatchResult): number {
  if (r.userSide === null) return 0;
  const userScore = r.userSide === 0 ? r.homeScore : r.awayScore;
  const oppScore = r.userSide === 0 ? r.awayScore : r.homeScore;
  const won = userScore > oppScore;
  const drawn = userScore === oppScore;
  const coins = Math.round(((won ? 400 : drawn ? 200 : 100) + r.user.tries * 50 + r.user.tackles * 5) * DIFF_MULT[r.difficulty]);
  update((p) => {
    p.coins += coins;
    p.stats.matches++;
    if (won) p.stats.wins++;
    else if (drawn) p.stats.draws++;
    else p.stats.losses++;
    p.stats.tries += r.user.tries;
    p.stats.tackles += r.user.tackles;
    const side = r.userSide as 0 | 1;
    p.recent = [{ home: r.home, away: r.away, homeScore: r.homeScore, awayScore: r.awayScore, tries: side === 0 ? r.homeTries : r.awayTries, userSide: side }, ...(p.recent ?? [])].slice(0, 6);
    for (const c of p.daily.challenges) {
      if (c.claimed) continue;
      const add: Record<ChallengeKind, number> = {
        win: won ? 1 : 0,
        hardWin: won && r.difficulty === 'hard' ? 1 : 0,
        tries: r.user.tries,
        tackles: r.user.tackles,
        conversions: r.user.conversions,
        passes: r.user.passes,
        matches: 1,
      };
      c.progress = Math.min(c.target, c.progress + add[c.kind]);
    }
  });
  return coins;
}
