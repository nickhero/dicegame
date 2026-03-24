# Shared Error Contract

**Used by**: All phases (server returns errors, client displays them)
**Location**: `packages/shared/src/types/errors.ts`

## Goal

Define a shared error shape and error code enum used by both REST API and WebSocket acknowledgements. Every error the server returns follows this contract.

## Error Shape

```typescript
// packages/shared/src/types/errors.ts

interface GameError {
  code: GameErrorCode;
  message: string;          // human-readable, safe to show in UI
  details?: Record<string, unknown>;  // optional debug info (dev mode only)
}

enum GameErrorCode {
  // Auth (1xx)
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_INVALID_TOKEN = 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_INVALID_NAME = 'AUTH_INVALID_NAME',
  AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',

  // Lobby (2xx)
  LOBBY_GAME_NOT_FOUND = 'LOBBY_GAME_NOT_FOUND',
  LOBBY_GAME_FULL = 'LOBBY_GAME_FULL',
  LOBBY_GAME_STARTED = 'LOBBY_GAME_STARTED',
  LOBBY_WRONG_PASSWORD = 'LOBBY_WRONG_PASSWORD',
  LOBBY_NOT_CREATOR = 'LOBBY_NOT_CREATOR',
  LOBBY_INVALID_CONFIG = 'LOBBY_INVALID_CONFIG',
  LOBBY_NOT_ENOUGH_PLAYERS = 'LOBBY_NOT_ENOUGH_PLAYERS',
  LOBBY_ALREADY_JOINED = 'LOBBY_ALREADY_JOINED',

  // Game actions (3xx)
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',
  GAME_NOT_PLAYING = 'GAME_NOT_PLAYING',
  GAME_NOT_YOUR_TURN = 'GAME_NOT_YOUR_TURN',
  GAME_INVALID_TERRITORY = 'GAME_INVALID_TERRITORY',
  GAME_CANNOT_ATTACK_FROM = 'GAME_CANNOT_ATTACK_FROM',
  GAME_INVALID_TARGET = 'GAME_INVALID_TARGET',
  GAME_ATTACK_OWN_TERRITORY = 'GAME_ATTACK_OWN_TERRITORY',
  GAME_NOT_ADJACENT = 'GAME_NOT_ADJACENT',
  GAME_PLAYER_DEAD = 'GAME_PLAYER_DEAD',

  // Power-ups (4xx)
  POWERUP_NOT_FOUND = 'POWERUP_NOT_FOUND',
  POWERUP_WRONG_TERRITORY = 'POWERUP_WRONG_TERRITORY',
  POWERUP_INVALID_SOURCE = 'POWERUP_INVALID_SOURCE',
  POWERUP_MAX_DICE = 'POWERUP_MAX_DICE',

  // Undo (5xx)
  UNDO_DISABLED = 'UNDO_DISABLED',
  UNDO_NO_SNAPSHOT = 'UNDO_NO_SNAPSHOT',

  // Alliance (6xx)
  ALLIANCE_DISABLED = 'ALLIANCE_DISABLED',
  ALLIANCE_ALREADY_ALLIED = 'ALLIANCE_ALREADY_ALLIED',
  ALLIANCE_TARGET_DEAD = 'ALLIANCE_TARGET_DEAD',
  ALLIANCE_SELF_TARGET = 'ALLIANCE_SELF_TARGET',
  ALLIANCE_PROPOSAL_NOT_FOUND = 'ALLIANCE_PROPOSAL_NOT_FOUND',

  // Connection (7xx)
  CONNECTION_GAME_ENDED = 'CONNECTION_GAME_ENDED',
  CONNECTION_NOT_IN_GAME = 'CONNECTION_NOT_IN_GAME',

  // Generic
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
}
```

## REST API Error Responses

```typescript
// HTTP error responses
// Status 400: validation errors (LOBBY_INVALID_CONFIG, AUTH_INVALID_NAME)
// Status 401: auth errors (AUTH_REQUIRED, AUTH_INVALID_TOKEN, AUTH_TOKEN_EXPIRED)
// Status 403: permission errors (LOBBY_NOT_CREATOR, GAME_NOT_YOUR_TURN)
// Status 404: not found (LOBBY_GAME_NOT_FOUND, GAME_NOT_FOUND)
// Status 409: conflict (LOBBY_ALREADY_JOINED, LOBBY_GAME_STARTED)
// Status 429: rate limit (AUTH_RATE_LIMITED, RATE_LIMITED)
// Status 500: internal (INTERNAL_ERROR)

// Hono error handler
app.onError((err, c) => {
  if (err instanceof GameException) {
    return c.json({ error: { code: err.code, message: err.message } }, err.httpStatus);
  }
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500);
});
```

## WebSocket Acknowledgement Format

```typescript
// Success
ack({ success: true, data?: any })

// Error
ack({ success: false, error: { code: GameErrorCode, message: string } })
```

## Client Error Handling

```typescript
// packages/client/src/network/errorHandler.ts

function handleGameError(error: GameError): void {
  switch (error.code) {
    case 'GAME_NOT_YOUR_TURN':
      showToast('Not your turn!', 'warning');
      break;
    case 'GAME_INVALID_TARGET':
      showToast('Invalid target', 'error');
      break;
    case 'AUTH_TOKEN_EXPIRED':
      authClient.refreshToken();
      break;
    case 'CONNECTION_GAME_ENDED':
      sceneManager.goToGameOver();
      break;
    default:
      showToast(error.message, 'error');
  }
}
```

- [ ] Define `GameError` interface in shared package
- [ ] Define `GameErrorCode` enum in shared package
- [ ] Create `GameException` class for server-side error throwing
- [ ] REST error handler maps to HTTP status codes
- [ ] WebSocket ack format standardized
- [ ] Client error handler with per-code behavior
- [ ] Tests: verify all error codes are reachable
