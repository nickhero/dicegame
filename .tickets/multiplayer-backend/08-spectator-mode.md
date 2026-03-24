# Phase 8: Spectator Mode — Server-Side

**Priority**: 🟡 Important
**Depends on**: Phase 5 (game engine)
**Scope**: Server-side spectator support, live spectating

## Goal

Enable spectators to watch any in-progress game in real-time via WebSocket, including joining mid-game.

## Tasks

### 8.1 — Spectator join flow

```typescript
// REST
POST /api/games/:id/spectate    ← Join as spectator

// WebSocket
socket.on('game:spectate', (gameId) => {
  socket.join(`game:${gameId}:spectators`);
  socket.join(`game:${gameId}`);  // also join main room for game events
  socket.emit('game:stateUpdate', engine.getFullState(gameId));
});
```

- [ ] Spectators can join any game (public or with invite link)
- [ ] Spectators receive full state on join (mid-game catch-up)
- [ ] Spectators receive all game events (same as players)
- [ ] Spectators cannot send game actions (server rejects)
- [ ] Spectator count broadcasted to room

### 8.2 — Spectator-specific features

- [ ] Spectators see fog-of-war lifted (they see all territories)
- [ ] Spectator count shown in game browser + in-game HUD
- [ ] Spectators can leave without affecting the game
- [ ] "Spectating" indicator in client UI

### 8.3 — All-AI spectate games

Allow creating games with all AI players (no humans):
- [ ] Creator can start a game with 0 human slots
- [ ] Server runs all AI turns automatically
- [ ] Creator and others join as spectators
- [ ] Useful for tournaments, demonstrations, testing

### 8.4 — Tests

- [ ] Spectator joins mid-game, receives correct state
- [ ] Spectator cannot send game actions
- [ ] Spectator count updates correctly
- [ ] All-AI game runs to completion
- [ ] Multiple spectators see same events

## Acceptance Criteria

- Players can spectate any public in-progress game
- Spectators see real-time game events
- All-AI games work for spectating
- Spectator actions properly restricted
