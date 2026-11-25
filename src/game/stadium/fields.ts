import * as THREE from 'three';
import type { QualityPreset } from '../view/quality';
import { makeCrowd } from './crowd';
import type { StadiumSpec } from './types';

/**
 * A school sports ground instead of a stadium: open mown fields, the pavilion behind one
 * dead-ball line, floodlight poles along a touchline, the 3G pitch and the hockey astro /
 * courts alongside, woods, hedges and a wheat field round the edge, and a few hundred
 * parents and players on the touchline. Laid out from aerial photos of BGS Failand.
 *
 * Game axes: the pitch runs along x (try lines at x = +-50), touchlines at z = +-35.
 */
export function buildSchoolGround(group: THREE.Group, q: QualityPreset, crowdColors: string[], V: StadiumSpec, key: THREE.DirectionalLight) {
  const rnd = mulberry(0xb65);

  // ---------- the mown fields round the pitch (stripes like the photos)
  const fieldTex = stripeTexture();
  fieldTex.wrapS = fieldTex.wrapT = THREE.RepeatWrapping;
  fieldTex.repeat.set(36, 36);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(640, 640), new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 1 }));
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.02;
  field.receiveShadow = true;
  group.add(field);

  // ---------- the pavilion: cream walls, terracotta hipped roof with gables, curved terrace
  const pav = pavilion();
  pav.position.set(-86, 0, 10);
  pav.rotation.y = -Math.PI / 2; // faces +x, up the pitch
  group.add(pav);
  // the car park and sports hall behind it
  group.add(flat(-130, 0, 70, 46, '#5c6066', 0.01));
  const hall = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 60), new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.7 }));
  hall.position.set(-150, 4.5, -60);
  group.add(hall);

  // ---------- floodlight poles along the touchline next to the 3G
  const poleMat = new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.4, metalness: 0.7 });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.2, 3) });
  for (const x of [-48, -16, 16, 48]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 16, 8), poleMat);
    pole.position.set(x, 8, -42);
    pole.castShadow = q.shadows;
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.5), lampMat);
    head.position.set(x, 16.2, -41.6);
    head.rotation.x = -0.35;
    group.add(head);
  }

  // ---------- 3G pitch beyond the floodlights: dark green, red surround, white lines, posts
  const g3 = artificialPitch(108, 72, '#2f6a3a', '#9b2b22', true);
  g3.position.set(0, 0.01, -90);
  group.add(g3);
  // hockey astro (bright green) and the netball / tennis courts beyond the other touchline
  const astro = artificialPitch(96, 58, '#58b25a', '#c94a2c', false);
  astro.position.set(-10, 0.01, 78);
  group.add(astro);
  const courts = courtsBlock(60, 40);
  courts.position.set(78, 0.01, 72);
  group.add(courts);

  // ---------- edges: woods past the far end, hedges, the wheat field
  const wheat = flat(40, -170, 260, 90, '#c9b468', 0.0);
  group.add(wheat);
  const trees: { x: number; z: number; s: number }[] = [];
  const band = (x0: number, x1: number, z0: number, z1: number, n: number, s0 = 4, s1 = 8) => {
    for (let i = 0; i < n; i++) trees.push({ x: x0 + rnd() * (x1 - x0), z: z0 + rnd() * (z1 - z0), s: s0 + rnd() * (s1 - s0) });
  };
  band(96, 190, -140, 150, q.crowdDensity > 0.6 ? 260 : 150, 5, 10); // woodland behind the far dead-ball line
  band(-120, 96, 112, 140, 70, 4, 8); // tree line beyond the courts
  band(-120, 96, -128, -118, 50, 3, 5); // hedge line by the wheat field
  band(-110, -96, -40, 60, 14, 3, 6); // trees round the pavilion
  group.add(treeMesh(trees, rnd));
  const hedgeMat = new THREE.MeshStandardMaterial({ color: '#2c4a22', roughness: 1 });
  for (const [x, z, w, d] of [
    [0, -128, 230, 3],
    [0, 112, 230, 3],
  ]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), hedgeMat);
    h.position.set(x, 1.2, z);
    group.add(h);
  }

  // ---------- people: parents along the touchline and on the pavilion terrace, subs by the posts
  const offsets: number[] = [];
  const colors: number[] = [];
  const params: number[] = [];
  const palette = crowdColors.map((c) => new THREE.Color(c));
  const neutrals = ['#2b3346', '#4a5366', '#6b7280', '#1f2937', '#8a8f9c', '#3d5a80', '#7a5c3e', '#ffffff'].map((c) => new THREE.Color(c));
  const person = (x: number, z: number, team = 0.35) => {
    offsets.push(x, 0, z);
    const c = (rnd() < team ? palette[Math.floor(rnd() * palette.length)] : neutrals[Math.floor(rnd() * neutrals.length)]).clone();
    c.multiplyScalar(0.8 + rnd() * 0.3);
    colors.push(c.r, c.g, c.b);
    params.push(rnd(), rnd() < 0.5 ? 0 : 1, rnd());
  };
  const crowdN = Math.round(V.fill * 600 * Math.min(1, q.crowdDensity + 0.3));
  for (let i = 0; i < crowdN; i++) {
    const r = rnd();
    if (r < 0.55) person(-52 + rnd() * 104, 39 + rnd() * 3.5); // the near touchline, standing in a loose line
    else if (r < 0.75) person(-52 + rnd() * 104, -39 - rnd() * 1.8); // in front of the floodlights
    else if (r < 0.92) person(-74 - rnd() * 6, -6 + rnd() * 30); // on the pavilion terrace
    else person(56 + rnd() * 6, -30 + rnd() * 60); // behind the far posts
  }
  const { mesh: crowd, uniforms } = makeCrowd(offsets, colors, params);
  group.add(crowd);

  // a little warmer light: an afternoon game with the floodlights on
  key.color.set('#fff0d8');

  const right = new THREE.Vector3();
  return {
    update(time: number, excite: number, camera: THREE.Camera) {
      uniforms.uTime.value = time;
      uniforms.uExcite.value = excite * 0.6;
      camera.getWorldDirection(right);
      right.set(-right.z, 0, right.x).normalize();
      uniforms.uRight.value.copy(right);
    },
  };
}

