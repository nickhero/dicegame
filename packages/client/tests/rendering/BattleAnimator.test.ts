import { describe, it, expect, vi } from 'vitest';
import { BattleAnimator } from '../../src/rendering/BattleAnimator';

function createMockScene() {
  const dummyObj = {
    setDepth: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    fillStyle: vi.fn().mockReturnThis(),
    lineStyle: vi.fn().mockReturnThis(),
    fillRect: vi.fn().mockReturnThis(),
    fillRoundedRect: vi.fn().mockReturnThis(),
    strokeRoundedRect: vi.fn().mockReturnThis(),
    add: vi.fn().mockReturnThis(),
    destroy: vi.fn().mockReturnThis(),
  };

  const scene = {
    add: {
      container: vi.fn(() => ({ ...dummyObj, list: [] })),
      graphics: vi.fn(() => ({ ...dummyObj })),
      text: vi.fn(() => ({ ...dummyObj })),
      sprite: vi.fn(() => ({ ...dummyObj })),
    },
    tweens: {
      add: vi.fn((config: { onComplete?: () => void }) => {
        // synchronously trigger onComplete for instant animation in tests
        config.onComplete?.();
      }),
    },
    time: {
      delayedCall: vi.fn((_delay: number, callback: () => void) => {
        callback();
      }),
    },
  } as unknown as Phaser.Scene;

  return scene;
}

describe('BattleAnimator', () => {
  it('instantiates and can be dismissed without error', () => {
    const scene = createMockScene();
    const animator = new BattleAnimator(scene);
    expect(animator).toBeDefined();
    animator.dismiss();
  });

  it('runs showBattle with custom attacker and defender totals (shield and charge)', async () => {
    const scene = createMockScene();
    const animator = new BattleAnimator(scene);

    // Defender roll sum is 5, with shield bonus total is 8 (+3 Shield)
    // Attacker roll sum is 6, with charge bonus total is 8 (+2 Charge)
    const promise = animator.showBattle(
      [3, 3],
      [2, 3],
      0xff4444,
      0x4444ff,
      false, // attackerWon
      0,     // speed multiplier 0 (instant)
      8,     // attackerTotal
      8      // defenderTotal
    );

    await expect(promise).resolves.toBeUndefined();
  });
});
