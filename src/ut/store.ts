/**
 * Ultimate Team save: your club, cards, squad, packs and progress in every mode.
 * Saved to localStorage (fast, synchronous) and mirrored to IndexedDB, with JSON export/import.
 * Coins are the game's one wallet (profile.coins), so they're shared with the rest of Try Line.
 */
import { useSyncExternalStore } from 'react';
import { uid } from '../util/rng';
import { getProfile, replaceProfile, update as updateProfile } from '../state/store';
import type { Profile } from '../state/types';
import { cardPool, type OwnedCard } from './pool';
import { UT_START } from './config';
import { ovrFor, type Player } from '../data/players';

export interface ClubLook {
  name: string;
  short: string;
  /** badge: shape, two colours and an emblem */
  badge: { shape: 'shield' | 'round' | 'diamond' | 'crest'; c1: string; c2: string; emblem: 'star' | 'bolt' | 'lion' | 'wave' | 'crown' | 'ball' | 'stag' | 'rose' };
  kit: { primary: string; secondary: string; pattern: 'plain' | 'hoops' | 'stripes' | 'sash' | 'chevron' | 'halves' };
  stadium: string;
}

export interface UTMatchStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  tries: number;
  /** tries by card base id */
  scorers: Record<string, number>;
  /** matches per card base id (for objectives / evolutions) */
  apps: Record<string, number>;
}

export interface Listing {
  id: string;
  card: OwnedCard;
  price: number;
  /** when it was listed (ms); ends after an hour */
  at: number;
  mine?: boolean;
}

export interface UTState {
  v: 1;
  started: boolean;
  club: ClubLook;
  cards: OwnedCard[];
  /** duplicates kept aside (not in the club) */
  storage: OwnedCard[];
  /** starting XV (shirt 1-15) and bench (8), card uids */
  xv: (string | null)[];
  bench: (string | null)[];
  /** unopened packs */
  packs: string[];
  items: { posChange: number };
  stats: UTMatchStats;
  battles: { week: string; points: number; played: number; beaten: string[]; claimed: string | null; lastRank: string | null };
  rivals: { week: string; division: number; points: number; best: number; wins: number; matches: number; claimed: string | null };
  champions: { week: string; qualified: boolean; active: boolean; played: number; wins: number; claimed: boolean };
  moments: Record<string, number>;
  momentRewards: number[];
  draft: null | { picks: (string | null)[]; options: string[] | null; slot: number; wins: number; active: boolean; lost: boolean };
  friendlies: { date: string; wins: number };
  sbc: Record<string, number>;
  objectives: { date: string; week: string; progress: Record<string, number>; claimed: string[] };
  season: { xp: number; claimed: number[] };
  market: { seed: number; listings: Listing[]; mine: Listing[]; watch: string[]; last: number; history: Record<string, number[]> };
  evo: { cardUid: string; id: string; progress: Record<string, number> }[];
  /** base ids of the user's own top performers this week (Team of the Week) */
  performers: { week: string; scores: Record<string, number> };
  log: string[];
}

const KEY = 'tryline.ut.v1';

export const weekKey = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day);
  return t.toISOString().slice(0, 10);
};
export const dayKey = () => new Date().toISOString().slice(0, 10);

function fresh(): UTState {
  const w = weekKey();
  return {
    v: 1,
    started: false,
    club: {
      name: 'Try Line FC',
      short: 'TLF',
      badge: { shape: 'shield', c1: '#0e1b45', c2: '#c6ff1a', emblem: 'bolt' },
      kit: { primary: '#0e1b45', secondary: '#c6ff1a', pattern: 'chevron' },
      stadium: 'ENG',
    },
    cards: [],
    storage: [],
    xv: Array(15).fill(null),
    bench: Array(8).fill(null),
    packs: [],
    items: { posChange: 0 },
    stats: { played: 0, wins: 0, draws: 0, losses: 0, tries: 0, scorers: {}, apps: {} },
    battles: { week: w, points: 0, played: 0, beaten: [], claimed: null, lastRank: null },
    rivals: { week: w, division: 10, points: 0, best: 10, wins: 0, matches: 0, claimed: null },
    champions: { week: w, qualified: false, active: false, played: 0, wins: 0, claimed: false },
    moments: {},
    momentRewards: [],
    draft: null,
    friendlies: { date: dayKey(), wins: 0 },
    sbc: {},
    objectives: { date: dayKey(), week: w, progress: {}, claimed: [] },
    season: { xp: 0, claimed: [] },
    market: { seed: 1, listings: [], mine: [], watch: [], last: 0, history: {} },
    evo: [],
    performers: { week: w, scores: {} },
    log: [],
  };
}

function load(): UTState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as UTState;
      if (s.v === 1) return { ...fresh(), ...s };
    }
  } catch {
    /* corrupted or blocked */
  }
  return fresh();
}

let state: UTState = load();
const listeners = new Set<() => void>();

