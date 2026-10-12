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

interface ChatMessage {
  playerIndex: number;
  senderName: string;
  message: string;
  timestamp: string;
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

  // Chat UI state
  private chatMessages: ChatMessage[] = [];
  private chatContainer!: Phaser.GameObjects.Container;
  private chatInput = '';
  private chatFocused = false;
  private chatInputDisplay!: Phaser.GameObjects.Text;
  private chatInputBg!: Phaser.GameObjects.Graphics;
  private cursorVisible = true;
  private cursorTimer?: Phaser.Time.TimerEvent;

  // Event handler references for cleanup
  private playerJoinedHandler!: (data: { playerIndex: number; name: string; isAI: boolean; userId?: string }) => void;
  private playerLeftHandler!: (data: { playerIndex: number }) => void;
  private readyStateHandler!: (data: { userId: string; ready: boolean; readyPlayers: string[] }) => void;
  private stateUpdateHandler!: (state: WireGameState) => void;
  private chatHandler!: (data: { playerIndex: number; senderName: string; message: string; timestamp: string }) => void;

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
    this.chatMessages = [];
    this.chatInput = '';
    this.chatFocused = false;
  }

  create(): void {
    // Left column: X center ~260
    const leftCX = 250;

    // Header Title
    this.add.text(leftCX, 30, 'WAITING ROOM', {
      fontSize: '28px',
      color: '#e94560',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Game name
    this.add.text(leftCX, 62, this.gameName, {
      fontSize: '15px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Player list header
    this.add.text(leftCX, 95, 'PLAYERS', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Player list container
    this.playerListContainer = this.add.container(0, 0);

    // Status text
    this.statusText = this.add.text(leftCX, GAME_HEIGHT - 120, '', {
      fontSize: '13px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Ready button
    const readyY = GAME_HEIGHT - 70;
    this.readyBg = this.add.graphics();
    this.drawReadyButton();

    const readyLabel = this.add.text(leftCX - 80, readyY, 'READY', {
      fontSize: '15px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.zone(leftCX - 80, readyY, 130, 42)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.toggleReady();
        readyLabel.setText(this.isReady ? '✓ READY' : 'READY');
        this.drawReadyButton();
      });

    // Start button (creator only)
    const startY = GAME_HEIGHT - 70;
    this.startBg = this.add.graphics();
    this.startLabel = this.add.text(leftCX + 75, startY, 'START GAME', {
      fontSize: '15px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.startZone = this.add.zone(leftCX + 75, startY, 140, 42)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.handleStart();
      });

    this.updateStartButton();

    // Leave button
    this.createButton(leftCX, GAME_HEIGHT - 22, 'LEAVE ROOM', 0x333344, 0x555566, () => {
      this.leaveGame();
    }, 120, 26, 11);

    // ─── Right Column: Chat Panel ───────────────────────────────────────────
    this.createChatPanel();

    // Connect to server and join room
    this.connectAndJoin();
  }

  private createChatPanel(): void {
    const chatX = 490;
    const chatY = 40;
    const chatW = 440;
    const chatH = 550;

    // Chat Panel Header
    this.add.text(chatX + 10, chatY, '💬 ROOM CHAT', {
      fontSize: '14px',
      color: '#ffcc00',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });

    // Chat Background
    const chatBg = this.add.graphics();
    chatBg.fillStyle(0x0c0d1a, 0.9);
    chatBg.fillRoundedRect(chatX, chatY + 25, chatW, chatH - 75, 8);
    chatBg.lineStyle(1, 0x333355, 0.8);
    chatBg.strokeRoundedRect(chatX, chatY + 25, chatW, chatH - 75, 8);

    // Messages container
    this.chatContainer = this.add.container(chatX + 12, chatY + 35);

    // Chat Input Bar
    const inputY = chatY + chatH - 40;
    const inputW = chatW - 80;
    const inputH = 36;

    this.chatInputBg = this.add.graphics();
    this.drawChatInputBg();

    this.chatInputDisplay = this.add.text(chatX + 12, inputY + 9, 'Type message... (Enter to send)', {
      fontSize: '12px',
      color: '#666688',
      fontFamily: 'monospace',
    });

    const chatMaskGraphics = this.add.graphics();
    chatMaskGraphics.fillStyle(0xffffff);
    chatMaskGraphics.fillRect(chatX + 8, inputY + 2, inputW - 16, inputH - 4);
    chatMaskGraphics.setVisible(false);
    this.chatInputDisplay.setMask(chatMaskGraphics.createGeometryMask());

    // Zone for input focus
    this.add.zone(chatX + inputW / 2, inputY + inputH / 2, inputW, inputH)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.chatFocused = true;
        this.drawChatInputBg();
        this.updateChatInputDisplay();
      });

    // Send Button
    this.createButton(chatX + chatW - 35, inputY + inputH / 2, 'SEND', 0x0f3460, 0xe94560, () => {
      this.sendChatMessage();
    }, 65, inputH, 12);

    // Blinking cursor
    this.cursorTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.cursorVisible = !this.cursorVisible;
        if (this.chatFocused) {
          this.updateChatInputDisplay();
        }
      },
    });

    // Keyboard handler for chat input
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (!this.chatFocused) {
        if (event.key === 'Enter') {
          this.chatFocused = true;
          this.drawChatInputBg();
          this.updateChatInputDisplay();
        }
        return;
      }

      if (event.key === 'Escape') {
        this.chatFocused = false;
        this.drawChatInputBg();
        this.updateChatInputDisplay();
      } else if (event.key === 'Enter') {
        this.sendChatMessage();
      } else if (event.key === 'Backspace') {
        this.chatInput = this.chatInput.slice(0, -1);
        this.updateChatInputDisplay();
      } else if (event.key.length === 1 && this.chatInput.length < 140) {
        this.chatInput += event.key;
        this.updateChatInputDisplay();
      }
    });
  }

  private drawChatInputBg(): void {
    const chatX = 490;
    const inputY = 40 + 550 - 40;
    const inputW = 440 - 80;
    const inputH = 36;

    this.chatInputBg.clear();
    this.chatInputBg.fillStyle(0x060710, 1);
    this.chatInputBg.fillRoundedRect(chatX, inputY, inputW, inputH, 6);
    this.chatInputBg.lineStyle(2, this.chatFocused ? 0xe94560 : 0x333355, 1);
    this.chatInputBg.strokeRoundedRect(chatX, inputY, inputW, inputH, 6);
  }

  private updateChatInputDisplay(): void {
    if (!this.chatFocused && this.chatInput.length === 0) {
      this.chatInputDisplay.setText('Type message... (Enter to send)').setColor('#666688');
      return;
    }

    const cursor = this.chatFocused && this.cursorVisible ? '|' : '';
    const maxVisible = 40;
    let textToShow = this.chatInput;
    if (textToShow.length > maxVisible) {
      textToShow = '…' + textToShow.slice(-(maxVisible - 1));
    }
    this.chatInputDisplay.setText(`${textToShow}${cursor}`).setColor('#ffffff');
  }

  private sendChatMessage(): void {
    const trimmed = this.chatInput.trim();
    if (trimmed.length === 0) return;

    if (this.socketClient) {
      this.socketClient.sendChat(trimmed);
    }
    this.chatInput = '';
    this.updateChatInputDisplay();
  }

  private onChatMessage(data: ChatMessage): void {
    this.chatMessages.push(data);
    if (this.chatMessages.length > 20) {
      this.chatMessages.shift();
    }
    this.renderChatFeed();
  }

  private renderChatFeed(): void {
    this.chatContainer.removeAll(true);

    const maxLines = 18;
    const visible = this.chatMessages.slice(-maxLines);

    visible.forEach((msg, idx) => {
      const y = idx * 24;
      const date = new Date(msg.timestamp);
      const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

      const senderColor = msg.playerIndex >= 0 && msg.playerIndex < PLAYER_COLORS.length
        ? PLAYER_COLOR_STRINGS[msg.playerIndex]
        : '#ffcc00';

      const timeText = this.add.text(0, y, `[${timeStr}]`, {
        fontSize: '11px',
        color: '#666688',
        fontFamily: 'monospace',
      });
      this.chatContainer.add(timeText);

      const senderText = this.add.text(50, y, `${msg.senderName}:`, {
        fontSize: '12px',
        color: senderColor,
        fontFamily: 'monospace',
        fontStyle: 'bold',
      });
      this.chatContainer.add(senderText);

      const msgX = 50 + senderText.width + 6;
      const contentText = this.add.text(msgX, y, msg.message, {
        fontSize: '12px',
        color: '#dddddd',
        fontFamily: 'monospace',
        wordWrap: { width: 410 - msgX, useAdvancedWrap: true },
      });
      this.chatContainer.add(contentText);
    });
  }

  shutdown(): void {
    if (this.cursorTimer) {
      this.cursorTimer.destroy();
    }
    this.removeSocketListeners();
  }

  private removeSocketListeners(): void {
    if (this.socketClient) {
      this.socketClient.off('game:playerJoined', this.playerJoinedHandler);
      this.socketClient.off('game:playerLeft', this.playerLeftHandler);
      this.socketClient.off('game:readyState', this.readyStateHandler);
      this.socketClient.off('game:stateUpdate', this.stateUpdateHandler);
      this.socketClient.off('game:chat', this.chatHandler);
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
      this.removeSocketListeners();

      this.scene.start('GameScene', {
        gameId: this.gameId,
        authClient: this.authClient,
        lobbyClient: this.lobbyClient,
        socketClient: this.socketClient,
        initialState: state,
      });
    };

    this.chatHandler = (data) => {
      this.onChatMessage(data);
    };

    this.socketClient.on('game:playerJoined', this.playerJoinedHandler);
    this.socketClient.on('game:playerLeft', this.playerLeftHandler);
    this.socketClient.on('game:readyState', this.readyStateHandler);
    this.socketClient.on('game:stateUpdate', this.stateUpdateHandler);
    this.socketClient.on('game:chat', this.chatHandler);
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

    const myUser = this.authClient.getUser();
    if (myUser) {
      this.myUserId = myUser.id;
      const me = this.players.find(p => p.userId === this.myUserId);
      if (me) {
        this.isReady = me.ready;
      }
    }

    this.renderPlayerList();
    this.updateStartButton();
  }

  private renderPlayerList(): void {
    this.playerListContainer.removeAll(true);

    const leftCX = 250;
    const slotW = 440;
    const slotH = 48;
    const startY = 115;

    for (let i = 0; i < this.maxPlayers; i++) {
      const y = startY + i * (slotH + 8);
      const player = this.players.find(p => p.index === i);

      // Slot background
      const slotBg = this.add.graphics();
      const bgColor = player ? 0x0a0a1e : 0x050510;
      slotBg.fillStyle(bgColor, 1);
      slotBg.fillRoundedRect(leftCX - slotW / 2, y, slotW, slotH, 6);
      slotBg.lineStyle(1, 0x333355, 0.5);
      slotBg.strokeRoundedRect(leftCX - slotW / 2, y, slotW, slotH, 6);
      this.playerListContainer.add(slotBg);

      // Color indicator
      const colorIndex = i < PLAYER_COLORS.length ? i : 0;
      const colorDot = this.add.graphics();
      colorDot.fillStyle(PLAYER_COLORS[colorIndex], 1);
      colorDot.fillCircle(leftCX - slotW / 2 + 25, y + slotH / 2, 8);
      this.playerListContainer.add(colorDot);

      if (player) {
        // Player name
        const nameColor = player.isAI ? '#d9d94a' : '#ffffff';
        const nameLabel = player.isAI && player.personality
          ? `${player.name} (${player.personality})`
          : player.name;
        const nameText = this.add.text(leftCX - slotW / 2 + 45, y + 8, nameLabel, {
          fontSize: '15px', color: nameColor, fontFamily: 'monospace', fontStyle: 'bold',
        });
        this.playerListContainer.add(nameText);

        // AI / Human label
        const typeLabel = player.isAI ? 'AI' : 'HUMAN';
        const typeText = this.add.text(leftCX - slotW / 2 + 45, y + 28, typeLabel, {
          fontSize: '10px', color: '#666666', fontFamily: 'monospace',
        });
        this.playerListContainer.add(typeText);

        // Ready status
        const readyColor = player.ready ? '#4ad94a' : '#d94a4a';
        const readyStr = player.ready ? '✓ READY' : 'NOT READY';
        const readyText = this.add.text(leftCX + slotW / 2 - 20, y + slotH / 2, readyStr, {
          fontSize: '12px', color: readyColor, fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(1, 0.5);
        this.playerListContainer.add(readyText);
      } else {
        // Empty slot
        const emptyText = this.add.text(leftCX - slotW / 2 + 45, y + slotH / 2, 'Waiting for player...', {
          fontSize: '13px', color: '#444466', fontFamily: 'monospace', fontStyle: 'italic',
        }).setOrigin(0, 0.5);
        this.playerListContainer.add(emptyText);
      }
    }
  }

  private drawReadyButton(): void {
    const leftCX = 250;
    const y = GAME_HEIGHT - 70;
    const color = this.isReady ? 0x4ad94a : 0x0f3460;
    this.readyBg.clear();
    this.readyBg.fillStyle(color, 1);
    this.readyBg.fillRoundedRect(leftCX - 145, y - 21, 130, 42, 8);
  }

  private drawStartButton(color: number): void {
    const leftCX = 250;
    const y = GAME_HEIGHT - 70;
    this.startBg.clear();
    this.startBg.fillStyle(color, 1);
    this.startBg.fillRoundedRect(leftCX + 5, y - 21, 140, 42, 8);
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
    const me = this.players.find(p => p.userId === this.myUserId);
    if (me) {
      me.ready = this.isReady;
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
    w = 140, h = 44, fontSize = 14,
  ): void {
    const bg = this.add.graphics();
    bg.fillStyle(normalColor, 1);
    bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);

    this.add.text(x, y, label, {
      fontSize: `${fontSize}px`,
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const zone = this.add.zone(x, y, w, h)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        bg.clear();
        bg.fillStyle(hoverColor, 1);
        bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      })
      .on('pointerout', () => {
        bg.clear();
        bg.fillStyle(normalColor, 1);
        bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      })
      .on('pointerdown', onClick);
  }
}
