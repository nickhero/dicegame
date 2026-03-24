# Phase 4: Game Lobby & Room Management

**Priority**: 🔴 Critical
**Depends on**: Phase 3 (authentication)
**Scope**: REST API for game CRUD, WebSocket lobby updates, invite system

## Goal

Build the game browser where players can see available games, create new rooms, and join via browser or invite link.

## Tasks

### 4.1 — Game room data model

```sql
CREATE TABLE game_rooms (
  id TEXT PRIMARY KEY,                -- nanoid, e.g. "xK9v2m"
  name TEXT NOT NULL,                 -- "Niklas's Game"
  creator_id TEXT REFERENCES users(id),
  status TEXT DEFAULT 'waiting',      -- waiting | started | finished | abandoned
  password_hash TEXT,                 -- NULL = public, hashed = private
  invite_code TEXT UNIQUE,            -- short code for invite links
  config TEXT NOT NULL,               -- JSON: GameSetupConfig
  max_players INTEGER DEFAULT 4,
  current_player_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  winner_id TEXT REFERENCES users(id)
);

CREATE TABLE game_players (
  game_id TEXT REFERENCES game_rooms(id),
  user_id TEXT REFERENCES users(id),
  slot_index INTEGER NOT NULL,        -- 0-based player position
  is_ai BOOLEAN DEFAULT false,
  ai_personality TEXT,                -- NULL for humans
  is_spectator BOOLEAN DEFAULT false,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, user_id)
);
```

- [ ] Drizzle schema definitions
- [ ] GameRoom service (CRUD + state transitions)

### 4.2 — REST API: Game CRUD

```
GET    /api/games              ← List public games (status=waiting)
GET    /api/games/:id          ← Get game details (config, players, status)
POST   /api/games              ← Create new game room
PATCH  /api/games/:id          ← Update game config (creator only, before start)
DELETE /api/games/:id          ← Cancel game (creator only, before start)
POST   /api/games/:id/join     ← Join a game
POST   /api/games/:id/leave    ← Leave a game (before start)
POST   /api/games/:id/start    ← Start the game (creator only)
```

#### Create game request:
```json
{
  "name": "Quick Game",
  "config": {
    "playerCount": 4,
    "territoryCount": 24,
    "mapShape": "rectangle",
    "gridType": "hex",
    "speed": "normal",
    "powerUps": true,
    "fogOfWar": false,
    "alliances": true,
    "undoEnabled": false
  },
  "password": null,
  "aiSlots": [
    { "slot": 2, "personality": "aggressive" },
    { "slot": 3, "personality": "cautious" }
  ]
}
```

- [ ] Create game: validates config, generates invite code, stores in DB
- [ ] List games: returns `GameRoomSummary[]` (id, name, playerCount, maxPlayers, config preview)
- [ ] Join game: validates password (if set), checks capacity, assigns slot
- [ ] Leave game: removes player, notifies room
- [ ] Start game: validates enough players, transitions status, triggers game engine
- [ ] Delete game: only creator, only before start

### 4.3 — Invite links & password protection

#### Invite links:
```
https://dicewars.example.com/join/xK9v2m
```

- [ ] Generate short invite code on room creation (nanoid, 6 chars)
- [ ] `GET /api/games/invite/:code` → resolves to game room
- [ ] Client route `/join/:code` → auto-join or show "enter password" prompt

#### Password protection:
- [ ] Hash password with argon2id on create
- [ ] `POST /api/games/:id/join` requires `password` field for protected rooms
- [ ] Verify password hash on join
- [ ] Password shown as 🔒 icon in game browser

### 4.4 — WebSocket lobby namespace

```typescript
// /lobby namespace
namespace.on('connection', (socket) => {
  // Send current game list on connect
  socket.emit('lobby:gameList', getPublicGames());

  // Real-time updates
  onGameCreated((game) => socket.emit('lobby:gameCreated', game));
  onGameRemoved((gameId) => socket.emit('lobby:gameRemoved', gameId));
  onGameUpdated((game) => socket.emit('lobby:gameUpdated', game));
  onPlayerCountChanged((count) => socket.emit('lobby:playerCount', count));
});
```

- [ ] Lobby namespace broadcasts game list changes in real-time
- [ ] Player count updates when players connect/disconnect
- [ ] Debounce rapid updates (e.g., multiple joins in quick succession)

### 4.5 — Game room waiting room

When players join a game that hasn't started yet, they enter a waiting room:

```typescript
// /game namespace
socket.on('game:join', async (gameId) => {
  socket.join(`game:${gameId}`);
  // Notify other players in waiting room
  socket.to(`game:${gameId}`).emit('game:playerJoined', { ... });
});

socket.on('game:ready', () => {
  // Player signals they're ready
  socket.to(`game:${gameId}`).emit('game:playerReady', { ... });
});
```

- [ ] Players see who else is in the room
- [ ] Creator can rearrange player slots
- [ ] Creator can add/remove AI opponents
- [ ] "Ready" toggle for each player
- [ ] Creator clicks "Start" when all ready

### 4.6 — Auto-cleanup

- [ ] Abandoned rooms (status=waiting, no players, >10 min old) → delete
- [ ] Finished games → archive after 1 hour, keep recording
- [ ] Periodic cleanup job (every 5 minutes)

### 4.7 — Tests

- [ ] Create game with valid config
- [ ] Create game rejects invalid config
- [ ] Join game succeeds (public, with capacity)
- [ ] Join game fails (full, already started, wrong password)
- [ ] Invite code resolves correctly
- [ ] Start game validates minimum players
- [ ] Lobby broadcasts game list updates
- [ ] Cleanup removes stale rooms

## Acceptance Criteria

- Game browser shows available public games
- Players can create, join, and start games
- Invite links work for sharing with friends
- Password-protected games require correct password
- Real-time lobby updates via WebSocket
- Stale rooms auto-cleaned
