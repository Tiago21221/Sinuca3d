/**
 * Avaliação pura das jogadas — usada pelo jogo e pelos testes.
 *
 * Regras adotadas (exibidas na tela de regras):
 * - Bola 8: adaptação WPA. Mesa aberta após a abertura; grupos definidos na primeira
 *   bola legalmente encaçapada de um único tipo. Vitória só com a 8 legal após limpar o grupo.
 * - Par ou Ímpar: categorias escolhidas antes da partida. Ímpares 1,3,5,7,9,11,13,15 (8 bolas)
 *   e pares 2,4,6,8,10,12,14 (7 bolas). A diferença é intencional: quem fica com os pares
 *   precisa de menos bolas. Vitória ao encaçapar todas da própria categoria.
 * - Bolinho (padrão de bar documentado): bolas 1–8 comuns a ambos. Cada 1–7 vale 1 ponto.
 *   A bola 8 (o bolinho) só pode ser encaçapada depois que 1–7 saíram; quem a encaixa vence.
 */

export const DEFAULT_BOLINHO = {
  ballCount: 8,
  pointsPerBall: 1,
  eightLast: true,
  eightWins: true,
  continueOnPot: true,
  foulPenalty: "ball-in-hand",
  requireRailAfterHit: true,
  breakMustHitRack: true,
};

export function isEven(n) {
  return n % 2 === 0;
}

export function groupOfEightBall(n) {
  if (n >= 1 && n <= 7) return "solids";
  if (n >= 9 && n <= 15) return "stripes";
  if (n === 8) return "eight";
  return "cue";
}

export function groupOfEvenOdd(n) {
  if (n === 0) return "cue";
  return isEven(n) ? "even" : "odd";
}

function contactFoul(validSet, firstContact, cuePocketed) {
  if (cuePocketed) return "scratch";
  if (firstContact == null) return "noHit";
  if (validSet && !validSet.has(firstContact)) return "wrongBall";
  return null;
}

function railFoul(shot, pocketed, enabled) {
  if (!enabled) return null;
  if (shot.anyHit && !shot.railAfterContact && pocketed.length === 0) return "noRail";
  return null;
}

export function evaluateEvenOdd(state, shot) {
  const player = state.currentPlayer;
  const myGroup = state.playerGroups[player];
  const opp = 1 - player;
  const pocketed = shot.pocketedNumbers.filter((n) => n !== 0);
  const validSet = new Set(state.remaining[myGroup] || []);

  const foulKey =
    contactFoul(validSet, shot.firstContact, shot.cuePocketed) ||
    railFoul(shot, pocketed, state.requireRail !== false);

  const ownPotted = pocketed.filter((n) => validSet.has(n));
  const remaining = {
    even: (state.remaining.even || []).filter((n) => !pocketed.includes(n)),
    odd: (state.remaining.odd || []).filter((n) => !pocketed.includes(n)),
  };

  const winner = !foulKey && remaining[myGroup].length === 0 ? player : null;
  const continueTurn = !foulKey && winner == null && ownPotted.length > 0;

  return {
    foul: Boolean(foulKey),
    foulReason: foulKey,
    continueTurn,
    winner,
    loser: null,
    nextPlayer: continueTurn ? player : opp,
    ballInHand: Boolean(foulKey),
    remaining,
    pocketedOwn: ownPotted,
    messageKey: winner != null ? "wonEvenOdd" : foulKey || (continueTurn ? "continueTurn" : "turnPassed"),
  };
}

export function evaluateBolinho(state, shot, config = DEFAULT_BOLINHO) {
  const player = state.currentPlayer;
  const opp = 1 - player;
  const pocketed = shot.pocketedNumbers.filter((n) => n !== 0);
  const openBalls = state.objectBalls.filter((n) => n !== 8);
  const eightWasUp = state.objectBalls.includes(8);
  const eightPotted = pocketed.includes(8);
  const eightLegal = config.eightLast ? openBalls.length === 0 : true;

  const validSet = eightLegal && eightWasUp
    ? new Set([8, ...openBalls])
    : new Set(openBalls.length ? openBalls : [8]);

  let foulKey =
    contactFoul(validSet, shot.firstContact, shot.cuePocketed) ||
    railFoul(shot, pocketed, config.requireRailAfterHit);

  if (!foulKey && eightPotted && !eightLegal) foulKey = "earlyEight";

  const scored = pocketed.filter((n) => n !== 8 && n !== 0);
  const scores = [...state.scores];
  if (!foulKey) scores[player] += scored.length * (config.pointsPerBall || 1);

  let winner = null;
  if (eightPotted && eightLegal && !foulKey && config.eightWins) winner = player;

  const continueTurn =
    config.continueOnPot && !foulKey && winner == null && (scored.length > 0 || (eightPotted && eightLegal));

  const remainingBalls = state.objectBalls.filter((n) => {
    if (n === 8 && eightPotted && (!eightLegal || foulKey)) return true;
    return !pocketed.includes(n);
  });

  return {
    foul: Boolean(foulKey),
    foulReason: foulKey,
    continueTurn,
    winner,
    loser: null,
    nextPlayer: continueTurn ? player : opp,
    ballInHand: Boolean(foulKey),
    scores,
    objectBalls: remainingBalls,
    scored,
    respawnEight: Boolean(eightPotted && !eightLegal),
    messageKey: winner != null ? "wonBolinho" : foulKey || (continueTurn ? "continueTurn" : "turnPassed"),
  };
}

