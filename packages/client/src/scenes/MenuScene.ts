import Phaser from 'phaser';
import {
  loadHistory,
  getAchievementStatus,
  GAME_WIDTH, GAME_HEIGHT,
} from '@dicewars/shared';
import { VERSION } from '../version';
import { AuthClient } from '../network/AuthClient';
import { LobbyClient, UserStats } from '../network/LobbyClient';

export class MenuScene extends Phaser.Scene {
  private authClient!: AuthClient;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.authClient = new AuthClient();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Title
    this.add.text(cx, cy - 140, 'DICE WARS', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 85, 'A territory strategy game', {
      fontSize: '15px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // User badge in top right
    const user = this.authClient.getUser();
    if (user) {
      const accountBadge = user.isGuest ? 'Guest' : 'Member';
      this.add.text(GAME_WIDTH - 20, 20, `👤 ${user.name} (${accountBadge})`, {
        fontSize: '13px',
        color: '#4ecca3',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(1, 0);
    }

    // Menu Buttons
    const btnStartY = cy - 20;
    const btnSpacing = 60;

    // 1. Local Game
    this.createMenuButton(cx, btnStartY, 'LOCAL GAME', 0x4a90d9, 0x6ab0f9, () => {
      this.scene.start('SetupScene');
    });

    // 2. Play Online
    this.createMenuButton(cx, btnStartY + btnSpacing, 'PLAY ONLINE', 0x4ad9a5, 0x6af9c5, () => {
      this.scene.start('LoginScene', { authClient: this.authClient });
    });

    // 3. Match History
    const historyCount = loadHistory().length;
    const historyLabel = historyCount > 0 ? `MATCH HISTORY (${historyCount})` : 'MATCH HISTORY';
    this.createMenuButton(cx, btnStartY + btnSpacing * 2, historyLabel, 0x905ad9, 0xb07af9, () => {
      this.scene.start('HistoryScene', { authClient: this.authClient });
    });

    // 4. Achievements
    const achievements = getAchievementStatus();
    const unlockedCount = achievements.filter((a) => a.unlocked).length;
    const achieveLabel = `ACHIEVEMENTS (${unlockedCount}/${achievements.length})`;
    this.createMenuButton(cx, btnStartY + btnSpacing * 3, achieveLabel, 0xd99a4a, 0xf9ba6a, () => {
      this.showAchievements();
    });

    // 5. Profile & Stats
    this.createMenuButton(cx, btnStartY + btnSpacing * 4, 'PROFILE & STATS', 0x5a70d9, 0x7a90f9, () => {
      this.showProfileStats();
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
    btnBg.fillRoundedRect(x - 120, y - 22, 240, 46, 8);

    this.add.text(x, y, label, {
      fontSize: '17px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const hitZone = this.add.zone(x, y, 240, 46).setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(hoverColor, 1);
      btnBg.fillRoundedRect(x - 120, y - 22, 240, 46, 8);
    });

    hitZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(normalColor, 1);
      btnBg.fillRoundedRect(x - 120, y - 22, 240, 46, 8);
    });

    hitZone.on('pointerdown', onClick);
  }

  private showProfileStats(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const overlay = this.add.container(0, 0).setDepth(200);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.88);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    overlay.add(bg);

    const panelW = 460;
    const panelH = 380;
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x16162a, 1);
    panelBg.fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 12);
    panelBg.lineStyle(2, 0x4a4a77, 1);
    panelBg.strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 12);
    overlay.add(panelBg);

