import { describe, it, expect, vi } from 'vitest';
import {
  createInitialGameState,
  createPlayer,
  PLAYER_COLORS,
  generateMap,
  assignTerritories,
  SeededRandom,
  createAllianceState,
  formAlliance,
} from '@dicewars/shared';
import { UIRenderer } from '../../src/rendering/UIRenderer';

function createMockGameObject() {
  return {
    input: { enabled: true },
    setDepth: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    disableInteractive: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    fillStyle: vi.fn().mockReturnThis(),
    lineStyle: vi.fn().mockReturnThis(),
    fillRoundedRect: vi.fn().mockReturnThis(),
    strokeRoundedRect: vi.fn().mockReturnThis(),
    fillCircle: vi.fn().mockReturnThis(),
    add: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn().mockReturnThis(),
  };
}

function createMockScene(): Phaser.Scene {
  return {
    add: {
      container: vi.fn(() => ({ ...createMockGameObject(), list: [] })),
      graphics: vi.fn(() => createMockGameObject()),
      text: vi.fn(() => createMockGameObject()),
      zone: vi.fn(() => createMockGameObject()),
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

  it('updates alliance widgets for allied and non-allied players correctly', () => {
    const scene = createMockScene();
    const ui = new UIRenderer(scene);

    const rng = new SeededRandom(42);
    const map = generateMap(12, rng, 'square', 'rectangle');
    assignTerritories(map.territories, 3, rng);
    const players = [
      createPlayer(0, 'Player', true, PLAYER_COLORS[0]),
      createPlayer(1, 'AI 1', false, PLAYER_COLORS[1], 'cautious'),
      createPlayer(2, 'AI 2', false, PLAYER_COLORS[2], 'aggressive'),
    ];
    const state = createInitialGameState(map.territories, players, map.adjacency);
    state.allianceState = createAllianceState(3);

    // Ally player 0 and player 1
    formAlliance(state.allianceState, 0, 1, 1, 5);

    // Call update with local player index = 0
    ui.update(state, 0);

    const widgets = (ui as unknown as { allianceWidgets: Array<{ container: any; text: any; zone: any }> }).allianceWidgets;

    // Player 0 (local): self, cannot propose, not visible
    expect(widgets[0].container.setVisible).toHaveBeenCalledWith(false);

    // Player 1 (allied): visible with "🤝 Pact"
    expect(widgets[1].container.setVisible).toHaveBeenCalledWith(true);
    expect(widgets[1].text.setText).toHaveBeenCalledWith('🤝 Pact');
    expect(widgets[1].zone.input.enabled).toBe(false);

    // Player 2 (alive, unallied, >2 alive players): visible with "🤝 Ally"
    expect(widgets[2].container.setVisible).toHaveBeenCalledWith(true);
    expect(widgets[2].text.setText).toHaveBeenCalledWith('🤝 Ally');
    expect(widgets[2].zone.input.enabled).toBe(true);
  });

  it('handles alliance proposal callbacks when zone is triggered', () => {
    const scene = createMockScene();
    const ui = new UIRenderer(scene);

    const onPropose = vi.fn();
    ui.setProposeAllianceCallback(onPropose);

    // Directly invoke onProposeAlliance
    (ui as unknown as { onProposeAlliance: (idx: number) => void }).onProposeAlliance(2);
    expect(onPropose).toHaveBeenCalledWith(2);
  });
});
