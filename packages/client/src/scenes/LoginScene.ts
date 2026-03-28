import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '@dicewars/shared';
import { AuthClient } from '../network/AuthClient';

export class LoginScene extends Phaser.Scene {
  private authClient!: AuthClient;
  private inputText = '';
  private inputDisplay!: Phaser.GameObjects.Text;
  private inputBg!: Phaser.GameObjects.Graphics;
  private cursorVisible = true;
  private cursorTimer!: Phaser.Time.TimerEvent;
  private statusText!: Phaser.GameObjects.Text;
  private submitButton!: Phaser.GameObjects.Zone;
  private submitBg!: Phaser.GameObjects.Graphics;

  constructor() {
    super('LoginScene');
  }

  init(data: Record<string, unknown>): void {
    this.authClient = (data.authClient as AuthClient) ?? new AuthClient();
    this.inputText = '';
  }

  create(): void {
    // Auto-proceed if already authenticated
    if (this.authClient.isAuthenticated()) {
      this.scene.start('LobbyScene', { authClient: this.authClient });
      return;
    }

    const cx = GAME_WIDTH / 2;

    // Title
    this.add.text(cx, 120, 'DICEWARS ONLINE', {
      fontSize: '42px',
      color: '#e94560',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, 170, 'Multiplayer territory strategy', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Name label
    this.add.text(cx, 240, 'Enter your name:', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Text input field
    const inputW = 320;
    const inputH = 40;
    const inputX = cx - inputW / 2;
    const inputY = 270;

    this.inputBg = this.add.graphics();
    this.drawInputBg(false);

    this.inputDisplay = this.add.text(inputX + 10, inputY + 10, '', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });

    // Make the input area clickable to indicate focus
    this.add.zone(cx, inputY + inputH / 2, inputW, inputH)
      .setInteractive({ useHandCursor: true });

    // Blinking cursor
    this.cursorTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.cursorVisible = !this.cursorVisible;
        this.updateInputDisplay();
      },
    });

    // Keyboard input
    this.input.keyboard!.on('keydown', this.handleKeyDown, this);

    // Submit button
    const btnY = 340;
    this.submitBg = this.add.graphics();
    this.drawSubmitButton(0x0f3460);

    this.add.text(cx, btnY, 'ENTER AS GUEST', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.submitButton = this.add.zone(cx, btnY, 240, 50)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.drawSubmitButton(0x16213e))
      .on('pointerout', () => this.drawSubmitButton(0x0f3460))
      .on('pointerdown', () => this.handleSubmit());

    // Status text
    this.statusText = this.add.text(cx, 400, '', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Back button
    this.createButton(cx, 480, 'BACK', 0x333355, 0x444477, () => {
      this.scene.start('MenuScene');
    });

    this.updateInputDisplay();
  }

  shutdown(): void {
    this.input.keyboard?.off('keydown', this.handleKeyDown, this);
    if (this.cursorTimer) {
      this.cursorTimer.destroy();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      this.inputText = this.inputText.slice(0, -1);
    } else if (event.key === 'Enter') {
      this.handleSubmit();
      return;
    } else if (event.key.length === 1 && this.inputText.length < 20) {
      if (/^[a-zA-Z0-9 _-]$/.test(event.key)) {
        this.inputText += event.key;
      }
    }
    this.updateInputDisplay();
  }

  private updateInputDisplay(): void {
    const cursor = this.cursorVisible ? '|' : '';
    this.inputDisplay.setText(this.inputText + cursor);
  }

  private drawInputBg(focused: boolean): void {
    const cx = GAME_WIDTH / 2;
    const inputW = 320;
    const inputH = 40;
    const inputX = cx - inputW / 2;
    const inputY = 270;
    const borderColor = focused ? 0xe94560 : 0x444466;

    this.inputBg.clear();
    this.inputBg.fillStyle(0x0a0a1a, 1);
    this.inputBg.fillRoundedRect(inputX, inputY, inputW, inputH, 6);
    this.inputBg.lineStyle(2, borderColor, 1);
    this.inputBg.strokeRoundedRect(inputX, inputY, inputW, inputH, 6);
  }

  private drawSubmitButton(color: number): void {
    const cx = GAME_WIDTH / 2;
    const btnY = 340;
    this.submitBg.clear();
    this.submitBg.fillStyle(color, 1);
    this.submitBg.fillRoundedRect(cx - 120, btnY - 25, 240, 50, 8);
  }

  private async handleSubmit(): Promise<void> {
    const name = this.inputText.trim();
    if (name.length === 0) {
      this.statusText.setText('Please enter a name').setColor('#e94560');
      return;
    }

    this.statusText.setText('Connecting...').setColor('#aaaaaa');
    this.submitButton.disableInteractive();

    try {
      await this.authClient.loginAsGuest(name);
      this.scene.start('LobbyScene', { authClient: this.authClient });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      this.statusText.setText(message).setColor('#e94560');
      this.submitButton.setInteractive({ useHandCursor: true });
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
