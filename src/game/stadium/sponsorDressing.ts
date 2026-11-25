import * as THREE from 'three';
import type { MatchSponsors } from '../../sponsors/manager';
import { backdropTexture, panelTexture, pitchLogoTexture } from '../../sponsors/textures';
import type { StandsResult } from './stands';
import type { StadiumContext } from './types';

/**
 * Sponsor dressing around the pitch: painted logos on the grass between the 22s and the 10 m
 * lines, a branded panel over the tunnel, dugout backs, photographers' boards behind each dead-ball
 * line and the step-and-repeat interview backdrop by the tunnel.
 */
export function buildSponsorDressing(group: THREE.Group, sp: MatchSponsors, ctx: StadiumContext, stands: StandsResult | null) {
  const low = ctx.quality.level === 'low';

  // ---------------------------------------------------------------- painted pitch logos
  // two per half, between the 10 m and 22 m lines; the grass shows through the paint
  const wet = ctx.weather === 'rain' ? 1 : 0;
  for (const [i, s] of sp.pitch.entries()) {
    const map = pitchLogoTexture(s);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uWet: { value: wet } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uWet; varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec4 t = texture2D(uMap, vUv);
          // paint soaked into grass blades: break the edge up and let the green through
          float grain = h(floor(vW.xz * 28.0));
          float stripe = 0.5 + 0.5 * sin(vW.x * 0.62832 * 2.0);
          float a = t.a * (0.62 + 0.18 * grain - 0.06 * stripe) * (1.0 - uWet * 0.15);
          if (a < 0.02) discard;
          gl_FragColor = vec4(t.rgb * (0.82 + 0.12 * grain), a);
          #include <colorspace_fragment>
        }`,
    });
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 4.75), mat);
      m.rotation.x = -Math.PI / 2;
      // reads from the broadcast camera behind the -x end: text "up" along +x
      m.rotation.z = -Math.PI / 2;
      m.position.set(side * 16, 0.02, (i === 0 ? -1 : 1) * 15);
      m.renderOrder = 2;
      group.add(m);
    }
  }

  if (!stands) return;
  const mainZ = stands.front.main; // negative: the main stand front line
  const frontMat = (t: THREE.Texture) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.1, 1.1, 1.1) });

  // ---------------------------------------------------------------- tunnel panel and dugouts
  const tunnel = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), frontMat(panelTexture(sp.title, 512, 128)));
  tunnel.position.set(0, 3.95, mainZ - 0.25 + 0.01);
  group.add(tunnel);
  const dug = panelTexture(sp.featured[1] ?? sp.title, 512, 128);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), frontMat(dug));
    m.position.set(sx * 13, 1.5, mainZ + 3.2 - 1.09);
    group.add(m);
  }

  // ---------------------------------------------------------------- photographers' boards
  if (!low) {
    const geo = new THREE.BoxGeometry(2.4, 0.55, 0.06);
    const list = sp.featured.slice(0, 4);
    for (const sx of [-1, 1])
      for (let k = 0; k < 4; k++) {
        const s = list[k % list.length];
        const m = new THREE.Mesh(geo, frontMat(panelTexture(s, 256, 64)));
        m.position.set(sx * 62.6, 0.3, -20 + k * 13.3);
        m.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        group.add(m);
      }
  }

  // ---------------------------------------------------------------- interview backdrop by the tunnel
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardMaterial({ map: backdropTexture([sp.title, ...sp.featured.slice(1, 4)]), roughness: 0.6 }));
  back.position.set(9, 1.5, mainZ + 1.2);
  group.add(back);
  const legs = new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 0.6, roughness: 0.4 });
  for (const sx of [-3, 3]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3, 0.06), legs);
    l.position.set(9 + sx, 1.5, mainZ + 1.15);
    group.add(l);
  }
}
