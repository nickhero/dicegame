import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

const PANEL_WIDTH = 400;
const PANEL_HEIGHT = 250;
const PANEL_X = GAME_WIDTH / 2;
const PANEL_Y = GAME_HEIGHT / 2;
const DICE_TEXTURE_SIZE = 14;
const DICE_DISPLAY_SCALE = 24 / DICE_TEXTURE_SIZE;
const MAX_PER_ROW = 4;
const DICE_GAP = 30;
const DEPTH = 200;

export class BattleAnimator {
  private scene: Phaser.Scene;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private activeResolve: (() => void) | null = null;
  private dismissed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Show the battle animation overlay.
   * Returns a promise that resolves when animation completes.
   */
  showBattle(
    attackerRolls: number[],
    defenderRolls: number[],
    attackerColor: number,
    defenderColor: number,
    attackerWins: boolean,
    speed = 1
  ): Promise<void> {
    if (this.activeResolve) {
      this.dismiss();
    }

    return new Promise((resolve) => {
      this.dismissed = false;
      this.activeResolve = resolve;

      const s = this.scene;

      // Semi-transparent dark overlay
      const overlay = s.add.rectangle(
        GAME_WIDTH / 2, GAME_HEIGHT / 2,
        GAME_WIDTH, GAME_HEIGHT,
        0x000000, 0.6
      ).setDepth(DEPTH).setInteractive();
      overlay.on('pointerdown', () => this.dismiss());
      this.objects.push(overlay);

      // Panel background with rounded corners
      const panel = s.add.graphics().setDepth(DEPTH + 1);
      panel.fillStyle(0x1a1a2e, 0.95);
      panel.fillRoundedRect(
        PANEL_X - PANEL_WIDTH / 2,
        PANEL_Y - PANEL_HEIGHT / 2,
        PANEL_WIDTH, PANEL_HEIGHT, 12
      );
      panel.lineStyle(2, 0x444466);
      panel.strokeRoundedRect(
        PANEL_X - PANEL_WIDTH / 2,
        PANEL_Y - PANEL_HEIGHT / 2,
        PANEL_WIDTH, PANEL_HEIGHT, 12
      );
      panel.lineStyle(1, 0x444466);
      panel.lineBetween(
        PANEL_X, PANEL_Y - PANEL_HEIGHT / 2 + 40,
        PANEL_X, PANEL_Y + 20
      );
      this.objects.push(panel);

      const leftX = PANEL_X - PANEL_WIDTH / 4;
      const rightX = PANEL_X + PANEL_WIDTH / 4;
      const labelY = PANEL_Y - PANEL_HEIGHT / 2 + 25;
      const toHex = (c: number) => '#' + c.toString(16).padStart(6, '0');

      // Side labels
      this.addText(leftX, labelY, 'ATTACKER', {
        fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold',
        color: toHex(attackerColor),
      });
      this.addText(rightX, labelY, 'DEFENDER', {
        fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold',
        color: toHex(defenderColor),
      });

      // Running totals
      const totalY = PANEL_Y + 40;
      const atkTotalText = this.addText(leftX, totalY, '0', {
        fontSize: '20px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
      });
      const defTotalText = this.addText(rightX, totalY, '0', {
        fontSize: '20px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
      });
      this.addText(PANEL_X, totalY, 'vs', {
        fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold', color: '#666688',
      });

      // Dice positioning helper
      const diceStartY = labelY + 35;
      const getDicePos = (centerX: number, count: number, index: number) => {
        const row = Math.floor(index / MAX_PER_ROW);
        const col = index % MAX_PER_ROW;
        const colsInRow = Math.min(count - row * MAX_PER_ROW, MAX_PER_ROW);
        return {
          x: centerX - (colsInRow - 1) * DICE_GAP / 2 + col * DICE_GAP,
          y: diceStartY + row * DICE_GAP,
        };
      };

      // Build dice sequence: attacker dice first, then defender
      interface DieInfo {
        roll: number; x: number; y: number;
        tint: number; side: 'attacker' | 'defender';
      }
      const allDice: DieInfo[] = [];

      for (let i = 0; i < attackerRolls.length; i++) {
        const pos = getDicePos(leftX, attackerRolls.length, i);
        allDice.push({ roll: attackerRolls[i], ...pos, tint: attackerColor, side: 'attacker' });
      }
      for (let i = 0; i < defenderRolls.length; i++) {
        const pos = getDicePos(rightX, defenderRolls.length, i);
        allDice.push({ roll: defenderRolls[i], ...pos, tint: defenderColor, side: 'defender' });
      }

      const diceDelay = 100 / speed;
      const flickerDuration = 200 / speed;
      let atkRunning = 0;
      let defRunning = 0;

      for (let d = 0; d < allDice.length; d++) {
        const die = allDice[d];
        const startTime = d * diceDelay;

        this.animateDie(die.x, die.y, die.roll, die.tint, startTime, flickerDuration, () => {
          if (die.side === 'attacker') {
            atkRunning += die.roll;
            atkTotalText.setText(String(atkRunning));
          } else {
            defRunning += die.roll;
            defTotalText.setText(String(defRunning));
          }
        });
      }

      // When last die settles
      const lastDieSettles = allDice.length > 0
        ? (allDice.length - 1) * diceDelay + flickerDuration
        : 0;

      // Show result after 1s pause
      const resultTime = lastDieSettles + 1000 / speed;
      s.time.delayedCall(resultTime, () => {
        if (this.dismissed) return;
        const text = attackerWins ? 'VICTORY!' : 'DEFEAT!';
        const color = attackerWins ? '#44ff44' : '#ff4444';
        this.addText(PANEL_X, PANEL_Y + PANEL_HEIGHT / 2 - 25, text, {
          fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold',
          color, stroke: '#000000', strokeThickness: 3,
        });
      });

      // Auto-dismiss 1.5s after result
      s.time.delayedCall(resultTime + 1500 / speed, () => this.dismiss());
    });
  }

