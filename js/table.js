import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  BALL_CORNER_POCKET_GAP_WIDTH,
  BALL_RADIUS,
  END_CUSHION_INSET,
  SIDE_CUSHION_INSET,
  LEG_HEIGHT, LEG_SIZE, CUSHION_HEIGHT, CUSHION_THICKNESS,
  POCKET_RADIUS, RAIL_HEIGHT, RAIL_WIDTH, SIDE_POCKET_RADIUS,
  TABLE_HEIGHT, TABLE_LENGTH, TABLE_WIDTH,
} from "./constants.js";

/* ============================================================
 * MESA DE SINUCA DE BAR — CAÇAPAS APERTADAS
 * ============================================================ */

export const BALL_DIAMETER = 0.054;

// Mesa de bar: bocas propositalmente justas, mas ainda jogáveis com a bola.
export const CORNER_MOUTH = BALL_DIAMETER * 1.09;
export const SIDE_MOUTH = BALL_DIAMETER * 1.14;

const CORNER_THROAT = CORNER_MOUTH * 1.35;
const SIDE_THROAT = SIDE_MOUTH * 1.45;

const POCKET_DEPTH = 0.16;
const BAG_DEPTH = 0.24;

const CORNER_CUSHION_ANGLE = 142;
const SIDE_CUSHION_ANGLE = 150;

let tablePocketOverride = null;
let tableGeometryRevision = 0;
let tableSurfaceBounds = {
  length: TABLE_LENGTH,
  width: TABLE_WIDTH,
};
let playSurfaceBounds = {
  length: TABLE_LENGTH - END_CUSHION_INSET * 2,
  width: TABLE_WIDTH - SIDE_CUSHION_INSET * 2,
};
let onSurfaceBoundsChanged = null;

export function setSurfaceBoundsListener(listener) {
  onSurfaceBoundsChanged = listener;
}

export function getTableSurfaceBounds() {
  return {
    length: tableSurfaceBounds.length,
    width: tableSurfaceBounds.width,
    halfLength: tableSurfaceBounds.length / 2,
    halfWidth: tableSurfaceBounds.width / 2,
  };
}

export function getPlaySurfaceBounds() {
  return {
    halfLength: playSurfaceBounds.length / 2,
    halfWidth: playSurfaceBounds.width / 2,
  };
}

export function getTableGeometryRevision() {
  return tableGeometryRevision;
}

export function pocketPositions() {
  if (tablePocketOverride) return tablePocketOverride.map((p) => ({ ...p }));

  const x = TABLE_LENGTH / 2;
  const z = TABLE_WIDTH / 2;

  return [
    { x: -x, z: -z, side: false, corner: true, id: "corner_nw" },
    { x: -x, z, side: false, corner: true, id: "corner_sw" },
    { x, z: -z, side: false, corner: true, id: "corner_ne" },
    { x, z, side: false, corner: true, id: "corner_se" },
    { x: 0, z: -z, side: true, corner: false, id: "side_north" },
    { x: 0, z, side: true, corner: false, id: "side_south" },
  ];
}

/* ---------- helpers ---------- */

function mat(color, roughness = 0.7, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    ...extra,
  });
}

function box(parent, name, size, pos, material) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    material
  );

  mesh.name = name;
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  return mesh;
}

function cylinder(parent, name, radiusTop, radiusBottom, height, pos, material, segments = 20) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material
  );
  mesh.name = name;
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function visibleGroup(parent, name) {
  const g = new THREE.Group();
  g.name = name;
  parent.add(g);
  return g;
}

function invisibleGroup(parent, name) {
  const g = new THREE.Group();
  g.name = name;
  g.visible = false;
  parent.add(g);
  return g;
}

