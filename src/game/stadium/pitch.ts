import * as THREE from 'three';
import { FIELD } from '../field';

export interface PitchStyle {
  mow: 'stripes' | 'checker' | 'diagonal' | 'circles' | 'wide';
  inGoal: string;
  artificial?: boolean;
  /** 0 dry .. 1 soaked: wear patches show up more */
  wet: number;
}

/** Grass with a mowing pattern, crisp painted lines and in-goal shading, drawn once to a canvas. */
function pitchCanvas(pxPerM: number, style: PitchStyle) {
  const W = 150;
  const H = 96;
  const c = document.createElement('canvas');
  c.width = Math.round(W * pxPerM);
  c.height = Math.round(H * pxPerM);
  const g = c.getContext('2d')!;
  const X = (x: number) => (x + W / 2) * pxPerM;
  const Z = (z: number) => (z + H / 2) * pxPerM;

  // Base grass and the ground's mowing pattern (artificial pitches: flat, brighter, faint bands)
  const [dark, light] = style.artificial ? ['#3b8a39', '#409240'] : ['#356f2a', '#3f8132'];
  g.fillStyle = dark;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = light;
  const P = pxPerM;
  if (style.mow === 'stripes' || style.mow === 'wide') {
    const w = style.mow === 'wide' ? 10 : 5;
    for (let i = 0; i < W / w; i += 2) g.fillRect(i * w * P, 0, w * P + 1, H * P);
  } else if (style.mow === 'checker') {
    for (let i = 0; i < W / 6; i++) for (let j = 0; j < H / 6; j++) if ((i + j) % 2) g.fillRect(i * 6 * P, j * 6 * P, 6 * P + 1, 6 * P + 1);
  } else if (style.mow === 'diagonal') {
    g.save();
    g.beginPath();
    g.rect(0, 0, c.width, c.height);
    g.clip();
    g.translate(c.width / 2, c.height / 2);
    g.rotate(Math.PI / 4);
    for (let i = -30; i < 30; i += 2) g.fillRect(i * 5 * P, -c.width, 5 * P, c.width * 2);
    g.restore();
  } else {
    // circles: rings mown out from the centre spot, over faint length stripes
    for (let i = 0; i < W / 5; i += 2) {
      g.fillStyle = 'rgba(70,140,55,0.35)';
      g.fillRect(i * 5 * P, 0, 5 * P + 1, H * P);
    }
    for (let r = 70; r > 0; r -= 6) {
      g.fillStyle = (r / 6) % 2 < 1 ? light : dark;
      g.beginPath();
      g.arc(X(0), Z(0), r * P, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Fine colour variation (speckle) so it doesn't look flat up close.
  const n = Math.round(W * H * 2.2);
  for (let i = 0; i < n; i++) {
    const l = Math.random();
    g.fillStyle = l < 0.5 ? `rgba(20,50,15,${0.08 + l * 0.12})` : `rgba(150,200,90,${0.04 + (l - 0.5) * 0.1})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, pxPerM * 0.35, pxPerM * 0.35);
  }
  // In-goal areas tinted in the home side's colour
  const ig = new THREE.Color(style.inGoal);
  g.fillStyle = `rgba(${Math.round(ig.r * 255)},${Math.round(ig.g * 255)},${Math.round(ig.b * 255)},0.2)`;
  g.fillRect(X(-60), Z(-35), 10 * pxPerM, 70 * pxPerM);
  g.fillRect(X(50), Z(-35), 10 * pxPerM, 70 * pxPerM);
  // Worn patches in front of the posts and at the centre.
  // (worse in the wet: scrums and lineouts churn the mud)
  const wear = style.artificial ? 0 : 0.2 + style.wet * 0.35;
  for (const [x, z, r] of [[0, 0, 4], [-40, 0, 5], [40, 0, 5], [-50, 0, 3], [50, 0, 3], [-22, -8, 3], [22, 8, 3], [0, -30, 3], [0, 30, 3]] as const) {
    const rg = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * pxPerM);
    rg.addColorStop(0, `rgba(${style.wet > 0.5 ? '95,78,50' : '120,110,60'},${wear})`);
    rg.addColorStop(1, 'rgba(120,110,60,0)');
    g.fillStyle = rg;
    g.fillRect(X(x - r), Z(z - r), 2 * r * pxPerM, 2 * r * pxPerM);
  }

  g.strokeStyle = 'rgba(250,250,245,0.96)';
  g.lineWidth = Math.max(1.5, 0.12 * pxPerM);
  g.lineCap = 'butt';
  const line = (x1: number, z1: number, x2: number, z2: number, dash?: number[]) => {
    g.setLineDash(dash ? dash.map((d) => d * pxPerM) : []);
    g.beginPath();
    g.moveTo(X(x1), Z(z1));
    g.lineTo(X(x2), Z(z2));
    g.stroke();
  };
  line(-60, -35, 60, -35);
  line(-60, 35, 60, 35);
  line(-60, -35, -60, 35);
  line(60, -35, 60, 35);
  for (const x of [-50, 50, -28, 28, 0]) line(x, -35, x, 35);
  // 10m lines dashed; 5m lines short dashes
  for (const x of [-10, 10]) line(x, -35, x, 35, [2, 1.4]);
  for (const x of [-45, 45]) line(x, -35, x, 35, [1, 4]);
  // 5m and 15m dashes in from each touchline, broken at the 22s/10s like a real pitch
  for (const z of [-30, 30, -20, 20]) {
    for (const x of [-45, -28, -10, 0, 10, 28, 45]) line(x - 1, z, x + 1, z);
    line(-50, z, 50, z, [1, 4]);
  }
  g.setLineDash([]);
  g.fillStyle = '#fff';
  g.fillRect(X(0) - 0.25 * pxPerM, Z(0) - 0.25 * pxPerM, 0.5 * pxPerM, 0.5 * pxPerM);
  return c;
}

/** Tiling grass normal map built from a field of random blades (height -> normals). */
function grassNormalMap(size = 256) {
  const h = new Float32Array(size * size);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 2 + Math.random() * 6;
    const amp = 0.4 + Math.random() * 0.6;
    for (let k = 0; k < len; k++) {
      const xi = (Math.floor(x + k * 0.3) + size) % size;
      const yi = (Math.floor(y + k) + size) % size;
      h[yi * size + xi] += amp * (1 - k / len);
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.8;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.8;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * size + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(110, 70);
  t.anisotropy = 4;
  return t;
}

function padTexture(color: string, band = 'rgba(255,255,255,0.9)') {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = band;
  g.fillRect(0, 18, 64, 10);
  g.fillRect(0, 100, 64, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildPitch(parent: THREE.Object3D, renderer: THREE.WebGLRenderer, pxPerM: number, endColors: [string, string], style: PitchStyle = { mow: 'stripes', inGoal: '#2c6a33', wet: 0 }, padBand?: string, padMap?: (color: string) => THREE.Texture) {
  const group = new THREE.Group();
  const map = new THREE.CanvasTexture(pitchCanvas(pxPerM, style));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  // wet grass picks up a sheen from the floodlights
  const mat = new THREE.MeshStandardMaterial({ map, normalMap: grassNormalMap(), normalScale: new THREE.Vector2(style.artificial ? 0.25 : 0.55, style.artificial ? 0.25 : 0.55), roughness: 0.95 - style.wet * 0.42, metalness: 0, envMapIntensity: 1 + style.wet * 0.8 });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(150, 96), mat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(260, 200), new THREE.MeshStandardMaterial({ color: style.artificial ? '#2c6b2c' : '#264a22', roughness: 1 }));
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.03;
  group.add(surround);

  // H posts: tall white uprights, padded bases in each team's colours.
  const postMat = new THREE.MeshStandardMaterial({ color: '#f7f7f4', roughness: 0.35, metalness: 0.15 });
  const upright = new THREE.CylinderGeometry(0.085, 0.1, 16, 10);
  const bar = new THREE.CylinderGeometry(0.075, 0.075, FIELD.postHalfW * 2, 10);
  const padGeo = new THREE.CylinderGeometry(0.34, 0.34, 2.2, 14);
  ([-1, 1] as const).forEach((sx, i) => {
    const padMat = new THREE.MeshStandardMaterial({ map: padMap ? padMap(endColors[i]) : padTexture(endColors[i], padBand), roughness: 0.8 });
    for (const sz of [-1, 1]) {
      const u = new THREE.Mesh(upright, postMat);
      u.position.set(sx * FIELD.tryX, 8, sz * FIELD.postHalfW);
      u.castShadow = true;
      group.add(u);
      const p = new THREE.Mesh(padGeo, padMat);
      p.position.set(sx * FIELD.tryX, 1.1, sz * FIELD.postHalfW);
      p.castShadow = true;
      group.add(p);
    }
    const b = new THREE.Mesh(bar, postMat);
    b.rotation.x = Math.PI / 2;
    b.position.set(sx * FIELD.tryX, FIELD.crossbar, 0);
    b.castShadow = true;
    group.add(b);
  });
  parent.add(group);
  return group;
}
