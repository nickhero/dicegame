# Phase 1: Monorepo Setup & Shared Package Extraction

**Priority**: 🔴 Critical (everything depends on this)
**Scope**: Infrastructure, no new features

## Goal

Restructure the project into an npm workspaces monorepo and extract the pure game logic into a shared package that both server and client can import.

## Tasks

### 1.1 — Create monorepo workspace structure

```
dicegame-908/
├── package.json              ← root workspace config
├── tsconfig.base.json        ← shared TS config
├── packages/
│   ├── shared/               ← pure game logic + utils
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── game/         ← moved from src/game/
│   │       └── utils/        ← moved from src/utils/
│   ├── server/               ← new backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   └── client/               ← current Phaser frontend
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── vitest.config.ts
│       ├── index.html
│       └── src/
│           ├── scenes/
│           ├── rendering/
│           ├── config.ts
│           └── version.ts
├── tests/                    ← stays at root or moves to packages/shared/tests/
```

- [ ] Init npm workspaces in root `package.json`
- [ ] Create `packages/shared/`, `packages/server/`, `packages/client/`
- [ ] Create `tsconfig.base.json` with shared compiler options
- [ ] Each package gets its own `tsconfig.json` extending base

### 1.2 — Extract shared package

Move pure game logic (ZERO browser dependencies) into `packages/shared/`:

**Files to move** (all pure TypeScript, no Phaser, no localStorage):
- `src/game/GameState.ts`
- `src/game/Territory.ts`
- `src/game/Player.ts`
- `src/game/GameRules.ts`
- `src/game/DiceBattle.ts`
- `src/game/AIPlayer.ts`
- `src/game/AIPersonality.ts` (extract localStorage functions OUT)
- `src/game/PowerUps.ts`
- `src/game/FogOfWar.ts`
- `src/game/Alliance.ts`
- `src/game/MapGenerator.ts`
- `src/game/MapShapes.ts`
- `src/game/GameStateSnapshot.ts`
- `src/game/GameStats.ts`
- `src/game/GameRecorder.ts`
- `src/game/EventFormatter.ts`
- `src/game/constants.ts`
- `src/game/GameConfig.ts` (extract localStorage functions OUT, keep interfaces + defaults)
- `src/game/Achievements.ts` (extract localStorage functions OUT, keep check logic)
- `src/game/MatchHistory.ts` (extract localStorage functions OUT, keep interfaces)
- `src/utils/random.ts`
- `src/utils/graph.ts`

**Files with localStorage that need splitting**:

| File | Keep in shared (pure) | Move to client (browser) |
|------|----------------------|-------------------------|
| `GameConfig.ts` | `GameSetupConfig` interface, `DEFAULT_SETUP`, `SPEED_CONFIGS` | `savePreferences()`, `loadPreferences()` |
| `Achievements.ts` | `Achievement` type, `checkAchievements()`, achievement definitions | `saveUnlocked()`, `loadUnlocked()` |
| `MatchHistory.ts` | `MatchRecord` interface | `saveMatch()`, `loadHistory()`, `deleteMatch()` |
| `AIPersonality.ts` | `CustomAIPreset` interface, `customPresetToPersonality()` | `saveCustomPreset()`, `loadCustomPresets()`, `deleteCustomPreset()` |

### 1.3 — Update imports

- [ ] Client: update all `import ... from '../game/...'` → `import ... from '@dicewars/shared'`
- [ ] Client: update all `import ... from '../utils/...'` → `import ... from '@dicewars/shared'`
- [ ] Shared package exports barrel file: `packages/shared/src/index.ts`
- [ ] Verify `npm run build` works from root
- [ ] Verify `npm run test` works (tests may move to `packages/shared/tests/`)

### 1.4 — Verify nothing breaks

- [ ] All 462+ tests still pass
- [ ] `npm run typecheck` clean
- [ ] `npm run dev` (client) still works
- [ ] `npm run build` (client) produces working dist/

### 1.5 — Create Copilot instructions for monorepo

The current `.github/copilot-instructions.md` describes a single-project structure. After the monorepo split, create **package-level instruction files** so Copilot understands each package's rules and boundaries.

#### Root instructions (`.github/copilot-instructions.md` — update existing)
- [ ] Update project overview: now a monorepo with `packages/shared`, `packages/server`, `packages/client`
- [ ] Update commands: `npm run dev` from root starts both server + client
- [ ] Document workspace commands: `npm -w packages/server run dev`, etc.
- [ ] Update architecture diagram to reflect monorepo structure
- [ ] Keep conventional commits and versioning instructions

#### Shared package instructions (`packages/shared/.github/copilot-instructions.md`)
- [ ] State: **ZERO browser APIs** — no `window`, `document`, `localStorage`, `fetch`
- [ ] State: **ZERO Phaser imports** — no `import Phaser` or `import ... from 'phaser'`
- [ ] State: **ZERO Node.js APIs** — no `fs`, `path`, `process` (must work in both environments)
- [ ] All code must be unit-testable without a browser or Node runtime
- [ ] All randomness uses `SeededRandom` — never `Math.random()`
- [ ] Export everything via barrel file `src/index.ts`
- [ ] Document key files and their purposes (GameRules, GameState, etc.)

#### Server package instructions (`packages/server/.github/copilot-instructions.md`)
- [ ] State: Hono framework for HTTP, Socket.IO for WebSocket
- [ ] State: **Server-authoritative** — all game logic executes here via `@dicewars/shared`
- [ ] State: SQLite + Drizzle ORM for persistence
- [ ] State: JWT authentication via Hono middleware
- [ ] Import game logic from `@dicewars/shared`, never duplicate it
- [ ] All errors must use `GameError` / `GameErrorCode` from shared error contract
- [ ] Document server commands: `npm run dev`, `npm run test`, `npm run build`
- [ ] Document environment variables: `PORT`, `JWT_SECRET`, `DB_PATH`, `CLIENT_ORIGIN`

#### Client package instructions (`packages/client/.github/copilot-instructions.md`)
- [ ] State: Phaser 3 frontend — **thin rendering layer only**
- [ ] State: **NEVER call game-mutating functions directly** — send intents via `SocketClient`
- [ ] State: Read-only validation functions (canAttackFrom, isValidAttack, getValidTargets) are OK for UI
- [ ] State: Game state comes from server via WebSocket events
- [ ] State: No `SeededRandom` — server owns all RNG
- [ ] State: No `GameRecorder` — server handles recording
- [ ] Document scene flow: LoginScene → LobbyScene → WaitingRoomScene → GameScene → GameOverScene
- [ ] Document network services: SocketClient, AuthClient, LobbyClient

## Acceptance Criteria

- Monorepo with 3 packages compiles and tests pass
- `packages/shared/` has zero browser/Phaser dependencies
- Client imports from `@dicewars/shared` instead of relative paths
- No functional changes — game plays identically
- Each package has its own Copilot instructions documenting boundaries and conventions
