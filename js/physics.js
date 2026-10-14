import * as CANNON from "cannon-es";
import {
  BALL_MASS,
  BALL_RADIUS,
  BALL_POCKET_APPROACH_MARGIN,
  BALL_CORNER_POCKET_APPROACH_MARGIN,
  BALL_CORNER_POCKET_GAP_WIDTH,
  CUSHION_HEIGHT,
  CUSHION_THICKNESS,
  END_CUSHION_INSET,
  SIDE_CUSHION_INSET,
  FIXED_DT,
  MAX_SUBSTEPS,
  POCKET_RADIUS,
  RAIL_HEIGHT,
  SIDE_POCKET_RADIUS,
  SLEEP_SPEED,
  TABLE_HEIGHT,
} from "./constants.js";
import {
  getTableGeometryRevision,
  getPlaySurfaceBounds,
  getTableSurfaceBounds,
  pocketPositions,
} from "./table.js";

const BALL_MATERIAL = new CANNON.Material("ball");
const CLOTH_MATERIAL = new CANNON.Material("cloth");
const CUSHION_MATERIAL = new CANNON.Material("cushion");

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.2;
    this.world.defaultContactMaterial.restitution = 0.5;

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(BALL_MATERIAL, BALL_MATERIAL, {
        friction: 0.04,
        restitution: 0.94,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(BALL_MATERIAL, CLOTH_MATERIAL, {
        friction: 0.22,
        restitution: 0.02,
        contactEquationStiffness: 1e7,
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(BALL_MATERIAL, CUSHION_MATERIAL, {
        friction: 0.12,
        restitution: 0.72,
        contactEquationStiffness: 1e7,
      })
    );

    this.bodies = new Map();
    this.surfaceBounds = getTableSurfaceBounds();
    this.pocketCenters = pocketPositions();
    this.tableBodies = [];
    this.tableGeometryRevision = getTableGeometryRevision();
    this.accumulator = 0;
    this.events = [];
    this.railSpinContacts = [];
    this.firstContact = null;
    this.railAfterContact = false;
    this.anyHit = false;
    this.cushionContacts = new Set();
    this._setupTable();
    this._listen();
  }

  _setupTable() {
    for (const body of this.tableBodies) this.world.removeBody(body);
    this.tableBodies = [];

    const bounds = getTableSurfaceBounds();
    this.surfaceBounds = bounds;
    const cloth = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: CLOTH_MATERIAL,
      shape: new CANNON.Box(new CANNON.Vec3(bounds.halfLength, 0.04, bounds.halfWidth)),
    });
    cloth.position.set(0, TABLE_HEIGHT - 0.04, 0);
    this.world.addBody(cloth);
    this.tableBodies.push(cloth);

    const L = bounds.halfLength;
    const W = bounds.halfWidth;
    const h = CUSHION_HEIGHT / 2;
    const y = TABLE_HEIGHT + h;
    const thick = CUSHION_THICKNESS;

    const addCushion = (sx, sz, x, z, tag) => {
      const body = new CANNON.Body({
        type: CANNON.Body.STATIC,
        material: CUSHION_MATERIAL,
        shape: new CANNON.Box(new CANNON.Vec3(sx, h, sz)),
      });
      body.position.set(x, y, z);
      body.userData = { kind: "cushion", tag };
      this.world.addBody(body);
      this.tableBodies.push(body);
    };

    const gapWidth = BALL_RADIUS * 2 + 0.012;
    const pocketTolerance = 0.18;
    const pockets = pocketPositions();

    const addRailSegments = (axis, edge, start, end, tag) => {
      const railPosition = edge + Math.sign(edge) * thick / 2;
      const edgePockets = pockets
        .filter((p) => Math.abs(Math.abs(axis === "x" ? p.x : p.z) - Math.abs(edge)) <= pocketTolerance)
        .map((p) => {
          const center = axis === "x" ? p.z : p.x;
          const pocketGapWidth = p.corner ? BALL_CORNER_POCKET_GAP_WIDTH : gapWidth;
          return [
            Math.max(start, center - pocketGapWidth / 2),
            Math.min(end, center + pocketGapWidth / 2),
          ];
        })
        .filter(([from, to]) => to > from)
        .sort((a, b) => a[0] - b[0]);

      let cursor = start;
      for (const [from, to] of edgePockets) {
        if (from > cursor) {
          const length = from - cursor;
          const center = (cursor + from) / 2;
          if (axis === "x") {
            addCushion(thick / 2, length / 2, railPosition, center, tag);
          } else {
            addCushion(length / 2, thick / 2, center, railPosition, tag);
          }
        }
        cursor = Math.max(cursor, to);
      }
      if (cursor < end) {
        const length = end - cursor;
        const center = (cursor + end) / 2;
        if (axis === "x") {
          addCushion(thick / 2, length / 2, railPosition, center, tag);
        } else {
          addCushion(length / 2, thick / 2, center, railPosition, tag);
        }
      }
    };

    for (const z of [-W + SIDE_CUSHION_INSET, W - SIDE_CUSHION_INSET]) {
      addRailSegments("z", z, -L, L, z < 0 ? "long-south" : "long-north");
    }
    for (const x of [-L + END_CUSHION_INSET, L - END_CUSHION_INSET]) {
      addRailSegments("x", x, -W, W, x < 0 ? "end-west" : "end-east");
    }

    void RAIL_HEIGHT;
  }

  _syncTableGeometry() {
    const revision = getTableGeometryRevision();
    if (revision === this.tableGeometryRevision) return;
    this.pocketCenters = pocketPositions();
    this._setupTable();
    this.tableGeometryRevision = revision;
  }

  _listen() {
    this.world.addEventListener("beginContact", (e) => {
      const a = e.bodyA;
      const b = e.bodyB;
      const na = a.userData?.number;
      const nb = b.userData?.number;
      const ca = a.userData?.kind;
      const cb = b.userData?.kind;

      if (typeof na === "number" && typeof nb === "number") {
        const impulse = relativeSpeed(a, b);
        this.events.push({ type: "ball", impulse, a: na, b: nb });
        this.anyHit = true;
        if (this.firstContact == null) {
          if (na === 0) this.firstContact = nb;
          else if (nb === 0) this.firstContact = na;
        }
      }

      const ballCushion =
        (typeof na === "number" && cb === "cushion") || (typeof nb === "number" && ca === "cushion");
      if (ballCushion) {
        const ball = typeof na === "number" ? a : b;
        const cushion = typeof na === "number" ? b : a;
        const impulse = ball.velocity.length();
        this.events.push({ type: "cushion", impulse, number: ball.userData.number });
        this.railSpinContacts.push({ ball, tag: cushion.userData.tag });
        if (this.anyHit || this.firstContact != null) this.railAfterContact = true;
        else this.cushionContacts.add(ball.userData.number);
      }
    });
  }

  addBall(number, x, z) {
    const body = new CANNON.Body({
      mass: BALL_MASS,
      material: BALL_MATERIAL,
      shape: new CANNON.Sphere(BALL_RADIUS),
      linearDamping: 0.28,
      angularDamping: 0.28,
      allowSleep: true,
      sleepSpeedLimit: SLEEP_SPEED,
      sleepTimeLimit: 0.25,
    });
    body.position.set(x, TABLE_HEIGHT + BALL_RADIUS, z);
    body.userData = { number, kind: "ball" };
    this.world.addBody(body);
    this.bodies.set(number, body);
    return body;
  }

  removeBall(number) {
    const body = this.bodies.get(number);
    if (!body) return;
    this.world.removeBody(body);
    this.bodies.delete(number);
  }

  resetShotTracking() {
    this.firstContact = null;
    this.railAfterContact = false;
    this.anyHit = false;
    this.cushionContacts.clear();
    this.events = [];
  }

  strikeCue(direction, speed, spin = { x: 0, y: 0 }) {
    const cue = this.bodies.get(0);
    if (!cue) return;
    cue.wakeUp();
    const dir = direction.clone();
    dir.y = 0;
    dir.normalize();
    cue.velocity.set(dir.x * speed, 0, dir.z * speed);
    const rollingSpin = speed / BALL_RADIUS * (1 + clampValue(spin.y, -1, 1) * 1.5);
    cue.angularVelocity.set(
      -dir.z * rollingSpin,
      clampValue(spin.x, -1, 1) * speed / BALL_RADIUS * 0.8,
      dir.x * rollingSpin
    );
  }

  placeCue(x, z) {
    const cue = this.bodies.get(0);
    if (!cue) return;
    cue.velocity.setZero();
    cue.angularVelocity.setZero();
    cue.position.set(x, TABLE_HEIGHT + BALL_RADIUS, z);
    cue.wakeUp();
  }

  overlaps(x, z, ignore = 0) {
    for (const [n, body] of this.bodies) {
      if (n === ignore) continue;
      const dx = body.position.x - x;
      const dz = body.position.z - z;
      if (dx * dx + dz * dz < (BALL_RADIUS * 2.15) ** 2) return true;
    }
    return false;
  }

  step(dt) {
    this._syncTableGeometry();
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.railSpinContacts.length = 0;
      this.world.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
      this._applyRailSpin();
      this._nudgeSeparation();
      this._clampBallsToCloth();
    }
    if (this.accumulator > FIXED_DT * MAX_SUBSTEPS) this.accumulator = 0;
    return this.consumeEvents();
  }

  _clampBallsToCloth() {
    const bounds = getPlaySurfaceBounds();
    const limitX = bounds.halfLength - BALL_RADIUS + CUSHION_THICKNESS / 2;
    const limitZ = bounds.halfWidth - BALL_RADIUS + CUSHION_THICKNESS / 2;
    const pockets = this.pocketCenters;

    for (const body of this.world.bodies) {
      if (body.userData?.kind !== "ball") continue;

      const nearPocket = pockets.some((p) => {
        const approachRadius = BALL_RADIUS
          + (p.corner
            ? BALL_CORNER_POCKET_APPROACH_MARGIN
            : BALL_POCKET_APPROACH_MARGIN);
        return isWithinPocketApproach(
          body.position.x,
          body.position.z,
          p,
          limitX,
          limitZ,
          approachRadius
        );
      });
      if (nearPocket) continue;

      if (Math.abs(body.position.x) > limitX) {
        body.position.x = Math.sign(body.position.x) * limitX;
        body.velocity.x = 0;
        body.aabbNeedsUpdate = true;
      }
      if (Math.abs(body.position.z) > limitZ) {
        body.position.z = Math.sign(body.position.z) * limitZ;
        body.velocity.z = 0;
        body.aabbNeedsUpdate = true;
      }
    }
  }

  _applyRailSpin() {
    for (const { ball, tag } of this.railSpinContacts) {
      const spin = ball.angularVelocity.y;
      if (Math.abs(spin) < 0.05) continue;
      const axis = tag.startsWith("long-") ? "x" : "z";
      const direction = axis === "x" ? 1 : -1;
      ball.velocity[axis] += direction * spin * BALL_RADIUS * 0.65;
    }
  }

  _nudgeSeparation() {
    const list = [...this.bodies.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const dist = Math.hypot(dx, dz);
        const min = BALL_RADIUS * 2 - 0.0004;
        if (dist > 0 && dist < min) {
          const nx = dx / dist;
          const nz = dz / dist;
          const push = (min - dist) / 2;
          a.position.x -= nx * push;
          a.position.z -= nz * push;
          b.position.x += nx * push;
          b.position.z += nz * push;
          a.aabbNeedsUpdate = true;
          b.aabbNeedsUpdate = true;
        }
      }
    }
  }

  consumeEvents() {
    const ev = this.events;
    this.events = [];
    if (!this.railAfterContact && this.anyHit && this.cushionContacts.size) {
      this.railAfterContact = true;
    }
    return ev;
  }

  ballsAtRest() {
    for (const body of this.bodies.values()) {
      if (body.sleepState === CANNON.Body.SLEEPING) continue;
      const v = body.velocity.length();
      const w = body.angularVelocity.length();
      if (v > SLEEP_SPEED || w > 0.35) return false;
    }
    return true;
  }

  forceSleepAll() {
    for (const body of this.bodies.values()) {
      if (body.velocity.length() < SLEEP_SPEED * 2) {
        body.velocity.setZero();
        body.angularVelocity.setZero();
        body.sleep();
      }
    }
  }

  pocketHits() {
    const hits = [];
    for (const [n, body] of this.bodies) {
      const y = body.position.y;
      for (const p of this.pocketCenters) {
        const dx = body.position.x - p.x;
        const dz = body.position.z - p.z;
        const r = p.side ? SIDE_POCKET_RADIUS : POCKET_RADIUS;
        const ballRadiusFactor = p.corner ? 0.5 : 0.6;
        const pocketRadius = Math.min(BALL_RADIUS * ballRadiusFactor, r * 0.3);
        const movingIntoCorner =
          !p.corner ||
          (body.velocity.x * Math.sign(p.x) > 0 &&
            body.velocity.z * Math.sign(p.z) > 0);
        if (
          dx * dx + dz * dz < pocketRadius * pocketRadius &&
          movingIntoCorner &&
          y < TABLE_HEIGHT + BALL_RADIUS * 1.6
        ) {
          hits.push(n);
          break;
        }
      }
      if (!hits.includes(n) && y < TABLE_HEIGHT - 0.02) hits.push(n);
    }
    return hits;
  }

  snapshotShot() {
    return {
      firstContact: this.firstContact,
      railAfterContact: this.railAfterContact,
      anyHit: this.anyHit,
    };
  }
}

function relativeSpeed(a, b) {
  const vx = a.velocity.x - b.velocity.x;
  const vy = a.velocity.y - b.velocity.y;
  const vz = a.velocity.z - b.velocity.z;
  return Math.hypot(vx, vy, vz);
}

function isWithinPocketApproach(x, z, pocket, limitX, limitZ, radius) {
  const startX = clampValue(pocket.x, -limitX, limitX);
  const startZ = clampValue(pocket.z, -limitZ, limitZ);
  const pathX = pocket.x - startX;
  const pathZ = pocket.z - startZ;
  const lengthSquared = pathX * pathX + pathZ * pathZ;

  if (lengthSquared === 0) {
    return (x - pocket.x) ** 2 + (z - pocket.z) ** 2 < radius * radius;
  }

  const t = clampValue(
    ((x - startX) * pathX + (z - startZ) * pathZ) / lengthSquared,
    0,
    1
  );
  const dx = x - (startX + t * pathX);
  const dz = z - (startZ + t * pathZ);
  return dx * dx + dz * dz < radius * radius;
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