function wallSegments(axis, edge, start, end, pockets) {
  const gaps = pockets
    .filter((pocket) => Math.abs(Math.abs(axis === "x" ? pocket.x : pocket.z) - Math.abs(edge)) <= 0.18)
    .map((pocket) => {
      const center = axis === "x" ? pocket.z : pocket.x;
      const gapWidth = pocket.corner
        ? BALL_CORNER_POCKET_GAP_WIDTH
        : BALL_RADIUS * 2 + 0.012;
      return [
        Math.max(start, center - gapWidth / 2),
        Math.min(end, center + gapWidth / 2),
      ];
    })
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);

  const segments = [];
  let cursor = start;
  for (const [from, to] of gaps) {
    if (from > cursor) segments.push([cursor, from]);
    cursor = Math.max(cursor, to);
  }
  if (cursor < end) segments.push([cursor, end]);
  return segments;
}

function collider(parent, name, size, pos) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial({ visible: false })
  );

  mesh.name = name;
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.userData.isCollider = true;
  parent.add(mesh);

  return mesh;
}

function loadTableModel(root, fallbackGroups) {
  // MTL e imagens ficam em public para que os caminhos relativos das texturas
  // continuem válidos tanto no desenvolvimento quanto no build.
  const materialUrl = `${import.meta.env.BASE_URL}models/billiard-table/Billiard+Table.mtl`;
  const modelUrl = new URL("../assets/models/billiard-table/Billiard+Table.obj", import.meta.url).href;

  const materialLoader = new MTLLoader();

  materialLoader.load(materialUrl, (materials) => {
    materials.preload();
    const loader = new OBJLoader();
    loader.setMaterials(materials);
    loader.load(modelUrl, (model) => {
      model.name = "table_visual";

      // O OBJ foi exportado com Z como altura. Converte para o eixo Y do jogo.
      model.rotation.x = -Math.PI / 2;
      model.updateMatrixWorld(true);

      const unwanted = [];
      const decorativeBallBottoms = [];

      model.traverse((child) => {
        // obj8–obj23: bolas decorativas; obj24–obj25: tacos sobre a mesa.
        if (/^obj(?:[89]|1[0-9]|2[0-3])$/.test(child.name)) {
          decorativeBallBottoms.push(
            new THREE.Box3().setFromObject(child).min.y
          );
          unwanted.push(child);
          return;
        }

        if (/^obj(?:2[45])$/.test(child.name)) {
          unwanted.push(child);
          return;
        }

        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // O arquivo também traz bolas decorativas; o jogo cria as próprias.
          if (/sphere|ball/i.test(child.name)) child.visible = false;
        }
      });

      unwanted.forEach((child) => child.removeFromParent());

      const size = new THREE.Vector3();
      const modelBounds = new THREE.Box3().setFromObject(model);
      modelBounds.getSize(size);

      // O OBJ inclui o gabinete e as bordas. Escalá-lo pela área de jogo
      // encolhia a mesa e desalinhava suas caçapas das caçapas físicas.
      const visualOuterLength = TABLE_LENGTH + Math.max(RAIL_WIDTH, 0.12) * 2;
      const visualOuterWidth = TABLE_WIDTH + Math.max(RAIL_WIDTH, 0.12) * 2;
      const desiredScale = Math.min(
        visualOuterLength / Math.max(size.x, 0.001),
        visualOuterWidth / Math.max(size.z, 0.001)
      );

      model.scale.setScalar(desiredScale);
      model.updateMatrixWorld(true);

      const surface = model.getObjectByName("superfice_da_mesa") || model.getObjectByName("Tabela") || model;
      const surfaceBox = new THREE.Box3().setFromObject(surface);
      const surfaceTop = surfaceBox.max.y;
      const modelBoxAfterScale = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      modelBoxAfterScale.getCenter(center);

      playSurfaceBounds = {
        length: TABLE_LENGTH - END_CUSHION_INSET * 2,
        width: TABLE_WIDTH - SIDE_CUSHION_INSET * 2,
      };
      const nextBounds = {
        length: TABLE_LENGTH,
        width: TABLE_WIDTH,
      };
      tableSurfaceBounds = nextBounds;
      if (onSurfaceBoundsChanged) onSurfaceBoundsChanged(nextBounds);

      // A base das bolas decorativas marca exatamente o plano do pano.
      // Assim, as bolas físicas ficam apoiadas visualmente na mesa.
      const clothTop = decorativeBallBottoms.length
        ? Math.min(...decorativeBallBottoms) * desiredScale
        : surfaceTop;

      model.position.set(-center.x, TABLE_HEIGHT - clothTop, -center.z);
      model.rotation.y = 0;

      root.add(model);
      root.updateMatrixWorld(true);

      const pocketNames = ["cacapa1", "cacapa2", "cacapa3", "cacapa4", "cacapa5", "cacapa6"];
      const modelPockets = pocketNames.map((name, index) => {
        const mesh = model.getObjectByName(name);
        if (!mesh) return null;
        if (!mesh) {
          throw new Error(`Mesh da caçapa "${name}" não encontrado no modelo da mesa.`);
        }
        const pos = new THREE.Vector3();
        mesh.getWorldPosition(pos);

        const side = index === 1 || index === 4;
        return {
          x: pos.x,
          z: pos.z,
          side,
          corner: !side,
          id: name,
        };
      });
      tablePocketOverride = modelPockets.length && modelPockets.every(Boolean)
        ? modelPockets
        : null;
      tableGeometryRevision++;

      fallbackGroups.forEach((group) => {
        group.visible = false;
      });
    }, undefined, () => {
      fallbackGroups.forEach((group) => {
        group.visible = true;
      });
    });
  }, undefined, () => {
    fallbackGroups.forEach((group) => {
      group.visible = true;
    });
  });
}

