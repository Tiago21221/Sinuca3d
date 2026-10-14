import { describe, expect, it } from "vitest";
import { evaluateBolinho, evaluateEightBall, evaluateEvenOdd, evaluateThreeBalls } from "../js/modes/rules-core.js";
import { EVEN_BALLS, ODD_BALLS, createEvenOddState } from "../js/modes/par-ou-impar.js";
import { createBolinhoState } from "../js/modes/bolinho.js";
import { createEightBallState, SOLIDS, STRIPES } from "../js/modes/bola-8.js";
import { createThreeBallsState } from "../js/modes/three-balls.js";

const hit = (over = {}) => ({
  pocketedNumbers: [],
  cuePocketed: false,
  firstContact: 1,
  railAfterContact: true,
  anyHit: true,
  ...over,
});

describe("Par ou Ímpar", () => {
  it("define 7 pares e 8 ímpares", () => {
    expect(EVEN_BALLS).toHaveLength(7);
    expect(ODD_BALLS).toHaveLength(8);
  });

  it("mantém a vez ao encaçapar bola da categoria", () => {
    const state = createEvenOddState("odd");
    const r = evaluateEvenOdd(state, hit({ pocketedNumbers: [1], firstContact: 1 }));
    expect(r.foul).toBe(false);
    expect(r.continueTurn).toBe(true);
    expect(r.remaining.odd).not.toContain(1);
  });

  it("falta ao tocar primeiro uma bola do adversário", () => {
    const state = createEvenOddState("odd");
    const r = evaluateEvenOdd(state, hit({ firstContact: 2 }));
    expect(r.foul).toBe(true);
    expect(r.foulReason).toBe("wrongBall");
    expect(r.ballInHand).toBe(true);
  });

  it("vence ao limpar a categoria", () => {
    const state = createEvenOddState("even");
    state.remaining.even = [14];
    const r = evaluateEvenOdd(state, hit({ pocketedNumbers: [14], firstContact: 14 }));
    expect(r.winner).toBe(0);
  });

  it("falta com branca na caçapa", () => {
    const state = createEvenOddState("odd");
    const r = evaluateEvenOdd(state, hit({ cuePocketed: true, pocketedNumbers: [1] }));
    expect(r.foulReason).toBe("scratch");
    expect(r.continueTurn).toBe(false);
  });
});

describe("Bolinho", () => {
  it("não deixa a 8 cair enquanto restam bolas 1–7", () => {
    const state = createBolinhoState();
    const r = evaluateBolinho(state, hit({ firstContact: 8, pocketedNumbers: [8] }));
    expect(r.foul).toBe(true);
    expect(r.respawnEight).toBe(true);
    expect(r.winner).toBeNull();
  });

  it("soma pontos nas bolas 1–7", () => {
    const state = createBolinhoState();
    const r = evaluateBolinho(state, hit({ firstContact: 3, pocketedNumbers: [3, 5] }));
    expect(r.scores[0]).toBe(2);
    expect(r.continueTurn).toBe(true);
  });

  it("vence com a 8 legal após limpar a mesa", () => {
    const state = createBolinhoState();
    state.objectBalls = [8];
    const r = evaluateBolinho(state, hit({ firstContact: 8, pocketedNumbers: [8] }));
    expect(r.winner).toBe(0);
    expect(r.foul).toBe(false);
  });
});

describe("Bola 8", () => {
  it("abre a mesa no break e não define grupo na abertura por padrão", () => {
    const state = createEightBallState();
    const r = evaluateEightBall(state, hit({ firstContact: 1, pocketedNumbers: [3] }));
    expect(r.groupsAssigned).toBe(false);
    expect(r.continueTurn).toBe(true);
  });

  describe("3 Bolas", () => {
    it("vence ao encaçapar a última das três bolas", () => {
      const state = { ...createThreeBallsState(), objectBalls: [3] };
      const result = evaluateThreeBalls(state, hit({ firstContact: 3, pocketedNumbers: [3] }));
      expect(result.winner).toBe(0);
      expect(result.objectBalls).toEqual([]);
    });

    it("vence ao encaçapar as três bolas na mesma tacada", () => {
      const result = evaluateThreeBalls(
        createThreeBallsState(),
        hit({ firstContact: 1, pocketedNumbers: [1, 2, 3] })
      );
      expect(result.winner).toBe(0);
      expect(result.objectBalls).toEqual([]);
    });

    it("perde a partida se a tacada não tocar em nenhuma bola", () => {
      const result = evaluateThreeBalls(
        createThreeBallsState(),
        hit({ firstContact: null, anyHit: false, railAfterContact: false })
      );
      expect(result.winner).toBe(1);
      expect(result.loser).toBe(0);
      expect(result.foulReason).toBe("noHitLoss");
    });

    it("mantém a vez após encaçapar bola sem terminar as três", () => {
      const result = evaluateThreeBalls(
        createThreeBallsState(),
        hit({ firstContact: 1, pocketedNumbers: [1] })
      );
      expect(result.winner).toBeNull();
      expect(result.continueTurn).toBe(true);
      expect(result.objectBalls).toEqual([2, 3]);
    });

    it("passa a vez quando acerta uma bola mas não encaçapa", () => {
      const result = evaluateThreeBalls(
        createThreeBallsState(),
        hit({ firstContact: 2, pocketedNumbers: [] })
      );
      expect(result.winner).toBeNull();
      expect(result.nextPlayer).toBe(1);
    });
  });

  it("define lisas/listradas após o break", () => {
    const state = { ...createEightBallState(), isBreak: false };
    const r = evaluateEightBall(state, hit({ firstContact: 10, pocketedNumbers: [10] }));
    expect(r.groupsAssigned).toBe(true);
    expect(r.playerGroups[0]).toBe("stripes");
    expect(r.playerGroups[1]).toBe("solids");
  });

  it("derrota ao encaçapar a 8 cedo", () => {
    const state = {
      ...createEightBallState(),
      isBreak: false,
      groupsAssigned: true,
      playerGroups: ["solids", "stripes"],
      solids: [...SOLIDS],
    };
    const r = evaluateEightBall(state, hit({ firstContact: 1, pocketedNumbers: [8] }));
    expect(r.loser).toBe(0);
    expect(r.winner).toBe(1);
  });

  it("vitória legal com a 8 após limpar o grupo", () => {
    const state = {
      ...createEightBallState(),
      isBreak: false,
      groupsAssigned: true,
      playerGroups: ["solids", "stripes"],
      solids: [],
      stripes: [...STRIPES],
    };
    const r = evaluateEightBall(state, hit({ firstContact: 8, pocketedNumbers: [8] }));
    expect(r.winner).toBe(0);
    expect(r.loser).toBeNull();
  });

  it("falta sem encostar em bola", () => {
    const state = { ...createEightBallState(), isBreak: false };
    const r = evaluateEightBall(state, hit({ firstContact: null, anyHit: false, railAfterContact: false }));
    expect(r.foulReason).toBe("noHit");
  });
});
