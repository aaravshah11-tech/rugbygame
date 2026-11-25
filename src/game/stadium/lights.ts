import * as THREE from 'three';
import type { QualityPreset } from '../view/quality';
import type { StadiumSpec, StadiumWeather, TimeOfDay } from './types';

/** Colours and sun for each kick-off time (and the overcast version for rain). */
interface SkyLook {
  zenith: string;
  horizon: string;
  ground: string;
  sunColor: string;
  sunIntensity: number;
  /** sun elevation in degrees (night: the main floodlight bank's direction) */
  elevation: number;
  /** compass of the sun, radians (0 = +x) */
  azimuth: number;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  clouds: number;
  cloudColor: string;
  stars: number;
  exposure: number;
}

function look(time: TimeOfDay, weather: StadiumWeather, climate: StadiumSpec['climate']): SkyLook {
  const wet = weather === 'rain';
  const snowy = weather === 'snow';
  if (time === 'afternoon') {
    const tropical = climate === 'tropical';
    const highveld = climate === 'highveld';
    return {
      zenith: wet ? '#5d6670' : tropical ? '#1f6fd1' : highveld ? '#2a62c4' : '#3b74c4',
      horizon: wet ? '#9aa3ab' : snowy ? '#c9d2dc' : tropical ? '#8fcdea' : '#a9c8e6',
      ground: '#4b5a3c',
      sunColor: wet ? '#d9dde2' : '#fff3df',
      sunIntensity: wet ? 1.5 : 3.1,
      // behind the main stand: its shadow lies across the far part of the pitch
      elevation: 36,
      azimuth: -1.99,
      hemiSky: wet ? '#aab3bd' : '#bcd6ff',
      hemiGround: '#3b5a2c',
      hemi: wet ? 1.2 : 1.0,
      clouds: wet ? 0.92 : snowy ? 0.75 : tropical ? 0.3 : 0.36,
      cloudColor: wet ? '#8a929b' : '#ffffff',
      stars: 0,
      exposure: wet ? 0.95 : 1.0,
    };
  }
  if (time === 'golden') {
    return {
      zenith: wet ? '#3b4250' : '#2b3c78',
      horizon: wet ? '#b08a6c' : '#ff9a4a',
      ground: '#3d3a2c',
      sunColor: wet ? '#e0b48a' : '#ffb26a',
      sunIntensity: wet ? 1.6 : 3.0,
      // low over one end: long shadows, the far stands glowing orange
      elevation: 16,
      azimuth: -2.84,
      hemiSky: '#d8b494',
      hemiGround: '#46402a',
      hemi: 1.05,
      clouds: wet ? 0.9 : 0.45,
      cloudColor: wet ? '#806a5c' : '#ffcfa8',
      stars: 0,
      exposure: 1.08,
    };
  }
  // night: the "sun" is the main floodlight bank
  return {
    zenith: '#060a1c',
    horizon: wet ? '#2a3140' : '#1c2348',
    ground: '#0b1008',
    sunColor: '#fff4e2',
    sunIntensity: 2.6,
    elevation: 57,
    azimuth: 2.25,
    hemiSky: '#9fb6ff',
    hemiGround: '#25401f',
    hemi: 0.55,
    clouds: wet ? 0.8 : 0.25,
    cloudColor: wet ? '#2a2f3a' : '#1b2238',
    stars: wet ? 0 : 1,
    exposure: 1.0,
  };
}