export function evaluateThreeBalls(state, shot) {
  const player = state.currentPlayer;
  const opp = 1 - player;
  const pocketed = new Set(shot.pocketedNumbers.filter((n) => n !== 0));
  const objectBalls = state.objectBalls.filter((n) => !pocketed.has(n));
  const noContact = !shot.anyHit || shot.firstContact == null;
  const winner = noContact ? opp : objectBalls.length === 0 ? player : null;
  const foulReason = noContact ? "noHitLoss" : shot.cuePocketed ? "scratch" : null;
  const continueTurn = winner == null && !foulReason && objectBalls.length < state.objectBalls.length;

  return {
    foul: Boolean(foulReason),
    foulReason,
    continueTurn,
    winner,
    loser: noContact ? player : null,
    nextPlayer: continueTurn ? player : opp,
    ballInHand: false,
    objectBalls,
    pocketed: [...pocketed],
    messageKey: winner != null
      ? noContact ? "noHitLoss" : "wonThreeBalls"
      : foulReason || (continueTurn ? "continueTurn" : "turnPassed"),
  };
}

export function evaluateEightBall(state, shot) {
  const player = state.currentPlayer;
  const opp = 1 - player;
  const pocketed = shot.pocketedNumbers.filter((n) => n !== 0);
  const eightPotted = pocketed.includes(8);
  const assigned = state.groupsAssigned;
  const myGroup = assigned ? state.playerGroups[player] : null;

  const solidsLeft = state.solids.filter((n) => !pocketed.includes(n));
  const stripesLeft = state.stripes.filter((n) => !pocketed.includes(n));
  const pottedSolids = pocketed.filter((n) => n >= 1 && n <= 7);
  const pottedStripes = pocketed.filter((n) => n >= 9 && n <= 15);

  let legalFirst;
  if (state.isBreak) legalFirst = new Set([...state.solids, ...state.stripes, 8]);
  else if (!assigned) legalFirst = new Set([...state.solids, ...state.stripes]);
  else if ((myGroup === "solids" ? state.solids : state.stripes).length === 0) legalFirst = new Set([8]);
  else legalFirst = new Set(myGroup === "solids" ? state.solids : state.stripes);

  let foulKey =
    contactFoul(legalFirst, shot.firstContact, shot.cuePocketed) ||
    railFoul(shot, pocketed, true);

  let groupsAssigned = assigned;
  let playerGroups = [...state.playerGroups];
  let assignMessage = false;

  if (!assigned && !foulKey && !state.isBreak) {
    if (pottedSolids.length && !pottedStripes.length) {
      groupsAssigned = true;
      playerGroups[player] = "solids";
      playerGroups[opp] = "stripes";
      assignMessage = true;
    } else if (pottedStripes.length && !pottedSolids.length) {
      groupsAssigned = true;
      playerGroups[player] = "stripes";
      playerGroups[opp] = "solids";
      assignMessage = true;
    }
  }

  if (state.isBreak && state.assignGroupsOnBreak && !foulKey) {
    if (pottedSolids.length && !pottedStripes.length) {
      groupsAssigned = true;
      playerGroups[player] = "solids";
      playerGroups[opp] = "stripes";
      assignMessage = true;
    } else if (pottedStripes.length && !pottedSolids.length) {
      groupsAssigned = true;
      playerGroups[player] = "stripes";
      playerGroups[opp] = "solids";
      assignMessage = true;
    }
  }

  const myNow = groupsAssigned ? playerGroups[player] : null;
  const mineLeft = myNow === "solids" ? solidsLeft : myNow === "stripes" ? stripesLeft : null;
  const ownPotted =
    myNow === "solids" ? pottedSolids : myNow === "stripes" ? pottedStripes : [...pottedSolids, ...pottedStripes];

  let winner = null;
  let loser = null;

  if (eightPotted) {
    if (state.isBreak) {
      foulKey = foulKey || "earlyEight";
    } else {
      const canShootEight = groupsAssigned && mineLeft && mineLeft.length === 0;
      if (canShootEight && !foulKey && !shot.cuePocketed) {
        winner = player;
      } else {
        loser = player;
        winner = opp;
        foulKey = foulKey || "illegalEight";
      }
    }
  }

  const continueTurn =
    !foulKey &&
    winner == null &&
    (ownPotted.length > 0 || (!groupsAssigned && (pottedSolids.length > 0 || pottedStripes.length > 0)));

  return {
    foul: Boolean(foulKey),
    foulReason: foulKey,
    continueTurn,
    winner,
    loser,
    nextPlayer: continueTurn ? player : opp,
    ballInHand: Boolean(foulKey) && winner == null,
    solids: solidsLeft,
    stripes: stripesLeft,
    groupsAssigned,
    playerGroups,
    assignMessage,
    pocketedOwn: ownPotted,
    messageKey: winner != null
      ? loser === player
        ? "lostEight"
        : "wonEight"
      : assignMessage
        ? "groupsAssigned"
        : foulKey || (continueTurn ? "continueTurn" : "turnPassed"),
  };
}
