import Phaser from 'phaser';
import {
  loadHistory, deleteMatch, clearHistory, MatchHistoryEntry,
  GAME_WIDTH, GAME_HEIGHT, PLAYER_COLOR_STRINGS,
} from '@dicewars/shared';
import { AuthClient } from '../network/AuthClient';
import { LobbyClient, UserMatchSummary, AuthExpiredError } from '../network/LobbyClient';

const ROWS_PER_PAGE = 7;

export class HistoryScene extends Phaser.Scene {
  private authClient!: AuthClient;
  private lobbyClient: LobbyClient | null = null;
  private returnScene = 'MenuScene';
  private fromLobby = false;

  private activeTab: 'local' | 'online' = 'local';
  private localEntries: MatchHistoryEntry[] = [];
  private onlineEntries: UserMatchSummary[] = [];

  private localPage = 0;
  private onlinePage = 0;
  private isLoadingOnline = false;
  private onlineError: string | null = null;

  private container!: Phaser.GameObjects.Container;
  private tabLocal!: Phaser.GameObjects.Text;
  private tabOnline!: Phaser.GameObjects.Text;
  private tabUnderline!: Phaser.GameObjects.Graphics;

  constructor() {
    super('HistoryScene');
  }

  init(data: Record<string, unknown>): void {
    this.authClient = (data.authClient as AuthClient) ?? new AuthClient();
    this.lobbyClient = (data.lobbyClient as LobbyClient) ??
      (this.authClient.isAuthenticated()
        ? new LobbyClient(this.authClient.getToken()!, this.authClient.getServerUrl())
        : null);
    this.fromLobby = !!data.fromLobby;
    this.returnScene = (data.returnScene as string) ?? (this.fromLobby ? 'LobbyScene' : 'MenuScene');
    this.activeTab = (data.activeTab as 'local' | 'online') ?? (this.fromLobby ? 'online' : 'local');
    this.localPage = 0;
    this.onlinePage = 0;
    this.isLoadingOnline = false;
    this.onlineError = null;
  }

