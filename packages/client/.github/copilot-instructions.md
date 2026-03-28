# Copilot Instructions — @dicewars/client

## Package Purpose
Phaser 3 frontend — a **thin rendering layer** that sends player intents to the server via WebSocket and renders the game state received from the server. Also supports fully local games (no server needed).

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| **Phaser 3** | 2D game rendering (Canvas/WebGL) |
| **Vite** | Build tool + dev server |
| **Socket.IO Client** | WebSocket communication |
| **@dicewars/shared** | Game types + read-only validation |

## CRITICAL RULES

1. **NEVER call game-mutating functions directly in online mode** — No `executeAttack()`, `endTurn()`, `formAlliance()`, etc. Send intents via `SocketClient` instead.
2. **Read-only validation is OK** — `canAttackFrom()`, `isValidAttack()`, `getValidTargets()`, `estimateWinProbability()` can be called locally for UI feedback.
3. **Online game state comes from the server** — Listen for `game:stateUpdate` events. The local `GameState` is a mirror of server state.
4. **Local games execute logic directly** — `GameScene` supports both paths via `this.isOnlineGame`.
5. **Rendering is stateless** — Renderers read `GameState` and draw. No game decisions in rendering code.
6. **Socket listeners must be cleaned up** — Remove listeners before scene transitions to prevent handlers surviving across scenes.

## Structure

```
src/
├── main.ts                 ← Entry point (Phaser boot + StorageAdapter setup)
├── config.ts               ← Phaser game config
├── version.ts              ← Version display (auto-updated by release script)
├── scenes/
│   ├── BootScene.ts        ← Loading screen
│   ├── MenuScene.ts        ← Title screen, achievements gallery
│   ├── LoginScene.ts       ← Guest login for online play
│   ├── LobbyScene.ts       ← Online game browser + create/join
│   ├── SetupScene.ts       ← Game configuration (local & online)
│   ├── WaitingRoomScene.ts ← Pre-game lobby for online matches
│   ├── GameScene.ts        ← Main gameplay (~2000 lines, local + online)
│   ├── GameOverScene.ts    ← Results + stats + achievements
│   ├── ReplayScene.ts      ← Replay playback
│   └── HistoryScene.ts     ← Match history browser
├── rendering/
│   ├── MapRenderer.ts      ← Territory drawing + alliance indicators
│   ├── DiceRenderer.ts     ← Pixel art dice generation + stacks
│   ├── UIRenderer.ts       ← HUD, player panel, buttons
│   ├── BattleAnimator.ts   ← Battle popup animations
│   ├── TerritoryEffects.ts ← Visual effects (arrows, glow, pulse)
│   ├── EventLog.ts         ← Scrollable event log panel
│   ├── ToastManager.ts     ← Toast notification popups
│   └── SoundManager.ts     ← Procedural Web Audio effects
└── network/
    ├── SocketClient.ts     ← Socket.IO connection management
    └── LobbyClient.ts      ← REST API client for lobby/auth
```

## Online vs Local

| Feature | Local | Online |
|---------|-------|--------|
| Speed | normal / fast / instant | normal only |
| Undo | available | disabled |
| Spectator | all-AI games | not available |
| AI personality | Player chooses | Random (server-side) |
| Game logic | Executed directly | Server-authoritative |

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
- When adding socket listeners, ensure cleanup in `shutdown()` or before `scene.start()`
