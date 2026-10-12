import { describe, it, expect, vi, beforeAll } from 'vitest';

beforeAll(() => {
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = (() => ({
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
      globalCompositeOperation: 'source-over',
    })) as any;
  }
});

import { EventLog } from '../../src/rendering/EventLog';

function createMockScene() {
  const dummyObj = {
    setDepth: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setMask: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    fillStyle: vi.fn().mockReturnThis(),
    fillRect: vi.fn().mockReturnThis(),
    fillRoundedRect: vi.fn().mockReturnThis(),
    fillCircle: vi.fn().mockReturnThis(),
    createGeometryMask: vi.fn(() => ({})),
    add: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn().mockReturnThis(),
    height: 14,
    y: 0,
  };

  const inputEvents = new Map<string, (...args: unknown[]) => void>();

  return {
    add: {
      container: vi.fn(() => ({ ...dummyObj, list: [] })),
      graphics: vi.fn(() => ({ ...dummyObj })),
      text: vi.fn(() => ({ ...dummyObj })),
      zone: vi.fn(() => ({ ...dummyObj })),
    },
    tweens: {
      add: vi.fn(),
    },
    input: {
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        inputEvents.set(event, callback);
      }),
      off: vi.fn(),
    },
    _inputEvents: inputEvents,
  } as unknown as Phaser.Scene & { _inputEvents: Map<string, (...args: unknown[]) => void> };
}

describe('EventLog', () => {
  it('instantiates cleanly and sets up masked container', () => {
    const scene = createMockScene();
    const log = new EventLog(scene);
    expect(log).toBeDefined();
    expect(scene.input.on).toHaveBeenCalledWith('wheel', expect.any(Function));
    expect(scene.input.on).toHaveBeenCalledWith('pointermove', expect.any(Function));
  });

  it('adds events and auto-scrolls', () => {
    const scene = createMockScene();
    const log = new EventLog(scene);

    log.addEvent('Turn 1 started', 0xffffff);
    log.addEvent('Player 1 attacked Player 2', 0xff4444);

    expect(scene.add.text).toHaveBeenCalled();
  });

  it('handles trackpad and mouse wheel scrolling in both directions', () => {
    const scene = createMockScene();
    const log = new EventLog(scene);

    for (let i = 0; i < 50; i++) {
      log.addEvent(`Event number ${i}`, 0xffffff);
    }

    const wheelHandler = scene._inputEvents.get('wheel');
    expect(wheelHandler).toBeDefined();

    // Wheel event with dy > 0 (scroll down)
    wheelHandler!({ x: 50, y: 100 } as any, [], 0, 15, 0);
    // Wheel event with dy < 0 (scroll up)
    wheelHandler!({ x: 50, y: 100 } as any, [], 0, -15, 0);
    // Wheel event with dz > 0 fallback
    wheelHandler!({ x: 50, y: 100 } as any, [], 0, 0, 100);
  });

  it('destroys and unregisters event listeners cleanly', () => {
    const scene = createMockScene();
    const log = new EventLog(scene);
    log.destroy();
    expect(scene.input.off).toHaveBeenCalledWith('wheel', expect.any(Function));
  });
});
