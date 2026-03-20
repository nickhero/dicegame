import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

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
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x4a90d9, 1);
    btnBg.fillRoundedRect(cx - 100, cy + 20, 200, 50, 8);

    const btnText = this.add.text(cx, cy + 45, 'START GAME', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Make button interactive
    const hitZone = this.add.zone(cx, cy + 45, 200, 50).setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0x6ab0f9, 1);
      btnBg.fillRoundedRect(cx - 100, cy + 20, 200, 50, 8);
    });

    hitZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x4a90d9, 1);
      btnBg.fillRoundedRect(cx - 100, cy + 20, 200, 50, 8);
    });

    hitZone.on('pointerdown', () => {
      this.scene.start('GameScene');
    });
  }
}
