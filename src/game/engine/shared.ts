/** Types, constants and small helpers shared by the engine modules. */
import * as THREE from 'three';
import type { Player, Ratings } from '../../data/players';
import { clamp, rand } from '../../util/rng';
import { CFG } from '../gameConfig';
import type { KickKind } from '../types';
import type { AnimName } from '../view/assets';
import type { Visual } from '../view/visual';
export type Side = 0 | 1;
export type PState = 'free' | 'down' | 'bound' | 'off';
export type Phase = 'pre' | 'kickoff' | 'play' | 'ruck' | 'maul' | 'scrum' | 'lineout' | 'placekick' | 'dead' | 'halftime' | 'fulltime';

export interface P {
  side: Side;
  num: number;
  data: Player;
  r: Ratings;
  name: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  tx: number;
  tz: number;
  /** smoothed movement goal */
  gx: number;
  gz: number;
  urgency: number;
  state: PState;
  timer: number;
  tackleCD: number;
  catchCD: number;
  sidestepT: number;
  /** sidestep cooldown */
  sidestepCD: number;
  sideDir: number;
  handoffT: number;
  diveT: number;
  kickT: number;
  stamina: number;
  slotSide: number;
  slotK: number;
  av: Visual;
  /** one-shot animation requested by the game logic this frame */
  fx: AnimName | null;
  celebrateT: number;
  wasDown: boolean;
  /** rendered facing, eased towards `heading` so players turn smoothly */
  face: number;
  casting?: boolean;
  /** lifted off the ground (lineout jumper), metres */
  lift?: number;
  prevFace?: number;
  leanZ?: number;
  leanX?: number;
  /** current locomotion animation, kept with hysteresis so it doesn't flicker */
  loco: 'idle' | 'walk' | 'run';
}

export interface PassFlight {
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  t: number;
  T: number;
  peak: number;
  target: P;
  passer: P;
  long: boolean;
  forward: boolean;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: 'held' | 'pass' | 'air' | 'ground' | 'dead';
  carrier: P | null;
  pass: PassFlight | null;
  lastSide: Side;
  kicker: P | null;
  kickFromX: number;
  bounced: boolean;
  goalCheck: null | { side: Side; kind: 'drop' | 'conversion' | 'penalty' | 'drill' };
  /** kicked to touch from a penalty: the kicking team throws in wherever it goes out */
  penTouch?: boolean;
  wind: boolean;
  grubber: boolean;
  hopT: number;
}

export const G = 9.81;
export const dirOf = (s: Side) => (s === 0 ? 1 : -1);
export const other = (s: Side): Side => (s === 0 ? 1 : 0);
export const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export const LINES: Record<string, string[]> = {
  try: ['TRY!', 'TRY! What a finish!', 'TRY! Over the line!', 'TRY! Brilliant score!'],
  bigHit: ['Huge hit!', 'Massive tackle!', 'Bone-rattler!', 'What a hit!'],
  knockOn: ['Knock-on', 'Knocked on!', 'Spilled forward'],
  forward: ['Forward pass!', 'That went forward'],
  turnover: ['Turnover!', 'Ball stolen!', 'Jackal! Turnover!'],
  lineBreak: ['Line break!', 'Through the gap!', "He's away!"],
  brokenTackle: ['Broken tackle!', 'Bounced off him!', 'Stepped him!'],
  intercept: ['Intercepted!', 'Picked off!'],
};
export const lastLine: Record<string, string> = {};
/** A random line for the moment, never the same one twice in a row. */
export const line = (k: string) => {
  const opts = LINES[k].filter((l) => l !== lastLine[k]);
  const l = rand.pick(opts.length ? opts : LINES[k]);
  lastLine[k] = l;
  return l;
};


export const REPLAY_SPEED = CFG.replaySpeed;
/** Longest landing distance for each kick type (metres). */
export const KICK_MAX: Record<KickKind, number> = CFG.kickMax;
/** Acceleration and agility from ratings: wingers are sharp, props are slow to get going. */
export function moveStats(p: P): { acc: number; agi: number } {
  const r = p.r;
  const acc = clamp(0.8 + (r.pace - 60) / 120 - (r.strength - 70) / 260, 0.7, 1.25);
  const agi = clamp((r.pace * 0.6 + r.handling * 0.4 - 55) / 40, 0, 1);
  return { acc, agi };
}
/** Orthonormal basis of the key light (it always shines along (35, -70, -45)). */
export const SHADOW_BASIS = (() => {
  const dir = new THREE.Vector3(35, -70, -45).normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  return { dir, right, up };
})();
export type KickType = 'punt' | 'grubber' | 'box' | 'drop' | 'chip' | 'high' | 'touch' | 'cross';
export const GRUB_VY = CFG.grubber.vy;
export const GRUB_REST = CFG.grubber.restitution;
export const GRUB_KEEP = CFG.grubber.keep;
export const GRUB_FRICTION = CFG.grubber.friction;

/** Distance a grubber travels before stopping (no random hops), for the aiming solver. */
export function simulateGrubber(vh: number): number {
  let x = 0;
  let y = 0.7;
  let vx = vh;
  let vy = GRUB_VY;
  let air = true;
  const dt = 1 / 60;
  for (let i = 0; i < 1200; i++) {
    if (air) {
      vy -= G * dt;
      x += vx * dt;
      y += vy * dt;
      if (y <= 0.12) {
        y = 0.12;
        if (Math.abs(vy) > 1.2) {
          vy = -vy * GRUB_REST;
          vx *= GRUB_KEEP;
        } else air = false;
      }
    } else {
      vx *= Math.max(0, 1 - dt * GRUB_FRICTION);
      x += vx * dt;
      if (vx < 0.3) break;
    }
  }
  return x;
}
export const ANIMS: AnimName[] = ['idle', 'walk', 'run', 'sidestepL', 'sidestepR', 'pass', 'catch', 'kick', 'tackle', 'dive', 'fall', 'getup', 'celebrate', 'bind', 'lying', 'carry', 'base'];

export interface ReplayFrame {
  p: Float32Array; // per player: x, z, heading, base anim, time scale, triggered anim
  bx: number;
  by: number;
  bz: number;
  flying: boolean;
}

/** Selector colour: the team's primary, unless it's too dark to see against the night sky. */
export function indicatorColor(kit: { primary: string; secondary: string }) {
  const c = new THREE.Color(kit.primary);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l > 0.12) return kit.primary;
  const s = new THREE.Color(kit.secondary);
  return 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b > 0.12 ? kit.secondary : '#c6ff1a';
}

export function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
