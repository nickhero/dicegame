import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, PLAYER_COLORS, PLAYER_COLOR_STRINGS } from '../config';
import { GameStatsSummary, PlayerStats } from '../game/GameStats';

interface GameOverData {
  winnerName: string;
  isVictory: boolean;
  stats?: GameStatsSummary;
  playerNames?: string[];
}

export class GameOverScene extends Phaser.Scene {
  private winnerName: string = '';
  private isVictory: boolean = false;
  private stats: GameStatsSummary | null = null;
  private playerNames: string[] = [];

  constructor() {
    super('GameOverScene');
  }

  init(data: GameOverData): void {
    this.winnerName = data.winnerName || 'Unknown';
    this.isVictory = data.isVictory ?? false;
    this.stats = data.stats ?? null;
    this.playerNames = data.playerNames ?? [];
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const hasStats = this.stats !== null;

    // Title area — push up if stats present
    const titleY = hasStats ? 40 : GAME_HEIGHT / 2 - 100;

    const titleText = this.isVictory ? 'VICTORY!' : 'DEFEAT';
    const titleColor = this.isVictory ? '#4ad94a' : '#d94a4a';

    this.add.text(cx, titleY, titleText, {
      fontSize: '40px',
      color: titleColor,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, titleY + 45, `Winner: ${this.winnerName}`, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (hasStats) {
      this.drawStatsPanel(cx, titleY + 80);
    }

    // Play again button — at bottom
    const btnY = hasStats ? GAME_HEIGHT - 45 : GAME_HEIGHT / 2 + 55;
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x4a90d9, 1);
    btnBg.fillRoundedRect(cx - 100, btnY - 25, 200, 50, 8);

    this.add.text(cx, btnY, 'PLAY AGAIN', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const hitZone = this.add.zone(cx, btnY, 200, 50).setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0x6ab0f9, 1);
      btnBg.fillRoundedRect(cx - 100, btnY - 25, 200, 50, 8);
    });

    hitZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x4a90d9, 1);
      btnBg.fillRoundedRect(cx - 100, btnY - 25, 200, 50, 8);
    });

    hitZone.on('pointerdown', () => {
      this.scene.start('MenuScene');
    });
  }

  private drawStatsPanel(cx: number, startY: number): void {
    const stats = this.stats!;

    // Game summary line
    this.add.text(cx, startY + 10, `${stats.turnCount} turns · ${stats.totalBattles} battles`, {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Per-player table
    const tableTop = startY + 35;
    const colX = [cx - 280, cx - 120, cx - 30, cx + 40, cx + 130];
    const headers = ['Player', 'Attacks', 'Won', 'Lost', 'Max Terr.'];
    const headerStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    };

    headers.forEach((h, i) => {
      this.add.text(colX[i], tableTop, h, headerStyle);
    });

    const rowStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '12px',
      fontFamily: 'monospace',
    };

    let rowY = tableTop + 20;
    const playerIds = Array.from(stats.perPlayer.keys()).sort((a, b) => a - b);
    for (const playerId of playerIds) {
      const ps = stats.perPlayer.get(playerId)!;
      const name = this.playerNames[playerId] ?? `P${playerId}`;
      const color = PLAYER_COLOR_STRINGS[playerId] ?? '#ffffff';

      this.add.text(colX[0], rowY, name, { ...rowStyle, color });
      this.add.text(colX[1], rowY, `${ps.attacksInitiated}`, { ...rowStyle, color: '#cccccc' });
      this.add.text(colX[2], rowY, `${ps.attacksWon}`, { ...rowStyle, color: '#cccccc' });
      this.add.text(colX[3], rowY, `${ps.attacksLost}`, { ...rowStyle, color: '#cccccc' });
      this.add.text(colX[4], rowY, `${ps.maxTerritories}`, { ...rowStyle, color: '#cccccc' });
      rowY += 18;
    }

    // Biggest upset
    if (stats.biggestUpset) {
      const u = stats.biggestUpset;
      const winnerName = this.playerNames[u.winnerId] ?? `P${u.winnerId}`;
      const upsetColor = PLAYER_COLOR_STRINGS[u.winnerId] ?? '#ffaa00';
      this.add.text(cx, rowY + 10, `⚡ Biggest upset: ${winnerName} won ${u.attackerDice}v${u.defenderDice}`, {
        fontSize: '13px',
        color: upsetColor,
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      rowY += 28;
    }

    // Territory chart
    this.drawTerritoryChart(cx, rowY + 20, stats);
  }

  private drawTerritoryChart(cx: number, topY: number, stats: GameStatsSummary): void {
    const chartW = 400;
    const chartH = 200;
    const left = cx - chartW / 2;
    const top = topY;

    this.add.text(cx, top - 5, 'Territories Over Time', {
      fontSize: '13px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const g = this.add.graphics();

    // Background
    g.fillStyle(0x111122, 0.7);
    g.fillRect(left, top + 10, chartW, chartH);
    g.lineStyle(1, 0x333355, 1);
    g.strokeRect(left, top + 10, chartW, chartH);

    // Determine data bounds
    let maxCount = 1;
    let maxTurns = 1;
    stats.territoriesOverTime.forEach((counts) => {
      if (counts.length > maxTurns) maxTurns = counts.length;
      for (const c of counts) {
        if (c > maxCount) maxCount = c;
      }
    });

    const padL = 30;
    const padR = 10;
    const padT = 20;
    const padB = 20;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    const plotLeft = left + padL;
    const plotTop = top + 10 + padT;

    // Y-axis labels
    const ySteps = Math.min(maxCount, 5);
    for (let i = 0; i <= ySteps; i++) {
      const val = Math.round((maxCount * i) / ySteps);
      const y = plotTop + plotH - (plotH * i) / ySteps;
      g.lineStyle(1, 0x333355, 0.5);
      g.beginPath();
      g.moveTo(plotLeft, y);
      g.lineTo(plotLeft + plotW, y);
      g.strokePath();
      this.add.text(plotLeft - 5, y, `${val}`, {
        fontSize: '10px',
        color: '#666666',
        fontFamily: 'monospace',
      }).setOrigin(1, 0.5);
    }

    // X-axis labels
    const xLabelCount = Math.min(maxTurns, 6);
    for (let i = 0; i <= xLabelCount; i++) {
      const turn = Math.round((maxTurns * i) / xLabelCount);
      const x = plotLeft + (plotW * i) / xLabelCount;
      this.add.text(x, plotTop + plotH + 5, `${turn}`, {
        fontSize: '10px',
        color: '#666666',
        fontFamily: 'monospace',
      }).setOrigin(0.5, 0);
    }

    // Draw lines per player
    stats.territoriesOverTime.forEach((counts, playerId) => {
      if (counts.length < 2) return;
      const color = PLAYER_COLORS[playerId] ?? 0xffffff;
      g.lineStyle(2, color, 0.9);
      g.beginPath();

      for (let i = 0; i < counts.length; i++) {
        const x = plotLeft + (plotW * i) / (maxTurns - 1);
        const y = plotTop + plotH - (plotH * counts[i]) / maxCount;
        if (i === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      }
      g.strokePath();
    });
  }
}