// ---------- IndexedDB mirror ----------
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
/** localStorage cleared but IndexedDB still has the club: bring it back. */
export async function restoreUT() {
  try {
    if (localStorage.getItem(KEY)) return;
    const db = await idb();
    const raw = await new Promise<string | null>((res) => {
      const r = db.transaction('kv').objectStore('kv').get(KEY);
      r.onsuccess = () => res((r.result as string) ?? null);
      r.onerror = () => res(null);
    });
    if (raw) {
      const s = JSON.parse(raw) as UTState;
      if (s.v === 1) {
        state = { ...fresh(), ...s };
        persist();
        emit();
      }
    }
  } catch {
    /* ignore */
  }
}

let timer: number | null = null;
function persist() {
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    const raw = JSON.stringify(state);
    try {
      localStorage.setItem(KEY, raw);
    } catch {
      /* storage full: IndexedDB still has it */
    }
    void idbPut(raw);
  }, 300);
}
function emit() {
  for (const l of listeners) l();
}

export function getUT() {
  return state;
}

export function updateUT(fn: (s: UTState) => void) {
  fn(state);
  state = { ...state };
  persist();
  emit();
}

export function useUT(): UTState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

// ---------- coins (the game's wallet) ----------
export const coins = () => getProfile().coins;
export function addCoins(n: number) {
  updateProfile((p) => (p.coins += n));
}
export function spend(n: number): boolean {
  if (getProfile().coins < n) return false;
  updateProfile((p) => (p.coins -= n));
  return true;
}

// ---------- cards ----------
export function newCard(base: string, extra: Partial<OwnedCard> = {}): OwnedCard {
  return { uid: uid(), base, at: Date.now(), ...extra };
}
export const cardByUid = (s: UTState, id: string | null) => (id ? s.cards.find((c) => c.uid === id) ?? null : null);
export function ownsVersion(s: UTState, c: OwnedCard) {
  return s.cards.some((x) => x.base === c.base && (x.special ?? '') === (c.special ?? ''));
}
/** Take cards out of the club (SBC, quick sell, market): also clears them from the squad. */
export function removeCards(s: UTState, uids: Set<string>) {
  s.cards = s.cards.filter((c) => !uids.has(c.uid));
  s.xv = s.xv.map((u) => (u && uids.has(u) ? null : u));
  s.bench = s.bench.map((u) => (u && uids.has(u) ? null : u));
  s.evo = s.evo.filter((e) => !uids.has(e.cardUid));
}

// ---------- first start + migration ----------
/**
 * The first time Ultimate Team opens: bring over the old Squad mode cards (nothing lost), add the
 * starter squad, the starter pack and 10,000 coins.
 */
export function startUT(starterSquad: () => OwnedCard[]) {
  if (state.started) return;
  const p = getProfile();
  updateUT((s) => {
    s.started = true;
    // old Squad mode cards: real players map to their card, generated ones keep their own data
    const pool = cardPool();
    const byName = new Map(pool.map((b) => [`${b.player.first} ${b.player.last}`, b.id]));
    const migrated: OwnedCard[] = (p.club?.cards ?? []).map((pl: Player) => {
      const id = byName.get(`${pl.first} ${pl.last}`);
      return id ? newCard(id) : newCard(`legacy-${pl.id}`, { legacy: { ...pl }, untradeable: true });
    });
    const starters = starterSquad();
    s.cards = [...starters, ...migrated];
    starters.slice(0, 15).forEach((c, i) => (s.xv[i] = c.uid));
    starters.slice(15, 23).forEach((c, i) => (s.bench[i] = c.uid));
    s.packs = [...UT_START.packs];
    if (migrated.length) s.log.unshift(`${migrated.length} cards brought over from your old Squad`);
  });
  addCoins(UT_START.coins);
}

/** Packs owed from outside Ultimate Team (the tutorial reward). */
export function collectFreePacks() {
  const p = getProfile();
  if (!p.freePacks?.length) return 0;
  const n = p.freePacks.length;
  updateUT((s) => s.packs.push(...(p.freePacks ?? [])));
  updateProfile((q) => (q.freePacks = []));
  return n;
}

// ---------- backup ----------
export function exportBackup(): string {
  return JSON.stringify({ app: 'try-line', at: new Date().toISOString(), profile: getProfile(), ut: state }, null, 0);
}
export function importBackup(raw: string): boolean {
  try {
    const d = JSON.parse(raw) as { app?: string; profile?: Profile; ut?: UTState };
    if (d.app !== 'try-line' || !d.ut || d.ut.v !== 1 || !d.profile) return false;
    replaceProfile(d.profile);
    state = { ...fresh(), ...d.ut };
    persist();
    emit();
    return true;
  } catch {
    return false;
  }
}

/** Card value helper used across screens. */
export const legacyOvr = (c: OwnedCard) => (c.legacy ? ovrFor(c.legacy.ratings, c.legacy.position) : 0);
