import { evaluateEightBall } from "./rules-core.js";

export const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
export const STRIPES = [9, 10, 11, 12, 13, 14, 15];

export function createEightBallState() {
  return {
    id: "eight-ball",
    solids: [...SOLIDS],
    stripes: [...STRIPES],
    groupsAssigned: false,
    playerGroups: [null, null],
    currentPlayer: 0,
    isBreak: true,
    assignGroupsOnBreak: false,
  };
}

export function applyEightBall(state, shot) {
  const result = evaluateEightBall(state, shot);
  return {
    ...result,
    respawnEight: Boolean(state.isBreak && shot.pocketedNumbers.includes(8)),
    state: {
      ...state,
      solids: result.solids,
      stripes: result.stripes,
      groupsAssigned: result.groupsAssigned,
      playerGroups: result.playerGroups,
      currentPlayer: result.nextPlayer,
      isBreak: false,
    },
  };
}

export function eightBallRulesText(lang) {
  if (lang === "en") {
    return [
      "American 8-ball (WPA-inspired house rules).",
      "Rack: 1 at the apex, 8 in the center, one solid and one stripe in the back corners.",
      "The table stays open on the break. Groups (solids/stripes) are assigned on the first legal pot of a single type after the break.",
      "After groups are set you must first contact your own remaining ball (or the 8 when your group is clear).",
      "A legal pot of your ball keeps the turn. A miss or foul passes the turn with ball in hand.",
      "Fouls include: scratch, no contact, wrong first ball, no cushion after contact if nothing is potted, and illegal 8-ball plays.",
      "You win only by legally potting the 8 after clearing your group. An illegal 8 loses the match.",
    ];
  }
  return [
    "Bola 8 americana (regras de casa inspiradas na WPA).",
    "Triângulo: bola 1 na ponta, bola 8 no centro, uma lisa e uma listrada nos cantos de trás.",
    "A mesa permanece aberta na abertura. Lisas e listradas são definidas na primeira bola legalmente encaçapada de um único tipo após o break.",
    "Depois disso, o primeiro contato deve ser com uma bola restante do seu grupo (ou a 8, se o grupo já saiu).",
    "Encaçapar bola válida mantém a vez. Erro ou falta passa o turno com bola na mão.",
    "Faltas: branca na caçapa, nenhum contato, primeira bola inválida, nenhuma borda após o contato se nada cair, e jogadas ilegais com a 8.",
    "Só vence quem encaçapar a 8 legalmente depois de limpar o grupo. A 8 ilegal perde a partida.",
  ];
}
