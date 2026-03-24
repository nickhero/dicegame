# Phase 9: Polish, Testing & Deployment

**Priority**: 🟢 Nice to have (but needed for production)
**Depends on**: Phases 1-8
**Scope**: End-to-end testing, deployment, monitoring

## Tasks

### 9.1 — End-to-end testing

- [ ] Integration tests: full game lifecycle (create → join → play → finish)
- [ ] Multi-client simulation (simulate 4 WebSocket clients)
- [ ] Stress test: 50 concurrent games with AI
- [ ] Reconnection test: disconnect mid-game, reconnect, verify state
- [ ] Fuzz testing: random valid/invalid actions sequence

### 9.2 — Security hardening

- [ ] Rate limiting on all endpoints (express-rate-limit or Hono equivalent)
- [ ] Input validation on all user inputs (zod schemas)
- [ ] WebSocket message size limits
- [ ] Action flood protection (max N actions per second per socket)
- [ ] JWT secret rotation support
- [ ] CORS lockdown (specific origins only)
- [ ] Content Security Policy headers

### 9.3 — Monitoring & logging

- [ ] Structured JSON logging (pino or winston)
- [ ] Request ID tracing (correlate HTTP + WebSocket events)
- [ ] Metrics: active games, connected players, games/hour
- [ ] Health endpoint with detailed status
- [ ] Error reporting (uncaught exceptions, unhandled rejections)

### 9.4 — Deployment

- [ ] Dockerfile (multi-stage: build shared + server + client, serve from one container)
- [ ] Docker Compose for local dev (app + optional PostgreSQL)
- [ ] Environment variable configuration (PORT, JWT_SECRET, DB_PATH, CLIENT_ORIGIN)
- [ ] Production build script (`npm run build:prod`)
- [ ] Graceful shutdown (drain WebSocket connections, save active games)

### 9.5 — Performance

- [ ] Profile WebSocket message sizes (minimize payload)
- [ ] Connection pooling for DB
- [ ] Lazy-load game recordings (don't keep full recording in memory)
- [ ] Cleanup completed games from memory promptly

## Acceptance Criteria

- Full game lifecycle works end-to-end
- No known security vulnerabilities
- Deployable with Docker
- Observable via logs and metrics
- Handles concurrent games without degradation
