import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT,
  PLAYER_COLORS, PLAYER_COLOR_STRINGS,
  type WireGameState,
} from '@dicewars/shared';
import { AuthClient } from '../network/AuthClient';
import { LobbyClient } from '../network/LobbyClient';
import { SocketClient } from '../network/SocketClient';

interface WaitingRoomData {
  gameId: string;
  authClient: AuthClient;
  lobbyClient: LobbyClient;
  gameName?: string;
  isCreator?: boolean;
  maxPlayers?: number;
}

interface RoomPlayer {
  index: number;
  name: string;
  isAI: boolean;
  personality?: string;
  ready: boolean;
  connected: boolean;
  userId?: string;
}

interface RoomJoinData {
  players: RoomPlayer[];
  maxPlayers: number;
  myUserId?: string;
}

interface PlayerSlot {
  index: number;
  name: string;
  isAI: boolean;
  personality?: string;
  ready: boolean;
  connected: boolean;
  userId?: string;
}

export class WaitingRoomScene extends Phaser.Scene {
  private authClient!: AuthClient;
  private lobbyClient!: LobbyClient;
  private socketClient!: SocketClient;
  private gameId!: string;
  private gameName = '';
  private isCreator = false;
  private maxPlayers = 4;
  private myUserId = '';
  private players: PlayerSlot[] = [];
  private isReady = false;
  private playerListContainer!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private startBg!: Phaser.GameObjects.Graphics;
  private startZone!: Phaser.GameObjects.Zone;
  private startLabel!: Phaser.GameObjects.Text;
  private readyBg!: Phaser.GameObjects.Graphics;

  // Event handler references for cleanup
  private playerJoinedHandler!: (data: { playerIndex: number; name: string; isAI: boolean; userId?: string }) => void;
  private playerLeftHandler!: (data: { playerIndex: number }) => void;
  private readyStateHandler!: (data: { userId: string; ready: boolean; readyPlayers: string[] }) => void;
  private stateUpdateHandler!: (state: WireGameState) => void;

  constructor() {
    super('WaitingRoomScene');
  }

