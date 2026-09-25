# Server Minor Fixes & Test Warnings Cleanup

- **Status**: done
- **Priority**: 🟢 Normal
- **Depends on**: none
- **Files**:
  - `packages/server/src/services/handleGameEnd.ts`
  - `packages/server/src/app.ts`

## Description

Address two minor technical defects and developer experience warnings in the server package:
1. **Unhandled TypeError in handleGameEnd**: When `handleGameEnd(gameId, game, db)` is called with an undefined `db` reference (as happens in unit tests that test `game:surrender` or game end without an instantiated SQLite database), `new MatchHistoryService(db)` throws:
   `TypeError: Cannot read properties of undefined (reading 'insert')`
   which logs an error to stderr during test suites.
2. **Static Asset Warning in Server Tests**: During `npm test` in `packages/server`, Hono logs:
   `serveStatic: root path '../../client/dist' is not found, are you sure it's correct?`
   whenever tests run before `packages/client` has been built.

## Tasks

- [x] **Guard `handleGameEnd.ts`**:
  - Add early return guard: `if (!db) return;` at the beginning of `handleGameEnd()`.
- [x] **Clean Up Static Serving Warning**:
  - In `packages/server/src/app.ts`: only register the `serveStatic` middleware if `config.nodeEnv === 'production'`, preventing warning pollution during automated test runs.
