import * as THREE from 'three';

/**
 * Free everything a scene put on the GPU, then the renderer and its WebGL context.
 * iOS Safari only allows a handful of live WebGL contexts, so every screen that owns a
 * renderer calls this when it closes. Shared cached textures/geometries are safe to
 * dispose: three.js uploads them again the next time a renderer draws them.
 */
export function disposeScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => materials.add(x));
    else if (mat) materials.add(mat);
  });
  for (const mat of materials) {
    for (const v of Object.values(mat)) if (v instanceof THREE.Texture) textures.add(v);
    const uniforms = (mat as THREE.ShaderMaterial).uniforms;
    if (uniforms) for (const u of Object.values(uniforms)) if (u?.value instanceof THREE.Texture) textures.add(u.value);
    mat.dispose();
  }
  for (const t of [scene.background, scene.environment]) if (t instanceof THREE.Texture) textures.add(t);
  textures.forEach((t) => t.dispose());
  renderer.renderLists.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement.remove();
}
