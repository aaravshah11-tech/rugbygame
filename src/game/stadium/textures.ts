import * as THREE from 'three';

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

