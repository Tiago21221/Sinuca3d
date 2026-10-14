import { describe, expect, it } from "vitest";
import { GameManager } from "../js/game-manager.js";
import {
  BALL_MOVEMENT_END_EDGE_MARGIN,
  BALL_MOVEMENT_SIDE_EDGE_MARGIN,
  BALL_RADIUS,
} from "../js/constants.js";
import { getPlaySurfaceBounds } from "../js/table.js";

describe("posicionamento da bola branca", () => {
  it("permite posicionar a bola perto das bordas da superfície de jogo", () => {
    const game = Object.create(GameManager.prototype);
    game.kitchenOnly = false;
    const bounds = getPlaySurfaceBounds();
    const target = {
      x: bounds.halfLength - BALL_RADIUS - BALL_MOVEMENT_END_EDGE_MARGIN - 0.01,
      z: bounds.halfWidth - BALL_RADIUS - BALL_MOVEMENT_SIDE_EDGE_MARGIN - 0.01,
    };

    const position = game._clampPlace(target.x, target.z);

    expect(position.x).toBeCloseTo(target.x);
    expect(position.z).toBeCloseTo(target.z);
    expect(game._inTable(position.x, position.z)).toBe(true);
  });
});