// ---------------------------------------------------------------- pieces

function pavilion() {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: '#d8c3a5', roughness: 0.85 });
  const brick = new THREE.MeshStandardMaterial({ color: '#9a5a3c', roughness: 0.9 });
  const tile = new THREE.MeshStandardMaterial({ color: '#a8502f', roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1c2a36', roughness: 0.2, metalness: 0.4 });
  const cream = new THREE.MeshStandardMaterial({ color: '#efe7da', roughness: 0.7 });
  // two storeys, 30m x 16m
  const base = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2, 16), brick);
  base.position.y = 0.6;
  const body = new THREE.Mesh(new THREE.BoxGeometry(30, 6.4, 16), wall);
  body.position.y = 4.4;
  g.add(base, body);
  // window bands front and back
  for (const z of [8.05, -8.05]) {
    for (const y of [2.6, 5.6]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(26, 1.4, 0.1), glass);
      w.position.set(0, y, z);
      g.add(w);
    }
  }
  // hipped roof: a four-sided "pyramid" stretched along the building
  const roofGeo = new THREE.ConeGeometry(1, 1, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  const roof = new THREE.Mesh(roofGeo, tile);
  roof.scale.set(23, 5, 12.5);
  roof.position.y = 7.6 + 2.5;
  roof.castShadow = true;
  g.add(roof);
  // three gables over the pitch-side front
  for (const x of [-8, 0, 8]) {
    const gable = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), tile);
    gable.geometry.rotateY(Math.PI / 4);
    gable.scale.set(3.4, 3.6, 3.4);
    gable.position.set(x, 9.4, 6.8);
    g.add(gable);
  }
  // the curved terrace with its white railing, looking onto the pitch
  const terrace = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 1.1, 40, 1, false, -Math.PI / 2, Math.PI), cream);
  terrace.scale.set(1, 1, 0.55);
  terrace.position.set(0, 0.55, 8);
  g.add(terrace);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(19, 0.06, 4, 40, Math.PI), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
  rail.rotation.x = Math.PI / 2;
  rail.rotation.z = Math.PI;
  rail.scale.set(1, 0.55, 1);
  rail.position.set(0, 2.1, 8);
  g.add(rail);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/** A synthetic pitch: coloured carpet, a red surround and (for the 3G) rugby lines and posts. */
