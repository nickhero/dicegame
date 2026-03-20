import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

export class GameOverScene extends Phaser.Scene {
  private winnerName: string = '';
  private isVictory: boolean = false;

  constructor() {
    super('GameOverScene');
  }

  init(data: { winnerName: string; isVictory: boolean }): void {
    this.winnerName = data.winnerName || 'Unknown';
    this.isVictory = data.isVictory ?? false;
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const titleText = this.isVictory ? 'VICTORY!' : 'DEFEAT';
    const titleColor = this.isVictory ? '#4ad94a' : '#d94a4a';

    this.add.text(cx, cy - 100, titleText, {
      fontSize: '48px',
      color: titleColor,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 40, `Winner: ${this.winnerName}`, {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Play again button
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x4a90d9, 1);
    btnBg.fillRoundedRect(cx - 100, cy + 30, 200, 50, 8);

    this.add.text(cx, cy + 55, 'PLAY AGAIN', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const hitZone = this.add.zone(cx, cy + 55, 200, 50).setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0x6ab0f9, 1);
      btnBg.fillRoundedRect(cx - 100, cy + 30, 200, 50, 8);
    });

    hitZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x4a90d9, 1);
      btnBg.fillRoundedRect(cx - 100, cy + 30, 200, 50, 8);
    });

    hitZone.on('pointerdown', () => {
      this.scene.start('MenuScene');
    });
  }
}
