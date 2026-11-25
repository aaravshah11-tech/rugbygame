import * as THREE from 'three';
import type { Path } from './path';
import type { StadiumSpec } from './types';

/** Original, made-up sponsor names for the LED boards. */
export const SPONSORS = ['VOLTARA', 'IRONBARK ALES', 'QUASAR MOBILE', 'ZEPHYRA AIR', 'BOLTWAVE', 'SUMMIT TYRES', 'HEXA ENERGY', 'PULSEFIT', 'TRY LINE', 'NORTHGATE BANK', 'KESTREL WATCHES'];

export function ledTexture(extra: string[] = []) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#04060b';
  g.fillRect(0, 0, 2048, 64);
  g.font = 'italic 900 38px Arial Black, Arial, sans-serif';
  g.textBaseline = 'middle';
  const colors = ['#c6ff1a', '#21e6c1', '#ffffff', '#ff3d6e', '#ffc83d'];
  let x = 16;
  let i = 0;
  while (x < 2048) {
    const list = [...extra, ...SPONSORS];
    const w = list[i % list.length];
    g.fillStyle = colors[i % colors.length];
    g.fillText(w, x, 34);
    x += g.measureText(w).width + 70;
    i++;
  }
  // LED pixel grid
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 0; y < 64; y += 3) g.fillRect(0, y, 2048, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function fanAtlas() {
  // 4 cells: 2 body variants x (arms down, arms up). R = shirt, G = skin, B = hair.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  for (let cell = 0; cell < 4; cell++) {
    const ox = cell * 64;
    const up = cell >= 2;
    const wide = cell % 2 === 1;
    const sw = wide ? 44 : 36;
    // torso (shirt)
    g.fillStyle = 'rgb(255,0,0)';
    g.beginPath();
    g.roundRect(ox + 32 - sw / 2, 52, sw, 76, 10);
    g.fill();
    // arms
    if (up) {
      g.fillRect(ox + 32 - sw / 2 - 8, 14, 9, 48);
      g.fillRect(ox + 32 + sw / 2 - 1, 14, 9, 48);
      g.fillStyle = 'rgb(0,255,0)';
      g.fillRect(ox + 32 - sw / 2 - 8, 6, 9, 12);
      g.fillRect(ox + 32 + sw / 2 - 1, 6, 9, 12);
    } else {
      g.fillRect(ox + 32 - sw / 2 - 7, 56, 9, 40);
      g.fillRect(ox + 32 + sw / 2 - 2, 56, 9, 40);
    }
    // head
    g.fillStyle = 'rgb(0,255,0)';
    g.beginPath();
    g.ellipse(ox + 32, 38, 11, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgb(0,0,255)';
    g.beginPath();
    g.ellipse(ox + 32, 30, 11, 7, 0, Math.PI, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,245,1)');
  rg.addColorStop(0.15, 'rgba(255,250,225,0.8)');
  rg.addColorStop(0.45, 'rgba(255,240,200,0.18)');
  rg.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
export const GLOW_TEX = (() => {
  let t: THREE.Texture | null = null;
  return () => (t ??= glowTexture());
})();


// ---------------------------------------------------------------- seats

interface SeatTier {
  rows: number;
  terrace: boolean;
}
type SeatRun = unknown;

const hash = (a: number, b: number, c: number) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * One pixel per seat for a tier: colour pattern from the spec, concrete aisles every ~14 m and dark
 * vomitory openings (tunnel entrances into the stand) part-way up bigger tiers. The same grid
 * tells the crowd builder where the seats are.
 */
export function seatMap(spec: StadiumSpec, path: Path, t: SeatTier, k: number, run: SeatRun, low: boolean) {
  const seatW = 0.55;
  const W = Math.max(64, Math.min(2048, Math.round(path.length / seatW)));
  const H = t.rows;
  const cols = spec.seats.colors.map((c) => new THREE.Color(c));
  const aisle = new THREE.Color('#5c626e');
  const vom = new THREE.Color('#07080b');
  const step = new THREE.Color(t.terrace ? '#8a909a' : '#6a707c');
  // side of each column
  const sides: string[] = [];
  let pi = 0;
  for (let j = 0; j < W; j++) {
    const s = ((j + 0.5) / W) * path.length;
    while (pi + 1 < path.pts.length && path.pts[pi + 1].s <= s) pi++;
    sides.push(path.pts[pi].side);
  }
  const aisleEvery = Math.round(14 / seatW);
  const isAisle = (j: number) => !t.terrace && j % aisleEvery < 2;
  const isVom = (j: number, r: number) => !t.terrace && H >= 9 && j % (aisleEvery * 2) >= 2 && j % (aisleEvery * 2) < 6 && r >= Math.floor(H * 0.42) && r < Math.floor(H * 0.42) + 3;
  // letters spelled in the seats (lower tier of the main stand)
  let letterMask: Uint8ClampedArray | null = null;
  if (spec.seats.pattern === 'letters' && spec.seats.letters && k === 0 && !low) {
    const js = sides.map((sd, j) => (sd === 'main' ? j : -1)).filter((j) => j >= 0);
    if (js.length > 20) {
      const j0 = js[0];
      const span = js[js.length - 1] - j0;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${Math.round(H * 0.8)}px Arial, sans-serif`;
      // letters are mirrored on the path when it runs right-to-left; draw so they read from the pitch
      const flip = path.pts.find((p) => p.side === 'main')!;
      const reverse = (path.pts[path.pts.indexOf(flip) + 1]?.x ?? flip.x + 1) < flip.x;
      g.save();
      g.translate(j0 + span / 2, H / 2);
      g.scale(reverse ? -1 : 1, -1);
      const text = spec.seats.letters;
      const size = Math.min(span / (text.length * 0.75), H * 0.9);
      g.font = `900 ${Math.round(size)}px Arial, sans-serif`;
      g.fillText(text, 0, 0);
      g.restore();
      letterMask = g.getImageData(0, 0, W, H).data;
    }
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const seat = new Uint8Array(W * H);
  const tmp = new THREE.Color();
  for (let r = 0; r < H; r++)
    for (let j = 0; j < W; j++) {
      let col: THREE.Color;
      let isSeat = 1;
      if (isAisle(j)) {
        col = aisle;
        isSeat = 0;
      } else if (isVom(j, r)) {
        col = vom;
        isSeat = 0;
      } else if (t.terrace) {
        col = tmp.copy(step).multiplyScalar(0.92 + 0.08 * (r % 2));
      } else {
        const pat = spec.seats.pattern;
        const n = cols.length;
        if (pat === 'mosaic') col = cols[Math.floor(hash(j, r, k) * n)];
        else if (pat === 'scatter') col = cols[hash(j, r, k + 7) < 0.72 ? 0 : 1 % n];
        else if (pat === 'blocks') col = cols[Math.floor(j / aisleEvery) % n];
        else if (pat === 'gradient') col = tmp.copy(cols[0]).lerp(cols[1 % n], (r / Math.max(1, H - 1)) * 0.5 + k * 0.25);
        else col = cols[r % Math.min(2, n)];
        if (letterMask && letterMask[(r * W + j) * 4 + 3] > 100) col = tmp.set(spec.seats.letterColor ?? '#ffffff');
      }
      // rows are stored top row first (v = 1 at the front row in the mesher)
      const o = ((H - 1 - r) * W + j) * 4;
      img.data[o] = Math.round(Math.pow(col.r, 1 / 2.2) * 255);
      img.data[o + 1] = Math.round(Math.pow(col.g, 1 / 2.2) * 255);
      img.data[o + 2] = Math.round(Math.pow(col.b, 1 / 2.2) * 255);
      img.data[o + 3] = 255;
      seat[r * W + j] = isSeat;
    }
  g.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = low ? 1 : 4;
  void run;
  return { texture, width: W, isSeat: (j: number, r: number) => seat[r * W + j] === 1 };
}

/** Repeating 8 m x 8 m tile for the outside of the stands. */
export function claddingTexture(style: StadiumSpec['cladding']['style'], color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const base = new THREE.Color(color);
  const css = (k: number) => `#${base.clone().multiplyScalar(k).getHexString()}`;
  g.fillStyle = css(1);
  g.fillRect(0, 0, 128, 128);
  if (style === 'glass') {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        g.fillStyle = css(0.75 + Math.random() * 0.35);
        g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
      }
  } else if (style === 'metal') {
    for (let x = 0; x < 128; x += 8) {
      g.fillStyle = css(0.78);
      g.fillRect(x, 0, 2, 128);
    }
    g.fillStyle = css(0.6);
    g.fillRect(0, 62, 128, 4);
  } else if (style === 'brick') {
    g.fillStyle = css(0.7);
    for (let y = 0; y < 128; y += 8) {
      g.fillRect(0, y, 128, 1);
      for (let x = (y / 8) % 2 ? 0 : 8; x < 128; x += 16) g.fillRect(x, y, 1, 8);
    }
  } else if (style === 'timber') {
    for (let x = 0; x < 128; x += 6) {
      g.fillStyle = css(0.7 + Math.random() * 0.4);
      g.fillRect(x, 0, 4, 128);
    }
  } else {
    // concrete: horizontal pour lines and a little staining
    for (let y = 0; y < 128; y += 32) {
      g.fillStyle = css(0.82);
      g.fillRect(0, y, 128, 2);
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2 + Math.random() * 8);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
