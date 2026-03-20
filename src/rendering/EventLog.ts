import Phaser from 'phaser';
import { GAME_HEIGHT } from '../config';

const PANEL_X = 10;
const PANEL_Y = GAME_HEIGHT - 200;
const PANEL_W = 280;
const PANEL_H = 180;
const LINE_HEIGHT = 13;
const FONT_SIZE = '11px';
const MAX_EVENTS = 50;
const VISIBLE_LINES = Math.floor((PANEL_H - 10) / LINE_HEIGHT);

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
    this.container = scene.add.container(0, 0).setDepth(99);

    this.bg = scene.add.graphics();
    this.bg.fillStyle(0x111122, 0.8);
    this.bg.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 4);
    this.container.add(this.bg);

    // Mask to clip text within panel bounds
    const maskShape = scene.add.graphics();
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(PANEL_X, PANEL_Y + 4, PANEL_W, PANEL_H - 8);
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

    zone.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, _dy: number, dz: number) => {
      this.scroll(dz > 0 ? 1 : -1);
    });

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
    // Remove old text objects
    for (const t of this.textObjects) {
      t.destroy();
    }
    this.textObjects = [];

    const start = this.scrollOffset;
    const end = Math.min(this.events.length, start + VISIBLE_LINES);

    for (let i = start; i < end; i++) {
      const ev = this.events[i];
      const lineIndex = i - start;
      const colorStr = '#' + ev.color.toString(16).padStart(6, '0');

      const txt = this.scene.add.text(
        PANEL_X + 6,
        PANEL_Y + 5 + lineIndex * LINE_HEIGHT,
        ev.text,
        {
          fontSize: FONT_SIZE,
          color: colorStr,
          fontFamily: 'monospace',
          wordWrap: { width: PANEL_W - 16 },
        }
      );
      txt.setMask(this.mask);
      this.container.add(txt);
      this.textObjects.push(txt);
    }
  }
}
