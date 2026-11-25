import * as THREE from 'three';
import type { StadiumContext, StadiumSpec } from './types';

/** Seeded RNG so a ground's setting is the same every match. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seedOf = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

/**
 * The world outside the ground: city skylines (windows lit after dark), suburbs, trees, fields and
 * hedges, palms and the sea, rivers, harbours, hills, mountains and volcano cones. All instanced so
 * a whole skyline is one or two draw calls. `radius` keeps everything clear of the stadium.
 */
export function buildSurroundings(group: THREE.Group, spec: StadiumSpec, ctx: StadiumContext, radius: number) {
  const s = spec.surroundings;
  const r = rng(seedOf(spec.id));
  const low = ctx.quality.level === 'low';
  const night = ctx.time === 'night';
  const golden = ctx.time === 'golden';
  const nightGlow: THREE.Material[] = [];
  const ring = (min: number, max: number) => {
    const a = r() * Math.PI * 2;
    const d = min + r() * (max - min);
    return [Math.cos(a) * d, Math.sin(a) * d] as const;
  };
  // keep things out of the stadium's rectangle-ish footprint
  const clear = (x: number, z: number, pad = 10) => Math.abs(x) > radius + pad || Math.abs(z) > radius * 0.75 + pad;

  // ---------------------------------------------------------------- buildings (skyline / suburbs)
  const boxes: { x: number; z: number; w: number; d: number; h: number; c: THREE.Color }[] = [];
  const roofs: { x: number; z: number; w: number; d: number; h: number; c: THREE.Color }[] = [];
  if (s.kind === 'city' || s.kind === 'harbour') {
    const tall = s.skyline ?? 30;
    const n = low ? 70 : 150;
    const minD = s.kind === 'harbour' ? radius + 160 : radius + 45;
    for (let i = 0; i < n; i++) {
      const [x, z] = ring(minD, minD + 260);
      if (!clear(x, z)) continue;
      // the downtown cluster is on one side; elsewhere lower blocks
      const towards = Math.cos(Math.atan2(z, x) - 2.4);
      const h = 8 + r() * (towards > 0.3 ? tall : tall * 0.4) * (0.4 + 0.6 * r());
      const w = 10 + r() * 18;
      const g = 0.45 + r() * 0.35;
      boxes.push({ x, z, w, d: w * (0.7 + r() * 0.6), h, c: new THREE.Color(g * 0.9, g * 0.95, g) });
    }
  }
  if (s.kind === 'suburb' || s.kind === 'city' || s.kind === 'trees') {
    const n = low ? 60 : s.kind === 'suburb' ? 220 : 110;
    for (let i = 0; i < n; i++) {
      const [x, z] = ring(radius + 25, radius + 200);
      if (!clear(x, z)) continue;
      const brick = ['#a5674a', '#c9b89a', '#8c5a44', '#d8d0c2', '#9e8f7c'][Math.floor(r() * 5)];
      const w = 7 + r() * 5;
      const d = 6 + r() * 4;
      const h = 5 + r() * 3;
      boxes.push({ x, z, w, d, h, c: new THREE.Color(brick) });
      roofs.push({ x, z, w: w + 0.6, d: d + 0.6, h, c: new THREE.Color(['#4b3a33', '#5b5f66', '#7a4a36'][Math.floor(r() * 3)]) });
    }
  }
  if (boxes.length) {
    const win = windowTexture(night || golden);
    const mat = new THREE.MeshStandardMaterial({ map: win.map, emissiveMap: win.emissive, emissive: new THREE.Color(1, 0.85, 0.6), emissiveIntensity: night ? 0.9 : golden ? 0.25 : 0, roughness: 0.7 });
    nightGlow.push(mat);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, mat, boxes.length);
    const m = new THREE.Matrix4();
    boxes.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, 0, b.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(b.z, b.x)), new THREE.Vector3(b.w, b.h, b.d));
      im.setMatrixAt(i, m);
      im.setColorAt(i, b.c);
    });
    group.add(im);
  }
  if (roofs.length) {
    const geo = new THREE.ConeGeometry(0.75, 1, 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), roofs.length);
    const m = new THREE.Matrix4();
    roofs.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.h, b.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(b.z, b.x)), new THREE.Vector3(b.w, 3.2, b.d));
      im.setMatrixAt(i, m);
      im.setColorAt(i, b.c);
    });
    group.add(im);
  }

  // ---------------------------------------------------------------- trees and palms
  const trees: [number, number, number][] = [];
  const nTrees = low ? 60 : s.kind === 'trees' || s.kind === 'fields' ? 260 : 130;
  for (let i = 0; i < nTrees; i++) {
    const [x, z] = ring(radius + 15, radius + 180);
    if (clear(x, z, 4)) trees.push([x, z, 4 + r() * 5]);
  }
  if (s.kind === 'tropical') {
    addPalms(group, r, radius, low);
  } else if (trees.length) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), trees.length);
    const m = new THREE.Matrix4();
    const greens = ['#24421d', '#2d5224', '#1f3a1a', '#36602a'].map((c) => new THREE.Color(c));
    trees.forEach(([x, z, sz], i) => {
      m.compose(new THREE.Vector3(x, sz * 0.9, z), new THREE.Quaternion(), new THREE.Vector3(sz, sz * 1.2, sz));
      im.setMatrixAt(i, m);
      im.setColorAt(i, greens[i % greens.length].clone().multiplyScalar(0.8 + r() * 0.35));
    });
    group.add(im);
  }

  // ---------------------------------------------------------------- fields and hedges (countryside)
  if (s.kind === 'fields') {
    const tones = ['#4f7a35', '#6b8d3b', '#c9b468', '#5d8a3e', '#8aa04a'];
    for (let i = 0; i < (low ? 8 : 18); i++) {
      const [x, z] = ring(radius + 40, radius + 320);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(60 + r() * 80, 50 + r() * 70), new THREE.MeshStandardMaterial({ color: tones[Math.floor(r() * tones.length)], roughness: 1 }));
      f.rotation.x = -Math.PI / 2;
      f.rotation.z = r() * Math.PI;
      f.position.set(x, -0.08 + i * 0.001, z);
      group.add(f);
    }
  }

  // ---------------------------------------------------------------- water
  const water = new THREE.MeshStandardMaterial({ color: night ? '#0d1a2c' : '#2f5f7f', roughness: 0.15, metalness: 0.6 });
  if (s.river) {
    // a river running past one long side
    const river = new THREE.Mesh(new THREE.PlaneGeometry(900, 26), water);
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, -0.04, Math.max(radius * 0.75 + 30, 200));
    group.add(river);
  }
  if (s.ocean || s.kind === 'harbour') {
    const sea = new THREE.Mesh(new THREE.CircleGeometry(1300, 48, Math.PI * 0.15, Math.PI * 0.7), water);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.05, 0);
    sea.scale.set(1, 1, 1);
    // the sea starts a little way out beyond the ground on the +z side
    sea.position.z = Math.max(s.kind === 'harbour' ? radius * 0.7 + 40 : radius * 0.7 + 90, 200);
    group.add(sea);
  }

  // ---------------------------------------------------------------- hills / mountains on the horizon
  if (s.hills) {
    const big = s.hills === 'mountains';
    const n = big ? 9 : 12;
    const mat = new THREE.MeshStandardMaterial({ color: big ? '#30482c' : '#4a6a38', roughness: 1, flatShading: true });
    const snow = new THREE.MeshStandardMaterial({ color: '#e8edf2', roughness: 0.9, flatShading: true });
    for (let i = 0; i < n; i++) {
      const a = -0.6 + (i / n) * 1.9 + r() * 0.1;
      const d = (big ? 480 : 700) + r() * 260;
      const h = big ? 150 + r() * 130 : 40 + r() * 45;
      const w = big ? 160 + r() * 120 : 140 + r() * 120;
      const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 7, 1), mat);
      m.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d - 120);
      m.rotation.y = r() * 3;
      group.add(m);
      if (big && h > 150) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.22, h * 0.22, 7, 1), snow);
        cap.position.set(m.position.x, h - h * 0.11 - 2, m.position.z);
        cap.rotation.y = m.rotation.y;
        group.add(cap);
      }
    }
  }
  return { nightGlow };
}

