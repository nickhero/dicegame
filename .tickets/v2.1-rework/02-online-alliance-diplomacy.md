# Complete Online Alliance Diplomacy System

- **Status**: done
- **Priority**: 🔴 Critical
- **Depends on**: none
- **Files**:
  - `packages/shared/src/game/ServerTypes.ts`
  - `packages/server/src/services/GameEngine.ts`
  - `packages/server/src/services/AITurnRunner.ts`
  - `packages/server/src/ws/gameHandlers.ts`
  - `packages/client/src/scenes/GameScene.ts`
  - `packages/client/src/network/deserializeState.ts`
  - `packages/client/src/network/SocketClient.ts`

## Description

The backend currently registers `game:proposeAlliance` and `game:respondAlliance` socket handlers, but the online alliance cycle cannot actually complete between human players or between AI and human players online:

1. **Target Not Notified**: When Player A proposes an alliance to Player B via `game:proposeAlliance`, Player B is never sent a notification, event, or proposal modal.
2. **Wire State Missing Proposals**: `WireGameState` only serializes accepted alliances (`alliances: WireAlliance[]`), not pending incoming proposals.
3. **Turn-End Proposal Wiping**: `tickAlliances()` automatically clears all pending proposals at round end (`allianceState.proposals = []`), discarding human proposals before the recipient ever has an opportunity to respond.
4. **AI Never Proposes to Humans**: `AITurnRunner.processAllianceTick` explicitly filters out human targets: `if (!targetPlayer.isHuman && targetPlayer.isAlive)`. AI players never send proposals to online human players.

## Tasks

- [ ] **Protocol & Server Events**:
  - Add `game:allianceProposal` server-to-client event to `ServerTypes.ts`: `{ proposalId: string; fromPlayerIndex: number; toPlayerIndex: number; duration: number }`.
  - Add `alliancesEnabled: boolean` to `WireGameState`.
- [ ] **Proposal Routing in GameEngine / gameHandlers**:
  - In `gameHandlers.ts` on `game:proposeAlliance`: if `targetPlayerIndex` is an online human player, emit `game:allianceProposal` directly to that player's socket.
  - If `targetPlayerIndex` is an AI player: evaluate acceptance immediately using `aiWouldAcceptProposal()`, form alliance if accepted, and emit state update.
- [ ] **Preserve Human Proposals Across Round Ticks**:
  - Update `tickAlliances` or `GameEngine` so human-targeted proposals with remaining duration or response windows are not prematurely cleared on round tick.
- [ ] **AITurnRunner Online Proposals**:
  - In `AITurnRunner.processAllianceTick`: when an AI decides to propose an alliance to a human player, emit `game:allianceProposal` to the human player's socket.
- [ ] **Client UI Integration**:
  - Listen for `game:allianceProposal` in `GameScene.setupSocketListeners()`.
  - Display `showAllianceProposal(proposal)` dialog.
  - When user clicks Accept/Decline, emit `socketClient.respondAlliance(proposalId, accept)`.
- [ ] **Tests**:
  - Add server integration tests for human-to-human proposal/acceptance.
  - Add server integration tests for human-to-AI and AI-to-human online proposals.
