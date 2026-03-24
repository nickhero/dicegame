import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT,
  type GameRoomSummary,
} from '@dicewars/shared';
import { AuthClient } from '../network/AuthClient';
import { LobbyClient } from '../network/LobbyClient';

const ROW_HEIGHT = 45;
const LIST_TOP = 130;
const LIST_LEFT = 60;
const LIST_WIDTH = GAME_WIDTH - 120;
const MAX_VISIBLE_ROWS = 8;

export class LobbyScene extends Phaser.Scene {
  private authClient!: AuthClient;
  private lobbyClient!: LobbyClient;
  private games: GameRoomSummary[] = [];
  private listContainer!: Phaser.GameObjects.Container;
  private scrollOffset = 0;
  private statusText!: Phaser.GameObjects.Text;
  private pollTimer!: Phaser.Time.TimerEvent;
  private unsubGameList?: () => void;

  constructor() {
    super('LobbyScene');
  }

  init(data: Record<string, unknown>): void {
    this.authClient = data.authClient as AuthClient;
    this.lobbyClient = (data.lobbyClient as LobbyClient) ??
      new LobbyClient(this.authClient.getToken()!);
    this.games = [];
    this.scrollOffset = 0;
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    // Title
    this.add.text(cx, 30, 'GAME LOBBY', {
      fontSize: '32px',
      color: '#e94560',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // User info (top right)
    const user = this.authClient.getUser();
    if (user) {
      this.add.text(GAME_WIDTH - 20, 15, user.name, {
        fontSize: '14px',
        color: '#4ad94a',
        fontFamily: 'monospace',
      }).setOrigin(1, 0);
    }

    // Column headers
    const headerY = LIST_TOP - 20;
    this.add.text(LIST_LEFT + 10, headerY, 'NAME', {
      fontSize: '12px', color: '#888888', fontFamily: 'monospace',
    });
    this.add.text(LIST_LEFT + 260, headerY, 'CREATOR', {
      fontSize: '12px', color: '#888888', fontFamily: 'monospace',
    });
    this.add.text(LIST_LEFT + 460, headerY, 'PLAYERS', {
      fontSize: '12px', color: '#888888', fontFamily: 'monospace',
    });
    this.add.text(LIST_LEFT + 580, headerY, 'MAP', {
      fontSize: '12px', color: '#888888', fontFamily: 'monospace',
    });
    this.add.text(LIST_LEFT + 720, headerY, 'STATUS', {
      fontSize: '12px', color: '#888888', fontFamily: 'monospace',
    });

    // List container with mask for scrolling
    this.listContainer = this.add.container(0, 0);
    const maskShape = this.make.graphics({});
    maskShape.fillRect(LIST_LEFT, LIST_TOP, LIST_WIDTH, MAX_VISIBLE_ROWS * ROW_HEIGHT);
    this.listContainer.setMask(new Phaser.Display.Masks.GeometryMask(this, maskShape));

    // Status text
    this.statusText = this.add.text(cx, LIST_TOP + 80, 'Loading games...', {
      fontSize: '16px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Scroll with mouse wheel
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gx: number[], _gy: number[], _gz: number[], dy: number) => {
      const maxScroll = Math.max(0, this.games.length - MAX_VISIBLE_ROWS);
      this.scrollOffset = Phaser.Math.Clamp(
        this.scrollOffset + Math.sign(dy),
        0,
        maxScroll,
      );
      this.renderGameList();
    });

    // Buttons row
    const btnY = GAME_HEIGHT - 60;
    this.createButton(160, btnY, 'CREATE GAME', 0xe94560, 0xff6580, () => {
      this.scene.start('SetupScene', {
        authClient: this.authClient,
        lobbyClient: this.lobbyClient,
        multiplayer: true,
      });
    });

    this.createButton(370, btnY, 'REFRESH', 0x0f3460, 0x16213e, () => {
      this.refreshGames();
    });

    this.createButton(560, btnY, 'LOGOUT', 0x333355, 0x444477, () => {
      this.authClient.logout();
      this.scene.start('LoginScene');
    });

    this.createButton(750, btnY, 'BACK', 0x333355, 0x444477, () => {
      this.scene.start('MenuScene');
    });

    // WebSocket game list updates
    this.unsubGameList = this.lobbyClient.onGameListUpdate((games) => {
      this.games = games;
      this.renderGameList();
    });

    // Poll for games
    this.pollTimer = this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => this.refreshGames(),
    });

    this.refreshGames();
  }

  shutdown(): void {
    if (this.pollTimer) this.pollTimer.destroy();
    if (this.unsubGameList) this.unsubGameList();
    this.input.off('wheel');
  }

  private async refreshGames(): Promise<void> {
    try {
      this.games = await this.lobbyClient.getGames();
      this.renderGameList();
    } catch {
      this.statusText.setText('Failed to load games').setColor('#e94560');
    }
  }

  private renderGameList(): void {
    this.listContainer.removeAll(true);

    if (this.games.length === 0) {
      this.statusText.setText('No games available — create one!').setColor('#aaaaaa');
      this.statusText.setVisible(true);
      return;
    }
    this.statusText.setVisible(false);

    const visible = this.games.slice(this.scrollOffset, this.scrollOffset + MAX_VISIBLE_ROWS);
    visible.forEach((game, i) => {
      const y = LIST_TOP + i * ROW_HEIGHT;
      this.createGameRow(game, y);
    });
  }

