# Phase 7: Persistence Layer — Database Migration

**Priority**: 🟡 Important
**Depends on**: Phase 3 (auth), Phase 5 (game engine)
**Scope**: Replace localStorage with server-side database storage

## Goal

Move all persistent data (match history, achievements, preferences, custom AI presets) from browser localStorage to the server database, enabling cross-device access and proper data ownership.

## Tasks

### 7.1 — Database schema for game data

```sql
-- Match history
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES game_rooms(id),
  recording TEXT NOT NULL,          -- JSON: GameRecording
  stats TEXT,                       -- JSON: computed stats
  seed TEXT,
  config TEXT NOT NULL,             -- JSON: GameSetupConfig
  winner_index INTEGER,
  turn_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE match_players (
  match_id TEXT REFERENCES matches(id),
  user_id TEXT REFERENCES users(id),  -- NULL for AI
  player_index INTEGER NOT NULL,
  is_ai BOOLEAN DEFAULT false,
  ai_personality TEXT,
  is_winner BOOLEAN DEFAULT false,
  PRIMARY KEY (match_id, player_index)
);

-- Achievements
CREATE TABLE user_achievements (
  user_id TEXT REFERENCES users(id),
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  match_id TEXT REFERENCES matches(id),  -- which game unlocked it
  PRIMARY KEY (user_id, achievement_id)
);

-- User preferences
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  preferences TEXT NOT NULL          -- JSON: saved game config preferences
);

-- Custom AI presets
CREATE TABLE custom_ai_presets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  config TEXT NOT NULL,              -- JSON: personality config
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] Drizzle schema definitions
- [ ] Migrations

### 7.2 — REST API for user data

```
GET    /api/me/history          ← Match history for current user
GET    /api/me/history/:id      ← Single match detail + recording
DELETE /api/me/history/:id      ← Delete a match from history

GET    /api/me/achievements     ← Unlocked achievements
GET    /api/me/preferences      ← Saved game preferences
PUT    /api/me/preferences      ← Update preferences

GET    /api/me/ai-presets       ← Custom AI presets
POST   /api/me/ai-presets       ← Create preset
PUT    /api/me/ai-presets/:id   ← Update preset
DELETE /api/me/ai-presets/:id   ← Delete preset
```

- [ ] History service: save match, list user matches, get recording
- [ ] Achievement service: check + unlock, list unlocked
- [ ] Preferences service: save/load user preferences
- [ ] AI preset service: CRUD custom presets

### 7.3 — Client migration

- [ ] Replace `localStorage.getItem/setItem` calls with API calls
- [ ] Async loading (show loading state in UI)
- [ ] Caching: cache preferences/achievements in memory, write-through to server
- [ ] Handle API errors gracefully (show error, use cached data)
- [ ] Remove localStorage shims from shared package

### 7.4 — Data migration path

For existing players who have localStorage data:
- [ ] On first login, check if localStorage has data
- [ ] If yes, offer to upload to server account
- [ ] One-time migration: POST /api/me/migrate with localStorage dump
- [ ] Clear localStorage after successful migration

### 7.5 — Tests

- [ ] History CRUD operations
- [ ] Achievement unlock + persistence
- [ ] Preferences save/load
- [ ] AI preset CRUD
- [ ] Concurrent access (two requests for same user)
- [ ] Migration from localStorage

## Acceptance Criteria

- All persistent data stored server-side
- Match history viewable from any device (same account)
- Achievements tracked per-user on server
- Custom AI presets synced to server
- One-time migration from localStorage
- No data loss during migration
