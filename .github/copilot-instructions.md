# Copilot Instructions — DiceWars

## Project Overview

DiceWars is a browser-based 2D pixel art strategy game inspired by DiceWars/KDice. Built with **Phaser 3 + TypeScript + Vite**, tested with **Vitest**. Single-player vs AI opponents on a randomly generated territory map.

## Architecture — CRITICAL

The codebase enforces a strict separation between **game logic** and **rendering**:

```
src/game/       ← Pure TypeScript. ZERO Phaser imports. All game rules live here.
src/rendering/  ← Phaser rendering code. Reads GameState, draws visuals.
src/scenes/     ← Phaser scenes. Thin wiring between game logic and renderers.
src/utils/      ← Pure TypeScript utilities (RNG, graph algorithms).
```

### Rules for this separation

1. **Never** add `import Phaser` or `import ... from 'phaser'` to any file in `src/game/` or `src/utils/`.
2. All game logic must be unit-testable without a browser or DOM.
3. Rendering code should be **stateless** — it reads from `GameState` and draws. No game decisions in rendering.
4. Constants shared between game logic and rendering live in `src/game/constants.ts` (no Phaser dependency). `src/config.ts` re-exports them and adds the Phaser config.

## Tech Stack

| Layer | Tech | Version |
|-------|------|---------|
| Runtime | Node.js | 24 (see .nvmrc) |
| Framework | Phaser 3 | ^3.88 |
| Language | TypeScript | ^5.x |
| Bundler | Vite | ^5.x |
| Test Runner | Vitest | ^2.x |

## Commands

```bash
nvm use            # Use correct Node version
npm run dev        # Start dev server on http://localhost:3000
npm run build      # Type-check + production build
npm run test       # Run all unit tests
npm run typecheck  # Type-check only (no emit)
```

## Game Logic (src/game/)

| File | Purpose |
|------|---------|
| `constants.ts` | Pure constants (colors, limits, dimensions) |
| `Territory.ts` | Territory data model (cells, center, neighbors, owner, dice) |
| `Player.ts` | Player data model + factory |
| `GameState.ts` | Central state + BattleResult types |
| `MapGenerator.ts` | Grid-based region growing map generation |
| `DiceBattle.ts` | Dice rolling and battle resolution |
| `GameRules.ts` | Attack validation, execution, turn flow, dice distribution |
| `AIPlayer.ts` | Greedy AI: finds and executes favorable attacks |

## Key Patterns

### Seeded RNG
All randomness uses `SeededRandom` from `src/utils/random.ts`. Pass `rng` explicitly — never use `Math.random()`. This keeps tests deterministic.

### GameState is mutable
`executeAttack()`, `endTurn()`, etc. mutate `GameState` in place. This is intentional for simplicity. Rendering re-reads state after mutations.

### Map generation
Uses grid-based region growing (BFS flood-fill from seed points). Produces territories with cells, adjacency graph, and visual centers. Grid is 20×16 cells of 32px each.

### AI strategy
Greedy: finds all attacks with advantage ≥ 1, picks from the best options with slight randomness. Executes multiple attacks per turn until no favorable moves remain.

## Testing

Tests live in `tests/` mirroring `src/` structure. All tests run against pure game logic — no DOM, no Phaser.

When modifying game logic, always run `npm run test` to verify. When modifying rendering, run `npm run typecheck` at minimum.

## Graphics

All visuals are programmatic — no external image assets. Dice textures are generated via Canvas API at boot time. Territories are drawn with Phaser Graphics. This means:
- No asset files to manage
- Rendering changes = code changes
- Pixel art style via `pixelArt: true` in Phaser config

## When Making Changes

1. **Game rules change?** → Modify `src/game/`, add/update tests in `tests/game/`, run `npm test`
2. **Visual change?** → Modify `src/rendering/`, run `npm run typecheck`, verify in browser
3. **New feature?** → Start with the game logic (testable), then wire up rendering
4. **Adding constants?** → Put in `src/game/constants.ts` if needed by game logic, or `src/config.ts` if Phaser-only
