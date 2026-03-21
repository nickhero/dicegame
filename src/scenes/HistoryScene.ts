import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, PLAYER_COLOR_STRINGS } from '../config';
import { loadHistory, deleteMatch, clearHistory, MatchHistoryEntry } from '../game/MatchHistory';

const ROWS_PER_PAGE = 8;

export class HistoryScene extends Phaser.Scene {
  private entries: MatchHistoryEntry[] = [];
  private page = 0;
  private container!: Phaser.GameObjects.Container;

  constructor() {
    super('HistoryScene');
  }

  create(): void {
    this.entries = loadHistory();
    this.page = 0;
    this.container = this.add.container(0, 0);

    const cx = GAME_WIDTH / 2;

    // Title
    this.add.text(cx, 30, 'MATCH HISTORY', {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    if (this.entries.length === 0) {
      this.add.text(cx, GAME_HEIGHT / 2, 'No matches yet. Play a game first!', {
        fontSize: '16px',
        color: '#888888',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
    } else {
      this.drawPage();
    }

    // Back button
    this.createButton(80, GAME_HEIGHT - 40, 'BACK', 0x555555, 0x777777, () => {
      this.scene.start('MenuScene');
    });

    // Clear history button
    if (this.entries.length > 0) {
      this.createButton(GAME_WIDTH - 100, GAME_HEIGHT - 40, 'CLEAR ALL', 0x663333, 0xaa4444, () => {
        clearHistory();
        this.entries = [];
        this.container.removeAll(true);
        this.add.text(cx, GAME_HEIGHT / 2, 'History cleared.', {
          fontSize: '16px',
          color: '#888888',
          fontFamily: 'monospace',
        }).setOrigin(0.5);
      });
    }

    // Keyboard
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.scene.start('MenuScene');
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        this.nextPage();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        this.prevPage();
      }
    });
  }

  private drawPage(): void {
    this.container.removeAll(true);

    const cx = GAME_WIDTH / 2;
    const startIdx = this.page * ROWS_PER_PAGE;
    const pageEntries = this.entries.slice(startIdx, startIdx + ROWS_PER_PAGE);
    const totalPages = Math.ceil(this.entries.length / ROWS_PER_PAGE);

    // Column headers
    const headerY = 70;
    const colX = [40, 200, 400, 540, 680];
    const headers = ['Date', 'Winner', 'Players', 'Turns', 'Actions'];
    headers.forEach((h, i) => {
      const t = this.add.text(colX[i], headerY, h, {
        fontSize: '12px', color: '#666688', fontFamily: 'monospace', fontStyle: 'bold',
      });
      this.container.add(t);
    });

    // Rows
    pageEntries.forEach((entry, i) => {
      const y = 100 + i * 60;
      const rowBg = this.add.graphics();
      rowBg.fillStyle(i % 2 === 0 ? 0x111122 : 0x161633, 0.6);
      rowBg.fillRect(30, y - 5, GAME_WIDTH - 60, 50);
      this.container.add(rowBg);

      // Date
      const date = new Date(entry.date);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      this.container.add(this.add.text(colX[0], y, dateStr, {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
      }));

      // Winner
      const winnerColor = entry.winnerId !== null
        ? (PLAYER_COLOR_STRINGS[entry.winnerId] ?? '#ffffff')
        : '#ffffff';
      this.container.add(this.add.text(colX[1], y, entry.winnerName, {
        fontSize: '13px', color: winnerColor, fontFamily: 'monospace', fontStyle: 'bold',
      }));

      // Players
      const playerStr = entry.playerNames.join(', ');
      this.container.add(this.add.text(colX[2], y, playerStr, {
        fontSize: '11px', color: '#888888', fontFamily: 'monospace',
        wordWrap: { width: 130 },
      }));

      // Turns
      this.container.add(this.add.text(colX[3], y, `${entry.turnCount}`, {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
      }));

      // Replay button
      const replayBtn = this.createButton(colX[4] + 30, y + 12, '▶ Replay', 0x905ad9, 0xb07af9, () => {
        this.scene.start('ReplayScene', { recording: entry.recording });
      }, 11);
      this.container.add(replayBtn);

      // Delete button
      const delBtn = this.createButton(colX[4] + 120, y + 12, '✕', 0x663333, 0xaa4444, () => {
        deleteMatch(entry.id);
        this.entries = loadHistory();
        if (this.page > 0 && this.page * ROWS_PER_PAGE >= this.entries.length) {
          this.page--;
        }
        this.drawPage();
      }, 11);
      this.container.add(delBtn);
    });

    // Pagination
    if (totalPages > 1) {
      const pageText = this.add.text(cx, GAME_HEIGHT - 80, `Page ${this.page + 1} / ${totalPages}`, {
        fontSize: '13px', color: '#888888', fontFamily: 'monospace',
      }).setOrigin(0.5);
      this.container.add(pageText);

      if (this.page > 0) {
        const prev = this.createButton(cx - 100, GAME_HEIGHT - 80, '◀ Prev', 0x444444, 0x666666, () => this.prevPage(), 12);
        this.container.add(prev);
      }
      if (this.page < totalPages - 1) {
        const next = this.createButton(cx + 100, GAME_HEIGHT - 80, 'Next ▶', 0x444444, 0x666666, () => this.nextPage(), 12);
        this.container.add(next);
      }
    }
  }

  private nextPage(): void {
    const totalPages = Math.ceil(this.entries.length / ROWS_PER_PAGE);
    if (this.page < totalPages - 1) {
      this.page++;
      this.drawPage();
    }
  }

  private prevPage(): void {
    if (this.page > 0) {
      this.page--;
      this.drawPage();
    }
  }

  private createButton(
    x: number, y: number, label: string,
    normalColor: number, hoverColor: number,
    onClick: () => void, fontSize = 14,
  ): Phaser.GameObjects.Container {
    const btn = this.add.container(x, y);

    const w = Math.max(80, label.length * (fontSize * 0.65) + 20);
    const h = fontSize + 14;

    const bg = this.add.graphics();
    bg.fillStyle(normalColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    btn.add(bg);

    const text = this.add.text(0, 0, label, {
      fontSize: `${fontSize}px`, color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(text);

    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    });
    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(normalColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    });
    zone.on('pointerdown', onClick);
    btn.add(zone);

    return btn;
  }
}
