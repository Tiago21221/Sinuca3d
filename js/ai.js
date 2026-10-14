import * as THREE from "three";
import { BALL_RADIUS, POCKET_RADIUS } from "./constants.js";
import { pocketPositions } from "./table.js";

/**
 * IA geométrica: método da bola fantasma. Não altera o resultado da física.
 */
export function pickShot(difficulty, cue, balls, validNumbers, powerHint = 0.55) {
  const pockets = pocketPositions();
  const candidates = [];

  for (const ball of balls) {
    if (!validNumbers.has(ball.number)) continue;
    for (const pocket of pockets) {
      const toPocket = new THREE.Vector3(pocket.x - ball.x, 0, pocket.z - ball.z);
      const distP = toPocket.length();
      if (distP < 0.05) continue;
      toPocket.normalize();
      const ghost = new THREE.Vector3(ball.x, 0, ball.z).addScaledVector(toPocket, -BALL_RADIUS * 2);
      const toGhost = new THREE.Vector3(ghost.x - cue.x, 0, ghost.z - cue.z);
      const distG = toGhost.length();
      if (distG < 0.04) continue;
      toGhost.normalize();

      const cut = Math.abs(toGhost.dot(toPocket));
      if (cut < 0.22) continue;
      if (!pathClear(cue, ghost, balls, [0, ball.number], BALL_RADIUS * 2.05)) continue;
      if (!pathClear(ball, { x: pocket.x, z: pocket.z }, balls, [0, ball.number], BALL_RADIUS * 1.4)) continue;

      const pocketR = pocket.side ? POCKET_RADIUS * 0.85 : POCKET_RADIUS;
      const score =
        cut * 1.4 +
        (1 / (distG + 0.2)) * 0.6 +
        (1 / (distP + 0.2)) * 0.5 +
        pocketR * 2 -
        Math.abs(ghost.z) * 0.05;

      const power = THREE.MathUtils.clamp(0.28 + distG * 0.18 + distP * 0.12, 0.28, 0.92);
      candidates.push({
        dir: toGhost.clone(),
        power,
        score,
        target: ball.number,
      });
    }
  }

  if (!candidates.length) {
    const fallback = balls.find((b) => validNumbers.has(b.number)) || balls.find((b) => b.number !== 0);
    if (!fallback) {
      return { dir: new THREE.Vector3(1, 0, 0), power: 0.4 };
    }
    const dir = new THREE.Vector3(fallback.x - cue.x, 0, fallback.z - cue.z).normalize();
    return jitter({ dir, power: powerHint }, difficulty, true);
  }

  candidates.sort((a, b) => b.score - a.score);
  let chosen;
  if (difficulty === "easy") {
    chosen = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
  } else if (difficulty === "medium") {
    chosen = candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];
  } else {
    chosen = candidates[0];
    if (candidates[1] && candidates[1].score > chosen.score * 0.92 && Math.random() < 0.25) {
      chosen = candidates[1];
    }
  }
  return jitter(chosen, difficulty, false);
}

function jitter(shot, difficulty, desperate) {
  const spread =
    difficulty === "easy" ? 0.22 : difficulty === "medium" ? 0.08 : desperate ? 0.05 : 0.02;
  const a = Math.atan2(shot.dir.x, shot.dir.z) + (Math.random() * 2 - 1) * spread;
  const powerJitter = difficulty === "easy" ? 0.18 : difficulty === "medium" ? 0.08 : 0.03;
  const power = THREE.MathUtils.clamp(shot.power + (Math.random() * 2 - 1) * powerJitter, 0.2, 1);
  return {
    dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
    power,
  };
}

function pathClear(from, to, balls, ignore, width) {
  const ax = from.x;
  const az = from.z;
  const bx = to.x;
  const bz = to.z;
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const nx = dx / len;
  const nz = dz / len;
  for (const b of balls) {
    if (ignore.includes(b.number)) continue;
    const px = b.x - ax;
    const pz = b.z - az;
    const t = px * nx + pz * nz;
    if (t < -BALL_RADIUS || t > len + BALL_RADIUS) continue;
    const closestX = ax + nx * Math.max(0, Math.min(len, t));
    const closestZ = az + nz * Math.max(0, Math.min(len, t));
    if (Math.hypot(b.x - closestX, b.z - closestZ) < width) return false;
  }
  return true;
}

export function validSetForAi(modeState) {
  const p = modeState.currentPlayer;
  if (modeState.id === "even-odd") {
    const g = modeState.playerGroups[p];
    return new Set(modeState.remaining[g]);
  }
  if (modeState.id === "bolinho") {
    const open = modeState.objectBalls.filter((n) => n !== 8);
    if (open.length) return new Set(open);
    return new Set([8]);
  }
  if (modeState.id === "three-balls") return new Set(modeState.objectBalls);
  if (modeState.id === "eight-ball") {
    if (!modeState.groupsAssigned) return new Set([...modeState.solids, ...modeState.stripes]);
    const g = modeState.playerGroups[p];
    const mine = g === "solids" ? modeState.solids : modeState.stripes;
    if (mine.length === 0) return new Set([8]);
    return new Set(mine);
  }
  return new Set();
}
