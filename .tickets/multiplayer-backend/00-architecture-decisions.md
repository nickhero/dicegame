# Architecture Decisions — Multiplayer DiceWars

## Overview

Transform the single-player browser game into a multiplayer client/server architecture where:
- **All game logic runs on the server** (server-authoritative)
- **Client is a thin renderer** that sends user intents and receives state updates
- **Real-time communication via WebSocket** (Socket.IO)
- **REST API for non-game operations** (auth, lobby, history)

---

## Decision Record

### DR-1: Monorepo Structure

**Decision**: Restructure into a monorepo with 3 packages.

```
packages/
  shared/     ← Pure game logic (current src/game/ + src/utils/)
  server/     ← Hono HTTP + Socket.IO WebSocket backend
  client/     ← Phaser 3 frontend (scenes + rendering)
```

**Rationale**: The existing `src/game/` directory is already Phaser-free and unit-testable. It can be extracted as a shared package imported by both server and client. TypeScript project references ensure type safety across boundaries.

**Tool**: npm workspaces (already using npm, no new tooling).

---

### DR-2: Backend Framework — Hono

**Decision**: Use [Hono](https://hono.dev) on Node.js for the HTTP/REST layer.

**Rationale**:
- Ultrafast, TypeScript-first, tiny footprint
- Built-in JWT middleware (`hono/jwt`), CORS (`hono/cors`), validation
- Works on Node.js via `@hono/node-server`
- Can serve the built Vite client as static files in production
- Familiar Express-like middleware pattern but modern
- Easy to test (request/response, no server boot needed)

**Alternatives considered**:
- **Fastify**: Heavier, plugin ecosystem overkill for this use case
- **Express**: No built-in TypeScript, aging middleware patterns
- **tRPC**: Great for type-safe APIs but adds complexity; we need WebSockets too

---

### DR-3: Real-Time — Socket.IO

**Decision**: Use Socket.IO for all real-time game communication.

**Rationale**:
- **Rooms**: Perfect mapping to game lobbies (`game:<id>`)
- **Namespaces**: Separate `/game` and `/lobby` concerns
- **Auto-reconnection**: Critical for games — player's browser tab sleeps, mobile network switch
- **Typed events**: Full TypeScript support with `ServerToClientEvents` / `ClientToServerEvents`
- **Broadcasting**: `io.to(room).emit()` for spectators + players
- **Fallback**: HTTP long-polling if WebSocket blocked (corporate firewalls)

**Why not raw WebSocket?**
Raw WS lacks rooms, reconnection, message acknowledgement, and broadcasting — all essential for a game lobby.

**Integration with Hono**: Socket.IO attaches to the Node.js `http.Server` instance alongside Hono. They share the same port.

---

### DR-4: Authentication — JWT + Guest Mode

**Decision**: JWT tokens with optional persistent accounts.

**Flow**:
1. **Guest login**: Client sends `POST /api/auth/guest` with a chosen display name → gets JWT
2. **Registered login** (future): `POST /api/auth/login` with username/password → gets JWT
3. JWT stored in memory (not localStorage — XSS risk) or httpOnly cookie
4. WebSocket connection sends JWT in handshake auth: `io({ auth: { token } })`
5. Socket.IO middleware validates JWT before allowing connection

**JWT payload**: `{ sub: visitorId, name: displayName, iat, exp }`

**Rationale**: Guest mode is essential — nobody wants to create an account to try a dice game. Persistent accounts are a future enhancement for stats/leaderboards.

---

### DR-5: Database — SQLite + Drizzle ORM

**Decision**: SQLite for persistence, Drizzle ORM for type-safe queries.

**Rationale**:
- Zero infrastructure — single file, no database server
- Drizzle is TypeScript-native, SQL-like syntax, excellent DX
- Perfect for single-server deployment (which this game will be)
- Can migrate to PostgreSQL later if needed (Drizzle supports both)

**What we store**:
- Users (guest + registered)
- Game rooms (config, state, password hash, invite codes)
- Match history (recordings, stats)
- Achievements (per-user unlocks)

**What we DON'T store**:
- Live game state (in-memory only — games are short-lived, <30 min)
- WebSocket sessions (Socket.IO handles this)

---

### DR-6: Game State Model — Server-Authoritative

**Decision**: Server owns all game state. Client never mutates game logic.

**Flow**:
```
Client                          Server
  │                               │
  │── intent:attack(from,to) ───→ │  validate + execute
  │                               │  broadcast result
  │←── event:battleResult(...) ──│
  │←── event:stateUpdate(...) ──│
  │                               │
  │── intent:endTurn() ─────────→ │  calculate bonus dice
  │                               │  run AI turns (all on server)
  │←── event:aiAction(...) ──────│  (multiple, with delays)
  │←── event:turnChanged(...) ──│
```

**Why server-authoritative?**
- Prevents cheating (can't manipulate dice rolls, can't attack invalid territories)
- AI runs on server (no client computation, spectators see same AI)
- Single source of truth — all clients see identical state
- Replay recording happens server-side

**State sync strategy**: Send diffs/events, not full state. Client applies events to its local copy. Periodic full-state sync as fallback for reconnection.

---

### DR-7: Game Room Lifecycle

```
CREATED  →  WAITING  →  STARTED  →  FINISHED
              ↑            │
              └── PAUSED ──┘  (if player disconnects, grace period)
```

- **CREATED**: Room exists, config set, creator is first player
- **WAITING**: Open for joins (via browser or invite link)
- **STARTED**: Game in progress, no new players (spectators OK)
- **PAUSED**: Human player disconnected, 60s grace period, then AI takes over or forfeit
- **FINISHED**: Winner determined, recording saved, room cleaned up after timeout

---

### DR-8: Single-Player on Backend

**Decision**: Single-player games also run on the server.

**Rationale**: Consistent architecture. The server creates a room with 1 human + N AI players. Same code path as multiplayer. Benefits:
- Server-side replay recording
- Server-side achievement tracking
- Anti-cheat for leaderboards
- Same reconnection logic if browser refreshes

**No offline mode**: The client always requires a server connection. This simplifies the architecture — no dual code paths, no local game logic in the client.

---

## Open Questions (to be resolved during implementation)

### OQ-1: Tick Rate / Animation Sync
How do we synchronize battle animations across clients? Options:
- **A**: Server sends action + timestamp, client plays animation at its own pace
- **B**: Server sends action, waits for client ACK before proceeding
- **Recommendation**: Option A — client plays animations independently, server just streams events. Clients with "instant" speed skip animations.

### OQ-2: Disconnect Handling
What happens when a multiplayer human disconnects?
- **Proposal**: 60-second grace period. If they reconnect, resume. If not, their slot converts to AI (using "balanced" personality). Game continues.
- **Alternative**: Pause game for all players during grace period.
- **Recommendation**: Convert to AI after timeout. Don't punish other players.

### OQ-3: Turn Timer
Should multiplayer turns have a time limit?
- **Proposal**: Configurable per-room. Default 60 seconds. When timer expires, auto-end-turn.
- Single-player: no timer (current behavior).

### OQ-4: Chat
Should game rooms have text chat?
- **Proposal**: Simple text chat in game rooms via Socket.IO. Low effort, high engagement.
- Consider: rate limiting, profanity filter (basic word list).

### OQ-5: Scaling
Current design is single-server (SQLite, in-memory game state). If scaling is ever needed:
- Move to PostgreSQL
- Use Redis for game state + pub/sub for multi-server Socket.IO
- But: this is a hobby game, single server handles 100s of concurrent games easily.

### OQ-6: Password Hashing
For registered accounts (future): bcrypt or argon2?
- **Recommendation**: argon2id (modern, recommended by OWASP)
- For now, guest-only means no password storage needed.
