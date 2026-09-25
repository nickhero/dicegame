# Restore Local Gameplay Parity & Fallbacks

- **Status**: done
- **Priority**: 🔴 Critical
- **Depends on**: none
- **Files**:
  - `packages/client/src/scenes/GameScene.ts`
  - `packages/shared/src/game/PowerUps.ts`
  - `packages/shared/src/game/Alliance.ts`
  - `packages/shared/src/game/GameRules.ts`

## Description

The v2.0 multiplayer refactor replaced several action dispatch paths in `GameScene.ts` with online WebSocket intents (`if (!this.socketClient) return`). While attacks and turn endings were restored for local mode in commit `e5f58eb`, four critical single-player features remain disabled or completely broken when playing offline:

1. **Power-Ups (Reinforce & Fortify)**: Clicking "Use Reinforce" or completing a "Fortify" selection does nothing because `activateReinforce()` and `handleFortifyTarget()` immediately abort if `!this.socketClient`.
2. **Surrender**: The human player confirmation dialog ("Surrender? Yes / No") calls `executeHumanSurrender()`, which immediately aborts if `!this.socketClient`.
3. **Local Alliance Proposals**: `proposeAllianceToPlayer()` checks `if (!this.socketClient) return`, preventing human players from proposing non-aggression pacts to AI players.
4. **Local Alliance Proposal Acceptance**: When an AI proposes an alliance to player 0, clicking the "Accept" button only calls `this.socketClient.respondAlliance()`. When offline, no alliance is formed and the proposal is discarded.

## Tasks

- [x] **Power-Ups Local Execution**:
  - In `activateReinforce(territoryId)`: add local fallback branch using `useReinforce(territoryId, this.gameState)` from `@dicewars/shared`. Update territory graphics, log event, trigger sound effects, record action, and refresh UI.
  - In `handleFortifyTarget(targetId)`: add local fallback branch using `useFortify(sourceId, targetId, count, this.gameState)` from `@dicewars/shared`.
- [x] **Surrender Local Execution**:
  - In `executeHumanSurrender()`: when offline (`!this.isOnlineGame`), mark human player as surrendered/eliminated (`isAlive = false`), distribute territories via `distributeSurrenderedTerritories(this.gameState, humanId)`, log surrender event, check for game over condition, and if game continues, trigger `executeLocalEndTurn()`.
- [x] **Alliance Diplomacy Local Execution**:
  - In `proposeAllianceToPlayer(targetIndex)`: when offline, evaluate AI willingness via `aiWouldAcceptProposal(allianceState, gameState, proposal)`. If accepted, call `formAlliance()`, log success, record action; if rejected, display notification toast that AI declined.
  - In `showAllianceProposal(proposal)`: when offline, accept button invokes `formAlliance(this.gameState.allianceState!, proposal.fromPlayer, proposal.toPlayer, this.gameState.turnNumber)`, plays sound, records action, and refreshes UI.
- [x] **Manual & Verification Tests**:
  - Verified compilation and test runs across shared and client.
