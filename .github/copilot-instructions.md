# Copilot Instructions — DiceWars

## Project Overview

DiceWars is a browser-based 2D pixel art strategy game inspired by DiceWars/KDice. Built with **Phaser 3 + TypeScript + Vite**, tested with **Vitest**. Multiplayer-ready with a server-authoritative backend.

## Architecture — CRITICAL

This is a **monorepo** (npm workspaces) with three packages:

```
packages/
├── shared/    ← @dicewars/shared — Pure TypeScript game logic + utilities.
│              ZERO browser APIs, ZERO Phaser, ZERO Node.js-specific APIs.
│              Authoritative source of all game rules, AI, data structures.
│
├── server/    ← @dicewars/server — Hono backend (REST + Socket.IO).
│              Server-authoritative game engine. Validates & executes all moves.
│              Imports game logic from @dicewars/shared.
│
└── client/    ← @dicewars/client — Phaser 3 frontend (thin renderer).
               Sends player intents via WebSocket. Renders state from server.
               Imports types from @dicewars/shared (read-only validation OK).
```

### Package boundaries

1. **`shared`** has ZERO dependencies on `server` or `client`. No browser APIs, no Node.js APIs, no Phaser.
2. **`server`** imports from `@dicewars/shared`. Never imports from `client`.
3. **`client`** imports from `@dicewars/shared`. Never imports from `server`. Never calls game-mutating functions directly — sends intents via WebSocket.
4. All game logic must be unit-testable without a browser or DOM.
5. Rendering code should be **stateless** — it reads from `GameState` and draws. No game decisions in rendering.

### Client rendering (packages/client/src/rendering/)

| File | Purpose |
|------|---------|
| `MapRenderer.ts` | Territory map drawing + alliance indicators |
| `DiceRenderer.ts` | Pixel art dice generation & stacks |
| `UIRenderer.ts` | HUD, player panel, buttons |
| `BattleAnimator.ts` | Battle popup animations |
| `TerritoryEffects.ts` | Visual effects (arrows, glow, pulse, warnings) |
| `EventLog.ts` | Scrollable event log panel |
| `SoundManager.ts` | Procedural Web Audio sound effects |

### Client scenes (packages/client/src/scenes/)

| File | Purpose |
|------|---------|
| `BootScene.ts` | Loading screen |
| `MenuScene.ts` | Title, start, history, achievements gallery |
| `SetupScene.ts` | Game configuration UI |
| `GameScene.ts` | Main gameplay (~1600 lines) |
| `GameOverScene.ts` | Victory/defeat + stats + achievements |
| `ReplayScene.ts` | Game replay playback |
| `HistoryScene.ts` | Match history browser |

## Tech Stack

| Layer | Tech | Version |
|-------|------|---------|
| Runtime | Node.js | 24 (see .nvmrc) |
| Monorepo | npm workspaces | — |
| Framework | Phaser 3 | ^3.88 |
| Backend | Hono + Socket.IO | — |
| Language | TypeScript | ^5.x |
| Bundler | Vite | ^5.x |
| Test Runner | Vitest | ^2.x |

## Commands

```bash
nvm use                # Use correct Node version
npm run dev            # Start Vite client dev server on :3000
npm run dev:server     # Start Hono server on :3001 (tsx watch)
npm run build          # Build shared + client for production
npm run test           # Run shared package tests
npm run test:server    # Run server package tests
npm run test:all       # Run all tests (shared + server)
npm run typecheck      # Type-check all packages (tsc --build)
```

## Game Logic (packages/shared/src/game/)

| File | Purpose |
|------|---------|
| `constants.ts` | Pure constants (colors, limits, dimensions) |
| `Territory.ts` | Territory data model (cells, center, neighbors, owner, dice) |
| `Player.ts` | Player data model + factory |
| `GameState.ts` | Central state + BattleResult types |
| `MapGenerator.ts` | Grid-based region growing map generation (square + hex) |
| `MapShapes.ts` | Map shape masks (rectangle, diamond, ring, continent, islands) |
| `DiceBattle.ts` | Dice rolling and battle resolution |
| `GameRules.ts` | Attack validation, execution, turn flow, dice distribution, surrender |
| `AIPlayer.ts` | AI opponent logic with personality-based strategy |
| `AIPersonality.ts` | 6 AI personality type definitions + config |
| `GameConfig.ts` | Game setup config, speed options |
| `GameRecorder.ts` | Action recording for replay & stats, GameAction types |
| `GameStats.ts` | Live stats tracking + `computeFromRecording()` for history |
| `GameStateSnapshot.ts` | Snapshot/restore for undo system |
| `EventFormatter.ts` | GameAction → display text with emoji/colors |
| `MatchHistory.ts` | Match history persistence (via StorageAdapter) |
| `PowerUps.ts` | Shield, Charge, Fortify, Reinforce power-ups |
| `FogOfWar.ts` | Visibility computation for fog of war mode |
| `Alliance.ts` | Alliance system, reputation, AI diplomacy |
| `Achievements.ts` | 12 achievements with check functions |
| `StorageAdapter.ts` | Pluggable storage abstraction (no direct localStorage) |

