# Custom AI Builder

- **Status**: pending
- **Phase**: 10
- **Depends on**: none
- **Files**: `src/game/AIPersonality.ts`, `src/scenes/SetupScene.ts`

## Description

Let the player configure custom AI personalities by adjusting sliders for aggression, caution, expansion priority, and max attacks per turn. Save custom presets by name.

## Tasks

- [ ] Add "Custom" option to personality selector in SetupScene
- [ ] Show slider panel when Custom is selected
- [ ] Sliders: min advantage (-2 to +4), max attacks (1-∞), connectivity bonus (0-10)
- [ ] Generate AIPersonalityConfig from slider values
- [ ] Save/load named custom presets in localStorage
- [ ] Add preset management UI (save, load, delete)
- [ ] Add tests for custom config generation
