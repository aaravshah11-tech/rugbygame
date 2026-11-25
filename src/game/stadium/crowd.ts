import * as THREE from 'three';
import { fanAtlas } from './textures';

/** Camera-facing crowd billboards: one instance per spectator (offset, shirt colour, params). */
export function makeCrowd(offsets: number[], colors: number[], params: number[]) {
  const base = new THREE.PlaneGeometry(0.62, 1.1);
  base.translate(0, 0.55, 0);
  const cg = new THREE.InstancedBufferGeometry();
  cg.index = base.index;
  cg.setAttribute('position', base.attributes.position);
  cg.setAttribute('uv', base.attributes.uv);
  cg.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  cg.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
  cg.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(params), 3));
  cg.instanceCount = offsets.length / 3;
  const crowdUniforms = {
    uTime: { value: 0 },
    uExcite: { value: 0 },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uAtlas: { value: fanAtlas() },
  };
  const crowdMat = new THREE.ShaderMaterial({
    uniforms: crowdUniforms,
    vertexShader: `
      uniform float uTime; uniform float uExcite; uniform vec3 uRight;
      attribute vec3 aOffset; attribute vec3 aColor; attribute vec3 aParams;
      varying vec2 vUv; varying vec3 vColor; varying float vSkin; varying float vShade;
      void main() {
        float ph = aParams.x;
        float bob = max(0.0, sin(uTime * (2.2 + ph * 1.5) + ph * 6.2831)) * (0.03 + uExcite * 0.32);
        float up = step(0.75 - uExcite * 0.6, fract(ph * 7.31 + floor(uTime * (0.4 + uExcite)) * 0.37)) * step(0.12, uExcite);
        vec3 world = aOffset + uRight * position.x + vec3(0.0, position.y + bob, 0.0);
        vUv = vec2((uv.x + aParams.y + up * 2.0) / 4.0, uv.y);
        vColor = aColor;
        vSkin = aParams.z;
        vShade = 0.6 + 0.4 * clamp(aOffset.y / 20.0, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uAtlas;
      varying vec2 vUv; varying vec3 vColor; varying float vSkin; varying float vShade;
      void main() {
        vec4 t = texture2D(uAtlas, vUv);
        if (t.a < 0.5) discard;
        vec3 skin = mix(vec3(0.95, 0.75, 0.6), vec3(0.35, 0.22, 0.14), vSkin);
        vec3 hair = vec3(0.08, 0.06, 0.05) + vSkin * 0.05;
        vec3 c = vColor * t.r + skin * t.g + hair * t.b;
        gl_FragColor = vec4(c * vShade, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const crowd = new THREE.Mesh(cg, crowdMat);
  crowd.frustumCulled = false;
  return { mesh: crowd, uniforms: crowdUniforms };
}
