import * as THREE from "three";
import { TABLE_HEIGHT } from "./constants.js";

export function createRenderer(container, quality) {
  if (!window.WebGLRenderingContext) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: quality !== "low",
      powerPreference: quality === "high" ? "high-performance" : "default",
      alpha: false,
    });
  } catch {
    return null;
  }
  renderer.setPixelRatio(
    quality === "low" ? 1 : quality === "medium" ? Math.min(1.5, window.devicePixelRatio) : Math.min(2, window.devicePixelRatio)
  );
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createScene(quality) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1210);
  scene.fog = new THREE.Fog(0x0c1210, 6, 16);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 40);
  camera.position.set(0.4, 2.2, 2.8);

  const hemi = new THREE.HemisphereLight(0xe8f0ff, 0x1a1510, 0.55);
  scene.add(hemi);

  const key = new THREE.SpotLight(0xfff3d0, quality === "low" ? 18 : 28, 12, Math.PI / 3.2, 0.35, 1);
  key.position.set(0, 3.4, 0.15);
  key.target.position.set(0, TABLE_HEIGHT, 0);
  key.castShadow = quality !== "low";
  key.shadow.mapSize.set(quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024);
  key.shadow.bias = -0.0002;
  scene.add(key, key.target);

  const fill = new THREE.PointLight(0x88aacc, 6, 10);
  fill.position.set(-2.2, 2.2, 1.6);
  scene.add(fill);

  const rim = new THREE.PointLight(0xffd9a0, 4, 8);
  rim.position.set(2.4, 1.6, -1.4);
  scene.add(rim);

  const ambient = new THREE.AmbientLight(0x334433, 0.25);
  scene.add(ambient);

  return { scene, camera, lights: { key, fill, rim } };
}

export function applyQuality(renderer, lights, quality) {
  if (!renderer) return;
  renderer.setPixelRatio(
    quality === "low" ? 1 : quality === "medium" ? Math.min(1.5, window.devicePixelRatio) : Math.min(2, window.devicePixelRatio)
  );
  renderer.shadowMap.enabled = quality !== "low";
  lights.key.castShadow = quality !== "low";
  lights.key.intensity = quality === "low" ? 18 : 28;
}

export function resizeRenderer(renderer, camera, container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