## Key Patterns

### Seeded RNG
All randomness uses `SeededRandom` from `src/utils/random.ts`. Pass `rng` explicitly — never use `Math.random()`. This keeps tests deterministic.

### GameState is mutable
`executeAttack()`, `endTurn()`, etc. mutate `GameState` in place. This is intentional for simplicity. Rendering re-reads state after mutations.

### Map generation
Uses grid-based region growing (BFS flood-fill from seed points). Supports both square and hex grids with configurable map shapes (rectangle, diamond, ring, continent, islands). Produces territories with cells, adjacency graph, and visual centers.

### AI strategy
Six AI personality types (aggressive, cautious, expansionist, defender, random, balanced) each with distinct attack thresholds, risk tolerance, and expansion priorities. AI is alliance-aware — considers reputation and diplomatic relationships when choosing targets.

### Power-ups, Fog of War & Alliances
Power-ups (Shield, Charge, Fortify, Reinforce) add tactical depth. Fog of war limits visibility to owned + adjacent territories. The alliance system includes reputation tracking, proposals, betrayal mechanics, and AI diplomacy logic.

## Testing

Tests live in each package's `tests/` directory. All game logic tests run against pure TypeScript — no DOM, no Phaser.

- **Shared**: 462+ tests in `packages/shared/tests/` — `npm run test`
- **Server**: Route/service tests in `packages/server/tests/` — `npm run test:server`
- **All**: `npm run test:all`

When modifying game logic, always run `npm run test` to verify. When modifying rendering, run `npm run typecheck` at minimum.

## Graphics

All visuals are programmatic — no external image assets. Dice textures are generated via Canvas API at boot time. Territories are drawn with Phaser Graphics. This means:
- No asset files to manage
- Rendering changes = code changes
- Pixel art style via `pixelArt: true` in Phaser config

## When Making Changes

1. **Game rules change?** → Modify `packages/shared/`, add/update tests, run `npm run test`
2. **Visual change?** → Modify `packages/client/src/rendering/`, run `npm run typecheck`, verify in browser
3. **New feature?** → Start with game logic in `shared` (testable), then wire up server + client
4. **Adding constants?** → Put in `packages/shared/src/game/constants.ts`
5. **New API endpoint?** → Add route in `packages/server/src/routes/`, test with `app.request()`
6. **Multiplayer event?** → Define types in `packages/server/src/types/events.ts`, handle in both server and client
7. **Cross-package types?** → Define in `packages/shared`, import as `@dicewars/shared`

## Versioning & Commits

### Semantic Versioning

The game version lives in `src/version.ts` and is displayed on the main menu. Keep it in sync with `package.json`.

### Conventional Commits (REQUIRED)

All commit messages **must** use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

[optional body]

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

**Types and version impact:**

| Type | When to use | Version bump |
|------|------------|--------------|
| `feat` | New feature or capability | **minor** (`npm run version:minor`) |
| `fix` | Bug fix | **patch** (`npm run version:patch`) |
| `refactor` | Code restructuring, no behavior change | patch |
| `perf` | Performance improvement | patch |
| `style` | Visual/UI changes (no logic change) | patch |
| `docs` | Documentation only | none |
| `test` | Adding/updating tests only | none |
| `chore` | Build, config, tooling changes | none |

**Scopes** (optional): `game`, `ai`, `ui`, `rendering`, `replay`, `history`, `config`, `map`, `server`, `shared`, `client`

**Examples:**
```
feat(ai): add defensive personality type
fix(replay): prevent crash on empty recording
refactor(game): extract dice distribution logic
style(ui): improve HUD layout spacing
```

### Version Bump Workflow

Version bumps are automated via `commit-and-tag-version`. Do **not** manually edit `src/version.ts` or the version in `package.json`.

```bash
npm run release          # auto-detects bump from commit history (feat→minor, fix→patch)
npm run release:minor    # force minor bump
npm run release:major    # force major bump
```

This reads all commits since the last git tag, determines the bump type, updates `src/version.ts` + `package.json` + `package-lock.json`, creates a version commit, and tags it.

### Commit Hooks (automated via husky)

- **pre-commit**: runs `npm test` — commit blocked if tests fail
- **commit-msg**: runs `commitlint` — commit blocked if message doesn't follow conventional format
