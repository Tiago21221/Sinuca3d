import * as THREE from "three";
import { TABLE_HEIGHT, TABLE_LENGTH } from "./constants.js";

export class CameraRig {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.yaw = 0.55;
    this.pitch = 0.72;
    this.distance = 2.55;
    this.minDist = 1.15;
    this.maxDist = 4.6;
    this.target = new THREE.Vector3(0, TABLE_HEIGHT, 0);
    this.desiredTarget = this.target.clone();
    this.follow = null;
    this.mode = "table";
  }

  setQualityDistance(mult) {
    this.distance = THREE.MathUtils.clamp(2.55 * (mult || 1), this.minDist, this.maxDist);
  }

  orbit(dx, dy) {
    const s = this.settings.cameraSpeed || 1;
    this.yaw -= dx * 0.005 * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004 * s, 0.28, 1.25);
  }

  zoom(delta) {
    this.distance = THREE.MathUtils.clamp(this.distance + delta, this.minDist, this.maxDist);
  }

  setFollow(pos, close) {
    this.follow = pos;
    this.mode = close ? "aim" : "follow";
  }

  clearFollow() {
    this.follow = null;
    this.mode = "table";
    this.desiredTarget.set(0, TABLE_HEIGHT, 0);
  }

  focusCue(pos, direction) {
    this.mode = "aim";
    const dir = direction?.clone().setY(0).normalize();
    if (dir?.lengthSq()) {
      this.yaw = Math.atan2(-dir.x, -dir.z);
      this.desiredTarget.set(pos.x + dir.x * 0.28, TABLE_HEIGHT + 0.035, pos.z + dir.z * 0.28);
    } else {
      this.desiredTarget.set(pos.x, TABLE_HEIGHT + 0.05, pos.z);
    }
  }

  reset() {
    this.yaw = 0.55;
    this.pitch = 0.72;
    this.distance = 2.55 * (this.settings.cameraDistance || 1);
    this.clearFollow();
  }

  cycleAngle() {
    this.pitch = this.pitch > 0.9 ? 0.45 : this.pitch + 0.25;
  }

  update(dt) {
    if (this.follow) {
      this.desiredTarget.lerp(
        new THREE.Vector3(this.follow.x, TABLE_HEIGHT + 0.04, this.follow.z),
        Math.min(1, dt * 4)
      );
    } else if (this.mode !== "aim") {
      this.desiredTarget.lerp(new THREE.Vector3(0, TABLE_HEIGHT, 0), Math.min(1, dt * 2.5));
    }
    this.target.lerp(this.desiredTarget, Math.min(1, dt * 6));

    const dist = this.mode === "aim" ? Math.min(this.distance, 2.15) : this.distance;
    const x = this.target.x + Math.cos(this.pitch) * Math.sin(this.yaw) * dist;
    const y = this.target.y + Math.sin(this.pitch) * dist;
    const z = this.target.z + Math.cos(this.pitch) * Math.cos(this.yaw) * dist;
    const pos = new THREE.Vector3(x, Math.max(0.35, y), z);

    // Evita atravessar o plano da mesa
    if (pos.y < TABLE_HEIGHT + 0.12) pos.y = TABLE_HEIGHT + 0.12;
    const maxX = TABLE_LENGTH / 2 + 2.8;
    pos.x = THREE.MathUtils.clamp(pos.x, -maxX, maxX);

    this.camera.position.lerp(pos, Math.min(1, dt * 8));
    this.camera.lookAt(this.target);
  }
}
