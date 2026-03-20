import Phaser from 'phaser';

// Re-export pure constants so rendering/scenes can import from one place
export {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_COLORS,
  PLAYER_COLOR_STRINGS,
  MAX_DICE_PER_TERRITORY,
  MAX_RESERVE_DICE,
  DEFAULT_TERRITORY_COUNT,
  DEFAULT_PLAYER_COUNT,
} from './game/constants';

import { GAME_WIDTH, GAME_HEIGHT } from './game/constants';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [], // populated in main.ts
};