  private createGameRow(game: GameRoomSummary, y: number): void {
    const rowBg = this.add.graphics();
    rowBg.fillStyle(0x0a0a1e, 1);
    rowBg.fillRoundedRect(LIST_LEFT, y, LIST_WIDTH, ROW_HEIGHT - 5, 4);
    this.listContainer.add(rowBg);

    // Game name
    const nameText = this.add.text(LIST_LEFT + 10, y + 12, game.name, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.listContainer.add(nameText);

    // Creator
    const creatorText = this.add.text(LIST_LEFT + 260, y + 12, game.creatorName, {
      fontSize: '14px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    this.listContainer.add(creatorText);

    // Player count
    const playerStr = `${game.playerCount}/${game.maxPlayers}`;
    const playerText = this.add.text(LIST_LEFT + 460, y + 12, playerStr, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    });
    this.listContainer.add(playerText);

    // Map shape
    const mapText = this.add.text(LIST_LEFT + 580, y + 12, game.config.mapShape, {
      fontSize: '14px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    this.listContainer.add(mapText);

    // Status
    const statusColor = game.status === 'waiting' ? '#4ad94a' : '#d9d94a';
    const statusLabel = game.status === 'waiting' ? 'OPEN' : 'IN GAME';
    const statusText = this.add.text(LIST_LEFT + 720, y + 12, statusLabel, {
      fontSize: '14px', color: statusColor, fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.listContainer.add(statusText);

    // Password indicator
    if (game.hasPassword) {
      const lockText = this.add.text(LIST_LEFT + 810, y + 12, '🔒', {
        fontSize: '12px', fontFamily: 'monospace',
      });
      this.listContainer.add(lockText);
    }

    // Hit zone for row click
    const hitZone = this.add.zone(
      LIST_LEFT + LIST_WIDTH / 2, y + (ROW_HEIGHT - 5) / 2,
      LIST_WIDTH, ROW_HEIGHT - 5,
    ).setInteractive({ useHandCursor: true });
    this.listContainer.add(hitZone);

    hitZone.on('pointerover', () => {
      rowBg.clear();
      rowBg.fillStyle(0x16213e, 1);
      rowBg.fillRoundedRect(LIST_LEFT, y, LIST_WIDTH, ROW_HEIGHT - 5, 4);
    });
    hitZone.on('pointerout', () => {
      rowBg.clear();
      rowBg.fillStyle(0x0a0a1e, 1);
      rowBg.fillRoundedRect(LIST_LEFT, y, LIST_WIDTH, ROW_HEIGHT - 5, 4);
    });
    hitZone.on('pointerdown', () => this.joinGame(game));
  }

  private async joinGame(game: GameRoomSummary): Promise<void> {
    if (game.hasPassword) {
      this.showPasswordPrompt(game);
      return;
    }
    await this.doJoin(game.id);
  }

  private showPasswordPrompt(game: GameRoomSummary): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    let password = '';

    const overlay = this.add.container(0, 0).setDepth(200);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    overlay.add(bg);

    overlay.add(this.add.text(cx, cy - 60, 'Enter Password', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5));

    const inputBg = this.add.graphics();
    inputBg.fillStyle(0x0a0a1a, 1);
    inputBg.fillRoundedRect(cx - 120, cy - 25, 240, 35, 6);
    inputBg.lineStyle(2, 0x444466, 1);
    inputBg.strokeRoundedRect(cx - 120, cy - 25, 240, 35, 6);
    overlay.add(inputBg);

    const pwDisplay = this.add.text(cx - 110, cy - 18, '', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'monospace',
    });
    overlay.add(pwDisplay);

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        password = password.slice(0, -1);
      } else if (event.key === 'Enter') {
        cleanup();
        this.doJoin(game.id, password);
        return;
      } else if (event.key === 'Escape') {
        cleanup();
        return;
      } else if (event.key.length === 1 && password.length < 30) {
        password += event.key;
      }
      pwDisplay.setText('•'.repeat(password.length));
    };

    this.input.keyboard!.on('keydown', handler);

    const cancelZone = this.add.zone(cx, cy + 40, 120, 35).setInteractive({ useHandCursor: true }).setDepth(201);
    const cancelBg = this.add.graphics();
    cancelBg.fillStyle(0x333355, 1);
    cancelBg.fillRoundedRect(cx - 60, cy + 22, 120, 35, 6);
    overlay.add(cancelBg);
    overlay.add(this.add.text(cx, cy + 40, 'CANCEL', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5));

    cancelZone.on('pointerdown', () => cleanup());

    const cleanup = () => {
      this.input.keyboard!.off('keydown', handler);
      overlay.destroy();
      cancelZone.destroy();
    };
  }

  private async doJoin(gameId: string, password?: string): Promise<void> {
    try {
      await this.lobbyClient.joinGame(gameId, password);
      this.scene.start('WaitingRoomScene', {
        gameId,
        authClient: this.authClient,
        lobbyClient: this.lobbyClient,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join game';
      this.statusText.setText(message).setColor('#e94560');
      this.statusText.setVisible(true);
    }
  }

  private createButton(
    x: number, y: number, label: string,
    normalColor: number, hoverColor: number,
    onClick: () => void,
  ): void {
    const bg = this.add.graphics();
    bg.fillStyle(normalColor, 1);
    bg.fillRoundedRect(x - 80, y - 20, 160, 40, 8);

    this.add.text(x, y, label, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.zone(x, y, 160, 40)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        bg.clear();
        bg.fillStyle(hoverColor, 1);
        bg.fillRoundedRect(x - 80, y - 20, 160, 40, 8);
      })
      .on('pointerout', () => {
        bg.clear();
        bg.fillStyle(normalColor, 1);
        bg.fillRoundedRect(x - 80, y - 20, 160, 40, 8);
      })
      .on('pointerdown', onClick);
  }
}
