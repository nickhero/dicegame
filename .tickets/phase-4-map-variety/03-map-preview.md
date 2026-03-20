# Map Preview in Setup

- **Status**: open
- **Phase**: 4
- **Depends on**: Phase 3 (`02-setup-scene`)
- **Files**: `src/scenes/SetupScene.ts`, `src/rendering/MapRenderer.ts`

## Description

Show a small preview of the generated map in the SetupScene so players can see the map before starting.

### Behavior

1. When setup options change (size, shape, seed), generate a preview map
2. Render it as a small thumbnail (200×150px) in the setup panel
3. Show territory colors (randomly assigned preview)
4. "Regenerate" button to get a new random seed
5. If player entered a custom seed, preview that specific map

### Implementation

- Reuse `generateMap()` and `assignTerritories()` with preview seed
- Render to a small off-screen canvas or scaled-down Phaser Graphics
- Don't create interactive zones (preview only)

## Acceptance Criteria

- [ ] Map preview visible in SetupScene
- [ ] Preview updates when map size or shape changes
- [ ] Custom seed produces the correct preview
- [ ] "Regenerate" button creates a new preview
- [ ] Preview doesn't block UI (fast enough for real-time updates)
