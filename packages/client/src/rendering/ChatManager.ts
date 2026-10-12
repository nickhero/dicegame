import Phaser from 'phaser';
import { GAME_HEIGHT } from '@dicewars/shared';

export interface ChatManagerConfig {
  onSendMessage: (message: string) => void;
}

export class ChatManager {
  private scene: Phaser.Scene;
  private onSendMessage: (message: string) => void;
  private isOpen = false;
  private chatInput = '';
  private chatContainer: Phaser.GameObjects.Container | null = null;
  private chatTriggerBtn: Phaser.GameObjects.Container | null = null;
  private chatBg: Phaser.GameObjects.Graphics | null = null;
  private chatDisplayText: Phaser.GameObjects.Text | null = null;
  private chatCursorVisible = true;
  private chatCursorTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, config: ChatManagerConfig) {
    this.scene = scene;
    this.onSendMessage = config.onSendMessage;
  }

  create(): void {
    if (this.chatTriggerBtn) return;

    const btnX = 220;
    const btnY = GAME_HEIGHT - 38;
    this.chatTriggerBtn = this.scene.add.container(btnX, btnY).setDepth(450);

    const btnBg = this.scene.add.graphics();
    btnBg.fillStyle(0x0f3460, 0.85);
    btnBg.fillRoundedRect(0, 0, 130, 28, 6);
    btnBg.lineStyle(1, 0x4466aa, 0.8);
    btnBg.strokeRoundedRect(0, 0, 130, 28, 6);
    this.chatTriggerBtn.add(btnBg);

    const btnText = this.scene.add.text(65, 14, '💬 Chat (Enter)', {
      fontSize: '11px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.chatTriggerBtn.add(btnText);

    const hitZone = this.scene.add.zone(65, 14, 130, 28)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.open());
    this.chatTriggerBtn.add(hitZone);

    this.chatContainer = this.scene.add.container(btnX, btnY).setDepth(500).setVisible(false);

    this.chatBg = this.scene.add.graphics();
    this.chatBg.fillStyle(0x0a0c1a, 0.95);
    this.chatBg.fillRoundedRect(0, 0, 480, 32, 6);
    this.chatBg.lineStyle(2, 0xe94560, 1);
    this.chatBg.strokeRoundedRect(0, 0, 480, 32, 6);
    this.chatContainer.add(this.chatBg);

    this.chatDisplayText = this.scene.add.text(12, 16, '', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0, 0.5);

    const chatMaskGraphics = this.scene.add.graphics();
    chatMaskGraphics.fillStyle(0xffffff);
    chatMaskGraphics.fillRect(btnX + 10, btnY + 2, 400, 28);
    chatMaskGraphics.setVisible(false);
    this.chatDisplayText.setMask(chatMaskGraphics.createGeometryMask());

    this.chatContainer.add(this.chatDisplayText);

    const sendBg = this.scene.add.graphics();
    sendBg.fillStyle(0xe94560, 1);
    sendBg.fillRoundedRect(415, 4, 55, 24, 4);
    this.chatContainer.add(sendBg);

    const sendText = this.scene.add.text(442, 16, 'SEND', {
      fontSize: '11px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.chatContainer.add(sendText);

    const sendZone = this.scene.add.zone(442, 16, 55, 24)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.send());
    this.chatContainer.add(sendZone);

    const closeText = this.scene.add.text(495, 16, '✕', {
      fontSize: '14px',
      color: '#8888aa',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeText.on('pointerdown', () => this.close());
    this.chatContainer.add(closeText);

    this.chatCursorTimer = this.scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.chatCursorVisible = !this.chatCursorVisible;
        if (this.isOpen) {
          this.updateDisplay();
        }
      },
    });
  }

  isChatOpen(): boolean {
    return this.isOpen;
  }

  open(): void {
    this.isOpen = true;
    this.chatInput = '';
    this.chatContainer?.setVisible(true);
    this.chatTriggerBtn?.setVisible(false);
    this.updateDisplay();
  }

  close(): void {
    this.isOpen = false;
    this.chatInput = '';
    this.chatContainer?.setVisible(false);
    this.chatTriggerBtn?.setVisible(true);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.isOpen) return false;

    if (event.key === 'Escape') {
      this.close();
      return true;
    }
    if (event.key === 'Enter') {
      this.send();
      return true;
    }
    if (event.key === 'Backspace') {
      this.chatInput = this.chatInput.slice(0, -1);
      this.updateDisplay();
      return true;
    }
    if (event.key.length === 1 && this.chatInput.length < 140) {
      this.chatInput += event.key;
      this.updateDisplay();
      return true;
    }
    return true;
  }

  private send(): void {
    const trimmed = this.chatInput.trim();
    if (trimmed.length > 0) {
      this.onSendMessage(trimmed);
    }
    this.close();
  }

  private updateDisplay(): void {
    if (!this.chatDisplayText) return;
    const cursor = this.chatCursorVisible ? '|' : '';
    if (this.chatInput.length === 0) {
      this.chatDisplayText.setText(`💬 Type message... (Enter to send)${cursor}`).setColor('#777799');
    } else {
      const maxVisible = 46;
      let textToShow = this.chatInput;
      if (textToShow.length > maxVisible) {
        textToShow = '…' + textToShow.slice(-(maxVisible - 1));
      }
      this.chatDisplayText.setText(`💬 ${textToShow}${cursor}`).setColor('#ffffff');
    }
  }

  destroy(): void {
    if (this.chatCursorTimer) {
      this.chatCursorTimer.destroy();
      this.chatCursorTimer = null;
    }
    this.chatContainer?.destroy();
    this.chatContainer = null;
    this.chatTriggerBtn?.destroy();
    this.chatTriggerBtn = null;
    this.chatBg = null;
    this.chatDisplayText = null;
    this.isOpen = false;
    this.chatInput = '';
  }
}
