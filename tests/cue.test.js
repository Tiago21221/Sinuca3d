import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CueStick, createAimLine, predictAimPaths } from "../js/cue.js";
import { BALL_RADIUS, TABLE_HEIGHT } from "../js/constants.js";

describe("taco", () => {
  it("posiciona a ponteira na branca no fim do movimento para frente", () => {
    const cue = new CueStick(new THREE.Scene());
    cue.setAim(new THREE.Vector3(0, 0, 1));
    cue.update(
      { x: 0, y: TABLE_HEIGHT + BALL_RADIUS, z: 0 },
      true,
      0.5,
      0.008
    );
    cue.group.updateMatrixWorld(true);

    const tip = cue.group.children[4].getWorldPosition(new THREE.Vector3());
    const ball = new THREE.Vector3(0, TABLE_HEIGHT + BALL_RADIUS, 0);
    expect(tip.distanceTo(ball)).toBeCloseTo(BALL_RADIUS, 3);
  });
});

describe("mira preditiva", () => {
  const bounds = { halfLength: 1.12, halfWidth: 0.56 };

  it("desenha em branco a previsão da bola-alvo junto ao marcador vermelho", () => {
    const helpers = createAimLine(new THREE.Scene());

    expect(helpers.objectLine.material.color.getHex()).toBe(0xffffff);
    expect(helpers.objectLine.material.isLineDashedMaterial).toBe(true);
    expect(helpers.cueDeflectionLine.material.color.getHex()).toBe(0x70d6d0);
    expect(helpers.contactMarker.material.color.getHex()).toBe(0xe32636);
    expect(helpers.contactRing).toBeUndefined();
  });

  it("mostra a trajetória da branca até à bola e a direção das duas bolas após o choque", () => {
    const paths = predictAimPaths(
      new THREE.Vector3(-0.4, 0, 0),
      new THREE.Vector3(1, 0, 0),
      [{ number: 1, x: 0, z: 0.045 }],
      bounds
    );

    expect(paths.contact).not.toBeNull();
    expect(paths.cuePath).toHaveLength(2);
    expect(paths.objectPath).toHaveLength(2);
    expect(paths.cueDeflectionPath).toHaveLength(2);
    expect(paths.targetSpot).not.toBeNull();
    expect(paths.targetSpot.y).toBeGreaterThan(TABLE_HEIGHT + BALL_RADIUS);
    expect(paths.objectPath[1].z).toBeGreaterThan(paths.objectPath[0].z);
    expect(paths.cueDeflectionPath[1].z).toBeLessThan(paths.cueDeflectionPath[0].z);
  });

  it("prolonga a trajetória da branca até à tabela quando não há bola no caminho", () => {
    const paths = predictAimPaths(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      [],
      bounds
    );

    expect(paths.contact).toBeNull();
    expect(paths.targetSpot).toBeNull();
    expect(paths.cuePath[1].z).toBeCloseTo(bounds.halfWidth - BALL_RADIUS);
    expect(paths.objectPath).toHaveLength(0);
  });
});
