import * as THREE from 'three';

/** Field geometry (metres). x runs along the pitch, z across it. */
export const FIELD = {
  tryX: 50,
  deadX: 60,
  halfW: 35,
  postHalfW: 2.8,
  crossbar: 3,
  postH: 14,
};

const PX = 14; // texture pixels per metre

function pitchTexture(): THREE.CanvasTexture {
  const W = 150;
  const H = 96;
  const c = document.createElement('canvas');
  c.width = W * PX;
  c.height = H * PX;
  const g = c.getContext('2d')!;
  const X = (x: number) => (x + W / 2) * PX;
  const Z = (z: number) => (z + H / 2) * PX;
  // mown stripes
  for (let i = 0; i < W / 5; i++) {
    g.fillStyle = i % 2 ? '#1f6a2c' : '#24783a';
    g.fillRect(i * 5 * PX, 0, 5 * PX + 1, H * PX);
  }
  // in-goal areas slightly darker
  g.fillStyle = 'rgba(0,0,0,0.10)';
  g.fillRect(X(-60), Z(-35), 10 * PX, 70 * PX);
  g.fillRect(X(50), Z(-35), 10 * PX, 70 * PX);
  // baked floodlight pools + vignette (our "baked lighting")
  const rg = g.createRadialGradient(X(0), Z(0), 10 * PX, X(0), Z(0), 80 * PX);
  rg.addColorStop(0, 'rgba(255,255,230,0.10)');
  rg.addColorStop(1, 'rgba(0,0,10,0.45)');
  g.fillStyle = rg;
  g.fillRect(0, 0, W * PX, H * PX);

  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 0.14 * PX;
  const line = (x1: number, z1: number, x2: number, z2: number, dash?: number[]) => {
    g.setLineDash(dash ? dash.map((d) => d * PX) : []);
    g.beginPath();
    g.moveTo(X(x1), Z(z1));
    g.lineTo(X(x2), Z(z2));
    g.stroke();
  };
  // touchlines + dead ball lines
  line(-60, -35, 60, -35);
  line(-60, 35, 60, 35);
  line(-60, -35, -60, 35);
  line(60, -35, 60, 35);
  // try lines, 22s, halfway
  for (const x of [-50, 50, -28, 28, 0]) line(x, -35, x, 35);
  // 10m lines (dashed), 5m lines (dashed)
  for (const x of [-10, 10]) line(x, -35, x, 35, [2, 1.5]);
  for (const x of [-45, 45]) line(x, -35, x, 35, [1, 4]);
  // 5m and 15m lines in from touch (dashed)
  for (const z of [-30, 30, -20, 20]) line(-50, z, 50, z, [1, 4]);
  g.setLineDash([]);
  // centre spot
  g.fillStyle = '#fff';
  g.fillRect(X(0) - 0.3 * PX, Z(0) - 0.3 * PX, 0.6 * PX, 0.6 * PX);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function boardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#05070c';
  g.fillRect(0, 0, 1024, 64);
  const words = ['TRY LINE', 'RUGBY', 'GAME ON', 'TRY LINE', 'NEON XV', 'FULL TIME'];
  g.font = 'italic 900 40px Arial Black, Arial, sans-serif';
  g.textBaseline = 'middle';
  words.forEach((w, i) => {
    g.fillStyle = i % 2 ? '#21e6c1' : '#c6ff1a';
    g.fillText(w, 10 + i * 172, 34);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export interface Stadium {
  group: THREE.Group;
  /** excitement 0..1 makes the crowd bounce harder */
  update(time: number, excitement: number): void;
  boards: THREE.Texture;
}

export function buildStadium(scene: THREE.Scene, crowdColors: string[], options: { crowdDensity?: number } = {}): Stadium {
  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color('#070b16');
  scene.fog = new THREE.Fog('#070b16', 90, 220);

  // Baked-style lighting: hemisphere + one key light, no real-time shadows.
  scene.add(new THREE.HemisphereLight('#cfe3ff', '#1a3a1a', 1.6));
  const key = new THREE.DirectionalLight('#fff6e0', 1.6);
  key.position.set(-30, 60, 40);
  scene.add(key);

  // Pitch
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(150, 96), new THREE.MeshBasicMaterial({ map: pitchTexture() }));
  pitch.rotation.x = -Math.PI / 2;
  group.add(pitch);
  // Surround
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(240, 190), new THREE.MeshBasicMaterial({ color: '#10241a' }));
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.02;
  group.add(surround);

  // Posts
  const postMat = new THREE.MeshLambertMaterial({ color: '#f4f4f4' });
  const padMat = new THREE.MeshLambertMaterial({ color: '#c6ff1a' });
  const upright = new THREE.CylinderGeometry(0.08, 0.08, FIELD.postH, 6);
  const bar = new THREE.CylinderGeometry(0.07, 0.07, FIELD.postHalfW * 2, 6);
  const pad = new THREE.CylinderGeometry(0.3, 0.3, 2, 8);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const u = new THREE.Mesh(upright, postMat);
      u.position.set(sx * FIELD.tryX, FIELD.postH / 2, sz * FIELD.postHalfW);
      group.add(u);
      const p = new THREE.Mesh(pad, padMat);
      p.position.set(sx * FIELD.tryX, 1, sz * FIELD.postHalfW);
      group.add(p);
    }
    const b = new THREE.Mesh(bar, postMat);
    b.rotation.x = Math.PI / 2;
    b.position.set(sx * FIELD.tryX, FIELD.crossbar, 0);
    group.add(b);
  }

  // Advertising boards
  const boards = boardTexture();
  const boardMat = new THREE.MeshBasicMaterial({ map: boards });
  const mkBoard = (len: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 1), boardMat);
    m.position.set(x, 0.5, z);
    m.rotation.y = ry;
    group.add(m);
  };
  mkBoard(130, 0, -41, 0);
  mkBoard(130, 0, 41, Math.PI);
  mkBoard(90, -66, 0, Math.PI / 2);
  mkBoard(90, 66, 0, -Math.PI / 2);

  // Stands: stepped tiers with baked vertex shading.
  const standMat = new THREE.MeshLambertMaterial({ color: '#1a2030' });
  const roofMat = new THREE.MeshBasicMaterial({ color: '#0c1220' });
  type StandDef = { cx: number; cz: number; len: number; ry: number };
  const stands: StandDef[] = [
    { cx: 0, cz: -48, len: 150, ry: 0 },
    { cx: 0, cz: 48, len: 150, ry: Math.PI },
    { cx: -73, cz: 0, len: 100, ry: Math.PI / 2 },
    { cx: 73, cz: 0, len: 100, ry: -Math.PI / 2 },
  ];
  const ROWS = 12;
  const density = options.crowdDensity ?? 1;
  const seatSpacing = 1.1 / density;
  let count = 0;
  for (const s of stands) count += ROWS * Math.floor(s.len / seatSpacing);

  const crowdGeo = new THREE.BoxGeometry(0.55, 0.9, 0.45);
  crowdGeo.translate(0, 0.45, 0);
  const crowdMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  crowdMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uExcite = uniforms.uExcite;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;\nuniform float uExcite;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfloat bob = max(0.0, sin(uTime * (3.0 + aPhase) + aPhase * 7.0));\ntransformed.y += bob * (0.08 + uExcite * 0.55);',
      );
  };
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, count);
  const phases = new Float32Array(count);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const palette = crowdColors.map((c) => new THREE.Color(c));
  const neutrals = ['#2a3142', '#3b4252', '#4c566a', '#6b7280', '#1f2937'].map((c) => new THREE.Color(c));
  let i = 0;
  for (const s of stands) {
    const tiers = new THREE.Group();
    tiers.position.set(s.cx, 0, s.cz);
    tiers.rotation.y = s.ry;
    group.add(tiers);
    for (let r = 0; r < ROWS; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(s.len, 1, 1.5), standMat);
      step.position.set(0, r * 1 + 0.5 + 1, -r * 1.5);
      tiers.add(step);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(s.len + 4, 0.6, 24), roofMat);
    roof.position.set(0, ROWS + 9, -ROWS * 0.75);
    tiers.add(roof);
    const back = new THREE.Mesh(new THREE.BoxGeometry(s.len, ROWS + 10, 1), standMat);
    back.position.set(0, (ROWS + 10) / 2, -ROWS * 1.5 - 0.5);
    tiers.add(back);
    tiers.updateMatrixWorld(true);
    const seats = Math.floor(s.len / seatSpacing);
    for (let r = 0; r < ROWS; r++) {
      for (let k = 0; k < seats; k++) {
        if (i >= count) break;
        const local = new THREE.Vector3(-s.len / 2 + (k + 0.5) * seatSpacing + (Math.random() - 0.5) * 0.2, r + 2, -r * 1.5);
        local.applyMatrix4(tiers.matrixWorld);
        m4.makeRotationY(s.ry);
        m4.setPosition(local);
        crowd.setMatrixAt(i, m4);
        const pickTeam = Math.random() < 0.7;
        col.copy(pickTeam ? palette[Math.floor(Math.random() * palette.length)] : neutrals[Math.floor(Math.random() * neutrals.length)]);
        col.multiplyScalar(0.55 + (r / ROWS) * 0.45); // baked shading: upper rows catch more light
        crowd.setColorAt(i, col);
        phases[i] = Math.random() * 3;
        i++;
      }
    }
  }
  crowdGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  crowd.frustumCulled = false;
  group.add(crowd);

  // Floodlight towers
  const towerMat = new THREE.MeshLambertMaterial({ color: '#2b3245' });
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fffbe8' });
  for (const [x, z] of [[-80, -55], [80, -55], [-80, 55], [80, 55]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 40, 6), towerMat);
    t.position.set(x, 20, z);
    group.add(t);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.6), lampMat);
    lamp.position.set(x * 0.97, 40, z * 0.97);
    lamp.lookAt(0, 0, 0);
    group.add(lamp);
  }

  return {
    group,
    boards,
    update(time, excitement) {
      uniforms.uTime.value = time;
      uniforms.uExcite.value = excitement;
      boards.offset.x = (time * 0.02) % 1;
    },
  };
}
