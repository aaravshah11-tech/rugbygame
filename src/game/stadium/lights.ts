import * as THREE from 'three';
import type { QualityPreset } from '../view/quality';

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){
        float h = vDir.y;
        vec3 zenith = vec3(0.025,0.04,0.12);
        vec3 mid = vec3(0.09,0.11,0.28);
        vec3 horizon = vec3(0.95,0.48,0.25);
        vec3 c = mix(mid, zenith, smoothstep(0.08, 0.6, h));
        float sunDir = max(0.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(-0.6,0.0,-0.8))));
        float glow = exp(-max(h,0.0) * 9.0) * (0.35 + 0.65 * pow(sunDir, 3.0));
        c = mix(c, horizon, clamp(glow, 0.0, 1.0));
        if (h < 0.0) c = mix(horizon * 0.25, vec3(0.02,0.03,0.05), clamp(-h * 6.0, 0.0, 1.0));
        float s = step(0.9975, hash(floor(vDir * 380.0))) * smoothstep(0.2, 0.6, h);
        c += vec3(s * 0.7);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}


/** Sky dome, image-based lighting and the key/fill lights. Returns the shadow-casting key light. */
export function buildSkyAndLights(scene: THREE.Scene, renderer: THREE.WebGLRenderer, q: QualityPreset): THREE.DirectionalLight {
  // ---------- sky + image-based lighting
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMaterial());
  scene.add(sky);
  scene.background = new THREE.Color('#0b1024');
  {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial()));
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 8, 7) });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 2), lampMat);
      lamp.position.set(x * 60, 45, z * 50);
      lamp.lookAt(0, 0, 0);
      envScene.add(lamp);
    }
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: '#1f4a1d' }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -1;
    envScene.add(grass);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  // ---------- lights: hemisphere + floodlight "sun" with shadows
  scene.add(new THREE.HemisphereLight('#9fb6ff', '#25401f', 0.55));
  const key = new THREE.DirectionalLight('#fff4e2', 2.6);
  key.position.set(-35, 70, 45);
  key.castShadow = q.shadows;
  key.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
  const sc = key.shadow.camera;
  sc.left = -22;
  sc.right = 22;
  sc.top = 22;
  sc.bottom = -22;
  sc.near = 10;
  sc.far = 160;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key, key.target);
  const fill1 = new THREE.DirectionalLight('#dfe8ff', 0.9);
  fill1.position.set(50, 60, -40);
  const fill2 = new THREE.DirectionalLight('#ffe9d0', 0.6);
  fill2.position.set(40, 50, 50);
  scene.add(fill1, fill2);

  return key;
}
