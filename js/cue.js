import * as THREE from "three";
import { BALL_RADIUS, TABLE_HEIGHT } from "./constants.js";

export class CueStick {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = "cue";

    const wood = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.45,
      metalness: 0.08,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3b2414, roughness: 0.4 });
    const wrap = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.7 });
    const tip = new THREE.MeshStandardMaterial({ color: 0xb8d4e8, roughness: 0.35 });
    const ferrule = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.3 });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.007, 1.35, 16), wood);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = -0.72;
    shaft.castShadow = true;
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.22, 16), dark);
    butt.rotation.z = Math.PI / 2;
    butt.position.x = -1.48;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 16), wrap);
    grip.rotation.z = Math.PI / 2;
    grip.position.x = -1.28;
    const fer = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.03, 12), ferrule);
    fer.rotation.z = Math.PI / 2;
    fer.position.x = -0.035;
    const tipMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0074, 12, 8), tip);
    tipMesh.position.x = -0.012;

    this.group.add(shaft, butt, grip, fer, tipMesh);
    this.group.visible = false;
    scene.add(this.group);

    this.aim = new THREE.Vector3(1, 0, 0);
    this.power = 0.35;
    this.pull = 0;
  }

  setAim(dir) {
    this.aim.copy(dir);
    this.aim.y = 0;
    if (this.aim.lengthSq() < 1e-6) this.aim.set(1, 0, 0);
    this.aim.normalize();
  }

  update(cuePos, aiming, power, pullAnim = 0) {
    this.power = power;
    this.group.visible = aiming;
    if (!aiming) return;
    const back = Math.max(0.005, BALL_RADIUS - 0.02 + pullAnim);
    const y = TABLE_HEIGHT + BALL_RADIUS * 0.85;
    this.group.position.set(
      cuePos.x - this.aim.x * back,
      y,
      cuePos.z - this.aim.z * back
    );
    this.group.rotation.set(0, Math.atan2(this.aim.x, this.aim.z) - Math.PI / 2, 0.04);
  }

}

export function createAimLine(scene) {
  const mat = new THREE.LineDashedMaterial({
    color: 0xf8f1d0,
    dashSize: 0.04,
    gapSize: 0.025,
    transparent: true,
    opacity: 0.75,
  });
  const line = new THREE.Line(new THREE.BufferGeometry(), mat);
  line.visible = false;
  scene.add(line);

  const objectLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 0.025,
      gapSize: 0.012,
      transparent: true,
      opacity: 0.95,
    })
  );
  objectLine.visible = false;
  scene.add(objectLine);

  const cueDeflectionLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({
      color: 0x70d6d0,
      dashSize: 0.035,
      gapSize: 0.02,
      transparent: true,
      opacity: 0.85,
    })
  );
  cueDeflectionLine.visible = false;
  scene.add(cueDeflectionLine);

  const contactMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.007, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xe32636, depthTest: false })
  );
  contactMarker.renderOrder = 2;
  contactMarker.visible = false;
  scene.add(contactMarker);

  const ghost = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS * 0.92, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })
  );
  ghost.visible = false;
  scene.add(ghost);

  return { line, objectLine, cueDeflectionLine, contactMarker, ghost };
}

export function updateAimLine(helpers, origin, dir, show, balls = [], bounds = null) {
  const { line, objectLine, cueDeflectionLine, contactMarker, ghost } = helpers;
  line.visible = show;
  objectLine.visible = show;
  cueDeflectionLine.visible = show;
  contactMarker.visible = false;
  ghost.visible = show;
  if (!show || !bounds) return;

  const paths = predictAimPaths(origin, dir, balls, bounds);
  setLinePoints(line, paths.cuePath);
  setLinePoints(objectLine, paths.objectPath);
  setLinePoints(cueDeflectionLine, paths.cueDeflectionPath);
  objectLine.visible = show && paths.objectPath.length > 1;
  cueDeflectionLine.visible = show && paths.cueDeflectionPath.length > 1;
  contactMarker.visible = show && Boolean(paths.targetSpot);
  if (paths.targetSpot) contactMarker.position.copy(paths.targetSpot);
  ghost.visible = show && Boolean(paths.contact);
  if (paths.contact) ghost.position.copy(paths.contact);
}

