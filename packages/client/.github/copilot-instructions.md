# Copilot Instructions — @dicewars/client

## Package Purpose
Phaser 3 frontend — a **thin rendering layer** that sends player intents to the server via WebSocket and renders the game state received from the server.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| **Phaser 3** | 2D game rendering (Canvas/WebGL) |
| **Vite** | Build tool + dev server |
| **Socket.IO Client** | WebSocket communication |
| **@dicewars/shared** | Game types + read-only validation |

## CRITICAL RULES

1. **NEVER call game-mutating functions directly** — No `executeAttack()`, `endTurn()`, `formAlliance()`, etc. Send intents via `SocketClient` instead.
2. **Read-only validation is OK** — `canAttackFrom()`, `isValidAttack()`, `getValidTargets()`, `estimateWinProbability()` can be called locally for UI feedback.
3. **Game state comes from the server** — Listen for `game:stateUpdate` events. The local `GameState` is a mirror of server state.
4. **No `SeededRandom`** — Server owns all RNG. Don't create or use `SeededRandom` in client code.
5. **No `GameRecorder`** — Server handles recording. Don't create recorders in client code.
6. **Rendering is stateless** — Renderers read `GameState` and draw. No game decisions in rendering code.

## Structure

```
src/
├── main.ts                 ← Entry point (Phaser boot + StorageAdapter setup)
├── config.ts               ← Phaser game config
├── version.ts              ← Version display
├── scenes/
│   ├── BootScene.ts        ← Loading screen
│   ├── MenuScene.ts        ← Title screen
│   ├── SetupScene.ts       ← Game configuration
│   ├── GameScene.ts        ← Main gameplay (renders + sends intents)
│   ├── GameOverScene.ts    ← Results screen
│   ├── ReplayScene.ts      ← Replay playback
│   └── HistoryScene.ts     ← Match history
├── rendering/
│   ├── MapRenderer.ts      ← Territory drawing
│   ├── DiceRenderer.ts     ← Dice sprites
│   ├── UIRenderer.ts       ← HUD + panels
│   ├── BattleAnimator.ts   ← Battle animations
│   ├── TerritoryEffects.ts ← Visual effects
│   ├── EventLog.ts         ← Event log panel
│   └── SoundManager.ts     ← Procedural audio
└── network/                ← (future) WebSocket + REST clients
```

## Graphics

All visuals are programmatic — no image assets. Pixel art style via `pixelArt: true` in Phaser config.

## Commands

```bash
npm run dev         # Vite dev server on :3000 (proxies /api + /socket.io to :3001)
npm run build       # Production build
npm run typecheck   # Type-check only
npm run preview     # Preview production build
```

## When Making Changes

- Import game types from `@dicewars/shared` (consolidated import)
- Rendering changes = code changes (no asset files)
- Run `npm run typecheck` after changes
- Test visually in browser (`npm run dev`)
- Keep imports from `@dicewars/shared` on a single consolidated line per file
