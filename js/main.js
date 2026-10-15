import * as THREE from "three";
import { loadSettings, saveSettings } from "./settings.js";
import { GameAudio } from "./audio.js";
import { applyQuality, createRenderer, createScene, resizeRenderer } from "./scene.js";
import { createTable } from "./table.js";
import { CameraRig } from "./camera.js";
import { Controls } from "./controls.js";
import { GameManager } from "./game-manager.js";
import { UI } from "./ui.js";
import { createRoomCode, MultiplayerSession } from "./multiplayer.js";
import { MODES, TABLE_HEIGHT } from "./constants.js";

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

  let network = null;
  const ui = new UI({
    root: document.getElementById("app"),
    settings,
    audio,
    onStart: (config) => startMatch(config),
    onPauseAction: (action) => handlePause(action),
    onOnlineAction: (action) => startOnline(action),
    onOnlineCancel: () => {
      network?.close();
      network = null;
      ui.showScreen("screen-play");
    },
  });

  const game = new GameManager({ scene, cameraRig, audio, settings, ui });
  ui.game = game;
  game.onNetworkEvent = (type, payload) => {
    if (type === "shot-request") sendNetwork({ type, shot: payload });
    if (type === "place-request") sendNetwork({ type, position: payload });
    if (type === "restart-request") sendNetwork({ type });
    if (type === "shot" || type === "state") sendNetwork({ type, ...payload });
  };

  function sendNetwork(message) {
    if (!network) return;
    try {
      network.send(message);
    } catch (error) {
      game.networkConnected = false;
      ui.showMessage(`${ui.tx("onlineConnectionError")}: ${error.message}`, 5000);
    }
  }

  function receiveNetwork(message) {
    if (!message || typeof message !== "object" || typeof message.type !== "string") return;
    if (message.type === "join" && network?.role === "host" && !game.config) {
      const config = { ...network.matchConfig, multiplayerHost: true, localPlayer: 0, vsAi: false };
      sendNetwork({ type: "match-config", config });
      game.networkConnected = true;
      startMatch(config);
      return;
    }
    if (
      message.type === "match-config" &&
      network?.role === "join" &&
      !game.config &&
      Object.values(MODES).includes(message.config?.mode)
    ) {
      game.networkConnected = true;
      startMatch({
        ...message.config,
        multiplayer: true,
        multiplayerHost: false,
        localPlayer: 1,
        vsAi: false,
      });
      return;
    }
    if (message.type === "shot-request" && network?.role === "host") {
      if (game.modeState?.currentPlayer === 1) {
        if (!game.playNetworkShot(message.shot, 1) && game.phase === "aim") {
          sendNetwork({ type: "state", ...game.getNetworkState() });
        }
      }
      return;
    }
    if (message.type === "shot" && network?.role === "join") {
      game.playNetworkShot(message.shot, message.shooter);
      return;
    }
    if (message.type === "place-request" && network?.role === "host") {
      const position = message.position;
      if (!game.placeNetworkCue(position?.x, position?.z)) sendNetwork({ type: "state", ...game.getNetworkState() });
      return;
    }
    if (message.type === "state" && network?.role === "join") {
      game.applyNetworkState(message);
      return;
    }
    if (message.type === "restart-request" && network?.role === "host") game.restart();
  }

  function startOnline({ action, code, config }) {
    network?.close();
    const roomCode = action === "host" ? createRoomCode() : code;
    const hostConfig = action === "host"
      ? { ...config, multiplayerRoom: roomCode, multiplayer: true, multiplayerHost: true, localPlayer: 0, vsAi: false }
      : null;
    network = new MultiplayerSession({
      onMessage: receiveNetwork,
      onStatus: (status, error) => {
        if (status === "connected") {
          game.networkConnected = true;
          ui.setOnlineStatus("onlineConnected");
          ui.setOnlineWarning("");
        } else if (status === "waiting") {
          ui.setOnlineStatus("onlineWaiting");
        } else if (status === "connecting") {
          ui.setOnlineStatus("onlineConnecting");
        } else if (status === "relay-unavailable") {
          game.networkConnected = false;
          ui.setOnlineStatus("onlineRelayUnavailable");
          ui.setOnlineWarning("");
        } else if (status === "timeout") {
          game.networkConnected = false;
          ui.setOnlineStatus("onlineTimeout");
        } else if (status === "error") {
          game.networkConnected = false;
          ui.setOnlineStatus("onlineConnectionError", error?.message || "");
          if (game.config?.multiplayer) ui.showMessage(`${ui.tx("onlineConnectionError")}: ${error?.message || ""}`, 5000);
        } else if (status === "disconnected") {
          game.networkConnected = false;
          ui.setOnlineStatus("onlineDisconnected");
          if (game.config?.multiplayer) ui.showMessage(ui.tx("onlineDisconnected"), 5000);
        }
      },
    });
    network.matchConfig = hostConfig;
    ui.showOnlineLobby({ hosting: action === "host", code: roomCode });
    if (action === "host") network.host(roomCode);
    else network.join(roomCode);
  }

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
    if (game.phase !== "aim" || !game.isLocalTurn()) return;
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
    game.networkConnected = !config.multiplayer || Boolean(network?.connection?.open);
    game.startMatch(config);
    ui.setControlsEnabled(game.phase === "aim" && game.isLocalTurn());
    ui.showScreen("screen-game");
    controls.setEnabled(game.phase === "aim" && game.isLocalTurn());
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
      controls.setEnabled(game.phase === "aim" && game.isLocalTurn());
    }
    if (action === "menu") {
      network?.close();
      network = null;
      game.networkConnected = false;
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
    controls.placeMode = game.phase === "place" && game.isLocalTurn();
    controls.setEnabled(game.phase === "aim" && !paused && game.isLocalTurn());
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