  private animateDie(
    x: number, y: number,
    finalFace: number, tint: number,
    startDelay: number, flickerDuration: number,
    onSettle: () => void
  ): void {
    const numFlickers = 2 + Math.floor(Math.random() * 2);
    const flickerInterval = flickerDuration / (numFlickers + 1);
    const spriteRef: (Phaser.GameObjects.Image | null)[] = [null];

    for (let f = 0; f < numFlickers; f++) {
      this.scene.time.delayedCall(startDelay + f * flickerInterval, () => {
        if (this.dismissed) return;
        if (spriteRef[0]) spriteRef[0].destroy();
        const face = Math.floor(Math.random() * 6) + 1;
        spriteRef[0] = this.scene.add.image(x, y, `dice_${face}`)
          .setScale(DICE_DISPLAY_SCALE)
          .setTint(tint)
          .setDepth(DEPTH + 2);
      });
    }

    this.scene.time.delayedCall(startDelay + flickerDuration, () => {
      if (this.dismissed) return;
      if (spriteRef[0]) spriteRef[0].destroy();
      const settled = this.scene.add.image(x, y, `dice_${finalFace}`)
        .setScale(DICE_DISPLAY_SCALE)
        .setTint(tint)
        .setDepth(DEPTH + 2);
      this.objects.push(settled);
      onSettle();
    });
  }

  private addText(
    x: number, y: number, content: string,
    style: Phaser.Types.GameObjects.Text.TextStyle
  ): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, content, style)
      .setOrigin(0.5)
      .setDepth(DEPTH + 2);
    this.objects.push(t);
    return t;
  }

  private dismiss(): void {
    if (this.dismissed) return;
    this.dismissed = true;
    for (const obj of this.objects) {
      try { obj.destroy(); } catch { /* already destroyed */ }
    }
    this.objects = [];
    if (this.activeResolve) {
      const resolve = this.activeResolve;
      this.activeResolve = null;
      resolve();
    }
  }

  destroy(): void {
    this.dismiss();
  }
}
