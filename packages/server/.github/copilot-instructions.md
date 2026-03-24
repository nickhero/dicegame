# Copilot Instructions — @dicewars/server

## Package Purpose
Backend server for DiceWars multiplayer. All game logic runs here — the server is the authoritative source of truth. Clients send intents, the server validates and executes them.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| **Hono** | HTTP framework (REST API) |
| **Socket.IO** | WebSocket (real-time game events) |
| **jose** | JWT creation/verification |
| **nanoid** | Short ID generation |
| **Drizzle ORM** | Database (SQLite) — future |
| **tsx** | Dev server with hot reload |

## CRITICAL RULES

1. **Server-authoritative** — ALL game mutations happen here. Never trust client input.
2. **Import game logic from `@dicewars/shared`** — Never duplicate game rules.
3. **Validate every action** — Check: correct player, correct turn, legal move, alive player.
4. **Use `GameError` / `GameErrorCode`** for all errors — consistent shape across REST + WebSocket.
5. **JWT auth required** on all endpoints except `/api/health` and `/api/auth/*`.

## Structure

```
src/
├── index.ts              ← Entry point (HTTP server)
├── app.ts                ← Hono app factory
├── config.ts             ← Environment variables
├── middleware/
│   ├── auth.ts           ← JWT verification
│   └── errorHandler.ts   ← Global error handler
├── routes/
│   ├── auth.ts           ← Guest login, token refresh
│   └── health.ts         ← Health check
├── ws/
│   └── index.ts          ← Socket.IO setup
├── services/             ← Business logic (GameEngine, etc.)
└── types/
    ├── events.ts         ← Socket.IO typed events
    └── api.ts            ← REST request/response types
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
npm run test       # Run tests
npm run typecheck  # Type-check only
```

## When Making Changes

- Import types and functions from `@dicewars/shared`, not from relative paths to shared source
- Add tests in `tests/` for new endpoints and services
- Use Hono's `app.request()` for testing routes (no server boot needed)
- Keep WebSocket event types in sync with client expectations
