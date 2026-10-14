/** Dimensões aproximadas de uma mesa de 8 pés (área de jogo). */
export const TABLE_LENGTH = 2.24;
export const TABLE_WIDTH = 1.12;
export const TABLE_HEIGHT = 0.45;
export const RAIL_WIDTH = 0.12;
export const RAIL_HEIGHT = 0.045;
export const CUSHION_HEIGHT = 0.038;
export const CUSHION_THICKNESS = 0.045;
export const END_CUSHION_INSET = 0.024;
export const SIDE_CUSHION_INSET = 0.003;
export const LEG_SIZE = 0.09;
export const LEG_HEIGHT = 0.72;

// Levemente maiores para combinar com a escala da nova mesa.
export const BALL_RADIUS = 0.028;
export const BALL_EDGE_MARGIN = 0.175;
export const BALL_END_EDGE_MARGIN = 0.28;
export const BALL_MOVEMENT_END_EDGE_MARGIN = 0.02;
export const BALL_MOVEMENT_SIDE_EDGE_MARGIN = 0.0245;
export const BALL_POCKET_APPROACH_MARGIN = 0.015;
export const BALL_CORNER_POCKET_APPROACH_MARGIN = 0.06;
export const BALL_CORNER_POCKET_GAP_WIDTH = 0.14;
export const BALL_MASS = 0.17;
export const POCKET_RADIUS = 0.06;
export const SIDE_POCKET_RADIUS = 0.055;
export const POCKET_DROP = 0.09;

export const HEAD_STRING = -TABLE_LENGTH * 0.25;
export const FOOT_SPOT = TABLE_LENGTH * 0.25;
export const KITCHEN_MIN_X = -TABLE_LENGTH / 2 + BALL_RADIUS * 2;
export const KITCHEN_MAX_X = HEAD_STRING;

export const FIXED_DT = 1 / 240;
export const MAX_SUBSTEPS = 16;
export const SLEEP_SPEED = 0.018;
export const SETTLE_FRAMES = 18;

export const MAX_SHOT_SPEED = 8;
export const CUE_MAX_PULL = 0.42;

/** Cores oficiais aproximadas das bolas 1–15. */
export const NUMBER_COLORS = {
  1: 0xd4a017,
  2: 0x1d4ed8,
  3: 0xb91c1c,
  4: 0x6b21a8,
  5: 0xea580c,
  6: 0x15803d,
  7: 0x7f1d1d,
  8: 0x111111,
  9: 0xd4a017,
  10: 0x1d4ed8,
  11: 0xb91c1c,
  12: 0x6b21a8,
  13: 0xea580c,
  14: 0x15803d,
  15: 0x7f1d1d,
};

export const STORAGE_SETTINGS = "sinuquinha-settings-v1";
export const STORAGE_STATS = "sinuquinha-stats-v1";

export const MODES = {
  EVEN_ODD: "even-odd",
  BOLINHO: "bolinho",
  EIGHT_BALL: "eight-ball",
  THREE_BALLS: "three-balls",
};

export const DIFFICULTIES = ["easy", "medium", "hard"];