/* Segmento extrudado para as borrachas. */
function cushionSegment(parent, name, points2D, height, thickness, material) {
  const shape = new THREE.Shape();

  shape.moveTo(points2D[0][0], points2D[0][1]);

  for (let i = 1; i < points2D.length; i++) {
    shape.lineTo(points2D[i][0], points2D[i][1]);
  }

  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 2,
  });

  geo.rotateX(-Math.PI / 2);
  geo.translate(0, height, 0);

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  parent.add(mesh);

  return mesh;
}

/* ============================================================
 * CRIAÇÃO DA MESA
 * ============================================================ */

export function createTable(scene) {
  const root = new THREE.Group();
  root.name = "table";

  const L = TABLE_LENGTH;
  const W = TABLE_WIDTH;
  const rail = Math.max(RAIL_WIDTH, 0.12);
  const railH = Math.max(RAIL_HEIGHT, 0.09);
  const topY = TABLE_HEIGHT;

  const outerL = L + rail * 2;
  const outerW = W + rail * 2;

  /* ---------- grupos ---------- */

  const gStructure = visibleGroup(root, "table_structure");
  const gBed = visibleGroup(root, "table_bed");
  const gCloth = visibleGroup(root, "table_cloth");
  const gCushions = visibleGroup(root, "table_cushions");
  const gCollisionWallHighlights = invisibleGroup(root, "collision_wall_highlights");
  const gPockets = visibleGroup(root, "table_pockets");
  const gBags = visibleGroup(root, "table_pocket_bags");
  const gLegs = visibleGroup(root, "table_legs");

  const gColliders = invisibleGroup(root, "table_colliders");
  const gCushionColliders = invisibleGroup(
    gColliders,
    "cushion_colliders"
  );
  const gPocketColliders = invisibleGroup(
    gColliders,
    "pocket_colliders"
  );
  const gBedCollider = invisibleGroup(
    gColliders,
    "bed_collider"
  );

  /* ---------- materiais ---------- */

  const wood = mat(0x5b2d14, 0.38, 0.02);
  const darkWood = mat(0x241108, 0.44, 0.0);
  const woodTrim = mat(0x120904, 0.3, 0.02);
  const felt = mat(0x075c31, 0.91, 0.0);
  const rubber = mat(0x0b0b0b, 0.85, 0.0);
  const pocketIn = mat(0x020302, 1.0, 0.0);
  const bagMat = mat(0x050505, 0.95, 0.0);
  const metal = mat(0xb8b2a6, 0.35, 0.75);
  const brass = mat(0x9a6c24, 0.28, 0.72);
  const leather = mat(0x30150a, 0.58, 0.0);

  /* ============================================================
   * 1. ESTRUTURA EXTERNA
   * ============================================================ */

  box(
    gStructure,
    "table_body",
    { x: outerL, y: 0.22, z: outerW },
    { x: 0, y: topY - 0.12, z: 0 },
    darkWood
  );

  box(
    gStructure,
    "wood_apron",
    { x: outerL * 0.985, y: 0.18, z: outerW * 0.985 },
    { x: 0, y: topY - 0.23, z: 0 },
    wood
  );

  box(
    gStructure,
    "lower_apron_trim",
    { x: outerL * 0.985, y: 0.035, z: outerW * 0.985 },
    { x: 0, y: topY - 0.325, z: 0 },
    woodTrim
  );

  // Frisos em camadas dão ao gabinete a presença de uma mesa comercial.
  for (const yOffset of [-0.075, -0.275]) {
    box(gStructure, "cabinet_brass_inlay", { x: outerL * 0.94, y: 0.012, z: 0.018 },
      { x: 0, y: topY + yOffset, z: outerW / 2 + 0.002 }, brass);
    box(gStructure, "cabinet_brass_inlay", { x: outerL * 0.94, y: 0.012, z: 0.018 },
      { x: 0, y: topY + yOffset, z: -outerW / 2 - 0.002 }, brass);
  }

  for (const side of [-1, 1]) {
    box(gStructure, "cabinet_end_cap", { x: 0.032, y: 0.19, z: outerW * 0.76 },
      { x: side * (outerL / 2 + 0.004), y: topY - 0.21, z: 0 }, woodTrim);
  }

  /* Parafusos decorativos. */

  const screwGeo = new THREE.CylinderGeometry(
    0.008, 0.008, 0.006, 10
  );

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const s = new THREE.Mesh(screwGeo, metal);

      s.name = "apron_screw";
      s.rotation.x = Math.PI / 2;

      s.position.set(
        sx * (outerL * 0.42),
        topY - 0.23,
        sz * (outerW * 0.5 + 0.002)
      );

      gStructure.add(s);
    }
  }

  /* ============================================================
   * 2. TAMPO
   * ============================================================ */

  box(
    gBed,
    "table_bed",
    { x: L, y: 0.05, z: W },
    { x: 0, y: topY - 0.025, z: 0 },
    darkWood
  );

  collider(
    gBedCollider,
    "bed_collider",
    { x: L, y: 0.05, z: W },
    { x: 0, y: topY - 0.025, z: 0 }
  );

  /* ============================================================
   * 3. TECIDO
   * ============================================================ */

  box(
    gCloth,
    "playing_cloth",
    { x: L, y: 0.012, z: W },
    { x: 0, y: topY - 0.006, z: 0 },
    felt
  );

  /* ============================================================
   * 4. BORRACHAS
   * ============================================================ */

  const cHeight = Math.max(CUSHION_HEIGHT, 0.04);
  const cThick = Math.max(CUSHION_THICKNESS, 0.04);

  const halfL = L / 2;
  const halfW = W / 2;

  const cornerHalfX = Math.max(CORNER_MOUTH, BALL_CORNER_POCKET_GAP_WIDTH) * 0.5;
  const cornerHalfZ = Math.max(CORNER_MOUTH, BALL_CORNER_POCKET_GAP_WIDTH) * 0.5;
  const sideHalfX = SIDE_MOUTH * 0.5;

  /* Bordas longas. */

  for (const side of [-1, 1]) {
    const zOuter = side * (halfW + cThick - SIDE_CUSHION_INSET);
    const zInner = side * (halfW - SIDE_CUSHION_INSET);

    const leftStartX = -halfL + cornerHalfX;
    const leftEndX = -sideHalfX;
    const leftLen = leftEndX - leftStartX;

    const rightStartX = sideHalfX;
    const rightEndX = halfL - cornerHalfX;
    const rightLen = rightEndX - rightStartX;

    if (leftLen > 0.01) {
      const cx = (leftStartX + leftEndX) / 2;
      const angleRad = THREE.MathUtils.degToRad(
        CORNER_CUSHION_ANGLE
      );
      const tipInset = cThick / Math.tan(angleRad / 2);

      cushionSegment(
        gCushions,
        "cushion_long_left",
        [
          [leftStartX, zOuter],
          [leftEndX, zOuter],
          [leftEndX, zInner + tipInset * 0.15],
          [leftStartX + tipInset * 0.15, zInner],
        ],
        cHeight,
        0,
        rubber
      );

      const m = gCushions.children[
        gCushions.children.length - 1
      ];

      m.position.set(cx, topY, -side * SIDE_CUSHION_INSET);
      m.scale.set(1, 1, 1);
    }

    if (rightLen > 0.01) {
      const cx = (rightStartX + rightEndX) / 2;
      const angleRad = THREE.MathUtils.degToRad(
        CORNER_CUSHION_ANGLE
      );
      const tipInset = cThick / Math.tan(angleRad / 2);

      cushionSegment(
        gCushions,
        "cushion_long_right",
        [
          [rightStartX, zOuter],
          [rightEndX, zOuter],
          [rightEndX - tipInset * 0.15, zInner],
          [rightStartX, zInner + tipInset * 0.15],
        ],
        cHeight,
        0,
        rubber
      );

      const m = gCushions.children[
        gCushions.children.length - 1
      ];

      m.position.set(cx, topY, -side * SIDE_CUSHION_INSET);
    }
  }

  /* Bordas curtas. */

  for (const side of [-1, 1]) {
    const xOuter = side * (halfL + cThick);
    const xInner = side * (halfL - END_CUSHION_INSET);

    const startZ = -halfW + cornerHalfZ;
    const endZ = halfW - cornerHalfZ;
    const len = endZ - startZ;

    if (len > 0.01) {
      const cz = (startZ + endZ) / 2;

      const angleRad = THREE.MathUtils.degToRad(
        CORNER_CUSHION_ANGLE
      );

      const tipInset = cThick / Math.tan(angleRad / 2);

      const railGeo = new THREE.BoxGeometry(
        cThick, cHeight, len
      );

      const mesh = new THREE.Mesh(railGeo, rubber);

      mesh.name = "cushion_end";
      mesh.position.set(
        xInner + side * cThick / 2,
        topY + cHeight / 2,
        cz
      );

      mesh.castShadow = true;
      mesh.receiveShadow = true;

      gCushions.add(mesh);

      const tipGeo = new THREE.BoxGeometry(
        cThick, cHeight, tipInset
      );

      const tip = new THREE.Mesh(tipGeo, rubber);

      tip.name = "cushion_end_tip";

      tip.position.set(
        xInner + side * cThick / 2,
        topY + cHeight / 2,
        side > 0
          ? startZ - tipInset / 2
          : endZ + tipInset / 2
      );

      tip.rotation.x = side > 0
        ? -angleRad / 2
        : angleRad / 2;

      gCushions.add(tip);
    }
  }

  /* Colisores das borrachas. */

  const colliderH = cHeight;
  const colliderY = topY + colliderH / 2;

  const wallHighlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4b35,
    depthWrite: true,
  });
  const highlightThickness = 0.004;
  const highlightY = topY + CUSHION_HEIGHT / 2;
  const highlightPockets = pocketPositions();

  for (const side of [-1, 1]) {
    const edge = side * (halfW - SIDE_CUSHION_INSET);
    for (const [start, end] of wallSegments("z", edge, -halfL, halfL, highlightPockets)) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(end - start, CUSHION_HEIGHT, highlightThickness),
        wallHighlightMaterial
      );
      mesh.name = "collision_wall_highlight";
      mesh.position.set(
        (start + end) / 2,
        highlightY,
        edge - side * highlightThickness / 2
      );
      gCollisionWallHighlights.add(mesh);
    }
  }

  for (const side of [-1, 1]) {
    const edge = side * (halfL - END_CUSHION_INSET);
    for (const [start, end] of wallSegments("x", edge, -halfW, halfW, highlightPockets)) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(highlightThickness, CUSHION_HEIGHT, end - start),
        wallHighlightMaterial
      );
      mesh.name = "collision_wall_highlight";
      mesh.position.set(
        edge - side * highlightThickness / 2,
        highlightY,
        (start + end) / 2
      );
      gCollisionWallHighlights.add(mesh);
    }
  }

  for (const side of [-1, 1]) {
    const z = side * (halfW - SIDE_CUSHION_INSET + cThick / 2);

    const leftLen =
      (-sideHalfX) - (-halfL + cornerHalfX);

    if (leftLen > 0.01) {
      collider(
        gCushionColliders,
        "cushion_collider_long_left",
        { x: leftLen, y: colliderH, z: cThick },
        {
          x: (-halfL + cornerHalfX + (-sideHalfX)) / 2,
          y: colliderY,
          z,
        }
      );
    }

    const rightLen =
      (halfL - cornerHalfX) - sideHalfX;

    if (rightLen > 0.01) {
      collider(
        gCushionColliders,
        "cushion_collider_long_right",
        { x: rightLen, y: colliderH, z: cThick },
        {
          x: (sideHalfX + (halfL - cornerHalfX)) / 2,
          y: colliderY,
          z,
        }
      );
    }
  }

  for (const side of [-1, 1]) {
    const x = side * (halfL + cThick / 2);
    const len =
      (halfW - cornerHalfZ) - (-halfW + cornerHalfZ);

    if (len > 0.01) {
      collider(
        gCushionColliders,
        "cushion_collider_end",
        { x: cThick, y: colliderH, z: len },
        { x, y: colliderY, z: 0 }
      );
    }
  }

  /* ============================================================
   * 5. CAÇAPAS
   * ============================================================ */

  for (const p of pocketPositions()) {
    const mouth = p.side ? SIDE_MOUTH : CORNER_MOUTH;
    const throat = p.side ? SIDE_THROAT : CORNER_THROAT;
    const r = mouth * 0.5;

    const gPocket = visibleGroup(
      gPockets,
      `pocket_${p.id}`
    );

    gPocket.position.set(p.x, topY, p.z);

    /* Aro escuro. */

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.9, r * 1.15, 32),
      pocketIn
    );

    ring.name = "pocket_rim_dark";
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.008;

    gPocket.add(ring);

    /* Abertura da caçapa. */

    const mouthGeo = new THREE.CylinderGeometry(
      r, r * 0.92, 0.02, 32, 1, true
    );

    const mouthMesh = new THREE.Mesh(
      mouthGeo, pocketIn
    );

    mouthMesh.name = "pocket_mouth";
    mouthMesh.position.y = 0.01;

    gPocket.add(mouthMesh);

    /* Garganta da caçapa. */

    const throatGeo = new THREE.CylinderGeometry(
      r * 0.92,
      throat * 0.5,
      POCKET_DEPTH,
      24,
      1,
      true
    );

    const throatMesh = new THREE.Mesh(
      throatGeo, pocketIn
    );

    throatMesh.name = "pocket_throat";
    throatMesh.position.y = -POCKET_DEPTH / 2 + 0.01;

    gPocket.add(throatMesh);

    /* Aro metálico. */

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.05, 0.006, 8, 32),
      brass
    );

    rim.name = "pocket_metal_rim";
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.012;

    gPocket.add(rim);

    const leatherRim = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.2, 0.012, 8, 32),
      leather
    );
    leatherRim.name = "pocket_leather_facing";
    leatherRim.rotation.x = Math.PI / 2;
    leatherRim.position.y = 0.009;
    gPocket.add(leatherRim);

    /* Bolsa interna. */

    const gBag = visibleGroup(
      gBags,
      `bag_${p.id}`
    );

    gBag.position.set(p.x, topY, p.z);

    const bagGeo = new THREE.CylinderGeometry(
      throat * 0.45,
      throat * 0.35,
      BAG_DEPTH,
      20,
      1,
      true
    );

    const bag = new THREE.Mesh(bagGeo, bagMat);

    bag.name = "pocket_bag";
    bag.position.y =
      -POCKET_DEPTH - BAG_DEPTH / 2 + 0.02;

    gBag.add(bag);

    const bagBottom = new THREE.Mesh(
      new THREE.CircleGeometry(throat * 0.35, 20),
      bagMat
    );

    bagBottom.name = "pocket_bag_bottom";
    bagBottom.rotation.x = Math.PI / 2;
    bagBottom.position.y =
      -POCKET_DEPTH - BAG_DEPTH + 0.02;

    gBag.add(bagBottom);

    /* Colisor da caçapa. */

    const colGeo = new THREE.CylinderGeometry(
      r,
      throat * 0.5,
      POCKET_DEPTH + 0.02,
      16,
      1,
      true
    );

    const colMesh = new THREE.Mesh(
      colGeo,
      new THREE.MeshBasicMaterial({ visible: false })
    );

    colMesh.name = `pocket_collider_${p.id}`;

    colMesh.position.set(
      p.x,
      topY - (POCKET_DEPTH + 0.02) / 2 + 0.01,
      p.z
    );

    colMesh.userData.isCollider = true;
    colMesh.userData.isPocket = true;
    colMesh.userData.pocketId = p.id;

    gPocketColliders.add(colMesh);
  }

  /* ============================================================
   * 6. PERNAS
   * ============================================================ */

  const legW = Math.max(LEG_SIZE * 1.65, 0.16);
  const legH = Math.max(LEG_HEIGHT, 0.45);

  const legX = outerL / 2 - rail * 1.35;
  const legZ = outerW / 2 - rail * 1.35;

  const legPositions = [
    [-legX, -legZ],
    [-legX, legZ],
    [legX, -legZ],
    [legX, legZ],
  ];

  for (const [x, z] of legPositions) {
    cylinder(gLegs, "turned_leg_foot", legW * 0.34, legW * 0.48, 0.055,
      { x, y: 0.028, z }, woodTrim, 16);

    box(
      gLegs,
      "square_wood_leg",
      { x: legW, y: legH, z: legW },
      { x, y: legH / 2 - 0.015, z },
      wood
    );

    const panelW = legW * 0.62;
    const panelH = legH * 0.72;

    for (const side of [-1, 1]) {
      box(
        gLegs,
        "leg_panel_frame",
        { x: panelW, y: panelH, z: 0.012 },
        {
          x,
          y: legH * 0.52,
          z: z + side * (legW / 2 + 0.007),
        },
        woodTrim
      );

      box(
        gLegs,
        "leg_panel_inset",
        {
          x: panelW * 0.78,
          y: panelH * 0.88,
          z: 0.014,
        },
        {
          x,
          y: legH * 0.52,
          z: z + side * (legW / 2 + 0.015),
        },
        wood
      );

      box(
        gLegs,
        "leg_side_frame",
        { x: 0.012, y: panelH, z: panelW },
        {
          x: x + side * (legW / 2 + 0.007),
          y: legH * 0.52,
          z,
        },
        woodTrim
      );

      box(
        gLegs,
        "leg_side_inset",
        {
          x: 0.014,
          y: panelH * 0.88,
          z: panelW * 0.78,
        },
        {
          x: x + side * (legW / 2 + 0.015),
          y: legH * 0.52,
          z,
        },
        wood
      );
    }

    box(
      gLegs,
      "leg_foot_trim",
      {
        x: legW * 1.04,
        y: 0.045,
        z: legW * 1.04,
      },
      { x, y: 0.035, z },
      woodTrim
    );

    /* Colisor da perna. */

    collider(
      gColliders,
      "leg_collider",
      { x: legW, y: legH, z: legW },
      { x, y: legH / 2 - 0.015, z }
    );
  }

  /* ============================================================
   * 7. ESTRUTURA INFERIOR
   * ============================================================ */

  const braceY = Math.min(
    legH * 0.68,
    topY * 0.55
  );

  box(
    gStructure,
    "underframe_long_brace",
    { x: outerL * 0.68, y: 0.09, z: 0.10 },
    { x: 0, y: braceY, z: 0 },
    darkWood
  );

  box(
    gStructure,
    "underframe_cross_brace",
    { x: 0.10, y: 0.09, z: outerW * 0.68 },
    { x: 0, y: braceY, z: 0 },
    darkWood
  );

  /* ============================================================
   * 8. MARCADORES NAS BORDAS
   * ============================================================ */

  const diamondGeo = new THREE.CircleGeometry(0.012, 4);
  const diamondMat = mat(0xf0e6d2, 0.4, 0.1);

  for (const side of [-1, 1]) {
    for (const f of [
      -0.4, -0.3, -0.2, -0.1,
       0.1,  0.2,  0.3,  0.4,
    ]) {
      const d = new THREE.Mesh(
        diamondGeo,
        diamondMat
      );

      d.name = "rail_diamond";
      d.rotation.x = -Math.PI / 2;
      d.rotation.z = Math.PI / 4;

      d.position.set(
        f * L,
        topY + railH + 0.002,
        side * (outerW / 2 - 0.01)
      );

      gStructure.add(d);
    }
  }

  // Marcadores também nas cabeceiras, como nas mesas comerciais.
  for (const side of [-1, 1]) {
    for (const f of [-0.28, 0, 0.28]) {
      const d = new THREE.Mesh(diamondGeo, brass);
      d.name = "end_rail_diamond";
      d.rotation.x = -Math.PI / 2;
      d.rotation.z = Math.PI / 4;
      d.position.set(side * (outerL / 2 - 0.01), topY + railH + 0.002, f * W);
      gStructure.add(d);
    }
  }

  /* ============================================================
   * FINALIZA
   * ============================================================ */

  // Mantém o modelo procedural: ele é alinhado às dimensões físicas e aos
  // detalhes comerciais desta mesa, sem um GLB externo sobrepondo o acabamento.

  loadTableModel(root, [
    gStructure,
    gBed,
    gCloth,
    gCushions,
    gPockets,
    gBags,
    gLegs,
  ]);

  scene.add(root);

  return {
    group: root,
    pockets: pocketPositions(),

    dimensions: {
      playingLength: L,
      playingWidth: W,
      playingHeight: topY,
      outerLength: outerL,
      outerWidth: outerW,
      railWidth: rail,
      railHeight: railH,
      cushionHeight: cHeight,
      cushionThickness: cThick,
      ballDiameter: BALL_DIAMETER,
      cornerMouth: CORNER_MOUTH,
      sideMouth: SIDE_MOUTH,
      pocketDepth: POCKET_DEPTH,
      bagDepth: BAG_DEPTH,
    },

    groups: {
      structure: gStructure,
      bed: gBed,
      cloth: gCloth,
      cushions: gCushions,
      collisionWallHighlights: gCollisionWallHighlights,
      pockets: gPockets,
      bags: gBags,
      legs: gLegs,
      colliders: gColliders,
      cushionColliders: gCushionColliders,
      pocketColliders: gPocketColliders,
      bedCollider: gBedCollider,
    },
  };
}
