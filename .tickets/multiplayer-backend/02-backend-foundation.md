# Phase 2: Backend Foundation — Hono + Socket.IO

**Priority**: 🔴 Critical
**Depends on**: Phase 1 (monorepo setup)
**Scope**: Server package scaffolding, no game logic yet

## Goal

Set up the backend server with Hono for REST API, Socket.IO for WebSocket, and basic project structure with middleware.

## Tasks

### 2.1 — Server package setup

```
packages/server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              ← entry point: create server, bind Hono + Socket.IO
│   ├── app.ts                ← Hono app factory (for testing)
│   ├── config.ts             ← env vars, port, secrets
│   ├── middleware/
│   │   ├── auth.ts           ← JWT verification middleware
│   │   ├── cors.ts           ← CORS config
│   │   └── errorHandler.ts   ← global error handling
│   ├── routes/
│   │   ├── auth.ts           ← POST /api/auth/guest, POST /api/auth/login (future)
│   │   ├── lobby.ts          ← GET/POST /api/games, GET /api/games/:id
│   │   └── health.ts         ← GET /api/health
│   ├── ws/
│   │   ├── index.ts          ← Socket.IO server setup + namespace registration
│   │   ├── lobbyNamespace.ts ← /lobby namespace: game list updates, player counts
│   │   └── gameNamespace.ts  ← /game namespace: in-game events
│   ├── services/
│   │   └── (empty for now)
│   └── types/
│       ├── events.ts         ← Socket.IO typed events (server↔client)
│       └── api.ts            ← REST API request/response types
└── tests/
    ├── routes/
    └── ws/
```

- [ ] `npm init` in `packages/server/`
- [ ] Install: `hono`, `@hono/node-server`, `socket.io`, `jsonwebtoken` (or `jose` for JWT)
- [ ] Install dev: `vitest`, `typescript`, `@types/node`
- [ ] Create `src/index.ts` — HTTP server that serves both Hono and Socket.IO

### 2.2 — Hono app with middleware

```typescript
// src/app.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';

const app = new Hono();

// Public routes (no auth)
app.route('/api/auth', authRoutes);
app.route('/api/health', healthRoutes);

// Protected routes (JWT required)
app.use('/api/games/*', jwt({ secret: JWT_SECRET }));
app.route('/api/games', lobbyRoutes);

export default app;
```

- [ ] CORS middleware allowing client origin (configurable)
- [ ] JWT middleware on protected routes
- [ ] Global error handler (catch-all, structured JSON errors)
- [ ] Health endpoint returning `{ status: 'ok', version, uptime }`

### 2.3 — Socket.IO server setup

```typescript
// src/ws/index.ts
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '../types/events';

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

// Auth middleware — validate JWT on connection
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const payload = verifyJWT(token);
    socket.data.userId = payload.sub;
    socket.data.userName = payload.name;
    next();
  } catch {
    next(new Error('Authentication failed'));
  }
});
```

- [ ] Socket.IO server attached to Node.js http.Server
- [ ] JWT auth middleware on socket connection
- [ ] `/lobby` namespace for game list updates
- [ ] `/game` namespace for in-game events
- [ ] Typed events interface (see 2.4)

### 2.4 — Define typed Socket.IO events

```typescript
// src/types/events.ts
interface ServerToClientEvents {
  // Lobby
  'lobby:gameList': (games: GameRoomSummary[]) => void;
  'lobby:gameCreated': (game: GameRoomSummary) => void;
  'lobby:gameRemoved': (gameId: string) => void;
  'lobby:playerCount': (count: number) => void;

  // Game
  'game:stateUpdate': (state: SerializedGameState) => void;
  'game:battleResult': (result: BattleResult) => void;
  'game:turnChanged': (data: TurnChangeData) => void;
  'game:aiAction': (action: GameAction) => void;
  'game:playerJoined': (player: PlayerInfo) => void;
  'game:playerLeft': (playerId: string) => void;
  'game:gameOver': (result: GameOverData) => void;
  'game:chat': (message: ChatMessage) => void;
  'game:error': (error: { code: string; message: string }) => void;
}

interface ClientToServerEvents {
  // Game actions
  'game:attack': (data: { from: number; to: number }, ack: AckFn) => void;
  'game:endTurn': (ack: AckFn) => void;
  'game:usePowerUp': (data: { type: string; territoryId: number }, ack: AckFn) => void;
  'game:surrender': (ack: AckFn) => void;
  'game:undo': (ack: AckFn) => void;

  // Alliance
  'game:proposeAlliance': (data: { targetPlayerId: number }, ack: AckFn) => void;
  'game:respondAlliance': (data: { proposalId: string; accept: boolean }, ack: AckFn) => void;

  // Chat
  'game:chat': (message: string) => void;
}
```

- [ ] Full typed event interfaces
- [ ] Shared between server and client (goes in `packages/shared/` or `packages/server/src/types/`)

### 2.5 — Static file serving (production)

In production, the server serves the built Vite client:

```typescript
import { serveStatic } from '@hono/node-server/serve-static';

// Serve client build
app.use('/*', serveStatic({ root: '../client/dist' }));

// SPA fallback
app.get('*', (c) => c.html(/* index.html */));
```

- [ ] Static file serving for production deployment
- [ ] SPA fallback route (all non-API routes → index.html)

### 2.6 — Dev workflow

- [ ] `npm run dev` in server: `tsx watch src/index.ts`
- [ ] Client Vite dev server proxies `/api` and `/socket.io` to backend
- [ ] Root `npm run dev` starts both (concurrently)

## Acceptance Criteria

- Server starts on port 3001 (configurable)
- `GET /api/health` returns OK
- Socket.IO connection succeeds with valid JWT
- Socket.IO connection rejected without JWT
- Client dev server proxies to backend
- Tests for auth middleware and health endpoint
