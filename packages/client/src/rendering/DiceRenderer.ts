import Phaser from 'phaser';
import { Territory, PLAYER_COLORS } from '@dicewars/shared';

const DICE_SIZE = 14;
const STACK_OFFSET = 5; // vertical offset between stacked dice

/**
 * Generates pixel-art dice textures at boot time.
 */
export function createDiceTextures(scene: Phaser.Scene): void {
  for (let face = 1; face <= 6; face++) {
    const key = `dice_${face}`;
    if (scene.textures.exists(key)) continue;

    const canvas = document.createElement('canvas');
    canvas.width = DICE_SIZE;
    canvas.height = DICE_SIZE;
    const ctx = canvas.getContext('2d')!;

    // White dice body
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(1, 1, DICE_SIZE - 2, DICE_SIZE - 2);

    // Border
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, DICE_SIZE - 1, DICE_SIZE - 1);

    // Pips
    ctx.fillStyle = '#222222';
    const pipPositions = getDicePips(face, DICE_SIZE);
    for (const [px, py] of pipPositions) {
      ctx.fillRect(px, py, 2, 2);
    }

    scene.textures.addCanvas(key, canvas);
  }
}

function getDicePips(face: number, size: number): [number, number][] {
  const s = size;
  const center: [number, number] = [s / 2 - 1, s / 2 - 1];
  const tl: [number, number] = [3, 3];
  const tr: [number, number] = [s - 5, 3];
  const ml: [number, number] = [3, s / 2 - 1];
  const mr: [number, number] = [s - 5, s / 2 - 1];
  const bl: [number, number] = [3, s - 5];
  const br: [number, number] = [s - 5, s - 5];

  switch (face) {
    case 1: return [center];
    case 2: return [tl, br];
    case 3: return [tl, center, br];
    case 4: return [tl, tr, bl, br];
    case 5: return [tl, tr, center, bl, br];
    case 6: return [tl, tr, ml, mr, bl, br];
    default: return [center];
  }
}

/**
 * Draw dice stacks on territories.
 */
export class DiceRenderer {
  private scene: Phaser.Scene;
  private diceSprites: Phaser.GameObjects.Image[] = [];
  private diceCountTexts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Redraw all dice stacks on territories.
   */
  drawDiceStacks(territories: Territory[], visibleSet?: Set<number>): void {
    this.clear();

    for (const territory of territories) {
      if (visibleSet && !visibleSet.has(territory.id)) {
        this.drawHiddenIndicator(territory);
      } else {
        this.drawStack(territory);
      }
    }
  }

  private drawStack(territory: Territory): void {
    const cx = territory.center.x;
    const cy = territory.center.y;
    const diceCount = territory.dice;

    const visualDice = diceCount;
    const stackHeight = (visualDice - 1) * STACK_OFFSET;
    const startY = cy - stackHeight / 2 - (visualDice > 4 ? 4 : 0);

    for (let i = 0; i < visualDice; i++) {
      const face = Math.min(6, Math.max(1, diceCount - i));
      const diceImg = this.scene.add.image(
        cx,
        startY + i * STACK_OFFSET - 8,
        `dice_${Math.min(face, 6)}`
      );
      diceImg.setScale(1);
      diceImg.setDepth(10 + i);
      this.diceSprites.push(diceImg);
    }

    // Dice count number below the stack
    const color = '#ffffff';
    const countText = this.scene.add.text(cx, cy + 12, `${diceCount}`, {
      fontSize: '12px',
      color,
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);

    this.diceCountTexts.push(countText);
  }

  private drawHiddenIndicator(territory: Territory): void {
    const cx = territory.center.x;
    const cy = territory.center.y;

    const text = this.scene.add.text(cx, cy, '?', {
      fontSize: '18px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);

    this.diceCountTexts.push(text);
  }

  clear(): void {
    for (const sprite of this.diceSprites) sprite.destroy();
    for (const text of this.diceCountTexts) text.destroy();
    this.diceSprites = [];
    this.diceCountTexts = [];
  }

  destroy(): void {
    this.clear();
  }
}
