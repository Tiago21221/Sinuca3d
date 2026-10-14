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

describe("partida online", () => {
  it("permite jogar somente no turno do dispositivo conectado", () => {
    const game = Object.create(GameManager.prototype);
    game.aiThinking = false;
    game.waitingForNetwork = false;
    game.networkConnected = true;
    game.config = { multiplayer: true };
    game.localPlayer = 1;
    game.modeState = { currentPlayer: 0 };

    expect(game.isLocalTurn()).toBe(false);
    game.modeState.currentPlayer = 1;
    expect(game.isLocalTurn()).toBe(true);
  });

  it("aceita apenas tacadas válidas do jogador da vez", () => {
    const game = Object.create(GameManager.prototype);
    game.config = { multiplayer: true, multiplayerHost: true };
    game.modeState = { currentPlayer: 1 };
    game.phase = "aim";
    game._fire = () => {};
    game.onNetworkEvent = (type, payload) => {
      expect(type).toBe("shot");
      expect(payload.shooter).toBe(1);
    };
    const shot = { direction: { x: 0, z: 1 }, power: 0.5, spin: { x: 0, y: 0 } };

    expect(game.playNetworkShot(shot, 0)).toBe(false);
    expect(game.playNetworkShot({ ...shot, power: 2 }, 1)).toBe(false);
    expect(game.playNetworkShot(shot, 1)).toBe(true);
  });
});