function addPalms(group: THREE.Group, r: () => number, radius: number, low: boolean) {
  const n = low ? 30 : 80;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.5, 1, 6), new THREE.MeshStandardMaterial({ color: '#7a5e3c', roughness: 1 }), n);
  const fronds = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 0.6, 7, 1, true), new THREE.MeshStandardMaterial({ color: '#2f6e2a', roughness: 1, side: THREE.DoubleSide, flatShading: true }), n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = radius * 0.9 + 12 + r() * 120;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d * 0.8;
    const h = 13 + r() * 9;
    const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25));
    m.compose(new THREE.Vector3(x, h / 2, z), lean, new THREE.Vector3(1, h, 1));
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, h + 0.1, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, r() * 3, 0)), new THREE.Vector3(6.5, 3, 6.5));
    fronds.setMatrixAt(i, m);
  }
  group.add(trunks, fronds);
  // a beach strip between the palms and the sea
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(900, 40), new THREE.MeshStandardMaterial({ color: '#d9c79a', roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.045, radius * 0.7 + 70);
  group.add(sand);
}

/** Office / flat windows: a grid of panes; after dark some are lit (emissive map = lit panes only). */
function windowTexture(lit: boolean) {
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    return c;
  };
  const a = mk();
  const b = mk();
  const g = a.getContext('2d')!;
  const e = b.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 128);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 10)
    for (let x = 4; x < 64; x += 10) {
      const on = lit && Math.random() < 0.45;
      g.fillStyle = on ? '#fff2c8' : '#5b6675';
      g.fillRect(x, y, 6, 6);
      if (on) {
        e.fillStyle = '#ffe6b0';
        e.fillRect(x, y, 6, 6);
      }
    }
  const map = new THREE.CanvasTexture(a);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(b);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}
