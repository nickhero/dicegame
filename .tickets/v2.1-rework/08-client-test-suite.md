# Establish Automated Test Suite for packages/client

- **Status**: done
- **Priority**: 🟡 High
- **Depends on**: none
- **Files**:
  - `packages/client/package.json`
  - `packages/client/vitest.config.ts`
  - `packages/client/tests/network/deserializeState.test.ts`
  - `packages/client/tests/network/AuthClient.test.ts`
  - `packages/client/tests/network/LobbyClient.test.ts`
  - `packages/client/tests/network/SocketClient.test.ts`
  - `package.json`

## Description

While `packages/shared` has extensive unit tests and `packages/server` has 304 unit/e2e tests, `packages/client` previously had **0 automated tests**. Regressions in state deserialization, event handling, socket reconnection, and UI state tracking could occur completely unnoticed during development.

## Tasks

- [x] **Configure Vitest for Client Workspace**:
  - Add `vitest` and `happy-dom` configuration to `packages/client/package.json` and `packages/client/vitest.config.ts`.
  - Add `npm run test` script to `packages/client/package.json` and ensure root `npm run test:all` executes client tests.
- [x] **State Deserialization Tests**:
  - Test `deserializeWireState.ts`: ensure territories, players, alliances, and power-up locations deserialize without error into valid client `GameState`.
- [x] **Network Layer Tests**:
  - Test `SocketClient.ts`: connection state transitions, notification listeners, rejecting action promises when disconnected.
  - Test `AuthClient.ts`: guest login, credential persistence, logout, error handling.
  - Test `LobbyClient.ts`: REST request formation, token attachment, 401 handling, game creation.
