import { CUE_MAX_PULL } from "./constants.js";

export class Controls {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.aimAngle = 0;
    this.power = 0.42;
    this.draggingAim = false;
    this.charging = false;
    this.pointers = new Map();
    this.keys = new Set();
    this.onShoot = null;
    this.onPause = null;
    this.onOrbit = null;
    this.onZoom = null;
    this.onAngle = null;
    this.onResetCamera = null;
    this.enabled = false;
    this.placeMode = false;
    this.onPlace = null;
    this.onPlaceMove = null;
    this.onPlaceNudge = null;
    this.placementPointer = null;
    this.pullDistance = 0;
    this.cuePull = 0;
    this.onPullChange = null;

    canvas.addEventListener("pointerdown", (e) => this._down(e));
    canvas.addEventListener("pointermove", (e) => this._move(e));
    window.addEventListener("pointerup", (e) => this._up(e));
    window.addEventListener("pointercancel", (e) => this._up(e));
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.onZoom?.(e.deltaY * 0.002);
      },
      { passive: false }
    );
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Escape" && !e.repeat) this.onPause?.();
      if (e.code === "Enter" && this.placeMode && !e.repeat) {
        e.preventDefault();
        this.onPlace?.();
      }
      if (e.code === "KeyC" && !e.repeat) this.onAngle?.();
      if (e.code === "KeyR" && !e.repeat) this.onResetCamera?.();
      if ((e.code === "KeyQ" || e.code === "KeyE") && !e.repeat) {
        this.onZoom?.(e.code === "KeyQ" ? -0.25 : 0.25);
      }
      if (e.code === "Space" && this.enabled && !this.placeMode) {
        e.preventDefault();
        if (!e.repeat) this.onShoot?.();
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  setEnabled(v) {
    this.enabled = v;
  }

  aimDirection() {
    return { x: Math.sin(this.aimAngle), y: 0, z: Math.cos(this.aimAngle) };
  }

  _down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.placeMode) {
      this.charging = false;
      this.draggingAim = false;
      this.placementPointer = e.pointerId;
      this.onPlaceMove?.(e);
      if (e.button === 0) this.onPlace?.();
      return;
    }
    if (!this.enabled) {
      this._orbitStart = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button === 2 || e.shiftKey) {
      this._orbitStart = { x: e.clientX, y: e.clientY };
      return;
    }
    this.draggingAim = true;
    this.aimOnly = e.pointerType === "touch";
    this.charging = !this.aimOnly;
    this._last = { x: e.clientX, y: e.clientY };
    this._chargeStartY = e.clientY;
    this.pullDistance = 0;
    this.cuePull = 0;
    if (this.charging) this.onPullChange?.(0);
  }

  _move(e) {
    if (this.placeMode) {
      this.onPlaceMove?.(e);
      return;
    }
    if (this._orbitStart && this.pointers.has(e.pointerId) && !this.draggingAim) {
      const dx = e.clientX - this._orbitStart.x;
      const dy = e.clientY - this._orbitStart.y;
      this._orbitStart = { x: e.clientX, y: e.clientY };
      this.onOrbit?.(dx, dy);
      return;
    }
    if (!this.draggingAim || !this.enabled) return;
    const sens = this.settings.aimSensitivity || 1;
    const dx = e.clientX - this._last.x;
    this.aimAngle -= dx * 0.006 * sens;
    this._last = { x: e.clientX, y: e.clientY };
    if (this.aimOnly) return;
    const pull = Math.max(0, e.clientY - this._chargeStartY);
    if (pull > this.pullDistance) {
      this.pullDistance = pull;
      this.power = clamp(0.08 + (pull / 180) * 0.92, 0.08, 1);
      this.cuePull = Math.min(1, pull / 180) * CUE_MAX_PULL;
      this.onPowerChange?.(this.power);
      this.onPullChange?.(this.cuePull);
    }
    if (this.pullDistance > 16 && e.clientY < this._chargeStartY + this.pullDistance * 0.55) {
      this.charging = false;
      this.draggingAim = false;
      this.onShoot?.(this.cuePull);
      this.cuePull = 0;
      this.onPullChange?.(0);
    }
  }

  _up(e) {
    this.pointers.delete(e.pointerId);
    this._orbitStart = null;
    if (this.placeMode || this.placementPointer === e.pointerId) {
      if (this.placementPointer === e.pointerId) this.placementPointer = null;
      return;
    }
    if (this.charging && this.enabled && this.draggingAim && this.pullDistance > 12) {
      this.charging = false;
      this.draggingAim = false;
      this.aimOnly = false;
      this.onShoot?.(this.cuePull);
      this.cuePull = 0;
      this.onPullChange?.(0);
      return;
    }
    this.charging = false;
    this.draggingAim = false;
    this.aimOnly = false;
    this.pullDistance = 0;
    this.cuePull = 0;
    this.onPullChange?.(0);
  }

  tickCamera(dt, rig) {
    if (this.placeMode) return;
    const s = (this.settings.cameraSpeed || 1) * dt * 1.4;
    if (this.keys.has("ArrowLeft")) rig.orbit(80 * s, 0);
    if (this.keys.has("ArrowRight")) rig.orbit(-80 * s, 0);
    if (this.keys.has("ArrowUp")) rig.orbit(0, -60 * s);
    if (this.keys.has("ArrowDown")) rig.orbit(0, 60 * s);
  }

  tickKeyboard(dt) {
    if (this.placeMode) {
      let dx = 0;
      let dz = 0;
      if (this.keys.has("ArrowLeft")) dx -= 1;
      if (this.keys.has("ArrowRight")) dx += 1;
      if (this.keys.has("ArrowUp")) dz -= 1;
      if (this.keys.has("ArrowDown")) dz += 1;
      if (dx || dz) {
        const scale = 0.35 * dt / Math.hypot(dx, dz);
        this.onPlaceNudge?.(dx * scale, dz * scale);
      }
      return;
    }
    if (!this.enabled) return;
    const oldAngle = this.aimAngle;
    const oldPower = this.power;
    const aimSpeed = 1.3 * dt * (this.settings.aimSensitivity || 1);
    if (this.keys.has("KeyA")) this.aimAngle += aimSpeed;
    if (this.keys.has("KeyD")) this.aimAngle -= aimSpeed;
    const powerSpeed = 0.55 * dt;
    if (this.keys.has("Keys")) this.power = clamp(this.power + powerSpeed, 0.08, 1);
    if (this.keys.has("Keyw")) this.power = clamp(this.power - powerSpeed, 0.08, 1);
    if (this.power !== oldPower) this.onPowerChange?.(this.power);
    return this.aimAngle !== oldAngle || this.power !== oldPower;
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
