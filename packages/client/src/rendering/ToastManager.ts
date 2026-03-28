import Phaser from 'phaser';
import { GAME_WIDTH } from '@dicewars/shared';

export type ToastType = 'info' | 'warning' | 'error';

interface Toast {
  container: Phaser.GameObjects.Container;
  timer: Phaser.Time.TimerEvent;
}

const TOAST_COLORS: Record<ToastType, { bg: number; border: number; text: string }> = {
  info: { bg: 0x113344, border: 0x44aacc, text: '#44ccff' },
  warning: { bg: 0x332211, border: 0xccaa44, text: '#ffcc44' },
  error: { bg: 0x331111, border: 0xcc4444, text: '#ff6666' },
};

const TOAST_HEIGHT = 36;
const TOAST_GAP = 6;
const TOAST_DURATION = 3000;
const TOAST_BOTTOM_MARGIN = 60;

export class ToastManager {
  private scene: Phaser.Scene;
  private toasts: Toast[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(message: string, type: ToastType = 'info'): void {
    const colors = TOAST_COLORS[type];
    const cx = GAME_WIDTH / 2;
    const yBase = this.scene.scale.height - TOAST_BOTTOM_MARGIN;
    const y = yBase - this.toasts.length * (TOAST_HEIGHT + TOAST_GAP);

    const container = this.scene.add.container(cx, y).setDepth(900).setAlpha(0);

    const textObj = this.scene.add.text(0, 0, message, {
      fontSize: '13px',
      color: colors.text,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const w = Math.max(textObj.width + 32, 200);
    const h = TOAST_HEIGHT;

    const bg = this.scene.add.graphics();
    bg.fillStyle(colors.bg, 0.92);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(1, colors.border, 0.8);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);

    container.add([bg, textObj]);

    // Fade in
    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Power1',
    });

    const timer = this.scene.time.delayedCall(TOAST_DURATION, () => {
      this.dismissToast(toast);
    });

    const toast: Toast = { container, timer };
    this.toasts.push(toast);
  }

  private dismissToast(toast: Toast): void {
    const index = this.toasts.indexOf(toast);
    if (index === -1) return;

    this.scene.tweens.add({
      targets: toast.container,
      alpha: 0,
      duration: 300,
      ease: 'Power1',
      onComplete: () => {
        toast.container.destroy();
        this.toasts = this.toasts.filter((t) => t !== toast);
        this.repositionToasts();
      },
    });
  }

  private repositionToasts(): void {
    const yBase = this.scene.scale.height - TOAST_BOTTOM_MARGIN;
    this.toasts.forEach((toast, i) => {
      this.scene.tweens.add({
        targets: toast.container,
        y: yBase - i * (TOAST_HEIGHT + TOAST_GAP),
        duration: 200,
        ease: 'Power1',
      });
    });
  }

  destroy(): void {
    for (const toast of this.toasts) {
      toast.timer.destroy();
      toast.container.destroy();
    }
    this.toasts = [];
  }
}
