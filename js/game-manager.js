import * as THREE from "three";
import {
  BALL_RADIUS,
  BALL_MOVEMENT_END_EDGE_MARGIN,
  BALL_MOVEMENT_SIDE_EDGE_MARGIN,
  CUE_MAX_PULL,
  FOOT_SPOT,
  HEAD_STRING,
  KITCHEN_MAX_X,
  KITCHEN_MIN_X,
  MAX_SHOT_SPEED,
  MODES,
  SETTLE_FRAMES,
  TABLE_HEIGHT,
} from "./constants.js";
import { PhysicsWorld } from "./physics.js";
import { createBallMesh, cueStart, eightBallRackOrder, mixedRack, rackPositions } from "./balls.js";
import { CueStick, createAimLine, updateAimLine } from "./cue.js";
import { getPlaySurfaceBounds, pocketPositions } from "./table.js";
import { pickShot, validSetForAi } from "./ai.js";
import { applyEvenOdd, createEvenOddState, evenOddBalls } from "./modes/par-ou-impar.js";
import { applyBolinho, bolinhoNumbers, createBolinhoState } from "./modes/bolinho.js";
import { applyEightBall, createEightBallState } from "./modes/bola-8.js";
import { applyThreeBalls, createThreeBallsState, THREE_BALLS } from "./modes/three-balls.js";
import { recordMatch } from "./stats.js";

export class GameManager {
  constructor({ scene, cameraRig, audio, settings, ui }) {
    this.scene = scene;
    this.cameraRig = cameraRig;
    this.audio = audio;
    this.settings = settings;
    this.ui = ui;
    this.physics = new PhysicsWorld();
    this.physics.pocketCenters = pocketPositions();
    this.cue = new CueStick(scene);
    this.aimHelpers = createAimLine(scene);
    this.ballMeshes = new Map();
    this.pocketAnims = [];
    this.phase = "idle";
    this.settle = 0;
    this.shotPocketed = [];
    this.stroke = null;
    this.cuePull = 0;
    this.history = [];
    this.players = [];
    this.config = null;
    this.modeState = null;
    this.run = 0;
    this.matchBalls = 0;
    this.matchFouls = 0;
    this.aiThinking = false;
    this.placeLegal = true;
    this.kitchenOnly = false;
  }

  startMatch(config) {
    this.clearBalls();
    this.config = config;
    this.physics.pocketCenters = pocketPositions();
    this.history = [];
    this.run = 0;
    this.matchBalls = 0;
    this.matchFouls = 0;
    this.shotPocketed = [];
    this.stroke = null;
    this.cuePull = 0;
    this.players = [
      { name: config.vsAi ? this.ui.tx("you") : this.ui.tx("player1"), isAi: false, fouls: 0 },
      {
        name: config.vsAi ? this.ui.tx("computer") : this.ui.tx("player2"),
        isAi: Boolean(config.vsAi),
        fouls: 0,
      },
    ];

    if (config.mode === MODES.EVEN_ODD) this.modeState = createEvenOddState(config.p1Group || "even");
    else if (config.mode === MODES.BOLINHO) this.modeState = createBolinhoState(config.bolinho || {});
    else if (config.mode === MODES.THREE_BALLS) this.modeState = createThreeBallsState();
    else this.modeState = createEightBallState();

    this._rack();
    this.phase = "aim";
    this.audio.startMatch();
    this.ui.showMessage(this.ui.tx("preparing"), 1200);
    this._refreshHud("breakShot");
    this.cameraRig.reset();
    if (this.players[this.modeState.currentPlayer].isAi) this._queueAi();
  }

  _rack() {
    const cue = cueStart();
    this._spawnBall(0, cue.x, cue.z);

    let numbers;
    if (this.config.mode === MODES.THREE_BALLS) numbers = [...THREE_BALLS];
    else if (this.config.mode === MODES.EIGHT_BALL) numbers = eightBallRackOrder();
    else if (this.config.mode === MODES.BOLINHO) numbers = mixedRack(bolinhoNumbers(this.modeState.config));
    else numbers = mixedRack(evenOddBalls());

    const spots = rackPositions(numbers.length);
    numbers.forEach((n, i) => {
      const s = spots[i];
      this._spawnBall(n, s.x, s.z);
    });
  }

