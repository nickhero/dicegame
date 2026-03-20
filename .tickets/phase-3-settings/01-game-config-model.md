# GameConfig Model + localStorage

- **Status**: open
- **Phase**: 3
- **Depends on**: none
- **Files**: `src/game/GameConfig.ts` (new)

## Description

Create a typed configuration interface for game setup options and persist user preferences via `localStorage`.

### Interface

```typescript
export interface GameSetupConfig {
  playerCount: number;          // 2–6
  territoryCount: number;       // 15 | 20 | 28 | 35 | 42
  mapSeed: string | null;       // optional seed for reproducible maps
  speed: 'normal' | 'fast' | 'instant';
  aiPersonalities: (string | 'random')[];  // one per AI slot
}
```

### Defaults

```typescript
export const DEFAULT_SETUP: GameSetupConfig = {
  playerCount: 4,
  territoryCount: 28,
  mapSeed: null,
  speed: 'normal',
  aiPersonalities: ['random', 'random', 'random', 'random', 'random'],
};
```

### localStorage

- Save to `dicewars_preferences` key as JSON
- Load on app start, merge with defaults (handles new fields gracefully)
- Only save non-default values to keep it clean

## Acceptance Criteria

- [ ] `GameSetupConfig` interface exported
- [ ] `DEFAULT_SETUP` constant exported
- [ ] `savePreferences()` and `loadPreferences()` functions
- [ ] Handles missing/corrupted localStorage gracefully (falls back to defaults)
- [ ] Pure TypeScript — no Phaser imports
- [ ] Unit tests for merge/fallback logic
