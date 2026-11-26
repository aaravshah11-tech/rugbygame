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

  /*
   * Layout from the aerial photo of Failand (about 0.3 m per pixel). The 1st team pitch runs
   * north-south; in game coordinates +x is north, +z is east, and the broadcast camera is on the
   * east touchline looking west, so the pavilion sits behind the far touchline.
   */
  // ---------- the pavilion: on the west touchline, halfway along, facing the pitch
  const pav = pavilion();
  pav.position.set(-4, 0, -60);
  pav.rotation.y = 0; // its front (+z) faces the pitch
  group.add(pav);
  // car park: north-west of the pavilion and round its back, with a minibus by the door
  const tarmac = '#55595f';
  group.add(flat(14, -92, 96, 44, tarmac, 0.01));
  group.add(flat(-28, -74, 26, 30, tarmac, 0.012));
  const bayMat = new THREE.MeshBasicMaterial({ color: '#d8d8d2' });
  const bays = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 4.6), bayMat, 44);
  const m4 = new THREE.Matrix4();
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  for (let i = 0; i < 44; i++) {
    const row = i < 22 ? 0 : 1;
    m4.compose(new THREE.Vector3(-30 + (i % 22) * 2.6 + 30, 0.02, row ? -104 : -80), qx, new THREE.Vector3(1, 1, 1));
    bays.setMatrixAt(i, m4);
  }
  group.add(bays);
  const carCols = ['#1d2330', '#c9ccd2', '#8a1c1c', '#2b4a7a', '#f0f0ee', '#3a3d42', '#6b7a8a', '#14161a'];
  const carN = q.crowdDensity > 0.6 ? 28 : 16;
  const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.4, 4.3), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.5 }), carN);
  const col = new THREE.Color();
  for (let i = 0; i < carN; i++) {
    const row = rnd() < 0.5 ? -80 : -104;
    m4.compose(new THREE.Vector3(1.3 + Math.floor(rnd() * 21) * 2.6, 0.7, row + (row < -90 ? -2.4 : 2.4)), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    cars.setMatrixAt(i, m4);
    cars.setColorAt(i, col.set(carCols[Math.floor(rnd() * carCols.length)]));
  }
  cars.castShadow = q.shadows;
  group.add(cars);
  const bus = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.8, 7.5), new THREE.MeshStandardMaterial({ color: '#f2f2ef', roughness: 0.5 }));
  bus.position.set(-24, 1.4, -78);
  group.add(bus);

  // ---------- the lane to the west, with trees both sides, and the sports hall beyond it
  group.add(flat(0, -132, 600, 6, '#4a4d52', 0.012));
  const hall = new THREE.Mesh(new THREE.BoxGeometry(62, 10, 26), new THREE.MeshStandardMaterial({ color: '#e2e5e9', roughness: 0.7 }));
  hall.position.set(165, 5, -160);
  group.add(hall);
  // football pitches over the lane (lined grass)
  for (const [fx, fz] of [[110, -230], [20, -230], [-70, -230]]) {
    const fp = flat(fx, fz, 80, 52, '#3f8a3a', 0.005);
    group.add(fp);
    const lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(72, 46)),
      new THREE.LineBasicMaterial({ color: '#e8efe6', transparent: true, opacity: 0.6 }),
    );
    lines.rotation.x = -Math.PI / 2;
    lines.position.set(fx, 0.03, fz);
    group.add(lines);
  }

  // ---------- 3G (floodlit) to the south-west, long side east-west
  const g3 = artificialPitch(120, 72, '#2f6a3a', '#9b2b22', true);
  g3.rotation.y = Math.PI / 2;
  g3.position.set(-114, 0.01, -42);
  group.add(g3);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.4, metalness: 0.7 });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.2, 3) });
  for (const [px, pz, face] of [[-75, -95, -1], [-75, -42, -1], [-75, 11, -1], [-153, -95, 1], [-153, -42, 1], [-153, 11, 1]] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 16, 8), poleMat);
    pole.position.set(px, 8, pz);
    pole.castShadow = q.shadows;
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 2.2), lampMat);
    head.position.set(px + face * 0.4, 16.2, pz);
    group.add(head);
  }
  // the blue covered seats by the 3G
  const blue = new THREE.MeshStandardMaterial({ color: '#2b4fa8', roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const shelter = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 6), blue);
    shelter.position.set(-56 - i * 7, 1.2, -116);
    group.add(shelter);
  }

  // ---------- hockey astro and netball courts to the north
  const astro = artificialPitch(104, 64, '#4fa84f', '#c4532d', false);
  astro.rotation.y = Math.PI / 2;
  astro.position.set(134, 0.01, 14);
  group.add(astro);
  const courts = courtsBlock(72, 60);
  courts.rotation.z = Math.PI / 2; // in-plane: the mesh is already laid flat
  courts.position.set(128, 0.01, 108);
  group.add(courts);
  // the clubhouse beyond the courts
  const house = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 16), new THREE.MeshStandardMaterial({ color: '#d8cdb8', roughness: 0.8 }));
  house.position.set(190, 3, 2);
  group.add(house);
  const hroof = new THREE.Mesh(new THREE.ConeGeometry(10, 4, 4), new THREE.MeshStandardMaterial({ color: '#8c4a32', roughness: 0.8 }));
  hroof.rotation.y = Math.PI / 4;
  hroof.scale.set(0.75, 1, 1.15);
  hroof.position.set(190, 8, 2);
  group.add(hroof);

  // ---------- the big mown field to the east with cricket squares, path along the south
  const sq = '#cdbf8e';
  for (const [cx, cz, n] of [[2, 58, 2], [56, 66, 2], [-28, 158, 1], [-110, 142, 2], [70, -14, 2], [-126, 50, 1]] as const) {
    for (let i = 0; i < n; i++) group.add(flat(cx, cz + i * 3.6, 20, 3, sq, 0.008));
  }
  group.add(flat(-160, 60, 4, 330, '#b9b2a2', 0.009)); // the path along the bottom edge

  // ---------- edges: the tree belt to the east, the lane's trees, hedges to the south
  const trees: { x: number; z: number; s: number }[] = [];
  const band = (x0: number, x1: number, z0: number, z1: number, n: number, s0 = 4, s1 = 8) => {
    for (let i = 0; i < n; i++) trees.push({ x: x0 + rnd() * (x1 - x0), z: z0 + rnd() * (z1 - z0), s: s0 + rnd() * (s1 - s0) });
  };
  band(-170, 230, 178, 260, q.crowdDensity > 0.6 ? 300 : 170, 6, 11); // the tree belt along the east side
  band(-160, 230, -142, -122, q.crowdDensity > 0.6 ? 90 : 50, 4, 8); // trees along the lane
  band(172, 230, 40, 175, 40, 5, 9); // beyond the courts
  band(-40, 40, -78, -68, 8, 3, 5); // round the pavilion
  band(-175, -165, -100, 200, 50, 3, 5); // hedgerow along the path
  group.add(treeMesh(trees, rnd));
  const hedgeMat = new THREE.MeshStandardMaterial({ color: '#2c4a22', roughness: 1 });
  for (const [x, z, w, d] of [
    [-168, 60, 3, 330],
    [80, -122, 300, 2.5],
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
    if (r < 0.45) person(-50 + rnd() * 100, -39 - rnd() * 3.5); // in front of the pavilion, the far touchline
    else if (r < 0.62) person(-14 + rnd() * 22, -46 - rnd() * 4); // on the pavilion terrace
    else if (r < 0.9) person(-50 + rnd() * 100, 39 + rnd() * 2.5); // the near (east) touchline
    else person((rnd() < 0.5 ? -1 : 1) * (56 + rnd() * 5), -30 + rnd() * 60); // behind the posts
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
  // BGS pavilion (from the photos): red-brick two-storey clubhouse, dark red tiled hipped roof
  // with three cross-gables facing the pitch, chimneys, and a raised curved terrace with a
  // white railing wrapped round the pitch side. Front (+z) faces the pitch.
  const g = new THREE.Group();
  const brick = new THREE.MeshStandardMaterial({ color: '#a4533a', roughness: 0.92 });
  const brickDark = new THREE.MeshStandardMaterial({ color: '#7e3c29', roughness: 0.95 });
  const tile = new THREE.MeshStandardMaterial({ color: '#6e2a20', roughness: 0.8, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: '#22303c', roughness: 0.15, metalness: 0.5 });
  const frame = new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.6 });
  const stone = new THREE.MeshStandardMaterial({ color: '#d9d2c3', roughness: 0.9 });
  const W = 26; // length along the pitch
  const D = 13; // depth
  const H = 6.8; // eaves height
  // plinth and walls
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.6, D + 0.4), brickDark);
  plinth.position.y = 0.3;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), brick);
  body.position.y = H / 2;
  g.add(plinth, body);
  // string course between the floors
  const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.15, 0.25, D + 0.15), stone);
  band.position.y = 3.4;
  g.add(band);
  // windows: tall glazing to the terrace on the ground floor, smaller ones upstairs, all four sides
  const win = (w: number, h: number, x: number, y: number, z: number, ry = 0) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, h + 0.25, 0.12), frame);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), glass);
    for (const m of [f, gl]) {
      m.position.set(x, y, z);
      m.rotation.y = ry;
      g.add(m);
    }
  };
  for (let i = 0; i < 6; i++) {
    const x = -W / 2 + 2.6 + i * ((W - 5.2) / 5);
    win(2.4, 2.4, x, 1.75, D / 2 + 0.02); // ground floor onto the terrace
    win(1.4, 1.5, x, 5.1, D / 2 + 0.02);
    win(1.3, 1.4, x, 1.9, -D / 2 - 0.02);
    win(1.3, 1.4, x, 5.1, -D / 2 - 0.02);
  }
  for (const sx of [-1, 1]) for (const z of [-3, 3]) {
    win(1.3, 1.4, sx * (W / 2 + 0.02), 1.9, z, Math.PI / 2);
    win(1.3, 1.4, sx * (W / 2 + 0.02), 5.1, z, Math.PI / 2);
  }
  // hipped roof with a ridge: a box-ish prism built from vertices, eaves overhanging
  const ov = 0.7;
  const rw = W / 2 + ov;
  const rd = D / 2 + ov;
  const rh = 4.6;
  const ridge = rw - rd; // hip ends slope at the same pitch as the sides
  const roofGeo = new THREE.BufferGeometry();
  const v = [
    -rw, 0, -rd, rw, 0, -rd, rw, 0, rd, -rw, 0, rd, // eaves corners 0-3
    -ridge, rh, 0, ridge, rh, 0, // ridge ends 4-5
  ];
  const idx = [0, 4, 5, 0, 5, 1, 2, 5, 4, 2, 4, 3, 3, 4, 0, 1, 5, 2];
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  roofGeo.setIndex(idx);
  roofGeo.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeo, tile);
  roof.position.y = H;
  g.add(roof);
  // three cross-gables on the pitch side: a pitched roof running forward with a brick triangle face
  const gableRoof = (x: number, w: number, depth: number, h: number) => {
    const hw = w / 2 + 0.35;
    const geo = new THREE.BufferGeometry();
    const z0 = 0;
    const z1 = depth;
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-hw, 0, z0, 0, h, z0, hw, 0, z0, -hw, 0, z1, 0, h, z1, hw, 0, z1], 3));
    geo.setIndex([0, 1, 4, 0, 4, 3, 2, 5, 4, 2, 4, 1]);
    geo.computeVertexNormals();
    const r = new THREE.Mesh(geo, tile);
    r.position.set(x, H, D / 2 - depth + 1.4);
    g.add(r);
    // brick gable end (triangle) just behind the roof edge
    const tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h - 0.15)]);
    const face = new THREE.Mesh(new THREE.ShapeGeometry(tri), brick);
    face.position.set(x, H, D / 2 + 1.35);
    g.add(face);
    // a wall box under it so the gable projects
    const bay = new THREE.Mesh(new THREE.BoxGeometry(w, H, 1.4), brick);
    bay.position.set(x, H / 2, D / 2 + 0.7);
    g.add(bay);
    win(w * 0.55, 1.6, x, 5.1, D / 2 + 1.42);
    win(w * 0.7, 2.4, x, 1.75, D / 2 + 1.42);
  };
  gableRoof(-8, 5.4, 6, 3.6);
  gableRoof(0, 6.2, 7, 4.2);
  gableRoof(8, 5.4, 6, 3.6);
  // chimneys
  for (const [cx, cz] of [[-6, -2.5], [6.5, -2.5]]) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), brickDark);
    ch.position.set(cx, H + 3.2, cz);
    g.add(ch);
  }
  // raised curved terrace round the pitch side with a white railing and steps down
  const tz = D / 2;
  const R = 17;
  const terrace = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.2, 48, 1, false, -Math.PI / 2, Math.PI), stone);
  terrace.scale.set(1, 1, 0.5);
  terrace.position.set(0, 0.6, tz);
  g.add(terrace);
  const wallRing = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 1.2, 48, 1, true, -Math.PI / 2, Math.PI), brickDark);
  wallRing.scale.set(1, 1, 0.5);
  wallRing.position.set(0, 0.6, tz);
  g.add(wallRing);
  const railMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
  for (const y of [1.6, 2.2]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R - 0.2, 0.05, 4, 48, Math.PI), railMat);
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = Math.PI;
    rail.scale.set(1, 0.5, 1);
    rail.position.set(0, y, tz);
    g.add(rail);
  }
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 4), railMat, 26);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (i / 25) * Math.PI;
    m4.makeTranslation(Math.sin(a) * (R - 0.2), 1.7, tz + Math.cos(a) * (R - 0.2) * 0.5);
    posts.setMatrixAt(i, m4);
  }
  g.add(posts);
  // steps down at the front centre
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 0.6), stone);
    st.position.set(0, 1 - i * 0.4, tz + R * 0.5 + 0.3 + i * 0.6);
    g.add(st);
  }
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

/** Netball courts: pale green courts split by red strips (as at Failand). */
function courtsBlock(w: number, d: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * d) / w);
  const x = c.getContext('2d')!;
  x.fillStyle = '#c94a2c';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#9fbf7c';
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
