import * as THREE from "three";
import { BALL_RADIUS, FOOT_SPOT, HEAD_STRING, NUMBER_COLORS } from "./constants.js";

function ballTexture(number, striped) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  const hex = "#" + (NUMBER_COLORS[number] || 0xcccccc).toString(16).padStart(6, "0");

  if (number === 0) {
    const grd = g.createRadialGradient(90, 80, 20, 128, 128, 140);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(1, "#d8d2c4");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  } else {
    g.fillStyle = striped ? "#f4f0e6" : hex;
    g.fillRect(0, 0, size, size);
    if (striped) {
      g.fillStyle = hex;
      g.fillRect(0, 78, size, 100);
    }
    g.fillStyle = "#f8f5ef";
    g.beginPath();
    g.arc(128, 128, 36, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1a1a1a";
    g.font = "bold 42px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(number), 128, 132);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createBallMesh(number) {
  const striped = number >= 9;
  const geo = new THREE.SphereGeometry(BALL_RADIUS, 32, 24);
  const mat = new THREE.MeshPhysicalMaterial({
    map: ballTexture(number, striped),
    roughness: 0.18,
    metalness: 0.05,
    clearcoat: 0.65,
    clearcoatRoughness: 0.12,
    reflectivity: 0.5,
  });
  if (number === 0) {
    mat.color = new THREE.Color(0xf7f4ea);
    mat.emissive = new THREE.Color(0x222018);
    mat.emissiveIntensity = 0.12;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.number = number;
  return mesh;
}

/** Empacota um triângulo compacto apontando para a bola branca (eixo -X). */
export function rackPositions(count, apexTowardCue = true) {
  const gap = BALL_RADIUS * 2.02;
  const rows = [];
  let left = count;
  let row = 1;
  while (left > 0) {
    const n = Math.min(row, left);
    rows.push(n);
    left -= n;
    row++;
  }
  const positions = [];
  let index = 0;
  for (let r = 0; r < rows.length; r++) {
    const n = rows[r];
    const z0 = -((n - 1) * gap) / 2;
    const x = apexTowardCue ? FOOT_SPOT + r * gap * Math.sin(Math.PI / 3) : FOOT_SPOT - r * gap * Math.sin(Math.PI / 3);
    for (let i = 0; i < n; i++) {
      positions.push({ index, x, z: z0 + i * gap, row: r, col: i });
      index++;
    }
  }
  return positions;
}

export function eightBallRackOrder() {
  // Ápice: 1. Centro do triângulo (linha 3, bola do meio): 8.
  // Cantos de trás: uma lisa e uma listrada.
  const order = new Array(15);
  const solids = [2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  shuffle(solids);
  shuffle(stripes);
  order[0] = 1;
  order[4] = 8; // terceira fileira, centro (índices 3,4,5)
  order[10] = solids.pop(); // canto traseiro
  order[14] = stripes.pop();
  const rest = [...solids, ...stripes];
  shuffle(rest);
  for (let i = 0; i < 15; i++) {
    if (order[i] == null) order[i] = rest.pop();
  }
  return order;
}

export function mixedRack(numbers) {
  const copy = [...numbers];
  shuffle(copy);
  return copy;
}

export function cueStart() {
  return { x: HEAD_STRING, z: 0 };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
