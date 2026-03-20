# Game Setup Scene

- **Status**: open
- **Phase**: 3
- **Depends on**: `01-game-config-model`, Phase 1 (`05-hud-personality-display`)
- **Files**: `src/scenes/SetupScene.ts` (new), `src/scenes/MenuScene.ts`

## Description

Replace the direct "START GAME" → GameScene flow with a setup screen where players can configure the match.

### UI Layout

```
┌─────────────────────────────────┐
│         GAME SETUP              │
│                                 │
│  Players:  [2] [3] [4] [5] [6] │
│                                 │
│  Map Size: [S] [M] [L] [XL]    │
│                                 │
│  AI 1: [Random ▾]              │
│  AI 2: [Random ▾]              │
│  AI 3: [Random ▾]              │
│                                 │
│  Speed: [Normal] [Fast] [Inst]  │
│                                 │
│  Seed: [________] (optional)    │
│                                 │
│       [ START GAME ]            │
│       [   BACK     ]            │
└─────────────────────────────────┘
```

### Behavior

- Player count selector: clicking a number updates AI personality slots accordingly
- AI personality dropdown: cycle through personalities + "Random"
- Seed field: text input (Phaser DOM element or click-to-type)
- Start button passes `GameSetupConfig` to `GameScene.init()`
- Back button returns to MenuScene
- Preferences auto-saved on change

## Acceptance Criteria

- [ ] SetupScene accessible from MenuScene
- [ ] Player count selector (2–6) dynamically shows/hides AI slots
- [ ] AI personality selectable per slot
- [ ] Map size presets working
- [ ] Speed selector working
- [ ] Optional seed input
- [ ] Config passed to GameScene via `scene.start('GameScene', config)`
- [ ] GameScene reads config from `init(data)` instead of hardcoded values
- [ ] Preferences persist via localStorage across sessions
