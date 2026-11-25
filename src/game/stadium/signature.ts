import * as THREE from 'three';
import { at } from './path';
import { tierBack, tierTop, type StandsResult } from './stands';
import { rng, seedOf } from './surroundings';
import type { StadiumContext, StadiumSpec } from './types';

/**
 * Each ground's signature feature - all original designs, only inspired by the real places: a
 * steel arch, corner masts, a bronze line-out sculpture, an old stone church tower by the river, a
 * communications needle, a covered "shed" terrace, a brick gatehouse, a volcano cone, a craggy
 * hill, umbrella pines, a hotel block behind a big main stand, an old scoreboard tower.
 * Plus the big screens, which show the live score.
 */
export function buildSignature(group: THREE.Group, spec: StadiumSpec, ctx: StadiumContext, stands: StandsResult, radius: number) {
  const kind = spec.signature.kind;
  const r = rng(seedOf(spec.id + 'sig'));
  const low = ctx.quality.level === 'low';
  const white = new THREE.MeshStandardMaterial({ color: '#f2f4f7', roughness: 0.35, metalness: 0.6 });
  const stone = new THREE.MeshStandardMaterial({ color: '#c9bb98', roughness: 0.95 });
  const brick = new THREE.MeshStandardMaterial({ color: '#8f4a34', roughness: 0.95 });
  const run = (side: string) => stands.runs.find((rn) => rn.path.pts.some((p) => p.side === side && rn.tiersAt(p) > 0));
  const back = (side: 'main' | 'opp' | 'endL' | 'endR') => {
    const rn = run(side);
    const f = stands.front[side];
    return Math.abs(f) + (rn ? rn.backD : 0);
  };
  const top = Math.max(...stands.runs.map((rn) => rn.topY), 10);

  switch (kind) {
    case 'arch': {
      // a white steel arch springing from the ground at each end of the main stand
      const span = 160;
      const h = top + 32;
      const z = -back('main') + 4;
      const curve = new THREE.CatmullRomCurve3(
        Array.from({ length: 13 }, (_, i) => {
          const t = i / 12;
          return new THREE.Vector3(-span / 2 + span * t, Math.sin(Math.PI * t) * h, z);
        }),
      );
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 1.3, 10, false), white));
      // hanger cables down to the roof
      const cable = new THREE.LineBasicMaterial({ color: '#d9dde3' });
      for (let i = 2; i < 11; i++) {
        const t = i / 12;
        const x = -span / 2 + span * t;
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, Math.sin(Math.PI * t) * h, z), new THREE.Vector3(x * 0.85, top + 6, z + 10)]);
        group.add(new THREE.Line(g, cable));
      }
      break;
    }
    case 'masts': {
      // four white masts at the corners, with stays to the roof
      const h = top + 48;
      const cable = new THREE.LineBasicMaterial({ color: '#cfd5dd' });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const x = sx * (back('endR') + 6);
          const z = sz * (back('opp') + 6);
          const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, h, 10), white);
          m.position.set(x, h / 2, z);
          m.rotation.z = sx * 0.07;
          m.rotation.x = -sz * 0.07;
          group.add(m);
          for (const k of [0.5, 0.8]) {
            const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, h - 2, z), new THREE.Vector3(x * k, top + 8, z * k)]);
            group.add(new THREE.Line(g, cable));
          }
        }
      break;
    }
    case 'sculpture': {
      // giant bronze line-out: two lifters hoisting a jumper, on a stone plinth outside the end
      const bronze = new THREE.MeshStandardMaterial({ color: '#6e4a2a', roughness: 0.4, metalness: 0.85 });
      const g = new THREE.Group();
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 6), stone);
      plinth.position.y = 1;
      g.add(plinth);
      for (const sx of [-1.6, 1.6]) {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 7, 8), bronze);
        body.position.set(sx, 5.5, 0);
        body.rotation.z = -sx * 0.12;
        g.add(body);
      }
      const jumper = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 7.5, 8), bronze);
      jumper.position.set(0, 12, 0);
      g.add(jumper);
      for (const sx of [-0.6, 0.6]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 4.2, 6), bronze);
        arm.position.set(sx, 17.6, 0);
        arm.rotation.z = -sx * 0.25;
        g.add(arm);
      }
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), bronze);
      ball.scale.set(1, 1.5, 1);
      ball.position.set(0, 20.2, 0);
      g.add(ball);
      g.position.set(-back('endL') - 26, 0, 6);
      group.add(g);
      break;
    }
    case 'river': {
      // an old stone church tower with a spire over the town across the river
      const g = new THREE.Group();
      const tower = new THREE.Mesh(new THREE.BoxGeometry(9, 34, 9), stone);
      tower.position.y = 17;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(6, 16, 4), new THREE.MeshStandardMaterial({ color: '#7d8691', roughness: 0.7 }));
      spire.position.y = 42;
      spire.rotation.y = Math.PI / 4;
      const nave = new THREE.Mesh(new THREE.BoxGeometry(14, 16, 40), stone);
      nave.position.set(0, 8, -22);
      g.add(tower, spire, nave);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const pin = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 4), stone);
          pin.position.set(sx * 4, 36, sz * 4);
          g.add(pin);
        }
      g.position.set(40, 0, back('opp') + 75);
      group.add(g);
      break;
    }
    case 'commsTower': {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 4, 200, 10), new THREE.MeshStandardMaterial({ color: '#cfd3d8', roughness: 0.6 }));
      shaft.position.y = 100;
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(9, 7, 12, 14), new THREE.MeshStandardMaterial({ color: '#8d969f', roughness: 0.4, metalness: 0.5 }));
      pod.position.y = 170;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 50, 6), white);
      mast.position.y = 225;
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.5, 0.4) }));
      beacon.position.y = 251;
      g.add(shaft, pod, mast, beacon);
      g.position.set(-260, 0, -380);
      group.add(g);
      break;
    }
    case 'shed': {
      // the covered terrace: a long low pitched roof on pillars over the opposite stand
      const rn = run('opp');
      if (!rn) break;
      const t = rn.tiers[0];
      const f = Math.abs(stands.front.opp);
      const depth = tierBack(t) + 2;
      const h = tierTop(t) + 3.5;
      const len = 120;
      const shape = new THREE.Shape([new THREE.Vector2(-1, h - 1), new THREE.Vector2(depth / 2, h + 4.5), new THREE.Vector2(depth + 1, h - 0.5)]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
      geo.rotateY(Math.PI / 2);
      const roof = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#7d8590', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }));
      roof.position.set(-len / 2, 0, f);
      group.add(roof);
      break;
    }
    case 'gatehouse': {
      // red-brick gatehouse with arched entrances behind the end stand
      const g = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 9, 34), brick);
      wall.position.y = 4.5;
      g.add(wall);
      for (const z of [-10, 0, 10]) {
        const arch = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4.4, 14, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 1 }));
        arch.rotation.z = Math.PI / 2;
        arch.rotation.y = Math.PI / 2;
        arch.position.set(0, 4, z);
        g.add(arch);
      }
      for (const z of [-17, 17]) {
        const turret = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 13, 10), brick);
        turret.position.set(0, 6.5, z);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(2.9, 4, 10), new THREE.MeshStandardMaterial({ color: '#3e4a52', roughness: 0.6 }));
        cap.position.set(0, 15, z);
        g.add(turret, cap);
      }
      g.position.set(back('endR') + 10, 0, 0);
      group.add(g);
      break;
    }
    case 'volcano':
    case 'hill': {
      // a grassy cone (crater on top for the volcano) rising behind the right-hand end
      const big = kind === 'volcano';
      const h = big ? 110 : 70;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(big ? 210 : 160, h, 12, 3, true), new THREE.MeshStandardMaterial({ color: big ? '#4d7a3a' : '#5b7a3e', roughness: 1, flatShading: true }));
      cone.position.set(back('endR') + (big ? 240 : 220), h / 2 - 4, big ? 40 : -60);
      if (!big) {
        // crags: a few grey rock faces near the top
        const rock = new THREE.MeshStandardMaterial({ color: '#6c6a66', roughness: 1, flatShading: true });
        for (let i = 0; i < 5; i++) {
          const k = new THREE.Mesh(new THREE.DodecahedronGeometry(14 + r() * 12, 0), rock);
          k.position.set(cone.position.x - 40 + r() * 40, h * 0.55 + r() * 10, cone.position.z - 40 + r() * 60);
          group.add(k);
        }
      }
      group.add(cone);
      break;
    }
    case 'pines': {
      // umbrella pines: tall bare trunks with flat dark canopies
      const n = low ? 20 : 46;
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.6, 1, 6), new THREE.MeshStandardMaterial({ color: '#6a5236', roughness: 1 }), n);
      const tops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color: '#2b4a25', roughness: 1, flatShading: true }), n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = radius + 25 + r() * 90;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d * 0.8;
        const h = 14 + r() * 6;
        m.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
        trunks.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(x, h, z), new THREE.Quaternion(), new THREE.Vector3(8, 2.4, 8));
        tops.setMatrixAt(i, m);
      }
      group.add(trunks, tops);
      break;
    }
    case 'bigMainStand': {
      // a glass hotel / conference block rising behind the main stand
      const rn = run('main');
      if (!rn) break;
      const block = new THREE.Mesh(new THREE.BoxGeometry(70, rn.topY + 14, 14), new THREE.MeshStandardMaterial({ color: '#8fa7bd', roughness: 0.15, metalness: 0.7 }));
      block.position.set(0, (rn.topY + 14) / 2, -back('main') - 7.5);
      group.add(block);
      break;
    }
    case 'scoreboard': {
      // an old-style scoreboard tower in a corner
      const g = new THREE.Group();
      const legs = new THREE.MeshStandardMaterial({ color: '#4e555f', roughness: 0.7, metalness: 0.4 });
      for (const sx of [-4, 4]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.8, 18, 0.8), legs);
        l.position.set(sx, 9, 0);
        g.add(l);
      }
      const board = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 1), new THREE.MeshStandardMaterial({ color: '#1d2b1f', roughness: 0.8 }));
      board.position.y = 20;
      g.add(board);
      g.position.set(back('endR') - 2, 0, back('opp') - 2);
      g.lookAt(0, 0, 0);
      group.add(g);
      break;
    }
    case 'timberRoof': {
      // planting along the rim of every level
      const green = new THREE.MeshStandardMaterial({ color: '#3f6e2e', roughness: 1, flatShading: true });
      for (const rn of stands.runs) {
        const pos: THREE.Matrix4[] = [];
        for (let i = 0; i < rn.path.pts.length; i += low ? 4 : 2) {
          const p = rn.path.pts[i];
          if (!rn.tiersAt(p)) continue;
          const [x, z] = at(p, rn.backD + 1);
          pos.push(new THREE.Matrix4().compose(new THREE.Vector3(x, rn.topY + 1.6, z), new THREE.Quaternion(), new THREE.Vector3(2.2, 1.2, 2.2)));
        }
        const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), green, pos.length);
        pos.forEach((m, i) => im.setMatrixAt(i, m));
        group.add(im);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Big screens (ends, corners or hung from the roof) that show the score. Returns a function to
 * redraw them when the score changes.
 */
