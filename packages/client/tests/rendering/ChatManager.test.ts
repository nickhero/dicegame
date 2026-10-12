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

import { ChatManager } from '../../src/rendering/ChatManager';

function createMockScene() {
  const dummyObj: any = {
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
    lineStyle: vi.fn().mockReturnThis(),
    strokeRoundedRect: vi.fn().mockReturnThis(),
    createGeometryMask: vi.fn().mockReturnValue({}),
    destroy: vi.fn(),
    add: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
  };

  return {
    add: {
      container: vi.fn().mockReturnValue({ ...dummyObj }),
      graphics: vi.fn().mockReturnValue({ ...dummyObj }),
      text: vi.fn().mockReturnValue({ ...dummyObj }),
      zone: vi.fn().mockReturnValue({ ...dummyObj }),
    },
    time: {
      addEvent: vi.fn().mockReturnValue({ destroy: vi.fn() }),
    },
  } as any;
}

describe('ChatManager', () => {
  it('initializes and handles open/close', () => {
    const scene = createMockScene();
    const sendFn = vi.fn();
    const chatManager = new ChatManager(scene, { onSendMessage: sendFn });

    expect(chatManager.isChatOpen()).toBe(false);

    chatManager.create();
    chatManager.open();
    expect(chatManager.isChatOpen()).toBe(true);

    chatManager.close();
    expect(chatManager.isChatOpen()).toBe(false);
  });

  it('handles typing and sending a message via Enter', () => {
    const scene = createMockScene();
    const sendFn = vi.fn();
    const chatManager = new ChatManager(scene, { onSendMessage: sendFn });

    chatManager.create();
    chatManager.open();

    // Type "Hi"
    chatManager.handleKeyDown({ key: 'H' } as KeyboardEvent);
    chatManager.handleKeyDown({ key: 'i' } as KeyboardEvent);

    // Send
    chatManager.handleKeyDown({ key: 'Enter' } as KeyboardEvent);

    expect(sendFn).toHaveBeenCalledWith('Hi');
    expect(chatManager.isChatOpen()).toBe(false);
  });

  it('handles backspace and escape', () => {
    const scene = createMockScene();
    const sendFn = vi.fn();
    const chatManager = new ChatManager(scene, { onSendMessage: sendFn });

    chatManager.create();
    chatManager.open();

    chatManager.handleKeyDown({ key: 'a' } as KeyboardEvent);
    chatManager.handleKeyDown({ key: 'b' } as KeyboardEvent);
    chatManager.handleKeyDown({ key: 'Backspace' } as KeyboardEvent);
    chatManager.handleKeyDown({ key: 'Escape' } as KeyboardEvent);

    expect(chatManager.isChatOpen()).toBe(false);
    expect(sendFn).not.toHaveBeenCalled();
  });
});
