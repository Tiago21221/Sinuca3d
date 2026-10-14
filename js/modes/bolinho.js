import { DEFAULT_BOLINHO, evaluateBolinho } from "./rules-core.js";

export { DEFAULT_BOLINHO };

export function bolinhoNumbers(config = DEFAULT_BOLINHO) {
  const n = Math.max(3, Math.min(15, config.ballCount || 8));
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function createBolinhoState(config = DEFAULT_BOLINHO) {
  return {
    id: "bolinho",
    config: { ...DEFAULT_BOLINHO, ...config },
    objectBalls: bolinhoNumbers({ ...DEFAULT_BOLINHO, ...config }),
    scores: [0, 0],
    currentPlayer: 0,
    isBreak: true,
  };
}

export function applyBolinho(state, shot) {
  const result = evaluateBolinho(state, shot, state.config);
  return {
    ...result,
    state: {
      ...state,
      objectBalls: result.objectBalls,
      scores: result.scores,
      currentPlayer: result.nextPlayer,
      isBreak: false,
    },
  };
}

export function bolinhoRulesText(lang, config = DEFAULT_BOLINHO) {
  const c = { ...DEFAULT_BOLINHO, ...config };
  if (lang === "en") {
    return [
      `Bolinho (house default): ${c.ballCount} numbered balls plus the cue ball.`,
      "Any player may pot any numbered ball from 1 to 7. They are not assigned groups.",
      `Each potted ball (1–7) scores ${c.pointsPerBall} point(s).`,
      c.eightLast
        ? "The 8-ball (the bolinho) may only be potted after 1–7 are gone. Potting it legally wins the match."
        : "The 8-ball may be potted at any time according to the selected configuration.",
      c.continueOnPot ? "A legal pot keeps your turn." : "The turn always passes after a shot.",
      "Fouls: scratch, no hit, first contact with the 8 while others remain, or no cushion after contact.",
      "Foul penalty: ball in hand. An early 8 is spotted back on the foot spot.",
      "This is independent of Even/Odd and 8-Ball. Change options in the match setup.",
    ];
  }
  return [
    `Bolinho (padrão desta casa): ${c.ballCount} bolas numeradas mais a branca.`,
    "Qualquer jogador pode encaçapar qualquer bola de 1 a 7. Não há grupos fixos.",
    `Cada bola 1–7 encaçapada vale ${c.pointsPerBall} ponto(s).`,
    c.eightLast
      ? "A bola 8 (o bolinho) só pode ser encaçapada depois que 1–7 saíram. Quem a encaixa legalmente vence."
      : "A bola 8 pode ser encaçapada conforme a configuração escolhida.",
    c.continueOnPot ? "Encaçapar de forma válida mantém a vez." : "O turno sempre passa após a tacada.",
    "Faltas: branca na caçapa, nenhum contato, acertar a 8 cedo demais, ou nenhuma borda após o contato.",
    "Penalidade: bola na mão. Bolinho encaçapado cedo volta ao ponto de pé.",
    "Estas regras são independentes de Par ou Ímpar e Bola 8. Dá para alterá-las no início da partida.",
  ];
}