export function buildScreens(group: THREE.Group, spec: StadiumSpec, stands: StandsResult) {
  if (!spec.screens.count) return () => {};
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (text: string) => {
    g.fillStyle = '#05070c';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#c6ff1a';
    g.fillRect(0, 0, 512, 10);
    g.font = '900 34px Arial Black, Arial, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.fillText(spec.name.toUpperCase(), 256, 60);
    g.font = '900 92px Arial Black, Arial, sans-serif';
    g.fillStyle = '#c6ff1a';
    g.fillText(text, 256, 170);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 256; y += 3) g.fillRect(0, y, 512, 1);
    tex.needsUpdate = true;
  };
  draw('0 - 0');
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  mat.color.setScalar(1.25);
  const frame = new THREE.MeshStandardMaterial({ color: '#1b1f26', roughness: 0.6, metalness: 0.5 });
  const top = Math.max(...stands.runs.map((r) => r.topY), 10);
  const spots: [number, number, number][] = [];
  const ex = Math.abs(stands.front.endR) + 4;
  const ez = Math.abs(stands.front.opp) + 4;
  if (spec.screens.at === 'corners') {
    spots.push([ex, top + 4, ez], [-ex, top + 4, -ez]);
  } else {
    const endBack = Math.max(...stands.runs.filter((r) => r.path.pts.some((p) => p.side === 'endL' || p.side === 'endR')).map((r) => r.backD), 6);
    spots.push([-(Math.abs(stands.front.endL) + endBack * 0.6), top + 6, 0], [Math.abs(stands.front.endR) + endBack * 0.6, top + 6, 0]);
  }
  spots.slice(0, spec.screens.count).forEach(([x, y, z]) => {
    const s = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(17, 9, 1), frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), mat);
    face.position.z = 0.52;
    s.add(box, face);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(1, y, 1), frame);
    legs.position.y = -y / 2;
    s.add(legs);
    s.position.set(x, y, z);
    s.lookAt(0, y, 0);
    group.add(s);
  });
  return draw;
}
