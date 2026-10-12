import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, Territory, POWER_UPS } from '@dicewars/shared';

export class DialogManager {
  private scene: Phaser.Scene;
  private helpOverlay: Phaser.GameObjects.Container | null = null;
  private confirmDialog: Phaser.GameObjects.Container | null = null;
  private exitDialog: Phaser.GameObjects.Container | null = null;
  private surrenderDialog: Phaser.GameObjects.Container | null = null;
  private allianceDialog: Phaser.GameObjects.Container | null = null;
  private allianceBreakDialog: Phaser.GameObjects.Container | null = null;
  private powerUpPopup: Phaser.GameObjects.Container | null = null;
  private disconnectOverlay: Phaser.GameObjects.Container | null = null;
  private disconnectTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  isDialogOpen(): boolean {
    return (
      this.helpOverlay !== null ||
      this.confirmDialog !== null ||
      this.exitDialog !== null ||
      this.surrenderDialog !== null ||
      this.allianceDialog !== null ||
      this.allianceBreakDialog !== null
    );
  }

  hasPowerUpPopup(): boolean {
    return this.powerUpPopup !== null;
  }

  createDialogButton(
    x: number,
    y: number,
    text: string,
    color: number,
    hoverColor: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const btn = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-40, -15, 80, 30, 5);
    btn.add(bg);

