# Multiplayer Backend — Ticket Index

## Architecture
- [00 — Architecture Decisions](./00-architecture-decisions.md) — Framework choices, data model, open questions
- [Shared Error Contract](./shared-error-contract.md) — `GameError` shape + `GameErrorCode` enum used by all phases

## Implementation Phases

| # | Ticket | Priority | Depends On | Description |
|---|--------|----------|------------|-------------|
| 1 | [Monorepo Setup](./01-monorepo-setup.md) | 🔴 Critical | — | npm workspaces, extract shared package, Copilot instructions |
| 2 | [Backend Foundation](./02-backend-foundation.md) | 🔴 Critical | Phase 1 | Hono + Socket.IO scaffold, middleware |
| 3 | [Authentication](./03-authentication.md) | 🔴 Critical | Phase 2 | JWT guest login, token management |
| 4 | [Game Lobby](./04-game-lobby.md) | 🔴 Critical | Phase 3 | Game browser, rooms, invites, passwords |
| 5a | [Game Engine Core](./05a-game-engine-core.md) | 🔴 Critical | Phase 1, 4 | GameEngine class, attack/endTurn/powerUps/undo/surrender/alliance |
| 5b | [AI Turn Loop](./05b-ai-turn-loop.md) | 🔴 Critical | Phase 5a | Server-side AI execution with timing, instant mode, spectator games |
| 5c | [Disconnect/Fog/Timer](./05c-disconnect-fog-timer.md) | 🔴 Critical | Phase 5a, 5b | Disconnect grace period, fog-of-war filtering, turn timer |
| 6 | [Client Refactoring](./06-client-refactoring.md) | 🔴 Critical | Phase 5a-c | WebSocket client, GameScene surgery plan, new scenes |
| 7 | [Persistence Layer](./07-persistence-layer.md) | 🟡 Important | Phase 3, 5a | SQLite + Drizzle, replace localStorage |
| 8 | [Spectator Mode](./08-spectator-mode.md) | 🟡 Important | Phase 5b | Server-side spectating |
| 9 | [Polish & Deployment](./09-polish-deployment.md) | 🟢 Nice to have | All | E2E tests, Docker, security, monitoring |

## Dependency Graph

```
Phase 1 (Monorepo + Copilot Instructions)
  ├── Phase 2 (Backend Foundation)
  │     └── Phase 3 (Auth)
  │           └── Phase 4 (Lobby)
  │                 └── Phase 5a (Game Engine Core) ← also depends on Phase 1
  │                       ├── Phase 5b (AI Turn Loop)
  │                       │     └── Phase 5c (Disconnect/Fog/Timer) ← also depends on 5a
  │                       │           └── Phase 6 (Client Refactor) ← depends on 5a-c
  │                       ├── Phase 7 (Persistence) ← also depends on Phase 3
  │                       └── Phase 8 (Spectator) ← depends on 5b
  └───────────────────────── Phase 9 (Polish) ← depends on all
```

## Parallelism Opportunities

```
After Phase 5a completes:
  ├── 5b (AI loop)     ─┐
  ├── 7  (Persistence)  ├── can run in parallel
  └── 8  (Spectator)*   ┘   (*after 5b)

After Phase 5c completes:
  └── 6  (Client refactor) — sequential, high-risk

Within phases:
  - Phase 2: route files can be written in parallel
  - Phase 4: REST endpoints + WebSocket namespace in parallel
  - Phase 5a: attack/endTurn/powerUp handlers in parallel
  - Phase 6: new scenes (Login/Lobby/WaitingRoom) in parallel with GameScene surgery
```

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| HTTP Server | **Hono** on Node.js | TypeScript-first, built-in JWT/CORS, ultrafast |
| WebSocket | **Socket.IO v4** | Rooms, reconnection, typed events, broadcasting |
| Database | **SQLite** + **Drizzle ORM** | Zero-infra, type-safe, migrates to PostgreSQL |
| Auth | **JWT** (jose or jsonwebtoken) | Stateless, works for HTTP + WebSocket |
| Shared Logic | `@dicewars/shared` package | Existing pure TS game logic, already tested |
| Client | **Phaser 3** (existing) | Thin renderer, sends intents via WebSocket |
| Build | **npm workspaces** | Native, no extra tooling |

## Key Principles

1. **Server-authoritative** — ALL game logic runs on server. Client sends intents, server validates.
2. **No offline mode** — Client always requires server connection. Simplifies architecture.
3. **Shared code** — Game rules, AI, battle logic in `@dicewars/shared` used by server.
4. **Guest-first** — Players can play immediately without registration.
5. **Graceful disconnection** — 60s grace period, then convert to AI.
6. **Test-driven** — Each phase includes its own test suite.
7. **Shared error contract** — All errors use `GameErrorCode` enum, consistent shape across REST + WebSocket.
