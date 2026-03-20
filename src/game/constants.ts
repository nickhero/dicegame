// Pure constants — no framework imports. Safe for game logic and tests.

export const PLAYER_COLORS = [
  0x4a90d9, // Blue (human)
  0xd94a4a, // Red
  0x4ad94a, // Green
  0xd9d94a, // Yellow
  0xd94ad9, // Purple
  0x4ad9d9, // Cyan
  0xd9914a, // Orange
  0x914ad9, // Violet
];

export const PLAYER_COLOR_STRINGS = PLAYER_COLORS.map(
  (c) => '#' + c.toString(16).padStart(6, '0')
);

export const MAX_DICE_PER_TERRITORY = 8;
export const MAX_RESERVE_DICE = 32;
export const DEFAULT_TERRITORY_COUNT = 28;
export const DEFAULT_PLAYER_COUNT = 4;
export const GAME_WIDTH = 1100;
export const GAME_HEIGHT = 700;
