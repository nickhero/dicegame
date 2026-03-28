# Copilot Instructions — DiceWars

## Project Overview

DiceWars is a browser-based 2D pixel art strategy game inspired by DiceWars/KDice. Built with **Phaser 3 + TypeScript + Vite**, tested with **Vitest**. Features a **server-authoritative multiplayer backend** with Hono + Socket.IO.

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
│              SQLite + Drizzle ORM for persistence. Imports from @dicewars/shared.
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
| `ToastManager.ts` | Toast notification popups |
| `SoundManager.ts` | Procedural Web Audio sound effects |

### Client scenes (packages/client/src/scenes/)

| File | Purpose |
|------|---------|
| `BootScene.ts` | Loading screen |
| `MenuScene.ts` | Title, start, history, achievements gallery |
| `LoginScene.ts` | Guest login for online play |
| `LobbyScene.ts` | Online game browser + create/join |
| `SetupScene.ts` | Game configuration UI (local & online) |
| `WaitingRoomScene.ts` | Pre-game lobby for online matches |
| `GameScene.ts` | Main gameplay (~2000 lines) |
| `GameOverScene.ts` | Victory/defeat + stats + achievements |
| `ReplayScene.ts` | Game replay playback |
| `HistoryScene.ts` | Match history browser |

### Client networking (packages/client/src/network/)

| File | Purpose |
|------|---------|
| `SocketClient.ts` | Socket.IO connection management |
| `LobbyClient.ts` | REST API client for lobby/auth |

## Tech Stack

| Layer | Tech | Version |
|-------|------|---------|
| Runtime | Node.js | 24 (see .nvmrc) |
| Monorepo | npm workspaces | — |
| Framework | Phaser 3 | ^3.90 |
| Backend | Hono + Socket.IO | — |
| Database | SQLite + Drizzle ORM | better-sqlite3 |
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
| `ServerTypes.ts` | Shared type definitions for server communication |
| `ErrorContract.ts` | Typed error codes shared between client and server |

## Key Patterns

### Seeded RNG
All randomness uses `SeededRandom` from `src/utils/random.ts`. Pass `rng` explicitly — never use `Math.random()`. This keeps tests deterministic.

### GameState is mutable
`executeAttack()`, `endTurn()`, etc. mutate `GameState` in place. This is intentional for simplicity. Rendering re-reads state after mutations.

### Map generation
Uses grid-based region growing (BFS flood-fill from seed points). Supports both square and hex grids with configurable map shapes (rectangle, diamond, ring, continent, islands). Produces territories with cells, adjacency graph, and visual centers.

### AI strategy
Six AI personality types (cautious, balanced, aggressive, reckless, expansionist, turtle) each with distinct attack thresholds, risk tolerance, and expansion priorities. AI is alliance-aware — considers reputation and diplomatic relationships when choosing targets. Online multiplayer always assigns random personalities to AI players (server-side).

### Power-ups, Fog of War & Alliances
Power-ups (Shield, Charge, Fortify, Reinforce) add tactical depth. Fortify clamps dice moved to target capacity (`MAX_DICE_PER_TERRITORY - target.dice`). Fog of war limits visibility to owned + adjacent territories; server sends per-player filtered state via `FogFilter.filterStateForPlayer()`. The alliance system uses a **proposal flow** — `proposeAlliance` creates a proposal; mutual proposals auto-accept, or the target can `respondAlliance`. Attacking an ally breaks the alliance (same as AI path). Includes reputation tracking, betrayal mechanics, and AI diplomacy logic.

### Online vs Local game differences
Online multiplayer enforces several restrictions compared to local play:
- **Speed**: Always `normal` (no fast/instant options)
- **Undo**: Disabled
- **Spectator mode**: Not available in online setup
- **AI personality**: Always randomized server-side (client shows Open/AI toggle only)

### Server architecture (packages/server/src/)

| Directory | Key Files |
|-----------|-----------|
| `services/` | `GameEngine.ts`, `AITurnRunner.ts`, `TurnTimer.ts`, `FogFilter.ts`, `handleGameEnd.ts`, `LobbyService.ts`, `MatchHistoryService.ts`, `UserService.ts`, `UserStatsService.ts`, `AchievementService.ts`, `AIPresetService.ts`, `UserPreferencesService.ts` |
| `ws/` | `index.ts` (Socket.IO setup), `gameHandlers.ts`, `disconnectHandler.ts`, `waitingRoom.ts`, `spectatorHandlers.ts`, `serializeState.ts`, `lobbyBroadcaster.ts`, `cleanupJob.ts` |
| `routes/` | `auth.ts`, `lobby.ts`, `history.ts`, `aiPresets.ts`, `preferences.ts`, `spectate.ts`, `stats.ts`, `health.ts` |
| `middleware/` | `auth.ts`, `errorHandler.ts`, `rateLimit.ts`, `securityHeaders.ts` |
| `db/` | `schema.ts` (Drizzle), `connection.ts`, `migrate.ts` |
| `types/` | `api.ts`, `events.ts`, `env.ts` |

`GameEngine` and `AITurnRunner` are module-level singletons (see `*Instance.ts` files). `handleGameEnd` is extracted into its own service so both `gameHandlers.ts` and `AITurnRunner` can call it. All fire-and-forget `runAITurns()` calls must have `.catch()` handlers to prevent unhandled promise rejections crashing Node.

## Testing

Tests live in each package's `tests/` directory. All game logic tests run against pure TypeScript — no DOM, no Phaser.

- **Shared**: 478+ tests in `packages/shared/tests/` — `npm run test`
- **Server**: 300+ tests (unit + E2E) in `packages/server/tests/` — `npm run test:server`
- **All**: `npm run test:all` (780+ total)

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

The game version lives in `packages/client/src/version.ts` and is displayed on the main menu. It is auto-updated by `commit-and-tag-version` — do **not** manually edit it.

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

Version bumps are automated via `commit-and-tag-version`. Do **not** manually edit `packages/client/src/version.ts` or the version in `package.json`.

```bash
npm run release          # auto-detects bump from commit history (feat→minor, fix→patch)
npm run release:minor    # force minor bump
npm run release:major    # force major bump
```

This reads all commits since the last git tag, determines the bump type, updates `packages/client/src/version.ts` + `package.json` + `package-lock.json`, creates a version commit, and tags it.

### Commit Hooks (automated via husky)

- **pre-commit**: runs `npm test` — commit blocked if tests fail
- **commit-msg**: runs `commitlint` — commit blocked if message doesn't follow conventional format
