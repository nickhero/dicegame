// Game configuration — pure TypeScript, no Phaser imports.

import { PersonalityType } from './AIPersonality';
import { MapShape } from './MapShapes';

export interface GameSetupConfig {
  playerCount: number;          // 2–6
  territoryCount: number;       // 15 | 20 | 28 | 35 | 42
  mapSeed: string | null;       // optional seed for reproducible maps
  speed: 'normal' | 'fast' | 'instant';
  aiPersonalities: (PersonalityType | 'random')[];  // one per AI slot (max 5)
  mapShape: MapShape;           // default: 'rectangle'
  gridType: 'square' | 'hex';   // default: 'square'
  fogOfWar: boolean;            // default: false
  powerUps: boolean;            // default: false
}

export const DEFAULT_SETUP: GameSetupConfig = {
  playerCount: 4,
  territoryCount: 28,
  mapSeed: null,
  speed: 'normal',
  aiPersonalities: ['random', 'random', 'random', 'random', 'random'],
  mapShape: 'rectangle',
  gridType: 'square',
  fogOfWar: false,
  powerUps: false,
};

export const TERRITORY_PRESETS = {
  small: 15,
  medium: 20,
  standard: 28,
  large: 35,
  huge: 42,
} as const;

export const SPEED_CONFIGS = {
  normal: { multiplier: 1.0, label: 'Normal' },
  fast: { multiplier: 0.5, label: 'Fast' },
  instant: { multiplier: 0, label: 'Instant' },
} as const;

const STORAGE_KEY = 'dicewars_preferences';

export function savePreferences(config: Partial<GameSetupConfig>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage unavailable or full — silently ignore
  }
}

export function loadPreferences(): GameSetupConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_SETUP, aiPersonalities: [...DEFAULT_SETUP.aiPersonalities] };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_SETUP, aiPersonalities: [...DEFAULT_SETUP.aiPersonalities] };
    }
    return {
      playerCount: isValidPlayerCount(parsed.playerCount) ? parsed.playerCount : DEFAULT_SETUP.playerCount,
      territoryCount: isValidTerritoryCount(parsed.territoryCount) ? parsed.territoryCount : DEFAULT_SETUP.territoryCount,
      mapSeed: typeof parsed.mapSeed === 'string' ? parsed.mapSeed : DEFAULT_SETUP.mapSeed,
      speed: isValidSpeed(parsed.speed) ? parsed.speed : DEFAULT_SETUP.speed,
      aiPersonalities: isValidPersonalities(parsed.aiPersonalities) ? parsed.aiPersonalities : [...DEFAULT_SETUP.aiPersonalities],
      mapShape: isValidMapShape(parsed.mapShape) ? parsed.mapShape : DEFAULT_SETUP.mapShape,
      gridType: isValidGridType(parsed.gridType) ? parsed.gridType : DEFAULT_SETUP.gridType,
      fogOfWar: typeof parsed.fogOfWar === 'boolean' ? parsed.fogOfWar : DEFAULT_SETUP.fogOfWar,
      powerUps: typeof parsed.powerUps === 'boolean' ? parsed.powerUps : DEFAULT_SETUP.powerUps,
    };
  } catch {
    return { ...DEFAULT_SETUP, aiPersonalities: [...DEFAULT_SETUP.aiPersonalities] };
  }
}

function isValidPlayerCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 2 && v <= 6;
}

function isValidTerritoryCount(v: unknown): v is number {
  const valid = Object.values(TERRITORY_PRESETS) as number[];
  return typeof v === 'number' && valid.includes(v);
}

function isValidSpeed(v: unknown): v is GameSetupConfig['speed'] {
  return v === 'normal' || v === 'fast' || v === 'instant';
}

const VALID_PERSONALITIES = new Set<string>([
  'cautious', 'balanced', 'aggressive', 'reckless', 'expansionist', 'turtle', 'random',
]);

function isValidPersonalities(v: unknown): v is (PersonalityType | 'random')[] {
  return Array.isArray(v) && v.length <= 5 && v.every((p) => typeof p === 'string' && VALID_PERSONALITIES.has(p));
}

const VALID_MAP_SHAPES = new Set<string>(['rectangle', 'diamond', 'ring', 'continent']);

function isValidMapShape(v: unknown): v is MapShape {
  return typeof v === 'string' && VALID_MAP_SHAPES.has(v);
}

function isValidGridType(v: unknown): v is 'square' | 'hex' {
  return v === 'square' || v === 'hex';
}
