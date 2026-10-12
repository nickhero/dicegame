# 07 - Multiplayer Socket Client and Online Game Integration

- **Status**: pending
- **Priority**: 🟡 High
- **Depends on**: `03-game-controllers-and-state-management.md`, `05-singleplayer-ui-and-screens.md`
- **Files**:
  - `packages/client_flutter/lib/network/socket_client.dart`
  - `packages/client_flutter/lib/network/auth_client.dart`
  - `packages/client_flutter/lib/network/lobby_client.dart`
  - `packages/client_flutter/lib/controllers/online_game_controller.dart`
  - `packages/client_flutter/lib/ui/screens/lobby_screen.dart`
  - `packages/client_flutter/lib/ui/screens/waiting_room_screen.dart`
  - `packages/client_flutter/lib/ui/widgets/chat_sheet.dart`
  - `packages/client_flutter/test/network/...`

## Description

Connect the Flutter client to the existing Hono + Socket.IO backend (`packages/server`). Implement user auth (JWT + Guest), lobby browser, waiting rooms, turn timers, real-time chat, and the `OnlineGameController`.

## Tasks

- [ ] Add `socket_io_client` & `http` dependencies.
- [ ] Implement `AuthClient` (Login, Register, Guest session token storage).
- [ ] Implement `LobbyClient` (Fetch room list, create room, join room).
- [ ] Implement `SocketClient` & `OnlineGameController`:
  - Listen to server game events (`game:state`, `game:turn`, `game:battle`, `game:powerup`, `game:alliance`).
  - Send player intents (`action:attack`, `action:endTurn`, `action:proposeAlliance`).
  - Manage turn timer countdown.
- [ ] Build Online UI:
  - `LobbyScreen`: List active rooms, player counts, create game modal.
  - `WaitingRoomScreen`: Slot toggles (open / AI), ready state, chat feed.
  - In-Game Chat overlay/sheet.
- [ ] Integration test connecting to local running backend (`http://localhost:3001`).