export function predictAimPaths(origin, direction, balls, bounds) {
  const dir = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  const halfLength = bounds.halfLength - BALL_RADIUS;
  const halfWidth = bounds.halfWidth - BALL_RADIUS;
  const findExit = (point, vector) => {
    let distance = Infinity;
    if (vector.x > 1e-8) distance = Math.min(distance, (halfLength - point.x) / vector.x);
    else if (vector.x < -1e-8) distance = Math.min(distance, (-halfLength - point.x) / vector.x);
    if (vector.z > 1e-8) distance = Math.min(distance, (halfWidth - point.z) / vector.z);
    else if (vector.z < -1e-8) distance = Math.min(distance, (-halfWidth - point.z) / vector.z);
    return Math.max(0, Number.isFinite(distance) ? distance : 0);
  };
  const atDistance = (point, vector, distance) =>
    new THREE.Vector3(point.x + vector.x * distance, TABLE_HEIGHT + 0.004, point.z + vector.z * distance);
  const start = new THREE.Vector3(origin.x, TABLE_HEIGHT + 0.004, origin.z);
  let firstHit = null;
  const diameter = BALL_RADIUS * 2;
  const diameterSquared = diameter * diameter;

  for (const ball of balls) {
    if (ball.number === 0) continue;
    const relX = ball.x - start.x;
    const relZ = ball.z - start.z;
    const projection = relX * dir.x + relZ * dir.z;
    if (projection <= 0) continue;
    const perpendicularSquared = relX * relX + relZ * relZ - projection * projection;
    if (perpendicularSquared >= diameterSquared) continue;
    const distance = projection - Math.sqrt(diameterSquared - perpendicularSquared);
    if (distance >= 0 && (!firstHit || distance < firstHit.distance)) {
      firstHit = { ball, distance };
    }
  }

  const endDistance = findExit(start, dir);
  if (!firstHit || firstHit.distance > endDistance) {
    return {
      cuePath: [start, atDistance(start, dir, endDistance)],
      objectPath: [],
      cueDeflectionPath: [],
      contact: null,
      targetSpot: null,
    };
  }

  const impact = atDistance(start, dir, firstHit.distance);
  const target = new THREE.Vector3(firstHit.ball.x, TABLE_HEIGHT + 0.004, firstHit.ball.z);
  const objectDirection = new THREE.Vector3(target.x - impact.x, 0, target.z - impact.z).normalize();
  const incomingNormal = new THREE.Vector3(impact.x - target.x, 0, impact.z - target.z).normalize();
  const visibleHeight = 0.72;
  const visibleHorizontal = Math.sqrt(1 - visibleHeight * visibleHeight);
  const targetSpot = new THREE.Vector3(
    target.x + incomingNormal.x * BALL_RADIUS * visibleHorizontal,
    TABLE_HEIGHT + BALL_RADIUS + BALL_RADIUS * visibleHeight,
    target.z + incomingNormal.z * BALL_RADIUS * visibleHorizontal
  );
  const objectEnd = atDistance(target, objectDirection, findExit(target, objectDirection));
  const cueDirection = dir.clone().addScaledVector(objectDirection, -dir.dot(objectDirection));
  const cueDeflectionPath = [];
  if (cueDirection.lengthSq() > 0.001) {
    cueDirection.normalize();
    cueDeflectionPath.push(impact, atDistance(impact, cueDirection, findExit(impact, cueDirection)));
  }

  return {
    cuePath: [start, impact],
    objectPath: [target, objectEnd],
    cueDeflectionPath,
    contact: impact,
    targetSpot,
  };
}

function setLinePoints(line, points) {
  line.geometry.setFromPoints(points);
  if (line.material.isLineDashedMaterial && points.length > 1) line.computeLineDistances();
}
