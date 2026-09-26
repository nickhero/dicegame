import { describe, it, expect, vi } from 'vitest';
import { UIRenderer } from '../../src/rendering/UIRenderer';

function createMockScene() {
  const dummyObj = {
    setDepth: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    fillStyle: vi.fn().mockReturnThis(),
    fillRoundedRect: vi.fn().mockReturnThis(),
    fillCircle: vi.fn().mockReturnThis(),
    add: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn().mockReturnThis(),
  };

  return {
    add: {
      container: vi.fn(() => ({ ...dummyObj, list: [] })),
      graphics: vi.fn(() => ({ ...dummyObj })),
      text: vi.fn(() => ({ ...dummyObj })),
      zone: vi.fn(() => ({ ...dummyObj })),
    },
  } as unknown as Phaser.Scene;
}

describe('UIRenderer', () => {
  it('instantiates and creates the back button', () => {
    const scene = createMockScene();
    const ui = new UIRenderer(scene);
    expect(ui).toBeDefined();

    const backCallback = vi.fn();
    ui.setBackCallback(backCallback);
    // Callback should be set
    expect((ui as unknown as { onBack: () => void }).onBack).toBe(backCallback);
  });

  it('invokes back callback when set', () => {
    const scene = createMockScene();
    const ui = new UIRenderer(scene);
    const onBack = vi.fn();
    ui.setBackCallback(onBack);

    (ui as unknown as { onBack: () => void }).onBack();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
