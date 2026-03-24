# Copilot Instructions — @dicewars/shared

## Package Purpose
Pure TypeScript game logic and utilities shared between server and client. This is the authoritative source of all game rules, AI logic, and data structures.

## CRITICAL RULES

1. **ZERO browser APIs** — No `window`, `document`, `localStorage`, `fetch`, `XMLHttpRequest`. Use the `StorageAdapter` abstraction for persistence.
2. **ZERO Phaser imports** — No `import Phaser` or `import ... from 'phaser'`. This package must work in Node.js.
3. **ZERO Node.js-specific APIs** — No `fs`, `path`, `process`, `Buffer`. This package must work in browsers.
4. **All randomness uses `SeededRandom`** — Never use `Math.random()`. Pass `rng` explicitly for deterministic tests and replays.
5. **All code must be unit-testable** without a browser, DOM, or Node runtime.

## Structure

```
src/
├── game/           ← Game rules, state, AI, map generation
│   ├── GameState.ts      ← Central state + types
│   ├── GameRules.ts      ← Attack, turn flow, dice distribution
│   ├── AIPlayer.ts       ← AI decision engine
│   ├── AIPersonality.ts  ← 6 personality types
│   ├── Alliance.ts       ← Alliance system + AI diplomacy
│   ├── DiceBattle.ts     ← Dice rolling + battle resolution
│   ├── MapGenerator.ts   ← Grid-based map generation
│   ├── PowerUps.ts       ← Shield, Charge, Fortify, Reinforce
│   ├── FogOfWar.ts       ← Visibility computation
│   ├── GameRecorder.ts   ← Action recording for replay
│   ├── EventFormatter.ts ← Action → display text
│   ├── constants.ts      ← Shared constants (colors, limits)
│   ├── StorageAdapter.ts ← Pluggable storage abstraction
│   └── ...
├── utils/
│   ├── random.ts         ← SeededRandom (Mulberry32)
│   └── graph.ts          ← Graph algorithms (BFS, adjacency)
└── index.ts              ← Barrel export (re-exports everything)
```

## Key Patterns

- **GameState is mutable** — `executeAttack()`, `endTurn()` mutate in place.
- **StorageAdapter** — Call `setStorageAdapter()` to inject localStorage (client) or DB adapter (server).
- **Barrel export** — Always export new public APIs from `src/index.ts`.

## Commands

```bash
npm run test          # Run all 462+ tests
npm run test:watch    # Watch mode
npm run typecheck     # Type-check only
npm run build         # Build declarations
```

## When Making Changes

- Add/update tests in `tests/` for any logic change
- Run `npm test` to verify
- Export new public types/functions from `src/index.ts`
- Never add browser or Node.js imports
