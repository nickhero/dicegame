# Copilot Instructions — @dicewars/server

## Package Purpose
Backend server for DiceWars multiplayer. All game logic runs here — the server is the authoritative source of truth. Clients send intents, the server validates and executes them.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| **Hono** | HTTP framework (REST API) |
| **Socket.IO** | WebSocket (real-time game events) |
| **better-sqlite3** | SQLite database |
| **Drizzle ORM** | Type-safe SQL queries + schema |
| **jose** | JWT creation/verification |
| **nanoid** | Short ID generation |
| **tsx** | Dev server with hot reload |

## CRITICAL RULES

1. **Server-authoritative** — ALL game mutations happen here. Never trust client input.
2. **Import game logic from `@dicewars/shared`** — Never duplicate game rules.
3. **Validate every action** — Check: correct player, correct turn, legal move, alive player.
4. **Use `GameError` / `GameErrorCode`** for all errors — consistent shape across REST + WebSocket.
5. **JWT auth required** on all endpoints except `/api/health` and `/api/auth/*`.
6. **All `runAITurns()` calls must have `.catch()`** — Fire-and-forget async without error handling crashes Node.
7. **Online AI personalities are always randomized server-side** — Ignore client-sent personality.

## Structure

```
src/
├── index.ts              ← Entry point (HTTP server)
├── app.ts                ← Hono app factory
├── config.ts             ← Environment variables
├── middleware/
│   ├── auth.ts           ← JWT verification
│   ├── errorHandler.ts   ← Global error handler
│   ├── rateLimit.ts      ← IP + socket rate limiting
│   └── securityHeaders.ts← Security headers
├── routes/
│   ├── auth.ts           ← Guest login, token refresh
│   ├── lobby.ts          ← Game CRUD, join/leave
│   ├── history.ts        ← Match history queries
│   ├── stats.ts          ← Player statistics
│   ├── aiPresets.ts      ← Saved AI configurations
│   ├── preferences.ts    ← User preferences
│   ├── spectate.ts       ← Spectator endpoints
│   └── health.ts         ← Health check
├── ws/
│   ├── index.ts          ← Socket.IO namespaces (/lobby, /game)
│   ├── gameHandlers.ts   ← In-game actions (attack, endTurn, surrender, etc.)
│   ├── waitingRoom.ts    ← Pre-game lobby (slots, AI, ready, start)
│   ├── disconnectHandler.ts ← Disconnect → AI takeover + reconnection
│   ├── spectatorHandlers.ts ← Spectator-specific events
│   ├── lobbyBroadcaster.ts  ← Lobby list broadcasts
│   ├── serializeState.ts    ← State serialization for clients
│   └── cleanupJob.ts        ← Stale room cleanup
├── services/
│   ├── GameEngine.ts         ← Game creation, state management, action execution
│   ├── AITurnRunner.ts       ← AI turn loop (animated + instant modes)
│   ├── TurnTimer.ts          ← Turn timeout enforcement
│   ├── FogFilter.ts          ← Per-player fog of war filtering
│   ├── handleGameEnd.ts      ← Game over logic (stats, achievements, cleanup)
│   ├── LobbyService.ts       ← Lobby CRUD + slot management
│   ├── MatchHistoryService.ts← Match persistence
│   ├── UserService.ts        ← Guest user management
│   ├── UserStatsService.ts   ← Player stats aggregation
│   ├── AchievementService.ts ← Achievement tracking
│   ├── AIPresetService.ts    ← Saved AI configs
│   ├── UserPreferencesService.ts ← User prefs
│   ├── gameEngineInstance.ts ← Singleton accessor
│   ├── aiTurnRunnerInstance.ts ← Singleton accessor
│   └── turnTimerInstance.ts  ← Singleton accessor
├── db/
│   ├── schema.ts         ← Drizzle schema (users, games, players, stats, etc.)
│   ├── connection.ts     ← SQLite connection
│   └── migrate.ts        ← Auto-migration
└── types/
    ├── events.ts         ← Socket.IO typed events
    ├── api.ts            ← REST request/response types
    └── env.ts            ← Hono env types (AppEnv for typed c.get('user'))
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | dev default | JWT signing secret |
| `CLIENT_ORIGIN` | `http://localhost:3000` | CORS allowed origin |
| `NODE_ENV` | `development` | Environment |

## Commands

```bash
npm run dev        # Start dev server (tsx watch)
npm run build      # TypeScript build
npm run test       # Run 300+ tests (unit + E2E)
npm run typecheck  # Type-check only
npm run db:studio  # Drizzle Studio (DB browser)
```

## When Making Changes

- Import types and functions from `@dicewars/shared`, not from relative paths to shared source
- Add tests in `tests/` for new endpoints and services
- Use Hono's `app.request()` for testing routes (no server boot needed)
- E2E tests use real Socket.IO connections — see `tests/e2e/helpers.ts`
- Keep WebSocket event types in sync with client expectations (`types/events.ts`)
- Use `Hono<AppEnv>` for type-safe `c.get('user')` without casts