  _spawnBall(number, x, z) {
    this.physics.addBall(number, x, z);
    const mesh = createBallMesh(number);
    mesh.position.set(x, TABLE_HEIGHT + BALL_RADIUS, z);
    this.scene.add(mesh);
    this.ballMeshes.set(number, mesh);
  }

  clearBalls() {
    for (const mesh of this.ballMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose?.();
    }
    this.ballMeshes.clear();
    for (const n of [...this.physics.bodies.keys()]) this.physics.removeBall(n);
  }

  update(dt) {
    for (const anim of [...this.pocketAnims]) {
      anim.t += dt;
      const m = anim.mesh;
      m.position.y -= dt * 0.55;
      m.scale.setScalar(Math.max(0.05, 1 - anim.t * 1.6));
      if (anim.t > 0.7) {
        this.scene.remove(m);
        this.pocketAnims.splice(this.pocketAnims.indexOf(anim), 1);
      }
    }

    if (this.phase === "stroke") this._updateStroke(dt);

    if (this.phase === "shot" || this.phase === "settle" || (this.phase === "stroke" && this.stroke?.impactDone)) {
      const events = this.physics.step(dt);
      for (const ev of events) {
        if (ev.type === "ball") this.audio.ballHit(ev.impulse);
        if (ev.type === "cushion") this.audio.cushion(ev.impulse);
      }
      this._syncMeshes();
      this._detectPockets();
      const cueBody = this.physics.bodies.get(0);
      if (cueBody && this.phase === "shot") this.cameraRig.setFollow(cueBody.position, false);

      if (this.physics.ballsAtRest()) {
        this.settle++;
        if (this.phase !== "stroke" && this.settle > SETTLE_FRAMES) {
          this.physics.forceSleepAll();
          this._resolveShot();
        }
      } else this.settle = 0;
    } else {
      this._syncMeshes();
    }

    const cueMesh = this.ballMeshes.get(0);
    const aiming = this.phase === "aim" && !this.aiThinking;
    if (cueMesh) {
      const dir = new THREE.Vector3(this.ui.aimDir.x, 0, this.ui.aimDir.z);
      this.cue.setAim(dir);
      const pull = aiming ? this.cuePull : this._strokeCueOffset();
      const cuePosition = this.phase === "stroke" ? this.stroke.cuePosition : cueMesh.position;
      this.cue.update(cuePosition, aiming || this.phase === "stroke", this.ui.power, pull);
      const aimEnabled = this.config?.aimAssist ?? this.settings.aimAssist;
      updateAimLine(
        this.aimHelpers,
        cueMesh.position,
        dir,
        aiming && aimEnabled,
        [...this.physics.bodies.entries()].map(([number, body]) => ({
          number,
          x: body.position.x,
          z: body.position.z,
        })),
        getPlaySurfaceBounds()
      );
      if (aiming) this.cameraRig.focusCue(cueMesh.position, dir);
    } else {
      this.cue.update({ x: 0, z: 0 }, false, 0);
      updateAimLine(this.aimHelpers, new THREE.Vector3(), new THREE.Vector3(1, 0, 0), false);
    }
  }