    const title = this.add.text(cx, cy - panelH / 2 + 35, '📊 PLAYER PROFILE', {
      fontSize: '22px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    overlay.add(title);

    const user = this.authClient.getUser();
    if (!user || !this.authClient.isAuthenticated()) {
      const msg = this.add.text(cx, cy - 30, 'Not signed in.\nSign in or register to record match history\nand track online stats.', {
        fontSize: '15px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: 8,
      }).setOrigin(0.5);
      overlay.add(msg);

      const signinBtn = this.createOverlayButton(cx, cy + 60, 'SIGN IN / REGISTER', 0xe94560, 0xff6580, () => {
        overlay.destroy();
        this.scene.start('LoginScene', { authClient: this.authClient });
      });
      overlay.add(signinBtn);

      const closeBtn = this.createOverlayButton(cx, cy + 125, 'CLOSE', 0x444466, 0x666688, () => {
        overlay.destroy();
      });
      overlay.add(closeBtn);
      return;
    }

    // Authenticated profile
    const nameText = this.add.text(cx, cy - panelH / 2 + 70, `${user.name} (${user.isGuest ? 'Guest' : 'Registered Member'})`, {
      fontSize: '15px',
      color: '#4ecca3',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    overlay.add(nameText);

    const loadingText = this.add.text(cx, cy, 'Loading stats...', {
      fontSize: '14px',
      color: '#8888aa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    overlay.add(loadingText);

    const lobbyClient = new LobbyClient(this.authClient.getToken()!, this.authClient.getServerUrl());

    lobbyClient.getUserStats().then((stats: UserStats) => {
      loadingText.destroy();

      const statsGrid = [
        { label: 'GAMES PLAYED', val: `${stats.totalGames}` },
        { label: 'VICTORIES', val: `${stats.wins}` },
        { label: 'DEFEATS', val: `${stats.losses}` },
        { label: 'WIN RATE', val: `${stats.winRate}%` },
        { label: 'AVG TURNS', val: `${stats.averageTurnCount}` },
        { label: 'WIN STREAK', val: `${stats.longestWinStreak}` },
      ];

      const startY = cy - 65;
      const colW = 130;
      const rowH = 65;

      statsGrid.forEach((item, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const cardX = cx - colW + col * colW;
        const cardY = startY + row * rowH;

        const box = this.add.graphics();
        box.fillStyle(0x0f1123, 0.9);
        box.fillRoundedRect(cardX - 58, cardY - 25, 116, 52, 6);
        box.lineStyle(1, 0x333366, 0.6);
        box.strokeRoundedRect(cardX - 58, cardY - 25, 116, 52, 6);
        overlay.add(box);

        const valTxt = this.add.text(cardX, cardY - 8, item.val, {
          fontSize: '18px',
          color: '#ffffff',
          fontFamily: 'monospace',
          fontStyle: 'bold',
        }).setOrigin(0.5);
        overlay.add(valTxt);

        const lblTxt = this.add.text(cardX, cardY + 12, item.label, {
          fontSize: '10px',
          color: '#8888aa',
          fontFamily: 'monospace',
        }).setOrigin(0.5);
        overlay.add(lblTxt);
      });
    }).catch(() => {
      loadingText.setText('Could not retrieve stats').setColor('#e94560');
    });

    // Log out button
    const logoutBtn = this.createOverlayButton(cx - 75, cy + panelH / 2 - 40, 'LOG OUT', 0x663333, 0x884444, () => {
      this.authClient.logout();
      overlay.destroy();
      this.scene.restart();
    }, 120, 36);
    overlay.add(logoutBtn);

    // Close button
    const closeBtn = this.createOverlayButton(cx + 75, cy + panelH / 2 - 40, 'CLOSE', 0x444466, 0x666688, () => {
      overlay.destroy();
    }, 120, 36);
    overlay.add(closeBtn);
  }

  private createOverlayButton(
    x: number, y: number, label: string,
    normalColor: number, hoverColor: number,
    onClick: () => void,
    w = 200, h = 40,
  ): Phaser.GameObjects.Container {
    const btn = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(normalColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    btn.add(bg);

    const txt = this.add.text(0, 0, label, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(txt);

    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    btn.add(zone);

    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    });

    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(normalColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    });

    zone.on('pointerdown', onClick);

    return btn;
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