  create(): void {
    this.container = this.add.container(0, 0);

    const cx = GAME_WIDTH / 2;

    // Header Title
    this.add.text(cx, 30, 'MATCH HISTORY', {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Tabs
    const tabY = 70;
    this.tabLocal = this.add.text(cx - 130, tabY, 'LOCAL MATCHES', {
      fontSize: '15px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tabOnline = this.add.text(cx + 130, tabY, 'ONLINE MATCHES', {
      fontSize: '15px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tabUnderline = this.add.graphics();

    this.tabLocal.on('pointerdown', () => this.switchTab('local'));
    this.tabOnline.on('pointerdown', () => this.switchTab('online'));

    // Back button
    this.createButton(80, GAME_HEIGHT - 35, 'BACK', 0x555555, 0x777777, () => {
      this.goBack();
    });

    // Keyboard navigation
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.goBack();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        this.nextPage();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        this.prevPage();
      }
    });

    this.switchTab(this.activeTab);
  }

  private goBack(): void {
    if (this.returnScene === 'LobbyScene') {
      this.scene.start('LobbyScene', {
        authClient: this.authClient,
        lobbyClient: this.lobbyClient,
      });
    } else {
      this.scene.start('MenuScene');
    }
  }

  private switchTab(tab: 'local' | 'online'): void {
    this.activeTab = tab;
    this.updateTabStyles();

    if (tab === 'local') {
      this.localEntries = loadHistory();
      this.renderLocalPage();
    } else {
      this.loadAndRenderOnline();
    }
  }

  private updateTabStyles(): void {
    const activeTabObj = this.activeTab === 'local' ? this.tabLocal : this.tabOnline;
    this.tabLocal.setColor(this.activeTab === 'local' ? '#e94560' : '#777799');
    this.tabOnline.setColor(this.activeTab === 'online' ? '#e94560' : '#777799');

    this.tabUnderline.clear();
    this.tabUnderline.fillStyle(0xe94560, 1);
    this.tabUnderline.fillRect(
      activeTabObj.x - activeTabObj.width / 2,
      activeTabObj.y + 12,
      activeTabObj.width,
      3,
    );
  }

  // ─── Local Matches Tab ─────────────────────────────────────────────────────

  private renderLocalPage(): void {
    this.container.removeAll(true);
    const cx = GAME_WIDTH / 2;

    if (this.localEntries.length === 0) {
      this.container.add(
        this.add.text(cx, GAME_HEIGHT / 2, 'No local matches found. Play a game first!', {
          fontSize: '16px',
          color: '#888888',
          fontFamily: 'monospace',
        }).setOrigin(0.5)
      );
      return;
    }

    const startIdx = this.localPage * ROWS_PER_PAGE;
    const pageEntries = this.localEntries.slice(startIdx, startIdx + ROWS_PER_PAGE);
    const totalPages = Math.ceil(this.localEntries.length / ROWS_PER_PAGE);

    // Column headers
    const headerY = 110;
    const colX = [40, 200, 400, 540, 680];
    const headers = ['Date', 'Winner', 'Players', 'Turns', 'Actions'];
    headers.forEach((h, i) => {
      this.container.add(
        this.add.text(colX[i], headerY, h, {
          fontSize: '12px',
          color: '#666688',
          fontFamily: 'monospace',
          fontStyle: 'bold',
        })
      );
    });

    // Rows
    pageEntries.forEach((entry, i) => {
      const y = 145 + i * 58;
      const rowBg = this.add.graphics();
      rowBg.fillStyle(i % 2 === 0 ? 0x111122 : 0x161633, 0.6);
      rowBg.fillRect(30, y - 5, GAME_WIDTH - 60, 48);
      this.container.add(rowBg);

      const date = new Date(entry.date);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      this.container.add(this.add.text(colX[0], y + 10, dateStr, {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
      }));

      const winnerColor = entry.winnerId !== null
        ? (PLAYER_COLOR_STRINGS[entry.winnerId] ?? '#ffffff')
        : '#ffffff';
      this.container.add(this.add.text(colX[1], y + 10, entry.winnerName, {
        fontSize: '13px', color: winnerColor, fontFamily: 'monospace', fontStyle: 'bold',
      }));

      const playerStr = entry.playerNames.join(', ');
      this.container.add(this.add.text(colX[2], y + 10, playerStr, {
        fontSize: '11px', color: '#888888', fontFamily: 'monospace',
        wordWrap: { width: 130 },
      }));

      this.container.add(this.add.text(colX[3], y + 10, `${entry.turnCount}`, {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
      }));

      // Replay button
      const replayBtn = this.createButton(colX[4] + 30, y + 18, '▶ Replay', 0x905ad9, 0xb07af9, () => {
        this.scene.start('ReplayScene', { recording: entry.recording });
      }, 11);
      this.container.add(replayBtn);

      // Delete button
      const delBtn = this.createButton(colX[4] + 120, y + 18, '✕', 0x663333, 0xaa4444, () => {
        deleteMatch(entry.id);
        this.localEntries = loadHistory();
        if (this.localPage > 0 && this.localPage * ROWS_PER_PAGE >= this.localEntries.length) {
          this.localPage--;
        }
        this.renderLocalPage();
      }, 11);
      this.container.add(delBtn);
    });

    // Clear All button
    if (this.localEntries.length > 0) {
      const clearBtn = this.createButton(GAME_WIDTH - 100, GAME_HEIGHT - 35, 'CLEAR ALL', 0x663333, 0xaa4444, () => {
        clearHistory();
        this.localEntries = [];
        this.renderLocalPage();
      });
      this.container.add(clearBtn);
    }

    // Pagination
    this.renderPagination(this.localPage, totalPages);
  }

  // ─── Online Matches Tab ────────────────────────────────────────────────────

  private async loadAndRenderOnline(): Promise<void> {
    this.container.removeAll(true);
    const cx = GAME_WIDTH / 2;

    if (!this.authClient.isAuthenticated()) {
      this.container.add(
        this.add.text(cx, GAME_HEIGHT / 2 - 30, 'Sign in with an account or guest to view online match history.', {
          fontSize: '15px',
          color: '#aaaaaa',
          fontFamily: 'monospace',
          align: 'center',
        }).setOrigin(0.5)
      );

      const signinBtn = this.createButton(cx, GAME_HEIGHT / 2 + 30, 'SIGN IN / REGISTER', 0xe94560, 0xff6580, () => {
        this.scene.start('LoginScene');
      });
      this.container.add(signinBtn);
      return;
    }

    if (!this.lobbyClient) {
      this.lobbyClient = new LobbyClient(this.authClient.getToken()!, this.authClient.getServerUrl());
    }

    this.container.add(
      this.add.text(cx, GAME_HEIGHT / 2, 'Loading online match history...', {
        fontSize: '15px',
        color: '#8888aa',
        fontFamily: 'monospace',
      }).setOrigin(0.5)
    );

    try {
      this.onlineEntries = await this.lobbyClient.getMatchHistory(ROWS_PER_PAGE, this.onlinePage * ROWS_PER_PAGE);
      this.renderOnlineRows();
    } catch (err) {
      this.container.removeAll(true);
      const errMsg = err instanceof AuthExpiredError
        ? 'Session expired. Please log in again.'
        : 'Failed to load online matches. Server may be unavailable.';

      this.container.add(
        this.add.text(cx, GAME_HEIGHT / 2 - 20, errMsg, {
          fontSize: '15px',
          color: '#e94560',
          fontFamily: 'monospace',
          align: 'center',
        }).setOrigin(0.5)
      );

      const retryBtn = this.createButton(cx, GAME_HEIGHT / 2 + 30, 'RETRY', 0x0f3460, 0x16213e, () => {
        this.loadAndRenderOnline();
      });
      this.container.add(retryBtn);
    }
  }

  private renderOnlineRows(): void {
    this.container.removeAll(true);
    const cx = GAME_WIDTH / 2;

    if (this.onlineEntries.length === 0) {
      this.container.add(
        this.add.text(cx, GAME_HEIGHT / 2, 'No online matches recorded yet.', {
          fontSize: '16px',
          color: '#888888',
          fontFamily: 'monospace',
        }).setOrigin(0.5)
      );
      return;
    }

    // Column headers
    const headerY = 110;
    const colX = [40, 200, 380, 520, 680];
    const headers = ['Date', 'Result', 'Players', 'Turns', 'Actions'];
    headers.forEach((h, i) => {
      this.container.add(
        this.add.text(colX[i], headerY, h, {
          fontSize: '12px',
          color: '#666688',
          fontFamily: 'monospace',
          fontStyle: 'bold',
        })
      );
    });

    // Rows
    this.onlineEntries.forEach((entry, i) => {
      const y = 145 + i * 58;
      const rowBg = this.add.graphics();
      rowBg.fillStyle(i % 2 === 0 ? 0x111122 : 0x161633, 0.6);
      rowBg.fillRect(30, y - 5, GAME_WIDTH - 60, 48);
      this.container.add(rowBg);

      const date = new Date(entry.createdAt);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      this.container.add(this.add.text(colX[0], y + 10, dateStr, {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
      }));

      // Result (Victory / Defeat)
      const resultText = entry.userWon ? '🏆 VICTORY' : 'DEFEAT';
      const resultColor = entry.userWon ? '#4ecca3' : '#e94560';
      this.container.add(this.add.text(colX[1], y + 10, resultText, {
        fontSize: '13px', color: resultColor, fontFamily: 'monospace', fontStyle: 'bold',
      }));

      // Player info
      const playerStr = `${entry.playerCount} Players (Slot ${entry.userPlayerIndex + 1})`;
      this.container.add(this.add.text(colX[2], y + 10, playerStr, {
        fontSize: '12px', color: '#888888', fontFamily: 'monospace',
      }));

      // Turns
      this.container.add(this.add.text(colX[3], y + 10, `${entry.turnCount ?? '-'}`, {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
      }));

      // Replay button
      const replayBtn = this.createButton(colX[4] + 30, y + 18, '▶ Replay', 0x905ad9, 0xb07af9, async () => {
        try {
          if (!this.lobbyClient) return;
          const detail = await this.lobbyClient.getMatchDetails(entry.id);
          if (detail.recording) {
            this.scene.start('ReplayScene', { recording: detail.recording });
          }
        } catch {
          // Replay not available
        }
      }, 11);
      this.container.add(replayBtn);

      // Delete button
      const delBtn = this.createButton(colX[4] + 120, y + 18, '✕', 0x663333, 0xaa4444, async () => {
        try {
          if (!this.lobbyClient) return;
          await this.lobbyClient.deleteMatch(entry.id);
          await this.loadAndRenderOnline();
        } catch {
          // Failed to delete
        }
      }, 11);
      this.container.add(delBtn);
    });

    // Pagination for online
    const hasNext = this.onlineEntries.length === ROWS_PER_PAGE;
    if (this.onlinePage > 0 || hasNext) {
      const pageText = this.add.text(cx, GAME_HEIGHT - 75, `Page ${this.onlinePage + 1}`, {
        fontSize: '13px', color: '#888888', fontFamily: 'monospace',
      }).setOrigin(0.5);
      this.container.add(pageText);

      if (this.onlinePage > 0) {
        const prev = this.createButton(cx - 100, GAME_HEIGHT - 75, '◀ Prev', 0x444444, 0x666666, () => {
          this.onlinePage--;
          this.loadAndRenderOnline();
        }, 12);
        this.container.add(prev);
      }
      if (hasNext) {
        const next = this.createButton(cx + 100, GAME_HEIGHT - 75, 'Next ▶', 0x444444, 0x666666, () => {
          this.onlinePage++;
          this.loadAndRenderOnline();
        }, 12);
        this.container.add(next);
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private renderPagination(currentPage: number, totalPages: number): void {
    if (totalPages <= 1) return;
    const cx = GAME_WIDTH / 2;

    const pageText = this.add.text(cx, GAME_HEIGHT - 75, `Page ${currentPage + 1} / ${totalPages}`, {
      fontSize: '13px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.container.add(pageText);

    if (currentPage > 0) {
      const prev = this.createButton(cx - 100, GAME_HEIGHT - 75, '◀ Prev', 0x444444, 0x666666, () => this.prevPage(), 12);
      this.container.add(prev);
    }
    if (currentPage < totalPages - 1) {
      const next = this.createButton(cx + 100, GAME_HEIGHT - 75, 'Next ▶', 0x444444, 0x666666, () => this.nextPage(), 12);
      this.container.add(next);
    }
  }

  private nextPage(): void {
    if (this.activeTab === 'local') {
      const totalPages = Math.ceil(this.localEntries.length / ROWS_PER_PAGE);
      if (this.localPage < totalPages - 1) {
        this.localPage++;
        this.renderLocalPage();
      }
    } else {
      if (this.onlineEntries.length === ROWS_PER_PAGE) {
        this.onlinePage++;
        this.loadAndRenderOnline();
      }
    }
  }

  private prevPage(): void {
    if (this.activeTab === 'local') {
      if (this.localPage > 0) {
        this.localPage--;
        this.renderLocalPage();
      }
    } else {
      if (this.onlinePage > 0) {
        this.onlinePage--;
        this.loadAndRenderOnline();
      }
    }
  }

  private createButton(
    x: number, y: number, label: string,
    normalColor: number, hoverColor: number,
    onClick: () => void, fontSize = 14,
  ): Phaser.GameObjects.Container {
    const btn = this.add.container(x, y);

    const padX = fontSize > 12 ? 18 : 12;
    const padY = fontSize > 12 ? 10 : 6;
    const approxW = label.length * (fontSize * 0.65) + padX * 2;
    const h = fontSize + padY * 2;

    const bg = this.add.graphics();
    bg.fillStyle(normalColor, 1);
    bg.fillRoundedRect(-approxW / 2, -h / 2, approxW, h, 6);
    btn.add(bg);

    const txt = this.add.text(0, 0, label, {
      fontSize: `${fontSize}px`,
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(txt);

    const zone = this.add.zone(0, 0, approxW, h).setInteractive({ useHandCursor: true });
    btn.add(zone);

    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-approxW / 2, -h / 2, approxW, h, 6);
    });

    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(normalColor, 1);
      bg.fillRoundedRect(-approxW / 2, -h / 2, approxW, h, 6);
    });

    zone.on('pointerdown', onClick);

    return btn;
  }
}