  _syncMeshes() {
    for (const [n, body] of this.physics.bodies) {
      const mesh = this.ballMeshes.get(n);
      if (!mesh) continue;
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }

  _detectPockets() {
    const hits = this.physics.pocketHits();
    for (const n of hits) {
      if (this.shotPocketed.includes(n)) continue;
      this.shotPocketed.push(n);
      this.audio.pocket();
      const mesh = this.ballMeshes.get(n);
      this.physics.removeBall(n);
      this.ballMeshes.delete(n);
      if (mesh) this.pocketAnims.push({ mesh, t: 0 });
      if (this.settings.vibrate && navigator.vibrate) navigator.vibrate(18);
    }
  }

  shoot(pulled = 0) {
    if (this.phase !== "aim" || this.aiThinking) return;
    const dir = new THREE.Vector3(this.ui.aimDir.x, 0, this.ui.aimDir.z).normalize();
    this._fire(dir, this.ui.power, pulled || this.cuePull, this.ui.spin);
  }

  _fire(dir, power, pulled = 0, spin = { x: 0, y: 0 }) {
    this.phase = "stroke";
    this.settle = 0;
    this.shotPocketed = [];
    this.cuePull = 0;
    this.stroke = {
      dir: dir.clone().normalize(),
      cuePosition: this.physics.bodies.get(0).position.clone(),
      power,
      spin: { ...spin },
      elapsed: 0,
      duration: 0.34,
      pull: Math.max(pulled, power * CUE_MAX_PULL),
      impactDone: false,
    };
    this.ui.setControlsEnabled(false);
  }

  _strokeCueOffset() {
    if (!this.stroke) return 0;
    const t = Math.min(1, this.stroke.elapsed / this.stroke.duration);
    const pull = this.stroke.pull;
    if (t < 0.3) return pull;
    if (t < 0.56) {
      const k = (t - 0.3) / 0.26;
      return pull * (1 - k) + 0.008 * k;
    }
    if (t < 0.76) return 0.008 - 0.01 * ((t - 0.56) / 0.2);
    return 0;
  }

  _updateStroke(dt) {
    if (!this.stroke) return;
    this.stroke.elapsed = Math.min(this.stroke.duration, this.stroke.elapsed + dt);
    const progress = this.stroke.elapsed / this.stroke.duration;
    if (!this.stroke.impactDone && progress >= 0.56) {
      this.stroke.impactDone = true;
      this.physics.resetShotTracking();
      this.audio.cueHit(this.stroke.power);
      this.physics.strikeCue(
        this.stroke.dir,
        this.stroke.power * MAX_SHOT_SPEED,
        this.stroke.spin
      );
      const cue = this.physics.bodies.get(0);
      if (cue) this.cameraRig.setFollow(cue.position, false);
      this.ui.showMessage(this.ui.tx("validShot"), 600);
    }
    if (progress >= 1) {
      this.stroke = null;
      this.phase = "shot";
    }
  }

  _resolveShot() {
    const snap = this.physics.snapshotShot();
    const shot = {
      pocketedNumbers: this.shotPocketed.filter((n) => n !== 0),
      cuePocketed: this.shotPocketed.includes(0),
      firstContact: snap.firstContact,
      railAfterContact: snap.railAfterContact,
      anyHit: snap.anyHit,
    };

    let pack;
    if (this.config.mode === MODES.EVEN_ODD) pack = applyEvenOdd(this.modeState, shot);
    else if (this.config.mode === MODES.BOLINHO) pack = applyBolinho(this.modeState, shot);
    else if (this.config.mode === MODES.THREE_BALLS) pack = applyThreeBalls(this.modeState, shot);
    else pack = applyEightBall(this.modeState, shot);

    const shooter = this.modeState.currentPlayer;
    this.modeState = pack.state;
    const pottedCount = shot.pocketedNumbers.length;
    this.matchBalls += pottedCount;
    if (pottedCount) this.run += pottedCount;
    else this.run = 0;

    if (pack.foul) {
      this.matchFouls += 1;
      this.players[shooter].fouls += 1;
      this.ui.showMessage(this.ui.tx("foul") + " — " + this.ui.tx(pack.foulReason || "foul"), 2200);
    } else if (pack.continueTurn) {
      this.ui.showMessage(this.ui.tx("continueTurn"), 1400);
    } else {
      this.ui.showMessage(this.ui.tx("turnPassed"), 1400);
    }

    if (pack.respawnEight) this._spot(8);

    this.history.unshift({
      player: this.players[shooter].name,
      text: this.ui.tx(pack.messageKey),
      potted: shot.pocketedNumbers,
    });
    if (this.history.length > 12) this.history.length = 12;

    if (pack.winner != null) {
      this._finish(pack.winner);
      return;
    }

    if (pack.ballInHand || shot.cuePocketed) {
      this.kitchenOnly = this.modeState && this.history.length <= 1;
      this._beginBallInHand();
      this._refreshHud(pack.messageKey);
      return;
    }

    this.phase = "aim";
    this.cameraRig.clearFollow();
    this._refreshHud(pack.messageKey);
    if (this.players[this.modeState.currentPlayer].isAi) this._queueAi();
    else this.ui.setControlsEnabled(true);
  }

  _spot(number) {
    if (this.physics.bodies.has(number) || this.ballMeshes.has(number)) return;
    let x = FOOT_SPOT;
    let z = 0;
    let guard = 0;
    while (this.physics.overlaps(x, z, -1) && guard < 20) {
      x -= BALL_RADIUS * 2.05;
      guard++;
    }
    this._spawnBall(number, x, z);
  }

  _beginBallInHand() {
    this.phase = "place";
    this.cameraRig.clearFollow();
    if (!this.ballMeshes.has(0)) {
      const s = cueStart();
      this._spawnBall(0, s.x, s.z);
    }
    this.ui.setBallInHand(true, this.kitchenOnly);
    if (this.players[this.modeState.currentPlayer].isAi) {
      this._placeAiCue();
      this.ui.setBallInHand(false, false);
      this.phase = "aim";
      this._queueAi();
    } else {
      this.ui.setControlsEnabled(false);
    }
  }

  confirmPlace() {
    if (this.phase !== "place" || !this.placeLegal) return;
    this.phase = "aim";
    this.ui.setBallInHand(false, false);
    this.ui.setControlsEnabled(true);
  }

  moveCueTo(x, z) {
    if (this.phase !== "place") return;
    const clamped = this._clampPlace(x, z);
    this.placeLegal = !this.physics.overlaps(clamped.x, clamped.z, 0) && this._inTable(clamped.x, clamped.z);
    if (this.kitchenOnly && clamped.x > KITCHEN_MAX_X) this.placeLegal = false;
    if (this.placeLegal) this.physics.placeCue(clamped.x, clamped.z);
  }

  _clampPlace(x, z) {
    const surface = getPlaySurfaceBounds();
    const endMargin = BALL_RADIUS + BALL_MOVEMENT_END_EDGE_MARGIN;
    const sideMargin = BALL_RADIUS + BALL_MOVEMENT_SIDE_EDGE_MARGIN;
    let cx = THREE.MathUtils.clamp(x, -surface.halfLength + endMargin, surface.halfLength - endMargin);
    const cz = THREE.MathUtils.clamp(z, -surface.halfWidth + sideMargin, surface.halfWidth - sideMargin);
    if (this.kitchenOnly) cx = THREE.MathUtils.clamp(cx, KITCHEN_MIN_X, KITCHEN_MAX_X);
    return { x: cx, z: cz };
  }

  _inTable(x, z) {
    const surface = getPlaySurfaceBounds();
    const endMargin = BALL_RADIUS + BALL_MOVEMENT_END_EDGE_MARGIN;
    const sideMargin = BALL_RADIUS + BALL_MOVEMENT_SIDE_EDGE_MARGIN;
    return Math.abs(x) < surface.halfLength - endMargin && Math.abs(z) < surface.halfWidth - sideMargin;
  }

  _placeAiCue() {
    const p = this._clampPlace(HEAD_STRING, (Math.random() - 0.5) * 0.3);
    this.physics.placeCue(p.x, p.z);
  }

  _queueAi() {
    this.aiThinking = true;
    this.ui.setControlsEnabled(false);
    this.ui.showMessage(this.ui.tx("opponentTurn"), 900);
    setTimeout(() => this._runAi(), 700 + Math.random() * 500);
  }

  _runAi() {
    if (this.phase !== "aim") {
      this.aiThinking = false;
      return;
    }
    const cue = this.physics.bodies.get(0);
    if (!cue) {
      this.aiThinking = false;
      return;
    }
    const balls = [...this.physics.bodies.entries()].map(([number, b]) => ({
      number,
      x: b.position.x,
      z: b.position.z,
    }));
    const valid = validSetForAi(this.modeState);
    const shot = pickShot(this.config.difficulty || "medium", { x: cue.position.x, z: cue.position.z }, balls, valid);
    this.ui.aimDir = { x: shot.dir.x, z: shot.dir.z };
    this.ui.power = shot.power;
    this.ui.syncAimWidgets();
    this.aiThinking = false;
    setTimeout(() => this._fire(shot.dir, shot.power), 280);
  }

  _finish(winnerIndex) {
    this.phase = "over";
    const winForP1 = winnerIndex === 0;
    recordMatch(this.config.mode, {
      win: winForP1,
      ballsPocketed: this.matchBalls,
      fouls: this.matchFouls,
      run: this.run,
    });
    if (this.config.vsAi && !winForP1) this.audio.lose();
    else this.audio.win();
    this.ui.showGameOver({
      winner: this.players[winnerIndex].name,
      youWin: winForP1,
      vsAi: this.config.vsAi,
    });
    this._refreshHud("victory");
  }

  _refreshHud(msg) {
    this.ui.updateHud({
      players: this.players,
      current: this.modeState.currentPlayer,
      mode: this.config.mode,
      modeState: this.modeState,
      history: this.history,
      messageKey: msg,
    });
  }

  restart() {
    if (!this.config) return;
    this.startMatch(this.config);
  }
}