function artificialPitch(w: number, d: number, carpet: string, surround: string, rugby: boolean) {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * (d + 8)) / (w + 8));
  const x = c.getContext('2d')!;
  x.fillStyle = surround;
  x.fillRect(0, 0, c.width, c.height);
  const sx = c.width / (w + 8);
  const sz = c.height / (d + 8);
  x.fillStyle = carpet;
  x.fillRect(4 * sx, 4 * sz, w * sx, d * sz);
  // faint mowing-style bands in the carpet
  for (let i = 0; i < 12; i++) {
    x.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)';
    x.fillRect((4 + (i * w) / 12) * sx, 4 * sz, (w / 12) * sx, d * sz);
  }
  x.strokeStyle = 'rgba(255,255,255,0.85)';
  x.lineWidth = 3;
  const line = (a: number) => {
    x.beginPath();
    x.moveTo((4 + a) * sx, 4 * sz);
    x.lineTo((4 + a) * sx, (4 + d) * sz);
    x.stroke();
  };
  x.strokeRect(4 * sx, 4 * sz, w * sx, d * sz);
  if (rugby) {
    const inGoal = 8;
    for (const a of [inGoal, inGoal + 22, w / 2, w - inGoal - 22, w - inGoal]) line(a);
  } else {
    // hockey: centre line and the two shooting circles
    line(w / 2);
    for (const side of [0, 1]) {
      x.beginPath();
      x.arc((4 + side * w) * sx, (4 + d / 2) * sz, 15 * sx, side ? Math.PI / 2 : -Math.PI / 2, side ? (3 * Math.PI) / 2 : Math.PI / 2);
      x.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w + 8, d + 8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  g.add(m);
  // perimeter fence
  const fence = new THREE.MeshStandardMaterial({ color: '#2c3138', roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.55 });
  for (const [px, pz, fw, fd] of [
    [0, -(d / 2 + 4), w + 8, 0.08],
    [0, d / 2 + 4, w + 8, 0.08],
    [-(w / 2 + 4), 0, 0.08, d + 8],
    [w / 2 + 4, 0, 0.08, d + 8],
  ]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(fw, 2.2, fd), fence);
    f.position.set(px, 1.1, pz);
    g.add(f);
  }
  if (rugby) {
    const post = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.4 });
    for (const end of [-1, 1]) {
      for (const pz of [-2.8, 2.8]) {
        const u = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 11, 6), post);
        u.position.set(end * (w / 2 - 8), 5.5, pz);
        g.add(u);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5.6, 6), post);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(end * (w / 2 - 8), 3, 0);
      g.add(bar);
    }
  }
  return g;
}

/** Netball / tennis courts: grey-blue courts split by red strips. */
function courtsBlock(w: number, d: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * d) / w);
  const x = c.getContext('2d')!;
  x.fillStyle = '#c94a2c';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#6f7d8a';
  const cols = 3;
  const rows = 2;
  const gap = 10;
  const cw = (c.width - gap * (cols + 1)) / cols;
  const ch = (c.height - gap * (rows + 1)) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) x.fillRect(gap + i * (cw + gap), gap + j * (ch + gap), cw, ch);
  x.strokeStyle = 'rgba(255,255,255,0.7)';
  x.lineWidth = 2;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const ox = gap + i * (cw + gap);
      const oy = gap + j * (ch + gap);
      x.strokeRect(ox + 6, oy + 6, cw - 12, ch - 12);
      x.beginPath();
      x.moveTo(ox + cw / 2, oy + 6);
      x.lineTo(ox + cw / 2, oy + ch - 6);
      x.stroke();
    }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

function flat(x: number, z: number, w: number, d: number, color: string, y: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

/** Instanced trees: a trunk-less canopy of lumpy spheres in several greens. */
function treeMesh(trees: { x: number; z: number; s: number }[], rnd: () => number) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, trees.length);
  const m = new THREE.Matrix4();
  const greens = ['#24421d', '#2d5224', '#1f3a1a', '#36602a', '#294a20'].map((c) => new THREE.Color(c));
  trees.forEach((t, i) => {
    const sy = t.s * (0.9 + rnd() * 0.4);
    m.compose(new THREE.Vector3(t.x, sy * 0.9, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(t.s, sy, t.s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, greens[Math.floor(rnd() * greens.length)].clone().multiplyScalar(0.85 + rnd() * 0.3));
  });
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/** Mown-grass checkerboard, as on the aerial photos. */
function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const a = '#4f8a3a';
  const b = '#5b9a43';
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      x.fillStyle = (i + j) % 2 ? a : b;
      x.fillRect(i * 32, j * 32, 32, 32);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Small fixed-seed RNG so the ground looks the same every match. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
