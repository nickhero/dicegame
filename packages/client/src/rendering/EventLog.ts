function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

import Phaser from 'phaser';
import { GAME_HEIGHT } from '@dicewars/shared';

const PANEL_X = 10;
const PANEL_Y = 10;
const PANEL_W = 200;
const PANEL_H = GAME_HEIGHT - 20;
const HEADER_H = 20;
const FONT_SIZE = '10px';
const MAX_EVENTS = 150;
const SCROLLBAR_W = 4;
const VIEWPORT_Y = PANEL_Y + HEADER_H;
const VIEWPORT_H = PANEL_H - HEADER_H;

export class EventLog {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private contentContainer: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private scrollbarGraphics: Phaser.GameObjects.Graphics;
  private events: { text: string; color: number }[] = [];
  private textObjects: Phaser.GameObjects.Text[] = [];
  private scrollY = 0;
  private maxScrollY = 0;
  private totalContentHeight = 0;
  private mask!: Phaser.Display.Masks.GeometryMask;
  private maskShape: Phaser.GameObjects.Graphics;
  private isDragging = false;
  private dragStartY = 0;
  private dragStartScrollY = 0;
  private wheelListener: (
    pointer: Phaser.Input.Pointer,
    over: Phaser.GameObjects.GameObject[],
    dx: number,
    dy: number,
    dz: number
  ) => void;
  private moveListener: (pointer: Phaser.Input.Pointer) => void;
  private stopDragListener: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(500);

