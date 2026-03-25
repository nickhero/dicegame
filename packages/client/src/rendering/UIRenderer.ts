import Phaser from 'phaser';
import {
  GameState, PERSONALITIES,
  PLAYER_COLORS, PLAYER_COLOR_STRINGS, GAME_WIDTH, GAME_HEIGHT,
} from '@dicewars/shared';
import type { ConnectionState } from '../network/SocketClient';

export class UIRenderer {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private playerInfoTexts: Phaser.GameObjects.Text[] = [];
  private turnText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Container;
  private undoBtn!: Phaser.GameObjects.Container;
  private onEndTurn: (() => void) | null = null;
  private onUndo: (() => void) | null = null;
  private onProposeAlliance: ((targetIndex: number) => void) | null = null;
  private spectatorMode = false;
  private connectionDot!: Phaser.GameObjects.Graphics;
  private connectionLabel!: Phaser.GameObjects.Text;
  private allianceBtns: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(100);
    this.createUI();
  }

  private createUI(): void {
    const panelX = GAME_WIDTH - 190;

    // Player info panel background
    const panelBg = this.scene.add.graphics();
    panelBg.fillStyle(0x111122, 0.85);
    panelBg.fillRoundedRect(panelX - 10, 10, 190, 300, 6);
    this.container.add(panelBg);

    // Turn indicator
    this.turnText = this.scene.add.text(panelX, 20, 'Turn 1', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    this.container.add(this.turnText);

    // Player info slots (up to 6 players)
    for (let i = 0; i < 6; i++) {
      const text = this.scene.add.text(panelX, 50 + i * 35, '', {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: 'monospace',
      });
      this.playerInfoTexts.push(text);
      this.container.add(text);
    }

    // Status text at bottom
    this.statusText = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, '', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#111122cc',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(100);
    this.container.add(this.statusText);

    // End turn button
    this.endTurnBtn = this.createEndTurnButton(panelX, 290);
    this.container.add(this.endTurnBtn);

    // Undo button (below end turn)
    this.undoBtn = this.createUndoButton(panelX, 325);
    this.container.add(this.undoBtn);

    // Connection indicator (top-left corner)
    this.connectionDot = this.scene.add.graphics();
    this.container.add(this.connectionDot);

    this.connectionLabel = this.scene.add.text(28, 12, '', {
      fontSize: '11px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    });
    this.container.add(this.connectionLabel);

    // Alliance proposal buttons (created lazily per player slot)
    for (let i = 0; i < 6; i++) {
      const btn = this.scene.add.text(0, 0, '🤝', {
        fontSize: '12px',
        fontFamily: 'monospace',
      }).setInteractive({ useHandCursor: true }).setVisible(false);
      btn.on('pointerdown', () => {
        if (this.onProposeAlliance) this.onProposeAlliance(i);
      });
      this.allianceBtns.push(btn);
      this.container.add(btn);
    }
  }

  private createUndoButton(x: number, y: number): Phaser.GameObjects.Container {
    const btn = this.scene.add.container(x + 80, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x555533, 1);
    bg.fillRoundedRect(-70, -12, 140, 24, 5);
    btn.add(bg);

    const text = this.scene.add.text(0, 0, 'UNDO (Z)', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(text);

    const zone = this.scene.add.zone(0, 0, 140, 24).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x888844, 1);
      bg.fillRoundedRect(-70, -12, 140, 24, 5);
    });
    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x555533, 1);
      bg.fillRoundedRect(-70, -12, 140, 24, 5);
    });
    zone.on('pointerdown', () => {
      if (this.onUndo) this.onUndo();
    });
    btn.add(zone);
    btn.setVisible(false);

    return btn;
  }

  private createEndTurnButton(x: number, y: number): Phaser.GameObjects.Container {
    const btn = this.scene.add.container(x + 80, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x338833, 1);
    bg.fillRoundedRect(-70, -15, 140, 30, 5);
    btn.add(bg);

    const text = this.scene.add.text(0, 0, 'END TURN', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(text);

    const zone = this.scene.add.zone(0, 0, 140, 30).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x44aa44, 1);
      bg.fillRoundedRect(-70, -15, 140, 30, 5);
    });
    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x338833, 1);
      bg.fillRoundedRect(-70, -15, 140, 30, 5);
    });
    zone.on('pointerdown', () => {
      if (this.onEndTurn) this.onEndTurn();
    });
    btn.add(zone);

    return btn;
  }

  setEndTurnCallback(cb: () => void): void {
    this.onEndTurn = cb;
  }

  setUndoCallback(cb: () => void): void {
    this.onUndo = cb;
  }

  setProposeAllianceCallback(cb: (targetIndex: number) => void): void {
    this.onProposeAlliance = cb;
  }

  setSpectatorMode(enabled: boolean): void {
    this.spectatorMode = enabled;
  }

  setConnectionState(state: ConnectionState): void {
    const colorMap: Record<ConnectionState, { hex: number; label: string; textColor: string }> = {
      connected: { hex: 0x44cc44, label: 'Connected', textColor: '#44cc44' },
      connecting: { hex: 0xcccc44, label: 'Reconnecting...', textColor: '#cccc44' },
      disconnected: { hex: 0xcc4444, label: 'Disconnected', textColor: '#cc4444' },
    };
    const { hex, label, textColor } = colorMap[state];

    this.connectionDot.clear();
    this.connectionDot.fillStyle(hex, 1);
    this.connectionDot.fillCircle(14, 18, 5);

    this.connectionLabel.setText(label).setColor(textColor);
  }

  update(state: GameState, localPlayerIndex?: number): void {
    this.turnText.setText(`Turn ${state.turnNumber}`);

    const panelX = GAME_WIDTH - 190;
    const hasAlliances = !!state.allianceState;

    for (let i = 0; i < this.playerInfoTexts.length; i++) {
      if (i >= state.players.length) {
        this.playerInfoTexts[i].setText('');
        this.allianceBtns[i].setVisible(false);
        continue;
      }
      const p = state.players[i];
      const territories = state.territories.filter((t) => t.owner === p.id).length;
      const totalDice = state.territories
        .filter((t) => t.owner === p.id)
        .reduce((sum, t) => sum + t.dice, 0);

      const marker = i === state.currentPlayerIndex ? '▶ ' : '  ';
      const reserve = p.reserveDice > 0 ? ` +${p.reserveDice}R` : '';
      const status = p.isAlive ? `${territories}T ${totalDice}D${reserve}` : 'DEAD';

      let name: string;
      if (p.isHuman) {
        name = `${p.name} (You)`;
      } else if (p.personality) {
        const label = PERSONALITIES[p.personality].label;
        name = `${p.name} (${label})`;
      } else {
        name = p.name;
      }

      this.playerInfoTexts[i].setText(`${marker}${name}\n   ${status}`);
      this.playerInfoTexts[i].setColor(
        p.isAlive ? PLAYER_COLOR_STRINGS[i] : '#666666'
      );

      // Show alliance propose button for alive non-local players when alliances are enabled
      const isLocal = localPlayerIndex !== undefined && i === localPlayerIndex;
      const canPropose = hasAlliances && !this.spectatorMode && !isLocal &&
        p.isAlive && localPlayerIndex !== undefined &&
        state.players[localPlayerIndex]?.isAlive;
      this.allianceBtns[i].setVisible(!!canPropose);
      if (canPropose) {
        this.allianceBtns[i].setPosition(panelX + 175, 50 + i * 35);
      }
    }

    // Show/hide end turn button based on phase
    const isHumanTurn = state.players[state.currentPlayerIndex]?.isHuman;
    this.endTurnBtn.setVisible(!this.spectatorMode && isHumanTurn && state.phase === 'selectingAttacker');
  }

  /** Show/hide undo button (called from GameScene when undo state changes) */
  setUndoVisible(visible: boolean): void {
    this.undoBtn.setVisible(visible && !this.spectatorMode);
  }

  setStatus(text: string): void {
    this.statusText.setText(text);
  }

  destroy(): void {
    this.container.destroy();
  }
}
