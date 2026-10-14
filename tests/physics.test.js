import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { PhysicsWorld } from "../js/physics.js";
import {
  BALL_CORNER_POCKET_GAP_WIDTH,
  BALL_RADIUS,
  CUSHION_THICKNESS,
  END_CUSHION_INSET,
  SIDE_CUSHION_INSET,
  TABLE_HEIGHT,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from "../js/constants.js";
import { getPlaySurfaceBounds, pocketPositions } from "../js/table.js";

describe("colisões da mesa", () => {
  it("transfere movimento entre bolas sem sobreposição persistente", () => {
    const physics = new PhysicsWorld();
    const cue = physics.addBall(0, -0.12, 0);
    const object = physics.addBall(1, 0, 0);
    cue.velocity.set(3, 0, 0);

    for (let i = 0; i < 20; i++) physics.step(1 / 120);

    expect(object.velocity.x).toBeGreaterThan(0.5);
    expect(Math.hypot(object.position.x - cue.position.x, object.position.z - cue.position.z))
      .toBeGreaterThanOrEqual(BALL_RADIUS * 2 - 0.001);
  });

  it.each([
    { side: "norte", x: 0.35, z: TABLE_WIDTH / 2 - 0.1, vx: 0, vz: 2.5, axis: "z", sign: -1 },
    { side: "sul", x: -0.35, z: -TABLE_WIDTH / 2 + 0.1, vx: 0, vz: -2.5, axis: "z", sign: 1 },
    { side: "leste", x: TABLE_LENGTH / 2 - 0.1, z: 0.2, vx: 2.5, vz: 0, axis: "x", sign: -1 },
    { side: "oeste", x: -TABLE_LENGTH / 2 + 0.1, z: -0.2, vx: -2.5, vz: 0, axis: "x", sign: 1 },
  ])("faz a bola rebater na tabela $side", ({ x, z, vx, vz, axis, sign }) => {
    const physics = new PhysicsWorld();
    const ball = physics.addBall(1, x, z);
    ball.velocity.set(vx, 0, vz);

    for (let i = 0; i < 30; i++) physics.step(1 / 120);

    expect(ball.velocity[axis] * sign).toBeGreaterThan(0.2);
    expect(Math.abs(ball.position.x)).toBeLessThanOrEqual(
      TABLE_LENGTH / 2 - END_CUSHION_INSET - BALL_RADIUS + CUSHION_THICKNESS / 2
    );
    expect(Math.abs(ball.position.z)).toBeLessThanOrEqual(
      TABLE_WIDTH / 2 - SIDE_CUSHION_INSET - BALL_RADIUS + CUSHION_THICKNESS / 2
    );
    expect(ball.position.y).toBeCloseTo(TABLE_HEIGHT + BALL_RADIUS, 2);
  });

  it("deixa a abertura central da caçapa livre para a bola passar", () => {
    const physics = new PhysicsWorld();
    const ball = physics.addBall(1, 0, TABLE_WIDTH / 2 - 0.12);
    ball.velocity.z = 2;

    let pocketed = false;
    for (let i = 0; i < 60; i++) {
      physics.step(1 / 120);
      pocketed ||= physics.pocketHits().includes(1);
    }

    expect(pocketed).toBe(true);
  });

  it("exige que a bola chegue um pouco mais perto do centro nas caçapas dos cantos", () => {
    const physics = new PhysicsWorld();
    const pocket = physics.pocketCenters.find((position) => position.corner);
    const directionX = Math.sign(pocket.x);
    const directionZ = Math.sign(pocket.z);
    const ball = physics.addBall(1, pocket.x - directionX * 0.013, pocket.z);

    expect(physics.pocketHits()).not.toContain(1);

    ball.position.x = pocket.x - directionX * 0.01;
    ball.velocity.set(directionX, 0, directionZ);
    expect(physics.pocketHits()).toContain(1);
  });

  it("deixa a bola avançar pela abertura diagonal da caçapa do canto", () => {
    const physics = new PhysicsWorld();
    const pocket = physics.pocketCenters.find((position) => position.corner);
    const directionX = Math.sign(pocket.x);
    const directionZ = Math.sign(pocket.z);
    const ball = physics.addBall(
      1,
      pocket.x - directionX * 0.18,
      pocket.z - directionZ * 0.18
    );
    ball.velocity.set(directionX * 1.5, 0, directionZ * 1.5);

    let pocketed = false;
    for (let i = 0; i < 90; i++) {
      physics.step(1 / 120);
      pocketed ||= physics.pocketHits().includes(1);
      if (pocketed) break;
    }

    expect(pocketed).toBe(true);
  });

  it("não pontua no canto quando a bola apenas acompanha a tabela", () => {
    const physics = new PhysicsWorld();
    const pocket = physics.pocketCenters.find((position) => position.corner);
    const ball = physics.addBall(1, pocket.x, pocket.z);
    ball.velocity.set(Math.sign(pocket.x), 0, 0);

    expect(physics.pocketHits()).not.toContain(1);
  });

  it("mantém a bola dentro da área de jogo sem bloquear as caçapas", () => {
    const physics = new PhysicsWorld();
    const ball = physics.addBall(1, TABLE_LENGTH / 2 + 0.2, 0);

    physics.step(1 / 120);

    expect(ball.position.x).toBeLessThanOrEqual(
      TABLE_LENGTH / 2 - END_CUSHION_INSET - BALL_RADIUS + CUSHION_THICKNESS / 2
    );
  });

  it("aplica os limites à branca e às bolas numeradas", () => {
    const physics = new PhysicsWorld();
    const cue = physics.addBall(0, 1.2, 0);
    const objectBall = physics.addBall(7, 1.2, 0.2);

    physics._clampBallsToCloth();

    const limitX = getPlaySurfaceBounds().halfLength - BALL_RADIUS + CUSHION_THICKNESS / 2;
    expect(cue.position.x).toBeCloseTo(limitX);
    expect(objectBall.position.x).toBeCloseTo(limitX);
  });

  it("abre mais o corredor de aproximação das caçapas dos cantos", () => {
    const physics = new PhysicsWorld();
    const bounds = getPlaySurfaceBounds();
    const limitX = bounds.halfLength - BALL_RADIUS + CUSHION_THICKNESS / 2;
    const limitZ = bounds.halfWidth - BALL_RADIUS + CUSHION_THICKNESS / 2;
    const pocket = pocketPositions().find((position) => position.corner);
    const startX = Math.max(-limitX, Math.min(limitX, pocket.x));
    const startZ = Math.max(-limitZ, Math.min(limitZ, pocket.z));
    const pathX = pocket.x - startX;
    const pathZ = pocket.z - startZ;
    const pathLength = Math.hypot(pathX, pathZ);
    const outward = Math.sign(pocket.x * pathZ - pocket.z * pathX) || 1;
    const x = (startX + pocket.x) / 2 - (pathZ / pathLength) * 0.05 * outward;
    const z = (startZ + pocket.z) / 2 + (pathX / pathLength) * 0.05 * outward;
    const ball = physics.addBall(1, x, z);

    physics._clampBallsToCloth();

    expect(ball.position.x).toBeCloseTo(x);
    expect(ball.position.z).toBeCloseTo(z);
  });

  it("abre mais a passagem física das caçapas dos cantos", () => {
    const physics = new PhysicsWorld();
    const pocket = pocketPositions().find((position) => position.corner);
    const railTag = pocket.z < 0 ? "long-south" : "long-north";
    const edge = Math.sign(pocket.x) * getPlaySurfaceBounds().halfLength;
    const cushionEnd = physics.tableBodies
      .filter((body) => body.userData?.kind === "cushion" && body.userData.tag === railTag)
      .map((body) => body.position.x + Math.sign(edge) * body.shapes[0].halfExtents.x)
      .filter((position) => Math.sign(edge) * position < Math.sign(edge) * pocket.x)
      .reduce((closest, position) =>
        Math.abs(pocket.x - position) < Math.abs(pocket.x - closest) ? position : closest
      );

    expect(Math.abs(pocket.x - cushionEnd)).toBeCloseTo(BALL_CORNER_POCKET_GAP_WIDTH / 2);
  });

  it("desloca para dentro as testeiras física e visualmente", () => {
    const physics = new PhysicsWorld();
    const endRails = physics.tableBodies.filter(
      (body) => body.userData?.kind === "cushion" && body.userData.tag.startsWith("end-")
    );

    expect(endRails).toHaveLength(2);
    for (const rail of endRails) {
      expect(Math.abs(rail.position.x)).toBeCloseTo(
        TABLE_LENGTH / 2 - END_CUSHION_INSET + CUSHION_THICKNESS / 2
      );
    }
    expect(getPlaySurfaceBounds().halfLength).toBeCloseTo(
      TABLE_LENGTH / 2 - END_CUSHION_INSET
    );
  });

  it("desloca para dentro as laterais longas e reduz a largura de jogo", () => {
    const physics = new PhysicsWorld();
    const longRails = physics.tableBodies.filter(
      (body) => body.userData?.kind === "cushion" && body.userData.tag.startsWith("long-")
    );

    expect(longRails.length).toBeGreaterThan(0);
    for (const rail of longRails) {
      expect(Math.abs(rail.position.z)).toBeCloseTo(
        TABLE_WIDTH / 2 - SIDE_CUSHION_INSET + CUSHION_THICKNESS / 2
      );
    }
    expect(getPlaySurfaceBounds().halfWidth).toBeCloseTo(
      TABLE_WIDTH / 2 - SIDE_CUSHION_INSET
    );
  });

  it("aplica o efeito lateral ao rebater na tabela", () => {
    const physics = new PhysicsWorld();
    const ball = physics.addBall(0, TABLE_LENGTH / 2 - BALL_RADIUS - 0.06, 0);
    ball.velocity.x = 2;
    ball.angularVelocity.y = 30;

    for (let i = 0; i < 24; i++) physics.step(1 / 120);

    expect(Math.abs(ball.position.z)).toBeGreaterThan(0.005);
  });

  it("converte a posição do pino em giro lateral e de avanço/recuo", () => {
    const physics = new PhysicsWorld();
    const cue = physics.addBall(0, 0, 0);

    physics.strikeCue(new Vector3(1, 0, 0), 2, { x: 1, y: -1 });

    expect(cue.angularVelocity.y).toBeCloseTo((2 / BALL_RADIUS) * 0.8);
    expect(cue.angularVelocity.z).toBeLessThan(0);
  });

});
