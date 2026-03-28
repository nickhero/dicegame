import Phaser from 'phaser';
import { setStorageAdapter } from '@dicewars/shared';
import { gameConfig } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { SetupScene } from './scenes/SetupScene';
import { GameOverScene } from './scenes/GameOverScene';
import { ReplayScene } from './scenes/ReplayScene';
import { HistoryScene } from './scenes/HistoryScene';
import { LoginScene } from './scenes/LoginScene';
import { LobbyScene } from './scenes/LobbyScene';
import { WaitingRoomScene } from './scenes/WaitingRoomScene';

// Wire up localStorage for the client
setStorageAdapter({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
});

const config: Phaser.Types.Core.GameConfig = {
  ...gameConfig,
  scene: [BootScene, MenuScene, SetupScene, GameScene, GameOverScene, ReplayScene, HistoryScene, LoginScene, LobbyScene, WaitingRoomScene],
};

new Phaser.Game(config);
