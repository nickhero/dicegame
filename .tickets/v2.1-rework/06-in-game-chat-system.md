# In-Game & Waiting Room Chat System

- **Status**: pending
- **Priority**: 🟢 Normal
- **Depends on**: none
- **Files**:
  - `packages/shared/src/game/ServerTypes.ts`
  - `packages/server/src/ws/gameHandlers.ts`
  - `packages/server/src/ws/waitingRoom.ts`
  - `packages/client/src/network/SocketClient.ts`
  - `packages/client/src/scenes/WaitingRoomScene.ts`
  - `packages/client/src/scenes/GameScene.ts`

## Description

The network layer contains remnants of a chat system:
- `SocketClient.ts` has `sendChat(message: string)` emitting `'game:chat'`.
- `ServerTypes.ts` defines `ClientToServerEvents['game:chat']`.

However, the server has no listener for `'game:chat'`, and neither `WaitingRoomScene` nor `GameScene` has an input field or message panel for in-game chat. Real-time multiplayer games require communication (taunts, alliance negotiation, coordination).

## Tasks

- [ ] **Server Chat Handler & Broadcast**:
  - In `packages/server/src/ws/gameHandlers.ts` and `packages/server/src/ws/waitingRoom.ts`:
    - Listen for `game:chat` payload `{ message: string }`.
    - Apply message validation: trim whitespace, limit length (max 140 chars), rate-limit (max 2 messages / second).
    - Sanitize input against script injection.
    - Broadcast `game:chat` to room namespace with `{ senderIndex: number; senderName: string; message: string; timestamp: number }`.
- [ ] **WaitingRoomScene Chat Panel**:
  - Add a lightweight chat feed and text input at the bottom or side of `WaitingRoomScene`.
  - Display chat messages with player name and assigned color.
- [ ] **GameScene Chat Overlay**:
  - Add collapsible or semi-transparent chat box (or integrate chat messages into the existing `EventLog` with a distinct format/icon 💬).
  - Add chat toggle button and input trigger (e.g. pressing 'Enter' or clicking a chat icon).
- [ ] **Tests**:
  - Add server tests verifying chat emission, room broadcast, and rate limiting.
