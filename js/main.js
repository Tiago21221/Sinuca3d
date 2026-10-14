import * as THREE from "three";
import { loadSettings, saveSettings } from "./settings.js";
import { GameAudio } from "./audio.js";
import { applyQuality, createRenderer, createScene, resizeRenderer } from "./scene.js";
import { createTable } from "./table.js";
import { CameraRig } from "./camera.js";
import { Controls } from "./controls.js";
import { GameManager } from "./game-manager.js";
import { UI } from "./ui.js";
import { TABLE_HEIGHT } from "./constants.js";

const settings = loadSettings();
const audio = new GameAudio();
audio.setVolumes(settings);

const view = document.querySelector("#view");
const { scene, camera, lights } = createScene(settings.quality);
const renderer = createRenderer(view, settings.quality);

if (!renderer) {
  const box = document.createElement("div");
  box.className = "webgl-error";
  box.textContent =
    "WebGL não está disponível neste navegador. Atualize o Chrome, Edge ou Firefox, ou ative a aceleração de hardware.";
  document.body.appendChild(box);
} else {
  createTable(scene);
  const cameraRig = new CameraRig(camera, settings);
  cameraRig.setQualityDistance(settings.cameraDistance);

  const ui = new UI({
    root: document.getElementById("app"),
    settings,
    audio,
    onStart: (config) => startMatch(config),
    onPauseAction: (action) => handlePause(action),
  });

  const game = new GameManager({ scene, cameraRig, audio, settings, ui });
  ui.game = game;

  const controls = new Controls(renderer.domElement, settings);
  controls.onShoot = (pull) => {
    const direction = controls.aimDirection();
    ui.aimDir = { x: direction.x, z: direction.z };
    game.shoot(pull);
  };
  controls.onPullChange = (pull) => {
    game.cuePull = pull;
  };
  controls.onPause = () => handlePause("pause");
  controls.onOrbit = (dx, dy) => cameraRig.orbit(dx, dy);
  controls.onZoom = (d) => cameraRig.zoom(d);
  controls.onAngle = () => cameraRig.cycleAngle();
  controls.onResetCamera = () => cameraRig.reset();
  controls.onPlace = () => game.confirmPlace();
  controls.onPlaceNudge = (dx, dz) => {
    const cue = game.physics.bodies.get(0);
    if (cue) game.moveCueTo(cue.position.x + dx, cue.position.z + dz);
  };
  controls.onPowerChange = (powerValue) => {
    ui.power = powerValue;
    ui.syncAimWidgets();
  };
  controls.onPlaceMove = (e) => {
    const p = unproject(e);
    if (p) game.moveCueTo(p.x, p.z);
  };

  ui.onSettingsChange = (next) => {
    Object.assign(settings, next);
    applyQuality(renderer, lights, next.quality);
    cameraRig.settings = next;
    cameraRig.setQualityDistance(next.cameraDistance);
    controls.settings = next;
    game.settings = next;
  };

  const power = document.getElementById("powerSlider");
  power?.addEventListener("input", () => {
    ui.power = Number(power.value);
    controls.power = ui.power;
    ui._powerLabel();
  });

  function syncAimFromControls() {
    if (game.phase !== "aim" || game.players[game.modeState?.currentPlayer]?.isAi) return;
    const d = controls.aimDirection();
    ui.aimDir = { x: d.x, z: d.z };
    if (controls.charging) {
      ui.power = controls.power;
      ui.syncAimWidgets();
    }
  }

  function startMatch(config) {
    audio.unlock();
    ui.hideGameOver();
    ui.setPause(false);
    paused = false;
    controls.aimAngle = 0;
    controls.power = 0.42;
    ui.aimDir = { x: 0, z: 1 };
    ui.power = 0.42;
    ui.syncAimWidgets();
    game.startMatch(config);
    controls.setEnabled(true);
  }

  let paused = false;
  function handlePause(action) {
    if (action === "pause") {
      if (game.phase === "idle" || game.phase === "over") return;
      paused = true;
      controls.setEnabled(false);
      ui.setPause(true);
    }
    if (action === "resume") {
      paused = false;
      ui.setPause(false);
      controls.setEnabled(game.phase === "aim");
    }
    if (action === "restart") {
      ui.hideGameOver();
      ui.setPause(false);
      paused = false;
      game.restart();
      controls.setEnabled(true);
    }
    if (action === "menu") {
      ui.hideGameOver();
      ui.setPause(false);
      paused = false;
      game.phase = "idle";
      game.clearBalls();
      ui.showScreen("screen-home");
      controls.setEnabled(false);
    }
  }

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_HEIGHT);
  const ndc = new THREE.Vector2();
  function unproject(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) return { x: hit.x, z: hit.z };
    return null;
  }

  window.addEventListener("resize", () => resizeRenderer(renderer, camera, view));
  resizeRenderer(renderer, camera, view);

  document.addEventListener(
    "pointerdown",
    () => {
      audio.unlock();
    },
    { once: true }
  );

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    controls.placeMode = game.phase === "place";
    controls.setEnabled(game.phase === "aim" && !paused && !game.aiThinking);
    if (!paused) {
      controls.tickKeyboard(dt);
      syncAimFromControls();
      controls.tickCamera(dt, cameraRig);
      game.update(dt);
      cameraRig.update(dt);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  saveSettings(settings);
}
