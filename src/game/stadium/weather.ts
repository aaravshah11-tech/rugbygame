import * as THREE from 'three';
import type { QualityPreset } from '../view/quality';

/**
 * Light snow (visual only): soft flakes drifting down in a box that follows the camera, like the
 * engine's rain but slow and swirling.
 */
export function buildSnow(group: THREE.Group, q: QualityPreset) {
  const N = q.level === 'low' ? 700 : q.level === 'medium' ? 1400 : 2400;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos.set([(Math.random() - 0.5) * 80, Math.random() * 30, (Math.random() - 0.5) * 80], i * 3);
    seed[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const u = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uScale: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aSeed; uniform float uTime; uniform vec3 uCenter; uniform float uScale;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - uTime * (1.1 + fract(aSeed) * 0.6), 30.0);
        p.x += sin(uTime * 0.7 + aSeed) * 1.2;
        p.z += cos(uTime * 0.5 + aSeed * 1.3) * 1.2;
        // wrap the box round the camera
        vec3 w = vec3(uCenter.x + mod(p.x - uCenter.x + 40.0, 80.0) - 40.0, p.y, uCenter.z + mod(p.z - uCenter.z + 40.0, 80.0) - 40.0);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        gl_PointSize = uScale * 26.0 / max(-mv.z, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = clamp(smoothstep(0.5, 0.15, r), 0.0, 1.0) * 0.85;
        gl_FragColor = vec4(vec3(1.0), a);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  group.add(pts);
  return {
    update(time: number, camera: THREE.Camera) {
      u.uTime.value = time;
      u.uCenter.value.copy(camera.position);
      u.uScale.value = Math.min(window.devicePixelRatio || 1, 2);
    },
  };
}