function skyMaterial(L: SkyLook, sunDir: THREE.Vector3, octaves: number) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(L.zenith) },
      uHorizon: { value: new THREE.Color(L.horizon) },
      uGround: { value: new THREE.Color(L.ground) },
      uSun: { value: sunDir.clone().negate() },
      uSunColor: { value: new THREE.Color(L.sunColor) },
      uCloud: { value: L.clouds },
      uCloudColor: { value: new THREE.Color(L.cloudColor) },
      uStars: { value: L.stars },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSun; uniform vec3 uSunColor;
      uniform float uCloud; uniform vec3 uCloudColor; uniform float uStars; uniform float uTime;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float hash3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < ${octaves}; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
        // sun glow near the horizon on its side, and the sun disc
        float sd = max(0.0, dot(d, uSun));
        c += uSunColor * (pow(sd, 6.0) * 0.35 + smoothstep(0.9993, 0.9997, sd) * 2.0) * step(0.0, uSun.y + 0.05);
        // clouds: noise projected onto a flat layer above
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
          float n = fbm(uv);
          float cov = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.28, n);
          vec3 cl = uCloudColor * (0.75 + 0.35 * n) + uSunColor * pow(sd, 3.0) * 0.25;
          c = mix(c, cl, cov * smoothstep(0.0, 0.12, h));
          // stars where the sky is clear
          float s = step(0.9975, hash3(floor(d * 380.0))) * smoothstep(0.2, 0.6, h) * (1.0 - cov);
          c += vec3(s * 0.7 * uStars);
        } else {
          c = mix(uHorizon * 0.6, uGround, clamp(-h * 6.0, 0.0, 1.0));
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export interface SkyResult {
  key: THREE.DirectionalLight;
  /** direction the key light travels (normalised, pointing down) */
  sunDir: THREE.Vector3;
  update(time: number): void;
}

/**
 * Sky dome (gradient, drifting clouds, sun, stars), image-based lighting and the lights for the
 * kick-off time: sun + sky fill by day, the floodlight "sun" with blue night fill after dark.
 */
export function buildSkyAndLights(scene: THREE.Scene, renderer: THREE.WebGLRenderer, q: QualityPreset, spec: StadiumSpec, time: TimeOfDay, weather: StadiumWeather): SkyResult {
  const L = look(time, weather, spec.climate);
  const el = (L.elevation * Math.PI) / 180;
  const sunDir = new THREE.Vector3(-Math.cos(L.azimuth) * Math.cos(el), -Math.sin(el), -Math.sin(L.azimuth) * Math.cos(el)).normalize();
  const sky = skyMaterial(L, sunDir, q.level === 'low' ? 2 : 4);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), sky);
  scene.add(dome);
  scene.background = new THREE.Color(L.zenith);
  renderer.toneMappingExposure = L.exposure;
  {
    // image-based lighting from a simple version of the same sky (+ lamps after dark)
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial({ ...L, clouds: L.clouds * 0.5 }, sunDir, 1)));
    if (time !== 'afternoon') {
      const k = time === 'night' ? 8 : 3;
      const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.88) });
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 2), lampMat);
        lamp.position.set(x * 60, 45, z * 50);
        lamp.lookAt(0, 0, 0);
        envScene.add(lamp);
      }
    }
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: time === 'afternoon' ? '#3d6a33' : '#1f4a1d' }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -1;
    envScene.add(grass);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = time === 'afternoon' ? 0.75 : 0.55;
    pmrem.dispose();
  }
  scene.add(new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi));
  const key = new THREE.DirectionalLight(L.sunColor, L.sunIntensity);
  key.position.copy(sunDir).multiplyScalar(-90);
  key.castShadow = q.shadows;
  key.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
  const sc = key.shadow.camera;
  sc.left = -22;
  sc.right = 22;
  sc.top = 22;
  sc.bottom = -22;
  sc.near = 10;
  sc.far = 200;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key, key.target);
  if (time === 'night') {
    // the other floodlight banks
    const fill1 = new THREE.DirectionalLight('#dfe8ff', 0.9);
    fill1.position.set(50, 60, -40);
    const fill2 = new THREE.DirectionalLight('#ffe9d0', 0.6);
    fill2.position.set(40, 50, 50);
    scene.add(fill1, fill2);
  } else {
    // soft bounce from the opposite side
    const bounce = new THREE.DirectionalLight(time === 'golden' ? '#7a8cc0' : '#c6d6f0', time === 'golden' ? 0.5 : 0.45);
    bounce.position.copy(sunDir).multiplyScalar(60).setY(30);
    scene.add(bounce);
  }
  // mist in the rain, snow haze
  if (weather === 'rain') scene.fog = new THREE.FogExp2(time === 'night' ? '#20262f' : '#8d959e', 0.0055);
  else if (weather === 'snow') scene.fog = new THREE.FogExp2('#c8d0da', 0.0035);
  else if (time === 'golden') scene.fog = new THREE.FogExp2('#c48a62', 0.0012);
  return {
    key,
    sunDir,
    update(t: number) {
      sky.uniforms.uTime.value = t;
    },
  };
}
