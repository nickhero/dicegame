import Phaser from 'phaser';
import {
  loadHistory,
  getAchievementStatus,
  GAME_WIDTH, GAME_HEIGHT,
} from '@dicewars/shared';
import { VERSION } from '../version';

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

    // Achievements button
    const achievements = getAchievementStatus();
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const achieveLabel = `ACHIEVEMENTS (${unlockedCount}/${achievements.length})`;
    this.createMenuButton(cx, cy + 175, achieveLabel, 0xd99a4a, 0xf9ba6a, () => {
      this.showAchievements();
    });

    // Version
    this.add.text(GAME_WIDTH - 10, GAME_HEIGHT - 10, `v${VERSION}`, {
      fontSize: '11px',
      color: '#444455',
      fontFamily: 'monospace',
    }).setOrigin(1, 1);
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

  private showAchievements(): void {
    const cx = GAME_WIDTH / 2;
    const achievements = getAchievementStatus();

    // Overlay container
    const overlay = this.add.container(0, 0).setDepth(200);

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    overlay.add(bg);

    // Title
    const title = this.add.text(cx, 30, '🏆 ACHIEVEMENTS', {
      fontSize: '24px',
      color: '#ffcc00',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    overlay.add(title);

    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const subtitle = this.add.text(cx, 58, `${unlockedCount} / ${achievements.length} unlocked`, {
      fontSize: '13px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    overlay.add(subtitle);

    // Achievement grid
    const cols = 3;
    const cardW = 310;
    const cardH = 55;
    const gapX = 15;
    const gapY = 10;
    const gridW = cols * cardW + (cols - 1) * gapX;
    const gridLeft = cx - gridW / 2;
    const gridTop = 85;

    achievements.forEach((entry, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridLeft + col * (cardW + gapX);
      const y = gridTop + row * (cardH + gapY);

      const cardBg = this.add.graphics();
      const cardColor = entry.unlocked ? 0x2a3a2a : 0x1a1a2a;
      const borderColor = entry.unlocked ? 0x4ad94a : 0x333355;
      cardBg.fillStyle(cardColor, 1);
      cardBg.fillRoundedRect(x, y, cardW, cardH, 6);
      cardBg.lineStyle(1, borderColor, 0.6);
      cardBg.strokeRoundedRect(x, y, cardW, cardH, 6);
      overlay.add(cardBg);

      const emoji = entry.unlocked ? entry.def.emoji : '🔒';
      const nameColor = entry.unlocked ? '#ffffff' : '#666666';
      const descColor = entry.unlocked ? '#aaaaaa' : '#444444';

      const nameText = this.add.text(x + 10, y + 8, `${emoji} ${entry.def.name}`, {
        fontSize: '13px',
        color: nameColor,
        fontFamily: 'monospace',
        fontStyle: 'bold',
      });
      overlay.add(nameText);

      const descText = this.add.text(x + 10, y + 28, entry.def.description, {
        fontSize: '10px',
        color: descColor,
        fontFamily: 'monospace',
      });
      overlay.add(descText);
    });

    // Close button
    const closeY = gridTop + Math.ceil(achievements.length / cols) * (cardH + gapY) + 15;
    const closeBg = this.add.graphics();
    closeBg.fillStyle(0x444466, 1);
    closeBg.fillRoundedRect(cx - 60, closeY, 120, 40, 8);
    overlay.add(closeBg);

    const closeText = this.add.text(cx, closeY + 20, 'CLOSE', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    overlay.add(closeText);

    const closeZone = this.add.zone(cx, closeY + 20, 120, 40).setInteractive({ useHandCursor: true }).setDepth(201);
    closeZone.on('pointerover', () => {
      closeBg.clear();
      closeBg.fillStyle(0x666688, 1);
      closeBg.fillRoundedRect(cx - 60, closeY, 120, 40, 8);
    });
    closeZone.on('pointerout', () => {
      closeBg.clear();
      closeBg.fillStyle(0x444466, 1);
      closeBg.fillRoundedRect(cx - 60, closeY, 120, 40, 8);
    });
    closeZone.on('pointerdown', () => {
      overlay.destroy();
      closeZone.destroy();
    });
  }
}
