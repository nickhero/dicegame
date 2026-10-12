# Flutter Client Relaunch — Phase Overview

- **Goal**: Rebuild the DiceWars client as a high-performance, native cross-platform application (Desktop + Mobile) using Flutter & Dart.
- **Key Tenet**: Full offline singleplayer parity first, followed by online multiplayer integration with the existing Hono/Socket.IO backend.
- **Testing Standard**: Every Dart module must match the parity and determinism of the existing TypeScript `@dicewars/shared` test suite via `flutter test`.

## Tickets in this Phase

| Ticket | Title | Priority | Depends on |
|---|---|---|---|
| [`00-architecture-and-project-setup.md`](./00-architecture-and-project-setup.md) | Project Setup & Monorepo Integration | 🔴 Critical | none |
| [`01-dart-core-engine-port.md`](./01-dart-core-engine-port.md) | Port Core Game Engine & Models to Dart | 🔴 Critical | 00 |
| [`02-dart-ai-and-tactics-port.md`](./02-dart-ai-and-tactics-port.md) | Port AI Personalities, Power-Ups & Alliances | 🔴 Critical | 01 |
| [`03-game-controllers-and-state-management.md`](./03-game-controllers-and-state-management.md) | LocalGameController & Reactive State Architecture | 🔴 Critical | 01, 02 |
| [`04-map-rendering-custom-painter.md`](./04-map-rendering-custom-painter.md) | Hex & Square Map CustomPainter + Hit Testing | 🔴 Critical | 01, 03 |
| [`05-singleplayer-ui-and-screens.md`](./05-singleplayer-ui-and-screens.md) | Complete Singleplayer UI (Menu, Setup, Game, GameOver) | 🟡 High | 03, 04 |
| [`06-audio-and-game-feel.md`](./06-audio-and-game-feel.md) | Audio, Battle Animations & Juice | 🟢 Normal | 04, 05 |
| [`07-multiplayer-socket-client.md`](./07-multiplayer-socket-client.md) | OnlineGameController & Socket.IO Multiplayer Integration | 🟡 High | 03, 05 |
