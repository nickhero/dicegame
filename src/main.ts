import Phaser from 'phaser';
import { gameConfig } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { SetupScene } from './scenes/SetupScene';
import { GameOverScene } from './scenes/GameOverScene';
import { ReplayScene } from './scenes/ReplayScene';
import { HistoryScene } from './scenes/HistoryScene';

const config: Phaser.Types.Core.GameConfig = {
  ...gameConfig,
  scene: [BootScene, MenuScene, SetupScene, GameScene, GameOverScene, ReplayScene, HistoryScene],
};

new Phaser.Game(config);