  init(data: WaitingRoomData): void {
    this.authClient = data.authClient;
    this.lobbyClient = data.lobbyClient;
    this.gameId = data.gameId;
    this.gameName = data.gameName ?? 'Game Room';
    this.isCreator = data.isCreator ?? false;
    this.maxPlayers = data.maxPlayers ?? 4;
    this.players = [];
    this.isReady = false;
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    // Title
    this.add.text(cx, 35, 'WAITING ROOM', {
      fontSize: '32px',
      color: '#e94560',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Game name
    this.add.text(cx, 70, this.gameName, {
      fontSize: '16px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Player list header
    this.add.text(cx, 105, 'PLAYERS', {
      fontSize: '14px',
      color: '#888888',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Player list container
    this.playerListContainer = this.add.container(0, 0);

    // Status text
    this.statusText = this.add.text(cx, GAME_HEIGHT - 130, '', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Ready button
    const readyY = GAME_HEIGHT - 80;
    this.readyBg = this.add.graphics();
    this.drawReadyButton();

    this.add.text(cx - 160, readyY, '', { fontSize: '0px' }); // placeholder

    const readyLabel = this.add.text(cx - 160, readyY, 'READY', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.zone(cx - 160, readyY, 160, 44)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.toggleReady();
        readyLabel.setText(this.isReady ? '✓ READY' : 'READY');
        this.drawReadyButton();
      });

    // Start button (creator only)
    const startY = GAME_HEIGHT - 80;
    this.startBg = this.add.graphics();
    this.startLabel = this.add.text(cx + 40, startY, 'START GAME', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.startZone = this.add.zone(cx + 40, startY, 180, 44)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        if (this.isCreator && this.canStart()) {
          this.drawStartButton(0x16213e);
        }
      })
      .on('pointerout', () => this.updateStartButton())
      .on('pointerdown', () => this.handleStart());

    this.updateStartButton();

    // Leave button
    this.createButton(cx + 220, startY, 'LEAVE', 0x333355, 0x444477, () => {
      this.leaveGame();
    });

    // Connect WebSocket and join game room
    this.connectAndJoin();
  }

  shutdown(): void {
    this.removeSocketListeners();
  }

  private removeSocketListeners(): void {
    if (this.socketClient) {
      this.socketClient.off('game:playerJoined', this.playerJoinedHandler);
      this.socketClient.off('game:playerLeft', this.playerLeftHandler);
      this.socketClient.off('game:readyState', this.readyStateHandler);
      this.socketClient.off('game:stateUpdate', this.stateUpdateHandler);
    }
  }

  private async connectAndJoin(): Promise<void> {
    this.statusText.setText('Connecting...').setColor('#aaaaaa');

    try {
      this.socketClient = new SocketClient();
      const token = this.authClient.getToken()!;
      await this.socketClient.connect(token, '/game');

      this.setupSocketListeners();

      const result = await this.socketClient.joinGame(this.gameId);
      if (result.success && result.data) {
        // The join response contains room player data
        const roomData = result.data as unknown as RoomJoinData;
        if (roomData.maxPlayers) {
          this.maxPlayers = roomData.maxPlayers;
        }
        if (roomData.players) {
          this.syncPlayersFromRoom(roomData.players);
        }
      }

      this.statusText.setText('Waiting for players...').setColor('#aaaaaa');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      this.statusText.setText(message).setColor('#e94560');
    }
  }

  private setupSocketListeners(): void {
    this.playerJoinedHandler = (data) => {
      const exists = this.players.find(p => p.index === data.playerIndex);
      if (!exists) {
        this.players.push({
          index: data.playerIndex,
          name: data.name,
          isAI: data.isAI,
          ready: data.isAI,
          connected: true,
          userId: data.userId,
        });
        this.renderPlayerList();
        this.updateStartButton();
      }
    };

    this.playerLeftHandler = (data) => {
      this.players = this.players.filter(p => p.index !== data.playerIndex);
      this.renderPlayerList();
      this.updateStartButton();
    };

    this.readyStateHandler = (data: { userId: string; ready: boolean; readyPlayers: string[] }) => {
      for (const p of this.players) {
        if (p.userId === data.userId) {
          p.ready = data.ready;
        }
      }
      this.renderPlayerList();
      this.updateStartButton();
    };

    this.stateUpdateHandler = (state: WireGameState) => {
      // Remove all waiting room handlers BEFORE transitioning —
      // Phaser's shutdown() may fire too late if scene.start() is deferred,
      // causing this handler to restart GameScene on every subsequent stateUpdate.
      this.removeSocketListeners();

      this.scene.start('GameScene', {
        gameId: this.gameId,
        authClient: this.authClient,
        lobbyClient: this.lobbyClient,
        socketClient: this.socketClient,
        initialState: state,
      });
    };

    this.socketClient.on('game:playerJoined', this.playerJoinedHandler);
    this.socketClient.on('game:playerLeft', this.playerLeftHandler);
    this.socketClient.on('game:readyState', this.readyStateHandler);
    this.socketClient.on('game:stateUpdate', this.stateUpdateHandler);
  }

  private syncPlayersFromRoom(players: RoomPlayer[]): void {
    this.players = players.map((p) => ({
      index: p.index,
      name: p.name,
      isAI: p.isAI,
      personality: p.personality,
      ready: p.ready,
      connected: p.connected,
      userId: p.userId,
    }));
    this.renderPlayerList();
    this.updateStartButton();
  }

  private renderPlayerList(): void {
    this.playerListContainer.removeAll(true);

    const cx = GAME_WIDTH / 2;
    const slotW = 400;
    const slotH = 50;
    const startY = 130;

    for (let i = 0; i < this.maxPlayers; i++) {
      const y = startY + i * (slotH + 8);
      const player = this.players.find(p => p.index === i);

      // Slot background
      const slotBg = this.add.graphics();
      const bgColor = player ? 0x0a0a1e : 0x050510;
      slotBg.fillStyle(bgColor, 1);
      slotBg.fillRoundedRect(cx - slotW / 2, y, slotW, slotH, 6);
      slotBg.lineStyle(1, 0x333355, 0.5);
      slotBg.strokeRoundedRect(cx - slotW / 2, y, slotW, slotH, 6);
      this.playerListContainer.add(slotBg);

      // Color indicator
      const colorIndex = i < PLAYER_COLORS.length ? i : 0;
      const colorDot = this.add.graphics();
      colorDot.fillStyle(PLAYER_COLORS[colorIndex], 1);
      colorDot.fillCircle(cx - slotW / 2 + 25, y + slotH / 2, 8);
      this.playerListContainer.add(colorDot);

      if (player) {
        // Player name
        const nameColor = player.isAI ? '#d9d94a' : '#ffffff';
        const nameLabel = player.isAI && player.personality
          ? `${player.name} (${player.personality})`
          : player.name;
        const nameText = this.add.text(cx - slotW / 2 + 45, y + 8, nameLabel, {
          fontSize: '16px', color: nameColor, fontFamily: 'monospace', fontStyle: 'bold',
        });
        this.playerListContainer.add(nameText);

        // AI / Human label
        const typeLabel = player.isAI ? 'AI' : 'HUMAN';
        const typeText = this.add.text(cx - slotW / 2 + 45, y + 30, typeLabel, {
          fontSize: '10px', color: '#666666', fontFamily: 'monospace',
        });
        this.playerListContainer.add(typeText);

        // Ready status
        const readyColor = player.ready ? '#4ad94a' : '#d94a4a';
        const readyStr = player.ready ? '✓ READY' : 'NOT READY';
        const readyText = this.add.text(cx + slotW / 2 - 20, y + slotH / 2, readyStr, {
          fontSize: '12px', color: readyColor, fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(1, 0.5);
        this.playerListContainer.add(readyText);
      } else {
        // Empty slot
        const emptyText = this.add.text(cx - slotW / 2 + 45, y + slotH / 2, 'Waiting...', {
          fontSize: '14px', color: '#444466', fontFamily: 'monospace', fontStyle: 'italic',
        }).setOrigin(0, 0.5);
        this.playerListContainer.add(emptyText);
      }
    }
  }

  private drawReadyButton(): void {
    const cx = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 80;
    const color = this.isReady ? 0x4ad94a : 0x0f3460;
    this.readyBg.clear();
    this.readyBg.fillStyle(color, 1);
    this.readyBg.fillRoundedRect(cx - 240, y - 22, 160, 44, 8);
  }

  private drawStartButton(color: number): void {
    const cx = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 80;
    this.startBg.clear();
    this.startBg.fillStyle(color, 1);
    this.startBg.fillRoundedRect(cx - 50, y - 22, 180, 44, 8);
  }

  private updateStartButton(): void {
    const canStart = this.isCreator && this.canStart();
    const color = canStart ? 0xe94560 : 0x333344;
    this.drawStartButton(color);
    this.startLabel.setAlpha(canStart ? 1 : 0.4);
    this.startZone.setVisible(this.isCreator);
    this.startLabel.setVisible(this.isCreator);
    if (!this.isCreator) {
      this.startBg.clear();
    }
  }

  private canStart(): boolean {
    const humanPlayers = this.players.filter(p => !p.isAI);
    return humanPlayers.length > 0 && humanPlayers.every(p => p.ready) && this.players.length >= 2;
  }

  private async toggleReady(): Promise<void> {
    this.isReady = !this.isReady;
    // Update local player's ready state immediately for responsive UI
    const myId = this.authClient.getUser()?.id ?? '';
    for (const p of this.players) {
      if (p.userId === myId) {
        p.ready = this.isReady;
      }
    }
    this.renderPlayerList();
    this.updateStartButton();
    try {
      await this.socketClient.ready();
    } catch {
      this.statusText.setText('Failed to update ready status').setColor('#e94560');
    }
  }

  private async handleStart(): Promise<void> {
    if (!this.isCreator || !this.canStart()) return;

    this.statusText.setText('Starting game...').setColor('#aaaaaa');
    try {
      const result = await this.socketClient.startGame(this.gameId);
      if (!result.success) {
        this.statusText.setText(result.error?.message || 'Failed to start').setColor('#e94560');
      }
      // On success, the server emits game:stateUpdate which triggers scene transition
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start game';
      this.statusText.setText(message).setColor('#e94560');
    }
  }

  private async leaveGame(): Promise<void> {
    try {
      await this.socketClient.leaveGame();
      this.socketClient.disconnect();
    } catch {
      // Ignore leave errors
    }
    this.scene.start('LobbyScene', {
      authClient: this.authClient,
      lobbyClient: this.lobbyClient,
    });
  }

  private createButton(
    x: number, y: number, label: string,
    normalColor: number, hoverColor: number,
    onClick: () => void,
  ): void {
    const bg = this.add.graphics();
    bg.fillStyle(normalColor, 1);
    bg.fillRoundedRect(x - 70, y - 22, 140, 44, 8);

    this.add.text(x, y, label, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.zone(x, y, 140, 44)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        bg.clear();
        bg.fillStyle(hoverColor, 1);
        bg.fillRoundedRect(x - 70, y - 22, 140, 44, 8);
      })
      .on('pointerout', () => {
        bg.clear();
        bg.fillStyle(normalColor, 1);
        bg.fillRoundedRect(x - 70, y - 22, 140, 44, 8);
      })
      .on('pointerdown', onClick);
  }
}
