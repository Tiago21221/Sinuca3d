import { evaluateEvenOdd } from "./rules-core.js";

export const EVEN_BALLS = [2, 4, 6, 8, 10, 12, 14];
export const ODD_BALLS = [1, 3, 5, 7, 9, 11, 13, 15];

export function createEvenOddState(p1Group) {
  const p2 = p1Group === "even" ? "odd" : "even";
  return {
    id: "even-odd",
    playerGroups: [p1Group, p2],
    remaining: { even: [...EVEN_BALLS], odd: [...ODD_BALLS] },
    currentPlayer: 0,
    requireRail: true,
    isBreak: true,
  };
}

export function evenOddBalls() {
  return [...ODD_BALLS, ...EVEN_BALLS];
}

export function applyEvenOdd(state, shot) {
  const result = evaluateEvenOdd(state, shot);
  return {
    ...result,
    state: {
      ...state,
      remaining: result.remaining,
      currentPlayer: result.nextPlayer,
      isBreak: false,
    },
  };
}

export function evenOddRulesText(lang) {
  if (lang === "en") {
    return [
      "Even balls: 2, 4, 6, 8, 10, 12, 14 (7 balls).",
      "Odd balls: 1, 3, 5, 7, 9, 11, 13, 15 (8 balls).",
      "The even group has fewer balls on purpose — that is the adopted balance.",
      "You must first contact one of your remaining balls.",
      "Pot a legal ball to keep your turn. A miss or foul passes the turn.",
      "Fouls: scratch, no contact, wrong first ball, or no cushion after contact when nothing is potted.",
      "Foul penalty: ball in hand for the opponent (kitchen on the opening scratch; anywhere after).",
      "Win by potting every ball in your group.",
    ];
  }
  return [
    "Bolas pares: 2, 4, 6, 8, 10, 12 e 14 (7 bolas).",
    "Bolas ímpares: 1, 3, 5, 7, 9, 11, 13 e 15 (8 bolas).",
    "A diferença de quantidade é intencional: quem fica com os pares precisa encaçapar menos bolas.",
    "O primeiro contato deve ser com uma bola restante da sua categoria.",
    "Encaçapar uma bola válida mantém a vez. Errar ou faltar passa o turno.",
    "Faltas: branca na caçapa, nenhum contato, primeira bola inválida, ou nenhuma borda após o contato quando nada cai.",
    "Penalidade: bola na mão para o adversário (na abertura, na área de saída; depois, em qualquer lugar legal).",
    "Vence quem encaçapar todas as bolas da sua categoria.",
  ];
}
