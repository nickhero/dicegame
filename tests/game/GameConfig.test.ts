import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_SETUP,
  TERRITORY_PRESETS,
  SPEED_CONFIGS,
  savePreferences,
  loadPreferences,
  GameSetupConfig,
} from '../../src/game/GameConfig';

// Mock localStorage for Node test environment
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k in store) delete store[k]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

describe('DEFAULT_SETUP', () => {
  it('has correct default values', () => {
    expect(DEFAULT_SETUP.playerCount).toBe(4);
    expect(DEFAULT_SETUP.territoryCount).toBe(28);
    expect(DEFAULT_SETUP.mapSeed).toBeNull();
    expect(DEFAULT_SETUP.speed).toBe('normal');
    expect(DEFAULT_SETUP.aiPersonalities).toEqual(['random', 'random', 'random', 'random', 'random']);
  });

  it('has 5 AI personality slots', () => {
    expect(DEFAULT_SETUP.aiPersonalities).toHaveLength(5);
  });
});

describe('TERRITORY_PRESETS', () => {
  it('contains all preset sizes', () => {
    expect(TERRITORY_PRESETS.small).toBe(15);
    expect(TERRITORY_PRESETS.medium).toBe(20);
    expect(TERRITORY_PRESETS.standard).toBe(28);
    expect(TERRITORY_PRESETS.large).toBe(35);
    expect(TERRITORY_PRESETS.huge).toBe(42);
  });

  it('has exactly 5 presets', () => {
    expect(Object.keys(TERRITORY_PRESETS)).toHaveLength(5);
  });
});

describe('SPEED_CONFIGS', () => {
  it('normal speed has multiplier 1', () => {
    expect(SPEED_CONFIGS.normal.multiplier).toBe(1.0);
  });

  it('fast speed has multiplier less than 1', () => {
    expect(SPEED_CONFIGS.fast.multiplier).toBeLessThan(1);
    expect(SPEED_CONFIGS.fast.multiplier).toBeGreaterThan(0);
  });

  it('instant speed has multiplier 0', () => {
    expect(SPEED_CONFIGS.instant.multiplier).toBe(0);
  });

  it('each speed has a label', () => {
    for (const key of ['normal', 'fast', 'instant'] as const) {
      expect(SPEED_CONFIGS[key].label.length).toBeGreaterThan(0);
    }
  });
});

describe('savePreferences / loadPreferences', () => {
  it('returns defaults when localStorage is empty', () => {
    const config = loadPreferences();
    expect(config).toEqual(DEFAULT_SETUP);
  });

  it('saves and loads a full config', () => {
    const custom: GameSetupConfig = {
      playerCount: 6,
      territoryCount: 42,
      mapSeed: 'abc123',
      speed: 'fast',
      aiPersonalities: ['aggressive', 'cautious', 'turtle', 'random', 'balanced'],
    };
    savePreferences(custom);
    const loaded = loadPreferences();
    expect(loaded).toEqual(custom);
  });

  it('merges partial overrides with defaults', () => {
    savePreferences({ playerCount: 2, speed: 'instant' });
    const loaded = loadPreferences();
    expect(loaded.playerCount).toBe(2);
    expect(loaded.speed).toBe('instant');
    expect(loaded.territoryCount).toBe(DEFAULT_SETUP.territoryCount);
    expect(loaded.mapSeed).toBeNull();
    expect(loaded.aiPersonalities).toEqual(DEFAULT_SETUP.aiPersonalities);
  });

  it('falls back to defaults for corrupted JSON', () => {
    store['dicewars_preferences'] = '{not valid json!!!';
    const loaded = loadPreferences();
    expect(loaded).toEqual(DEFAULT_SETUP);
  });

  it('falls back to defaults for non-object JSON', () => {
    store['dicewars_preferences'] = '"just a string"';
    const loaded = loadPreferences();
    expect(loaded).toEqual(DEFAULT_SETUP);
  });

  it('falls back to defaults for null JSON', () => {
    store['dicewars_preferences'] = 'null';
    const loaded = loadPreferences();
    expect(loaded).toEqual(DEFAULT_SETUP);
  });

  it('rejects invalid playerCount and uses default', () => {
    savePreferences({ playerCount: 10 });
    const loaded = loadPreferences();
    expect(loaded.playerCount).toBe(DEFAULT_SETUP.playerCount);
  });

  it('rejects non-integer playerCount', () => {
    savePreferences({ playerCount: 3.5 });
    const loaded = loadPreferences();
    expect(loaded.playerCount).toBe(DEFAULT_SETUP.playerCount);
  });

  it('rejects invalid territoryCount and uses default', () => {
    savePreferences({ territoryCount: 99 });
    const loaded = loadPreferences();
    expect(loaded.territoryCount).toBe(DEFAULT_SETUP.territoryCount);
  });

  it('rejects invalid speed and uses default', () => {
    savePreferences({ speed: 'ludicrous' as GameSetupConfig['speed'] });
    const loaded = loadPreferences();
    expect(loaded.speed).toBe(DEFAULT_SETUP.speed);
  });

  it('rejects invalid aiPersonalities and uses default', () => {
    savePreferences({ aiPersonalities: ['invalid_type' as any] });
    const loaded = loadPreferences();
    expect(loaded.aiPersonalities).toEqual(DEFAULT_SETUP.aiPersonalities);
  });

  it('does not mutate DEFAULT_SETUP when loading', () => {
    const before = { ...DEFAULT_SETUP, aiPersonalities: [...DEFAULT_SETUP.aiPersonalities] };
    const loaded = loadPreferences();
    loaded.playerCount = 99;
    loaded.aiPersonalities.push('aggressive');
    expect(DEFAULT_SETUP).toEqual(before);
  });
});