    const label = this.scene.add.text(0, 0, text, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(label);

    const zone = this.scene.add.zone(0, 0, 80, 30).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-40, -15, 80, 30, 5);
    });
    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-40, -15, 80, 30, 5);
    });
    zone.on('pointerdown', onClick);
    btn.add(zone);

    return btn;
  }

  toggleHelp(undoEnabled: boolean, isOnline: boolean): void {
    if (this.helpOverlay) {
      this.dismissHelp();
      return;
    }

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const w = 420;
    const h = 370;

    this.helpOverlay = this.scene.add.container(cx, cy).setDepth(1000);

    const dim = this.scene.add.graphics();
    dim.fillStyle(0x000000, 0.6);
    dim.fillRect(-cx, -cy, GAME_WIDTH, GAME_HEIGHT);
    this.helpOverlay.add(dim);

    const hitZone = this.scene.add.zone(0, 0, GAME_WIDTH, GAME_HEIGHT).setInteractive();
    hitZone.on('pointerdown', () => this.dismissHelp());
    this.helpOverlay.add(hitZone);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x111122, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, 0x4466aa, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.helpOverlay.add(bg);

    const title = this.scene.add.text(0, -h / 2 + 25, 'KEYBOARD SHORTCUTS', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.helpOverlay.add(title);

    const shortcuts: [string, string][] = [
      ['E / Space', 'End current turn'],
      ['Escape', 'Cancel / Deselect / Menu'],
    ];
    if (undoEnabled) {
      shortcuts.push(['Z', 'Undo last attack']);
    }
    shortcuts.push(['S', 'Surrender game']);
    if (!isOnline) {
      shortcuts.push(['1 / 2 / 3', 'Speed: Normal/Fast/Instant']);
    }
    shortcuts.push(['M', 'Toggle sound mute']);
    if (!isOnline) {
      shortcuts.push(['R', 'Restart game']);
    }
    shortcuts.push(['H / ?', 'Toggle this help overlay']);
    shortcuts.push(['Click Territory', 'Select attacker / defender']);
    shortcuts.push(['Right-click', 'Cancel selection']);

    const startY = -h / 2 + 65;
    const lineHeight = 24;

    shortcuts.forEach(([keys, desc], i) => {
      const y = startY + i * lineHeight;
      const keyText = this.scene.add.text(-w / 2 + 30, y, keys, {
        fontSize: '13px',
        color: '#e94560',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5);

      const descText = this.scene.add.text(w / 2 - 30, y, desc, {
        fontSize: '13px',
        color: '#cccccc',
        fontFamily: 'monospace',
      }).setOrigin(1, 0.5);

      this.helpOverlay!.add(keyText);
      this.helpOverlay!.add(descText);
    });

    const footer = this.scene.add.text(0, h / 2 - 20, 'Press H, Esc, or click outside to close', {
      fontSize: '11px',
      color: '#888888',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.helpOverlay.add(footer);
  }

  dismissHelp(): void {
    if (this.helpOverlay) {
      this.helpOverlay.destroy();
      this.helpOverlay = null;
    }
  }

  showConfirm(title: string, onConfirm: () => void, onCancel?: () => void): void {
    if (this.confirmDialog) return;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const w = 260;
    const h = 130;

    this.confirmDialog = this.scene.add.container(cx, cy).setDepth(1000);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x111122, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, 0xcc6666, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.confirmDialog.add(bg);

    const label = this.scene.add.text(0, -h / 2 + 30, title, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.confirmDialog.add(label);

    const yesBtn = this.createDialogButton(-55, 25, 'YES', 0x338833, 0x44aa44, () => {
      this.dismissConfirm();
      onConfirm();
    });
    this.confirmDialog.add(yesBtn);

    const noBtn = this.createDialogButton(55, 25, 'NO', 0x883333, 0xaa4444, () => {
      this.dismissConfirm();
      onCancel?.();
    });
    this.confirmDialog.add(noBtn);
  }

  dismissConfirm(): void {
    if (this.confirmDialog) {
      this.confirmDialog.destroy();
      this.confirmDialog = null;
    }
  }

  showExit(isOnline: boolean, onLeave: () => void, onCancel?: () => void): void {
    if (this.exitDialog) return;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const w = 320;
    const h = 140;

    this.exitDialog = this.scene.add.container(cx, cy).setDepth(1000);

    const dim = this.scene.add.graphics();
    dim.fillStyle(0x000000, 0.5);
    dim.fillRect(-cx, -cy, GAME_WIDTH, GAME_HEIGHT);
    this.exitDialog.add(dim);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x111122, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, 0x6688cc, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.exitDialog.add(bg);

    const title = this.scene.add.text(0, -h / 2 + 25, isOnline ? 'Leave Game?' : 'End Game?', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.exitDialog.add(title);

    const subtitleText = isOnline
      ? 'Leaving will forfeit the match.'
      : 'Return to main menu?';
    const subtitle = this.scene.add.text(0, -h / 2 + 52, subtitleText, {
      fontSize: '13px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.exitDialog.add(subtitle);

    const leaveBtn = this.createDialogButton(-60, 30, 'LEAVE', 0x883333, 0xaa4444, () => {
      this.dismissExit();
      onLeave();
    });
    this.exitDialog.add(leaveBtn);

    const cancelBtn = this.createDialogButton(60, 30, 'CANCEL', 0x335588, 0x4477aa, () => {
      this.dismissExit();
      onCancel?.();
    });
    this.exitDialog.add(cancelBtn);
  }

  dismissExit(): void {
    if (this.exitDialog) {
      this.exitDialog.destroy();
      this.exitDialog = null;
    }
  }

  showSurrender(onSurrender: () => void, onCancel?: () => void): void {
    if (this.surrenderDialog) return;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const w = 280;
    const h = 130;

    this.surrenderDialog = this.scene.add.container(cx, cy).setDepth(1000);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x221111, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, 0xcc6666, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.surrenderDialog.add(bg);

    const label = this.scene.add.text(0, -h / 2 + 30, 'Surrender?', {
      fontSize: '18px',
      color: '#ff6666',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.surrenderDialog.add(label);

    const yesBtn = this.createDialogButton(-55, 25, 'YES', 0x883333, 0xaa4444, () => {
      this.dismissSurrender();
      onSurrender();
    });
    this.surrenderDialog.add(yesBtn);

    const noBtn = this.createDialogButton(55, 25, 'NO', 0x338833, 0x44aa44, () => {
      this.dismissSurrender();
      onCancel?.();
    });
    this.surrenderDialog.add(noBtn);
  }

  dismissSurrender(): void {
    if (this.surrenderDialog) {
      this.surrenderDialog.destroy();
      this.surrenderDialog = null;
    }
  }

  showPowerUpPopup(
    territory: Territory,
    canAttack: boolean,
    onReinforce: () => void,
    onFortify: () => void,
    onAttack: () => void
  ): void {
    this.dismissPowerUpPopup();

    const powerUp = POWER_UPS[territory.powerUp!];
    if (!powerUp) return;

    const cx = territory.center.x;
    const cy = territory.center.y - 45;

    this.powerUpPopup = this.scene.add.container(cx, cy).setDepth(200);

    const w = 160;
    const h = canAttack ? 80 : 55;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x111133, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(2, 0x6688cc, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    this.powerUpPopup.add(bg);

    const useLabel = `Use ${powerUp.label}`;
    const useY = canAttack ? -12 : 0;
    const useBtn = this.createDialogButton(0, useY, useLabel, 0x336633, 0x44aa44, () => {
      this.dismissPowerUpPopup();
      if (territory.powerUp === 'reinforce') {
        onReinforce();
      } else if (territory.powerUp === 'fortify') {
        onFortify();
      }
    });
    this.powerUpPopup.add(useBtn);

    if (canAttack) {
      const atkBtn = this.createDialogButton(0, 22, 'Attack', 0x663333, 0xaa4444, () => {
        this.dismissPowerUpPopup();
        onAttack();
      });
      this.powerUpPopup.add(atkBtn);
    }
  }

  dismissPowerUpPopup(): void {
    if (this.powerUpPopup) {
      this.powerUpPopup.destroy();
      this.powerUpPopup = null;
    }
  }

  showAllianceProposal(
    fromPlayerName: string,
    fromColorHex: string,
    onAccept: () => void,
    onDecline: () => void
  ): void {
    if (this.allianceDialog) return;

    const container = this.scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(600);
    this.allianceDialog = container;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(-180, -80, 360, 160, 12);
    bg.lineStyle(2, 0x44ddff, 1);
    bg.strokeRoundedRect(-180, -80, 360, 160, 12);
    container.add(bg);

    const title = this.scene.add.text(0, -55, '🤝 Alliance Proposal', {
      fontSize: '16px', color: '#44ddff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(title);

    const msg = this.scene.add.text(0, -20, `${fromPlayerName} proposes a\nnon-aggression pact (5 turns)`, {
      fontSize: '13px', color: fromColorHex, fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);
    container.add(msg);

    const acceptBtn = this.scene.add.text(-70, 35, '✓ Accept', {
      fontSize: '14px', color: '#000', fontFamily: 'monospace', fontStyle: 'bold',
      backgroundColor: '#44dd88', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(acceptBtn);

    const declineBtn = this.scene.add.text(70, 35, '✗ Decline', {
      fontSize: '14px', color: '#000', fontFamily: 'monospace', fontStyle: 'bold',
      backgroundColor: '#dd4444', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(declineBtn);

    const cleanup = () => {
      this.allianceDialog = null;
      container.destroy();
    };

    acceptBtn.on('pointerup', () => {
      cleanup();
      onAccept();
    });

    declineBtn.on('pointerup', () => {
      cleanup();
      onDecline();
    });
  }

  dismissAllianceProposal(): void {
    if (this.allianceDialog) {
      this.allianceDialog.destroy();
      this.allianceDialog = null;
    }
  }

  showAllianceBreakConfirmation(
    defenderName: string,
    onBreak: () => void,
    onCancel: () => void
  ): void {
    if (this.allianceBreakDialog) return;

    const container = this.scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(600);
    this.allianceBreakDialog = container;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(-180, -80, 360, 160, 12);
    bg.lineStyle(2, 0xff6644, 1);
    bg.strokeRoundedRect(-180, -80, 360, 160, 12);
    container.add(bg);

    const title = this.scene.add.text(0, -55, '⚔️ Break Alliance?', {
      fontSize: '16px', color: '#ff6644', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(title);

    const msg = this.scene.add.text(0, -20, `This attack will betray your\nalliance with ${defenderName}!`, {
      fontSize: '13px', color: '#ffffff', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);
    container.add(msg);

    const confirmBtn = this.scene.add.text(-70, 35, '⚔️ Betray', {
      fontSize: '14px', color: '#000', fontFamily: 'monospace', fontStyle: 'bold',
      backgroundColor: '#ff6644', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(confirmBtn);

    const cancelBtn = this.scene.add.text(70, 35, '← Cancel', {
      fontSize: '14px', color: '#000', fontFamily: 'monospace', fontStyle: 'bold',
      backgroundColor: '#888888', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(cancelBtn);

    const cleanup = () => {
      this.allianceBreakDialog = null;
      container.destroy();
    };

    confirmBtn.on('pointerup', () => {
      cleanup();
      onBreak();
    });

    cancelBtn.on('pointerup', () => {
      cleanup();
      onCancel();
    });
  }

  dismissAllianceBreak(): void {
    if (this.allianceBreakDialog) {
      this.allianceBreakDialog.destroy();
      this.allianceBreakDialog = null;
    }
  }

  showDisconnectOverlay(onReturnToLobby: () => void): void {
    if (this.disconnectOverlay) return;

    this.disconnectOverlay = this.scene.add.container(0, 0).setDepth(2000);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.disconnectOverlay.add(bg);

    const text = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'Connection lost. Reconnecting...', {
      fontSize: '20px',
      color: '#e94560',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.disconnectOverlay.add(text);

    let countdown = 10;
    const timerText = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, `Retrying in ${countdown}s...`, {
      fontSize: '14px',
      color: '#8888aa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.disconnectOverlay.add(timerText);

    this.disconnectTimer = this.scene.time.addEvent({
      delay: 1000,
      repeat: 9,
      callback: () => {
        countdown--;
        if (countdown > 0) {
          timerText.setText(`Retrying in ${countdown}s...`);
        }
      },
    });

    this.scene.time.delayedCall(10000, () => {
      if (!this.disconnectOverlay) return;
      text.setText('Reconnection failed');
      timerText.setText('');

      const retryBtn = this.scene.add.container(0, 0);
      const retryBg = this.scene.add.graphics();
      retryBg.fillStyle(0xe94560, 1);
      retryBg.fillRoundedRect(GAME_WIDTH / 2 - 80, GAME_HEIGHT / 2 + 15, 160, 40, 8);
      retryBtn.add(retryBg);

      const retryLabel = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 35, 'Return to Lobby', {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      retryBtn.add(retryLabel);
      this.disconnectOverlay!.add(retryBtn);

      const retryZone = this.scene.add.zone(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 35, 160, 40)
        .setInteractive({ useHandCursor: true });
      retryZone.on('pointerover', () => {
        retryBg.clear();
        retryBg.fillStyle(0xff6b81, 1);
        retryBg.fillRoundedRect(GAME_WIDTH / 2 - 80, GAME_HEIGHT / 2 + 15, 160, 40, 8);
      });
      retryZone.on('pointerout', () => {
        retryBg.clear();
        retryBg.fillStyle(0xe94560, 1);
        retryBg.fillRoundedRect(GAME_WIDTH / 2 - 80, GAME_HEIGHT / 2 + 15, 160, 40, 8);
      });
      retryZone.on('pointerdown', () => {
        this.clearDisconnectOverlay();
        onReturnToLobby();
      });
      this.disconnectOverlay!.add(retryZone);
    });
  }

  clearDisconnectOverlay(): void {
    if (this.disconnectTimer) {
      this.disconnectTimer.destroy();
      this.disconnectTimer = null;
    }
    if (this.disconnectOverlay) {
      this.disconnectOverlay.destroy();
      this.disconnectOverlay = null;
    }
  }

  destroy(): void {
    this.dismissHelp();
    this.dismissConfirm();
    this.dismissExit();
    this.dismissSurrender();
    this.dismissPowerUpPopup();
    this.dismissAllianceProposal();
    this.dismissAllianceBreak();
    this.clearDisconnectOverlay();
  }
}
