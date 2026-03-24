import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SETUP,
  TERRITORY_PRESETS,
  SPEED_CONFIGS,
  savePreferences,
  loadPreferences,
  GameSetupConfig,
} from '../../src/game/GameConfig';
import { setStorageAdapter, StorageAdapter } from '../../src/game/StorageAdapter';

// Mock storage adapter for tests
function makeMockStorage(): StorageAdapter {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
}

let mockStorage: StorageAdapter;

beforeEach(() => {
  mockStorage = makeMockStorage();
  setStorageAdapter(mockStorage);
});

describe('DEFAULT_SETUP', () => {
  it('has correct default values', () => {
    expect(DEFAULT_SETUP.playerCount).toBe(4);
    expect(DEFAULT_SETUP.territoryCount).toBe(28);
    expect(DEFAULT_SETUP.mapSeed).toBeNull();
    expect(DEFAULT_SETUP.speed).toBe('normal');
    expect(DEFAULT_SETUP.aiPersonalities).toEqual(['random', 'random', 'random', 'random', 'random']);
    expect(DEFAULT_SETUP.mapShape).toBe('rectangle');
    expect(DEFAULT_SETUP.fogOfWar).toBe(false);
    expect(DEFAULT_SETUP.powerUps).toBe(false);
    expect(DEFAULT_SETUP.spectatorMode).toBe(false);
    expect(DEFAULT_SETUP.undoEnabled).toBe(true);
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
      mapShape: 'diamond',
      fogOfWar: true,
      powerUps: true,
      spectatorMode: true,
      undoEnabled: false,
    };
    savePreferences(custom);
    const loaded = loadPreferences();
    // mapSeed is intentionally never restored (always fresh per game)
    expect(loaded).toEqual({ ...custom, mapSeed: null });
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
    mockStorage.setItem('dicewars_preferences', '{not valid json!!!');
    const loaded = loadPreferences();
    expect(loaded).toEqual(DEFAULT_SETUP);
  });

  it('falls back to defaults for non-object JSON', () => {
    mockStorage.setItem('dicewars_preferences', '"just a string"');
    const loaded = loadPreferences();
    expect(loaded).toEqual(DEFAULT_SETUP);
  });

  it('falls back to defaults for null JSON', () => {
    mockStorage.setItem('dicewars_preferences', 'null');
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

  it('accepts valid mapShape values', () => {
    for (const shape of ['rectangle', 'diamond', 'ring', 'continent'] as const) {
      savePreferences({ mapShape: shape });
      const loaded = loadPreferences();
      expect(loaded.mapShape).toBe(shape);
    }
  });

  it('rejects invalid mapShape and uses default', () => {
    savePreferences({ mapShape: 'triangle' as any });
    const loaded = loadPreferences();
    expect(loaded.mapShape).toBe(DEFAULT_SETUP.mapShape);
  });

  it('accepts boolean fogOfWar values', () => {
    savePreferences({ fogOfWar: true });
    expect(loadPreferences().fogOfWar).toBe(true);
    savePreferences({ fogOfWar: false });
    expect(loadPreferences().fogOfWar).toBe(false);
  });

  it('rejects non-boolean fogOfWar and uses default', () => {
    savePreferences({ fogOfWar: 'yes' as any });
    const loaded = loadPreferences();
    expect(loaded.fogOfWar).toBe(DEFAULT_SETUP.fogOfWar);
  });

  it('accepts boolean powerUps values', () => {
    savePreferences({ powerUps: true });
    expect(loadPreferences().powerUps).toBe(true);
    savePreferences({ powerUps: false });
    expect(loadPreferences().powerUps).toBe(false);
  });

  it('rejects non-boolean powerUps and uses default', () => {
    savePreferences({ powerUps: 1 as any });
    const loaded = loadPreferences();
    expect(loaded.powerUps).toBe(DEFAULT_SETUP.powerUps);
  });

  it('spectatorMode defaults to false', () => {
    const loaded = loadPreferences();
    expect(loaded.spectatorMode).toBe(false);
  });

  it('accepts boolean spectatorMode values', () => {
    savePreferences({ spectatorMode: true });
    expect(loadPreferences().spectatorMode).toBe(true);
    savePreferences({ spectatorMode: false });
    expect(loadPreferences().spectatorMode).toBe(false);
  });

  it('rejects non-boolean spectatorMode and uses default', () => {
    savePreferences({ spectatorMode: 'yes' as any });
    const loaded = loadPreferences();
    expect(loaded.spectatorMode).toBe(DEFAULT_SETUP.spectatorMode);
  });

  it('undoEnabled defaults to true', () => {
    const loaded = loadPreferences();
    expect(loaded.undoEnabled).toBe(true);
  });

  it('accepts boolean undoEnabled values', () => {
    savePreferences({ undoEnabled: true });
    expect(loadPreferences().undoEnabled).toBe(true);
    savePreferences({ undoEnabled: false });
    expect(loadPreferences().undoEnabled).toBe(false);
  });

  it('rejects non-boolean undoEnabled and uses default', () => {
    savePreferences({ undoEnabled: 'yes' as any });
    const loaded = loadPreferences();
    expect(loaded.undoEnabled).toBe(DEFAULT_SETUP.undoEnabled);
  });

  it('handles missing undoEnabled in old configs gracefully', () => {
    mockStorage.setItem('dicewars_preferences', JSON.stringify({ playerCount: 4, speed: 'fast' }));
    const loaded = loadPreferences();
    expect(loaded.undoEnabled).toBe(true);
  });
});
