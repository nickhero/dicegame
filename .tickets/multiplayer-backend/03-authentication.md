# Phase 3: Authentication System

**Priority**: 🔴 Critical
**Depends on**: Phase 2 (backend foundation)
**Scope**: Guest login, JWT issuance, session management

## Goal

Implement a minimal authentication system that lets players start playing immediately as guests, with the foundation for registered accounts later.

## Tasks

### 3.1 — Guest authentication

```
POST /api/auth/guest
Body: { "displayName": "Player1" }
Response: { "token": "eyJ...", "user": { "id": "guest_abc123", "name": "Player1", "isGuest": true } }
```

- [ ] Generate unique guest ID (UUID v4 or nanoid)
- [ ] Validate display name (2-20 chars, alphanumeric + spaces, no profanity)
- [ ] Issue JWT with 24h expiry: `{ sub: guestId, name, isGuest: true }`
- [ ] Store guest in DB (for game history, stats)
- [ ] Rate limiting: max 10 guest creations per IP per hour

### 3.2 — JWT middleware

- [ ] Hono middleware that extracts + verifies JWT from `Authorization: Bearer <token>` header
- [ ] Populates `c.get('user')` with decoded payload
- [ ] Returns 401 for missing/expired/invalid tokens
- [ ] Socket.IO middleware that verifies JWT from `socket.handshake.auth.token`
- [ ] Populates `socket.data.user` with decoded payload

### 3.3 — Token refresh

```
POST /api/auth/refresh
Headers: Authorization: Bearer <current-token>
Response: { "token": "eyJ...(new)" }
```

- [ ] Issue new JWT if current token is valid and within refresh window (e.g., last 4 hours of 24h expiry)
- [ ] Client-side: auto-refresh before expiry

### 3.4 — User model (DB)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,            -- UUID
  display_name TEXT NOT NULL,
  is_guest BOOLEAN DEFAULT true,
  password_hash TEXT,             -- NULL for guests
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP
);
```

- [ ] Drizzle ORM schema definition
- [ ] User CRUD service (create, findById, updateLastSeen)

### 3.5 — Registered accounts (future-ready, not implemented now)

Leave stubs/interfaces for:
- `POST /api/auth/register` — username + password → JWT
- `POST /api/auth/login` — username + password → JWT
- Password hashing with argon2id
- Email verification (optional)

**Do NOT implement yet** — just define the route stubs that return 501 Not Implemented.

### 3.6 — Tests

- [ ] Guest login creates user, returns valid JWT
- [ ] Guest login rejects invalid display names
- [ ] JWT middleware accepts valid tokens
- [ ] JWT middleware rejects expired tokens
- [ ] JWT middleware rejects malformed tokens
- [ ] Socket.IO auth middleware accepts/rejects correctly
- [ ] Token refresh works within refresh window
- [ ] Token refresh rejected outside refresh window
- [ ] Rate limiting blocks excessive guest creations

## Acceptance Criteria

- Player can get a JWT by providing a display name
- All protected endpoints verify JWT
- WebSocket connections require valid JWT
- Guest users stored in database
- Comprehensive test coverage for auth flows
