import Phaser from 'phaser';
import { GAME_WIDTH } from '@dicewars/shared';
import { AuthClient } from '../network/AuthClient';

type AuthMode = 'guest' | 'login' | 'register';

export class LoginScene extends Phaser.Scene {
  private authClient!: AuthClient;
  private mode: AuthMode = 'guest';

  private nameText = '';
  private passwordText = '';
  private confirmText = '';
  private activeField = 0; // 0: name, 1: password, 2: confirm

  private cursorVisible = true;
  private cursorTimer!: Phaser.Time.TimerEvent;

  private tabGuest!: Phaser.GameObjects.Text;
  private tabLogin!: Phaser.GameObjects.Text;
  private tabRegister!: Phaser.GameObjects.Text;
  private tabUnderline!: Phaser.GameObjects.Graphics;

  private nameLabel!: Phaser.GameObjects.Text;
  private nameBg!: Phaser.GameObjects.Graphics;
  private nameDisplay!: Phaser.GameObjects.Text;

  private passLabel!: Phaser.GameObjects.Text;
  private passBg!: Phaser.GameObjects.Graphics;
  private passDisplay!: Phaser.GameObjects.Text;

  private confirmLabel!: Phaser.GameObjects.Text;
  private confirmBg!: Phaser.GameObjects.Graphics;
  private confirmDisplay!: Phaser.GameObjects.Text;

