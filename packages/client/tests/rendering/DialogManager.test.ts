import { describe, it, expect, vi } from 'vitest';
import { DialogManager } from '../../src/rendering/DialogManager';

function createMockScene() {
  const dummyObj = {
    setDepth: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    fillStyle: vi.fn().mockReturnThis(),
    fillRect: vi.fn().mockReturnThis(),
    fillRoundedRect: vi.fn().mockReturnThis(),
    lineStyle: vi.fn().mockReturnThis(),
    strokeRoundedRect: vi.fn().mockReturnThis(),
    destroy: vi.fn().mockReturnThis(),
    add: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
  };

  return {
    add: {
      container: vi.fn(() => ({ ...dummyObj, list: [] })),
      graphics: vi.fn(() => ({ ...dummyObj })),
      text: vi.fn(() => ({ ...dummyObj })),
      zone: vi.fn(() => ({ ...dummyObj })),
    },
    time: {
      addEvent: vi.fn().mockReturnValue({ destroy: vi.fn() }),
      delayedCall: vi.fn().mockReturnValue({ destroy: vi.fn() }),
    },
  } as unknown as Phaser.Scene;
}

describe('DialogManager', () => {
  it('tracks dialog open status for help overlay', () => {
    const scene = createMockScene();
    const dm = new DialogManager(scene);

    expect(dm.isDialogOpen()).toBe(false);

    dm.toggleHelp(true, false);
    expect(dm.isDialogOpen()).toBe(true);

    dm.dismissHelp();
    expect(dm.isDialogOpen()).toBe(false);
  });

  it('tracks confirmation dialogs', () => {
    const scene = createMockScene();
    const dm = new DialogManager(scene);

    dm.showConfirm('Test?', vi.fn());
    expect(dm.isDialogOpen()).toBe(true);

    dm.dismissConfirm();
    expect(dm.isDialogOpen()).toBe(false);
  });

  it('tracks surrender dialogs', () => {
    const scene = createMockScene();
    const dm = new DialogManager(scene);

    dm.showSurrender(vi.fn());
    expect(dm.isDialogOpen()).toBe(true);

    dm.dismissSurrender();
    expect(dm.isDialogOpen()).toBe(false);
  });

  it('tracks exit dialogs', () => {
    const scene = createMockScene();
    const dm = new DialogManager(scene);

    dm.showExit(false, vi.fn());
    expect(dm.isDialogOpen()).toBe(true);

    dm.dismissExit();
    expect(dm.isDialogOpen()).toBe(false);
  });

  it('tracks power-up popup', () => {
    const scene = createMockScene();
    const dm = new DialogManager(scene);

    expect(dm.hasPowerUpPopup()).toBe(false);

    const territory: any = {
      id: 0,
      center: { x: 100, y: 100 },
      powerUp: 'reinforce',
    };

    dm.showPowerUpPopup(territory, true, vi.fn(), vi.fn(), vi.fn());
    expect(dm.hasPowerUpPopup()).toBe(true);

    dm.dismissPowerUpPopup();
    expect(dm.hasPowerUpPopup()).toBe(false);
  });
});
