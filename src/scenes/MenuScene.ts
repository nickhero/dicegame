import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { loadHistory } from '../game/MatchHistory';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Title
    this.add.text(cx, cy - 120, 'DICE WARS', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 60, 'A territory strategy game', {
      fontSize: '16px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Start button
    this.createMenuButton(cx, cy + 45, 'START GAME', 0x4a90d9, 0x6ab0f9, () => {
      this.scene.start('SetupScene');
    });

    // Match History button
    const historyCount = loadHistory().length;
    const historyLabel = historyCount > 0 ? `MATCH HISTORY (${historyCount})` : 'MATCH HISTORY';
    this.createMenuButton(cx, cy + 110, historyLabel, 0x905ad9, 0xb07af9, () => {
      this.scene.start('HistoryScene');
    });
  }

  private createMenuButton(
    x: number, y: number, label: string,
    normalColor: number, hoverColor: number,
    onClick: () => void,
  ): void {
    const btnBg = this.add.graphics();
    btnBg.fillStyle(normalColor, 1);
    btnBg.fillRoundedRect(x - 120, y - 25, 240, 50, 8);

    this.add.text(x, y, label, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const hitZone = this.add.zone(x, y, 240, 50).setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(hoverColor, 1);
      btnBg.fillRoundedRect(x - 120, y - 25, 240, 50, 8);
    });

    hitZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(normalColor, 1);
      btnBg.fillRoundedRect(x - 120, y - 25, 240, 50, 8);
    });

    hitZone.on('pointerdown', onClick);
  }
}