  private submitButtonZone!: Phaser.GameObjects.Zone;
  private submitButtonBg!: Phaser.GameObjects.Graphics;
  private submitButtonText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super('LoginScene');
  }

  init(data: Record<string, unknown>): void {
    this.authClient = (data.authClient as AuthClient) ?? new AuthClient();
    this.nameText = '';
    this.passwordText = '';
    this.confirmText = '';
    this.activeField = 0;
    this.mode = 'guest';
  }

  create(): void {
    if (this.authClient.isAuthenticated()) {
      this.scene.start('LobbyScene', { authClient: this.authClient });
      return;
    }

    const cx = GAME_WIDTH / 2;

    // Header Title
    this.add.text(cx, 80, 'DICEWARS ONLINE', {
      fontSize: '38px',
      color: '#e94560',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, 120, 'Multiplayer territory strategy', {
      fontSize: '14px',
      color: '#8888aa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Mode Tabs
    const tabY = 165;
    this.tabGuest = this.add.text(cx - 140, tabY, 'GUEST PLAY', {
      fontSize: '15px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tabLogin = this.add.text(cx, tabY, 'SIGN IN', {
      fontSize: '15px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tabRegister = this.add.text(cx + 140, tabY, 'REGISTER', {
      fontSize: '15px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tabGuest.on('pointerdown', () => this.switchMode('guest'));
    this.tabLogin.on('pointerdown', () => this.switchMode('login'));
    this.tabRegister.on('pointerdown', () => this.switchMode('register'));

    this.tabUnderline = this.add.graphics();

    const inputW = 320;
    const inputH = 38;
    const inputX = cx - inputW / 2;

    // Field 0: Username / Display Name
    this.nameLabel = this.add.text(cx, 205, 'Display Name:', {
      fontSize: '14px',
      color: '#cccccc',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.nameBg = this.add.graphics();
    this.nameDisplay = this.add.text(inputX + 10, 230, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    this.add.zone(cx, 240, inputW, inputH)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { this.activeField = 0; this.updateDisplays(); });

    // Field 1: Password
    this.passLabel = this.add.text(cx, 275, 'Password (min 8 chars):', {
      fontSize: '14px',
      color: '#cccccc',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.passBg = this.add.graphics();
    this.passDisplay = this.add.text(inputX + 10, 300, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    this.add.zone(cx, 310, inputW, inputH)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { this.activeField = 1; this.updateDisplays(); });

    // Field 2: Confirm Password
    this.confirmLabel = this.add.text(cx, 345, 'Confirm Password:', {
      fontSize: '14px',
      color: '#cccccc',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.confirmBg = this.add.graphics();
    this.confirmDisplay = this.add.text(inputX + 10, 370, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    this.add.zone(cx, 380, inputW, inputH)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { this.activeField = 2; this.updateDisplays(); });

    // Submit button
    const btnY = 440;
    this.submitButtonBg = this.add.graphics();
    this.submitButtonText = this.add.text(cx, btnY, 'PLAY AS GUEST', {
      fontSize: '17px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.submitButtonZone = this.add.zone(cx, btnY, 260, 48)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.drawSubmitButton(0x16213e))
      .on('pointerout', () => this.drawSubmitButton(0x0f3460))
      .on('pointerdown', () => this.handleSubmit());

    // Status text
    this.statusText = this.add.text(cx, 500, '', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5);

    // Back button
    this.createButton(cx, 560, 'BACK', 0x333355, 0x444477, () => {
      this.scene.start('MenuScene');
    });

    // Blinking cursor
    this.cursorTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.cursorVisible = !this.cursorVisible;
        this.updateDisplays();
      },
    });

    // Keyboard handling
    this.input.keyboard!.on('keydown', this.handleKeyDown, this);

    this.switchMode('guest');
  }

  shutdown(): void {
    this.input.keyboard?.off('keydown', this.handleKeyDown, this);
    if (this.cursorTimer) {
      this.cursorTimer.destroy();
    }
  }

  private switchMode(mode: AuthMode): void {
    this.mode = mode;
    this.activeField = 0;
    this.statusText.setText('');

    const cx = GAME_WIDTH / 2;
    this.tabGuest.setColor(mode === 'guest' ? '#e94560' : '#777799');
    this.tabLogin.setColor(mode === 'login' ? '#e94560' : '#777799');
    this.tabRegister.setColor(mode === 'register' ? '#e94560' : '#777799');

    const activeTab = mode === 'guest' ? this.tabGuest : mode === 'login' ? this.tabLogin : this.tabRegister;
    this.tabUnderline.clear();
    this.tabUnderline.fillStyle(0xe94560, 1);
    this.tabUnderline.fillRect(activeTab.x - activeTab.width / 2, activeTab.y + 12, activeTab.width, 3);

    if (mode === 'guest') {
      this.nameLabel.setText('Display Name:').setPosition(cx, 220);
      this.nameDisplay.setPosition(cx - 150, 245);
      this.passLabel.setVisible(false);
      this.passBg.setVisible(false);
      this.passDisplay.setVisible(false);
      this.confirmLabel.setVisible(false);
      this.confirmBg.setVisible(false);
      this.confirmDisplay.setVisible(false);
      this.submitButtonText.setText('PLAY AS GUEST');
    } else if (mode === 'login') {
      this.nameLabel.setText('Username:').setPosition(cx, 205);
      this.nameDisplay.setPosition(cx - 150, 230);
      this.passLabel.setVisible(true).setText('Password:').setPosition(cx, 275);
      this.passBg.setVisible(true);
      this.passDisplay.setVisible(true).setPosition(cx - 150, 300);
      this.confirmLabel.setVisible(false);
      this.confirmBg.setVisible(false);
      this.confirmDisplay.setVisible(false);
      this.submitButtonText.setText('SIGN IN');
    } else {
      this.nameLabel.setText('Username:').setPosition(cx, 195);
      this.nameDisplay.setPosition(cx - 150, 218);
      this.passLabel.setVisible(true).setText('Password (min 8 chars):').setPosition(cx, 260);
      this.passBg.setVisible(true);
      this.passDisplay.setVisible(true).setPosition(cx - 150, 283);
      this.confirmLabel.setVisible(true).setPosition(cx, 325);
      this.confirmBg.setVisible(true);
      this.confirmDisplay.setVisible(true).setPosition(cx - 150, 348);
      this.submitButtonText.setText('CREATE ACCOUNT');
    }

    this.drawSubmitButton(0x0f3460);
    this.updateDisplays();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      event.preventDefault();
      const maxField = this.mode === 'guest' ? 0 : this.mode === 'login' ? 1 : 2;
      this.activeField = (this.activeField + 1) % (maxField + 1);
      this.updateDisplays();
      return;
    }

    if (event.key === 'Enter') {
      const maxField = this.mode === 'guest' ? 0 : this.mode === 'login' ? 1 : 2;
      if (this.activeField < maxField) {
        this.activeField++;
        this.updateDisplays();
      } else {
        this.handleSubmit();
      }
      return;
    }

    if (event.key === 'Backspace') {
      if (this.activeField === 0) {
        this.nameText = this.nameText.slice(0, -1);
      } else if (this.activeField === 1) {
        this.passwordText = this.passwordText.slice(0, -1);
      } else if (this.activeField === 2) {
        this.confirmText = this.confirmText.slice(0, -1);
      }
      this.updateDisplays();
      return;
    }

    if (event.key.length === 1) {
      if (this.activeField === 0 && this.nameText.length < 20) {
        const pattern = this.mode === 'guest' ? /^[a-zA-Z0-9 _-]$/ : /^[a-zA-Z0-9_]$/;
        if (pattern.test(event.key)) {
          this.nameText += event.key;
        }
      } else if (this.activeField === 1 && this.passwordText.length < 50) {
        this.passwordText += event.key;
      } else if (this.activeField === 2 && this.confirmText.length < 50) {
        this.confirmText += event.key;
      }
      this.updateDisplays();
    }
  }

  private updateDisplays(): void {
    const cursor = this.cursorVisible ? '|' : '';
    const cx = GAME_WIDTH / 2;
    const inputW = 320;
    const inputH = 34;
    const inputX = cx - inputW / 2;

    const maskedPass = '*'.repeat(this.passwordText.length);
    const maskedConfirm = '*'.repeat(this.confirmText.length);

    this.nameDisplay.setText(this.nameText + (this.activeField === 0 ? cursor : ''));
    this.passDisplay.setText(maskedPass + (this.activeField === 1 ? cursor : ''));
    this.confirmDisplay.setText(maskedConfirm + (this.activeField === 2 ? cursor : ''));

    this.nameBg.clear();
    const nameY = this.mode === 'guest' ? 240 : this.mode === 'login' ? 225 : 213;
    this.nameBg.fillStyle(0x0a0a1a, 1);
    this.nameBg.fillRoundedRect(inputX, nameY, inputW, inputH, 6);
    this.nameBg.lineStyle(2, this.activeField === 0 ? 0xe94560 : 0x444466, 1);
    this.nameBg.strokeRoundedRect(inputX, nameY, inputW, inputH, 6);

    if (this.mode !== 'guest') {
      this.passBg.clear();
      const passY = this.mode === 'login' ? 295 : 278;
      this.passBg.fillStyle(0x0a0a1a, 1);
      this.passBg.fillRoundedRect(inputX, passY, inputW, inputH, 6);
      this.passBg.lineStyle(2, this.activeField === 1 ? 0xe94560 : 0x444466, 1);
      this.passBg.strokeRoundedRect(inputX, passY, inputW, inputH, 6);
    }

    if (this.mode === 'register') {
      this.confirmBg.clear();
      const confirmY = 343;
      this.confirmBg.fillStyle(0x0a0a1a, 1);
      this.confirmBg.fillRoundedRect(inputX, confirmY, inputW, inputH, 6);
      this.confirmBg.lineStyle(2, this.activeField === 2 ? 0xe94560 : 0x444466, 1);
      this.confirmBg.strokeRoundedRect(inputX, confirmY, inputW, inputH, 6);
    }
  }

  private drawSubmitButton(color: number): void {
    const cx = GAME_WIDTH / 2;
    const btnY = 440;
    this.submitButtonBg.clear();
    this.submitButtonBg.fillStyle(color, 1);
    this.submitButtonBg.fillRoundedRect(cx - 130, btnY - 24, 260, 48, 8);
  }

  private async handleSubmit(): Promise<void> {
    const name = this.nameText.trim();

    if (this.mode === 'guest') {
      if (name.length < 2) {
        this.statusText.setText('Please enter at least 2 characters').setColor('#e94560');
        return;
      }
    } else {
      if (name.length < 3) {
        this.statusText.setText('Username must be at least 3 characters').setColor('#e94560');
        return;
      }
      if (this.passwordText.length < 8) {
        this.statusText.setText('Password must be at least 8 characters').setColor('#e94560');
        return;
      }
      if (this.mode === 'register' && this.passwordText !== this.confirmText) {
        this.statusText.setText('Passwords do not match').setColor('#e94560');
        return;
      }
    }

    this.statusText.setText('Processing...').setColor('#aaaaaa');
    this.submitButtonZone.disableInteractive();

    try {
      if (this.mode === 'guest') {
        await this.authClient.loginAsGuest(name);
      } else if (this.mode === 'login') {
        await this.authClient.login(name, this.passwordText);
      } else {
        await this.authClient.register(name, this.passwordText);
      }

      this.statusText.setText('Success! Loading lobby...').setColor('#4ecca3');
      this.time.delayedCall(300, () => {
        this.scene.start('LobbyScene', { authClient: this.authClient });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      this.statusText.setText(message).setColor('#e94560');
      this.submitButtonZone.setInteractive({ useHandCursor: true });
    }
  }

  private createButton(
    x: number,
    y: number,
    text: string,
    color: number,
    hoverColor: number,
    onClick: () => void,
  ): void {
    const w = 140;
    const h = 40;
    const bg = this.add.graphics();
    const draw = (c: number) => {
      bg.clear();
      bg.fillStyle(c, 1);
      bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    };
    draw(color);

    this.add.text(x, y, text, {
      fontSize: '15px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.zone(x, y, w, h)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => draw(hoverColor))
      .on('pointerout', () => draw(color))
      .on('pointerdown', onClick);
  }
}