    // Main background panel
    this.bg = scene.add.graphics();
    this.bg.fillStyle(0x111122, 0.85);
    this.bg.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 4);
    // Header background
    this.bg.fillStyle(0x334455, 0.7);
    this.bg.fillRect(PANEL_X, PANEL_Y, PANEL_W, HEADER_H);
    this.container.add(this.bg);

    const title = scene.add.text(PANEL_X + 6, PANEL_Y + 4, 'EVENT LOG', {
      fontSize: '10px',
      color: '#8899aa',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    this.container.add(title);

    // Scroll up button ▲
    const upBtn = scene.add
      .text(PANEL_X + PANEL_W - 32, PANEL_Y + 3, '▲', {
        fontSize: '11px',
        color: '#8899aa',
        fontFamily: 'monospace',
      })
      .setInteractive({ useHandCursor: true });
    upBtn.on('pointerover', () => upBtn.setColor('#ffffff'));
    upBtn.on('pointerout', () => upBtn.setColor('#8899aa'));
    upBtn.on('pointerdown', () => this.scrollBy(-35));
    this.container.add(upBtn);

    // Scroll down button ▼
    const downBtn = scene.add
      .text(PANEL_X + PANEL_W - 16, PANEL_Y + 3, '▼', {
        fontSize: '11px',
        color: '#8899aa',
        fontFamily: 'monospace',
      })
      .setInteractive({ useHandCursor: true });
    downBtn.on('pointerover', () => downBtn.setColor('#ffffff'));
    downBtn.on('pointerout', () => downBtn.setColor('#8899aa'));
    downBtn.on('pointerdown', () => this.scrollBy(35));
    this.container.add(downBtn);

    // Content container holds all event text objects
    this.contentContainer = scene.add.container(0, 0);
    this.container.add(this.contentContainer);

    // Mask to strictly clip content within panel viewport
    this.maskShape = scene.add.graphics();
    this.maskShape.fillStyle(0xffffff);
    this.maskShape.fillRect(PANEL_X, VIEWPORT_Y, PANEL_W, VIEWPORT_H);
    this.maskShape.setVisible(false);
    this.mask = this.maskShape.createGeometryMask();
    this.contentContainer.setMask(this.mask);

    // Scrollbar overlay
    this.scrollbarGraphics = scene.add.graphics();
    this.container.add(this.scrollbarGraphics);

    // Interactive zone for dragging to scroll
    const zone = scene.add
      .zone(
        PANEL_X + PANEL_W / 2,
        VIEWPORT_Y + VIEWPORT_H / 2,
        PANEL_W,
        VIEWPORT_H
      )
      .setInteractive({ useHandCursor: true });
    this.container.add(zone);

    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.dragStartY = pointer.y;
      this.dragStartScrollY = this.scrollY;
    });

    this.moveListener = (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging) {
        const dy = pointer.y - this.dragStartY;
        this.scrollTo(this.dragStartScrollY - dy);
      }
    };
    scene.input.on('pointermove', this.moveListener);

    this.stopDragListener = () => {
      this.isDragging = false;
    };
    scene.input.on('pointerup', this.stopDragListener);
    scene.input.on('pointerupoutside', this.stopDragListener);

    // Mouse wheel and trackpad scroll listener (handles both deltaY and deltaZ)
    this.wheelListener = (
      pointer: Phaser.Input.Pointer,
      _over: Phaser.GameObjects.GameObject[],
      _dx: number,
      dy: number,
      dz: number
    ) => {
      if (
        pointer.x >= PANEL_X &&
        pointer.x <= PANEL_X + PANEL_W &&
        pointer.y >= PANEL_Y &&
        pointer.y <= PANEL_Y + PANEL_H
      ) {
        const delta = dy !== 0 ? dy : dz;
        this.scrollBy(delta > 0 ? 35 : -35);
      }
    };
    scene.input.on('wheel', this.wheelListener);
  }

  addEvent(text: string, color: number = 0xcccccc): void {
    this.events.push({ text, color });
    if (this.events.length > MAX_EVENTS) {
      this.events.shift();
    }

    const wasNearBottom = this.maxScrollY - this.scrollY < 50;

    this.rebuildText();

    // Auto-scroll to bottom if user was near the bottom or this is the first event
    if (wasNearBottom || this.events.length === 1) {
      this.scrollTo(this.maxScrollY);
    }

    // Fade-in effect on the last visible text object
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
    this.scrollY = 0;
    this.rebuildText();
  }

  destroy(): void {
    this.scene.input.off('wheel', this.wheelListener);
    this.scene.input.off('pointermove', this.moveListener);
    this.scene.input.off('pointerup', this.stopDragListener);
    this.scene.input.off('pointerupoutside', this.stopDragListener);
    this.maskShape.destroy();
    this.container.destroy();
  }

  private scrollBy(delta: number): void {
    this.scrollTo(this.scrollY + delta);
  }

  private scrollTo(y: number): void {
    this.scrollY = clamp(y, 0, this.maxScrollY);
    this.contentContainer.y = -this.scrollY;
    this.renderScrollbar();
  }

  private rebuildText(): void {
    for (const t of this.textObjects) {
      t.destroy();
    }
    this.textObjects = [];

    let curY = VIEWPORT_Y + 4;
    const textWidth = PANEL_W - SCROLLBAR_W - 14;

    for (const ev of this.events) {
      const colorStr = '#' + ev.color.toString(16).padStart(6, '0');

      const txt = this.scene.add.text(PANEL_X + 6, curY, ev.text, {
        fontSize: FONT_SIZE,
        color: colorStr,
        fontFamily: 'monospace',
        wordWrap: { width: textWidth, useAdvancedWrap: true },
      });
      this.contentContainer.add(txt);
      this.textObjects.push(txt);

      curY += txt.height + 4;
    }

    this.totalContentHeight = curY - VIEWPORT_Y;
    this.maxScrollY = Math.max(0, this.totalContentHeight - VIEWPORT_H + 8);
    this.scrollY = clamp(this.scrollY, 0, this.maxScrollY);
    this.contentContainer.y = -this.scrollY;
    this.renderScrollbar();
  }

  private renderScrollbar(): void {
    this.scrollbarGraphics.clear();
    if (this.maxScrollY <= 0) return;

    const trackX = PANEL_X + PANEL_W - SCROLLBAR_W - 2;
    const trackY = VIEWPORT_Y + 2;
    const trackH = VIEWPORT_H - 4;

    // Track
    this.scrollbarGraphics.fillStyle(0x223344, 0.4);
    this.scrollbarGraphics.fillRect(trackX, trackY, SCROLLBAR_W, trackH);

    // Thumb
    const thumbH = Math.max(16, (VIEWPORT_H / this.totalContentHeight) * trackH);
    const thumbY = trackY + (this.scrollY / this.maxScrollY) * (trackH - thumbH);

    this.scrollbarGraphics.fillStyle(0x557799, 0.85);
    this.scrollbarGraphics.fillRoundedRect(trackX, thumbY, SCROLLBAR_W, thumbH, 2);
  }
}
