import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

const DEFAULT_X = 10;
const DEFAULT_Y = GAME_HEIGHT - 110;
const PANEL_W = 520;
const PANEL_H = 100;
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
  private maskShape: Phaser.GameObjects.Graphics;
  private mask!: Phaser.Display.Masks.GeometryMask;
  private panelX: number;
  private panelY: number;
  private dragZone: Phaser.GameObjects.Zone;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.panelX = DEFAULT_X;
    this.panelY = DEFAULT_Y;
    this.container = scene.add.container(0, 0).setDepth(99);

    this.bg = scene.add.graphics();
    this.container.add(this.bg);

    // Mask to clip text within panel bounds
    this.maskShape = scene.add.graphics();
    this.maskShape.setVisible(false);
    this.mask = this.maskShape.createGeometryMask();

    // Interactive zone for drag + scroll
    this.dragZone = scene.add.zone(0, 0, PANEL_W, PANEL_H).setInteractive({
      useHandCursor: true,
      draggable: true,
    });
    this.container.add(this.dragZone);

    // Drag handling
    scene.input.setDraggable(this.dragZone);
    this.dragZone.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      this.panelX = Phaser.Math.Clamp(dragX - PANEL_W / 2, 0, GAME_WIDTH - PANEL_W);
      this.panelY = Phaser.Math.Clamp(dragY - PANEL_H / 2, 0, GAME_HEIGHT - PANEL_H);
      this.redrawPanel();
      this.rebuildText();
    });

    // Scroll handling
    scene.input.on('wheel', (
      pointer: Phaser.Input.Pointer,
      _over: Phaser.GameObjects.GameObject[],
      _dx: number,
      _dy: number,
      dz: number,
    ) => {
      if (
        pointer.x >= this.panelX &&
        pointer.x <= this.panelX + PANEL_W &&
        pointer.y >= this.panelY &&
        pointer.y <= this.panelY + PANEL_H
      ) {
        this.scroll(dz > 0 ? 1 : -1);
      }
    });

    this.redrawPanel();
  }

  private redrawPanel(): void {
    this.bg.clear();
    this.bg.fillStyle(0x111122, 0.8);
    this.bg.fillRoundedRect(this.panelX, this.panelY, PANEL_W, PANEL_H, 4);
    // Thin drag-handle line at top
    this.bg.fillStyle(0x334455, 0.6);
    this.bg.fillRect(this.panelX + PANEL_W / 2 - 30, this.panelY + 2, 60, 2);

    this.maskShape.clear();
    this.maskShape.fillStyle(0xffffff);
    this.maskShape.fillRect(this.panelX, this.panelY + 4, PANEL_W, PANEL_H - 8);

    this.dragZone.setPosition(this.panelX + PANEL_W / 2, this.panelY + PANEL_H / 2);
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
        this.panelX + 6,
        this.panelY + 5 + lineIndex * LINE_HEIGHT,
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
