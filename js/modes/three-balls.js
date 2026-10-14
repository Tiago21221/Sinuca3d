import { evaluateThreeBalls } from "./rules-core.js";

export const THREE_BALLS = [1, 2, 3];

export function createThreeBallsState() {
  return {
    id: "three-balls",
    objectBalls: [...THREE_BALLS],
    currentPlayer: 0,
  };
}

export function applyThreeBalls(state, shot) {
  const result = evaluateThreeBalls(state, shot);
  return {
    ...result,
    state: {
      ...state,
      objectBalls: result.objectBalls,
      currentPlayer: result.nextPlayer,
    },
  };
}

export function threeBallsRulesText(lang) {
  if (lang === "en") {
    return [
      "Three numbered object balls (1, 2 and 3) plus the cue ball.",
      "Pocket all three object balls. The player who pockets the last one wins.",
      "A shot that does not contact any object ball immediately loses the round.",
      "If you contact a ball but pocket none, the turn passes to your opponent.",
      "Pocketing one or more object balls keeps your turn, unless it wins the game.",
    ];
  }
  return [
    "São usadas três bolas objetivas (1, 2 e 3), além da bola branca.",
    "Encaçape as três bolas. Quem matar a última vence.",
    "Uma tacada que não tocar em nenhuma bola objetiva perde a partida.",
    "Se tocar em uma bola, mas não encaçapar nenhuma, a vez passa ao adversário.",
    "Encaçapar uma ou mais bolas mantém sua vez, a menos que isso encerre a partida.",
  ];
}
