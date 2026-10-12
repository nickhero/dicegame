import Phaser from 'phaser';
import {
  GameState,
  PERSONALITIES,
  PLAYER_COLORS,
  PLAYER_COLOR_STRINGS,
  GAME_WIDTH,
  GAME_HEIGHT,
  areAllied,
} from '@dicewars/shared';
import type { ConnectionState } from '../network/SocketClient';

interface AllianceWidget {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
}

export class UIRenderer {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private playerInfoTexts: Phaser.GameObjects.Text[] = [];
  private turnText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Container;
  private undoBtn!: Phaser.GameObjects.Container;
  private backBtn!: Phaser.GameObjects.Container;
  private onEndTurn: (() => void) | null = null;
  private onBack: (() => void) | null = null;
  private onUndo: (() => void) | null = null;
  private onProposeAlliance: ((targetIndex: number) => void) | null = null;
  private spectatorMode = false;
  private connectionDot!: Phaser.GameObjects.Graphics;
  private connectionLabel!: Phaser.GameObjects.Text;
  private allianceWidgets: AllianceWidget[] = [];
  private allianceBtns: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(100);
    this.createUI();
  }

  private createUI(): void {
    const panelX = GAME_WIDTH - 200;

    // Player info panel background
    const panelBg = this.scene.add.graphics();
    panelBg.fillStyle(0x111122, 0.85);
    panelBg.fillRoundedRect(panelX - 10, 10, 205, 350, 6);
    this.container.add(panelBg);

    // Turn indicator
    this.turnText = this.scene.add.text(panelX, 20, 'Turn 1', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    this.container.add(this.turnText);

    // Back button in HUD header
    this.backBtn = this.createBackButton(panelX + 155, 26);
    this.container.add(this.backBtn);

    // Player info slots (up to 6 players)
    for (let i = 0; i < 6; i++) {
      const text = this.scene.add.text(panelX, 50 + i * 35, '', {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: 'monospace',
      });
      this.playerInfoTexts.push(text);
      this.container.add(text);

      const widget = this.createAllianceWidget(panelX + 156, 50 + i * 35 + 8, i);
      this.allianceWidgets.push(widget);
      this.allianceBtns.push(widget.text);
      this.container.add(widget.container);
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
    this.endTurnBtn = this.createEndTurnButton(panelX + 12, 280);
    this.container.add(this.endTurnBtn);

    // Undo button (below end turn)
    this.undoBtn = this.createUndoButton(panelX + 12, 314);
    this.container.add(this.undoBtn);

    // Connection indicator (below player panel)
    this.connectionDot = this.scene.add.graphics();
    this.container.add(this.connectionDot);

    this.connectionLabel = this.scene.add.text(panelX + 18, 342, '', {
      fontSize: '11px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
    this.container.add(this.connectionLabel);
  }

  private createAllianceWidget(x: number, y: number, playerIndex: number): AllianceWidget {
    const container = this.scene.add.container(x, y).setVisible(false);

    const bg = this.scene.add.graphics();
    container.add(bg);

    const text = this.scene.add.text(0, 0, '🤝 Ally', {
      fontSize: '10px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#88eeff',
    }).setOrigin(0.5);
    container.add(text);

    const zone = this.scene.add.zone(0, 0, 54, 20);
    zone.setInteractive({ useHandCursor: true });

    const onHover = () => {
      if (zone.input && !zone.input.enabled) return;
      bg.clear();
      bg.fillStyle(0x336688, 1);
      bg.lineStyle(1, 0x66ccff);
      bg.fillRoundedRect(-27, -10, 54, 20, 4);
      bg.strokeRoundedRect(-27, -10, 54, 20, 4);
    };

    const onOut = () => {
      if (zone.input && !zone.input.enabled) return;
      bg.clear();
      bg.fillStyle(0x1a3a4a, 0.9);
      bg.lineStyle(1, 0x44aacc);
      bg.fillRoundedRect(-27, -10, 54, 20, 4);
      bg.strokeRoundedRect(-27, -10, 54, 20, 4);
    };

    const onClick = () => {
      if (zone.input && !zone.input.enabled) return;
      if (this.onProposeAlliance) this.onProposeAlliance(playerIndex);
    };

    zone.on('pointerover', onHover);
    zone.on('pointerout', onOut);
    zone.on('pointerdown', onClick);
    container.add(zone);

    text.setInteractive({ useHandCursor: true });
    text.on('pointerover', onHover);
    text.on('pointerout', onOut);
    text.on('pointerdown', onClick);

    return { container, bg, text, zone };
  }

  private createBackButton(x: number, y: number): Phaser.GameObjects.Container {
    const btn = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x33334d, 1);
    bg.fillRoundedRect(-32, -11, 64, 22, 4);
    btn.add(bg);

    const text = this.scene.add.text(0, 0, '◀ BACK', {
      fontSize: '11px',
      color: '#cccccc',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(text);

    const zone = this.scene.add.zone(0, 0, 64, 22).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x555577, 1);
      bg.fillRoundedRect(-32, -11, 64, 22, 4);
      text.setColor('#ffffff');
    });
    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x33334d, 1);
      bg.fillRoundedRect(-32, -11, 64, 22, 4);
      text.setColor('#cccccc');
    });
    zone.on('pointerdown', () => {
      if (this.onBack) this.onBack();
    });
    btn.add(zone);

    return btn;
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

  setBackCallback(cb: () => void): void {
    this.onBack = cb;
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
      connecting: { hex: 0xcccc44, label: 'Connecting...', textColor: '#cccc44' },
      disconnected: { hex: 0xcc4444, label: 'Disconnected', textColor: '#cc4444' },
    };
    const { hex, label, textColor } = colorMap[state];

    const panelX = GAME_WIDTH - 200;
    this.connectionDot.clear();
    this.connectionDot.fillStyle(hex, 1);
    this.connectionDot.fillCircle(panelX + 7, 342, 4);

    this.connectionLabel.setText(label).setColor(textColor);
  }

  update(state: GameState, localPlayerIndex?: number): void {
    this.turnText.setText(`Turn ${state.turnNumber}`);

    const hasAlliances = !!state.allianceState;
    const alivePlayers = state.players.filter((player) => player.isAlive);

    for (let i = 0; i < this.playerInfoTexts.length; i++) {
      if (i >= state.players.length) {
        this.playerInfoTexts[i].setText('');
        this.allianceWidgets[i]?.container.setVisible(false);
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
      } else if (p.personality && PERSONALITIES[p.personality]) {
        const label = PERSONALITIES[p.personality].label;
        name = `${p.name} (${label})`;
      } else {
        name = p.name;
      }

      this.playerInfoTexts[i].setText(`${marker}${name}\n   ${status}`);
      this.playerInfoTexts[i].setColor(
        p.isAlive ? PLAYER_COLOR_STRINGS[i] : '#666666'
      );

      // Alliance button / badge handling
      const isLocal = localPlayerIndex !== undefined && i === localPlayerIndex;
      const isAllied = hasAlliances && localPlayerIndex !== undefined &&
        areAllied(state.allianceState!, localPlayerIndex, i);
      const allowByPlayerCount = state.players.length > 2 ? alivePlayers.length > 2 : true;
      const canPropose = hasAlliances && !this.spectatorMode && !isLocal &&
        p.isAlive && localPlayerIndex !== undefined &&
        state.players[localPlayerIndex]?.isAlive &&
        !isAllied && allowByPlayerCount;

      const widget = this.allianceWidgets[i];
      if (widget) {
        if (isAllied) {
          widget.container.setVisible(true);
          widget.bg.clear();
          widget.bg.fillStyle(0x113344, 0.9);
          widget.bg.lineStyle(1, 0x44ddff);
          widget.bg.fillRoundedRect(-27, -10, 54, 20, 4);
          widget.bg.strokeRoundedRect(-27, -10, 54, 20, 4);
          widget.text.setText('🤝 Pact').setColor('#44ddff');
          if (widget.zone.input) widget.zone.input.enabled = false;
          if (widget.text.input) widget.text.input.enabled = false;
        } else if (canPropose) {
          widget.container.setVisible(true);
          widget.bg.clear();
          widget.bg.fillStyle(0x1a3a4a, 0.9);
          widget.bg.lineStyle(1, 0x44aacc);
          widget.bg.fillRoundedRect(-27, -10, 54, 20, 4);
          widget.bg.strokeRoundedRect(-27, -10, 54, 20, 4);
          widget.text.setText('🤝 Ally').setColor('#88eeff');
          if (widget.zone.input) widget.zone.input.enabled = true;
          if (widget.text.input) widget.text.input.enabled = true;
        } else {
          widget.container.setVisible(false);
          if (widget.zone.input) widget.zone.input.enabled = false;
          if (widget.text.input) widget.text.input.enabled = false;
        }
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
