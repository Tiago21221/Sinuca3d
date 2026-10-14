import { STORAGE_STATS, MODES } from "./constants.js";

function emptyMode() {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    ballsPocketed: 0,
    fouls: 0,
    bestRun: 0,
  };
}

function emptyStats() {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    ballsPocketed: 0,
    fouls: 0,
    bestRun: 0,
    modes: {
      [MODES.EVEN_ODD]: emptyMode(),
      [MODES.BOLINHO]: emptyMode(),
      [MODES.EIGHT_BALL]: emptyMode(),
      [MODES.THREE_BALLS]: emptyMode(),
    },
  };
}

export function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_STATS);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw);
    const base = emptyStats();
    return {
      ...base,
      ...parsed,
      modes: {
        ...base.modes,
        ...(parsed.modes || {}),
      },
    };
  } catch {
    return emptyStats();
  }
}

export function saveStats(stats) {
  localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
  return stats;
}

export function recordMatch(mode, { win, ballsPocketed, fouls, run }) {
  const stats = loadStats();
  const apply = (bucket) => {
    bucket.matches += 1;
    if (win) bucket.wins += 1;
    else bucket.losses += 1;
    bucket.ballsPocketed += ballsPocketed;
    bucket.fouls += fouls;
    bucket.bestRun = Math.max(bucket.bestRun, run);
  };
  apply(stats);
  if (!stats.modes[mode]) stats.modes[mode] = emptyMode();
  apply(stats.modes[mode]);
  return saveStats(stats);
}

export function resetStats() {
  return saveStats(emptyStats());
}

export function winRate(bucket) {
  if (!bucket.matches) return 0;
  return Math.round((bucket.wins / bucket.matches) * 100);
}
