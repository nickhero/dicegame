import Phaser from 'phaser';
import { GAME_HEIGHT } from '@dicewars/shared';

const PANEL_X = 10;
const PANEL_Y = 10;
const PANEL_W = 200;
const PANEL_H = GAME_HEIGHT - 20;
const LINE_HEIGHT = 14;
const FONT_SIZE = '10px';
const MAX_EVENTS = 100;
const VISIBLE_LINES = Math.floor((PANEL_H - 24) / LINE_HEIGHT);

export class EventLog {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private events: { text: string; color: number }[] = [];
  private textObjects: Phaser.GameObjects.Text[] = [];
  private scrollOffset = 0;
  private mask!: Phaser.Display.Masks.GeometryMask;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(500);

    this.bg = scene.add.graphics();
    this.bg.fillStyle(0x111122, 0.8);
    this.bg.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 4);
    // Header
    this.bg.fillStyle(0x334455, 0.6);
    this.bg.fillRect(PANEL_X, PANEL_Y, PANEL_W, 16);
    this.container.add(this.bg);

    const title = scene.add.text(PANEL_X + 6, PANEL_Y + 2, 'EVENT LOG', {
      fontSize: '10px', color: '#8899aa', fontFamily: 'monospace',
    });
    this.container.add(title);

    // Mask to clip text within panel bounds
    const maskShape = scene.add.graphics();
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(PANEL_X, PANEL_Y + 18, PANEL_W, PANEL_H - 22);
    maskShape.setVisible(false);
    this.mask = maskShape.createGeometryMask();

    // Interactive zone for scroll
    const zone = scene.add.zone(
      PANEL_X + PANEL_W / 2,
      PANEL_Y + PANEL_H / 2,
      PANEL_W,
      PANEL_H
    ).setInteractive();
    this.container.add(zone);

    scene.input.on('wheel', (
      pointer: Phaser.Input.Pointer,
      _over: Phaser.GameObjects.GameObject[],
      _dx: number,
      _dy: number,
      dz: number,
    ) => {
      if (
        pointer.x >= PANEL_X &&
        pointer.x <= PANEL_X + PANEL_W &&
        pointer.y >= PANEL_Y &&
        pointer.y <= PANEL_Y + PANEL_H
      ) {
        this.scroll(dz > 0 ? 1 : -1);
      }
    });
  }

  addEvent(text: string, color: number = 0xcccccc): void {
    this.events.push({ text, color });
    if (this.events.length > MAX_EVENTS) {
      this.events.shift();
    }

    // Auto-scroll to bottom
    this.scrollOffset = Math.max(0, this.events.length - VISIBLE_LINES);
    this.rebuildText();

    // Fade-in on the last visible text object
    const lastObj = this.textObjects[this.textObjects.length - 1];
    if (lastObj) {
      lastObj.setAlpha(0);
      this.scene.tweens.add({
        targets: lastObj,
        alpha: 1,
        duration: 250,
        ease: 'Power1',
      });
    }
  }

  clear(): void {
    this.events = [];
    this.scrollOffset = 0;
    this.rebuildText();
  }

  destroy(): void {
    this.container.destroy();
  }

  private scroll(direction: number): void {
    const maxScroll = Math.max(0, this.events.length - VISIBLE_LINES);
    this.scrollOffset = Phaser.Math.Clamp(
      this.scrollOffset + direction * 2,
      0,
      maxScroll
    );
    this.rebuildText();
  }

  private rebuildText(): void {
    for (const t of this.textObjects) {
      t.destroy();
    }
    this.textObjects = [];

    const contentTop = PANEL_Y + 20;
    const contentBottom = PANEL_Y + PANEL_H - 4;
    let curY = contentTop;

    for (let i = this.scrollOffset; i < this.events.length; i++) {
      if (curY >= contentBottom) break;

      const ev = this.events[i];
      const colorStr = '#' + ev.color.toString(16).padStart(6, '0');

      const txt = this.scene.add.text(PANEL_X + 6, curY, ev.text, {
        fontSize: FONT_SIZE,
        color: colorStr,
        fontFamily: 'monospace',
        wordWrap: { width: PANEL_W - 16 },
      });
      txt.setMask(this.mask);
      this.container.add(txt);
      this.textObjects.push(txt);

      curY += txt.height + 2;
    }
  }
}
