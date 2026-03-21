# Alliance System

- **Status**: done
- **Phase**: 10
- **Depends on**: none
- **Files**: `src/game/Alliance.ts`, `src/game/AIPlayer.ts`, `src/scenes/GameScene.ts`, `src/rendering/MapRenderer.ts`, `src/game/GameRecorder.ts`, `src/game/EventFormatter.ts`, `src/game/GameState.ts`

## Description

AI players can propose temporary non-aggression pacts. Alliances last N turns and are shown visually. Breaking an alliance has a diplomatic penalty. Human can accept/reject proposals.

## Tasks

- [x] Create Alliance data model (parties, duration, turn created)
- [x] AI logic for proposing alliances (when mutually beneficial)
- [x] AI logic for honoring/breaking alliances
- [x] Diplomatic reputation system (breaking pacts reduces trust)
- [x] Human UI for accepting/rejecting alliance proposals
- [x] Visual indicator on map for allied territories
- [x] Event log entries for alliance events
- [x] Add tests for alliance logic
- [x] GameRecorder action types for alliance events
- [x] EventFormatter formatting for alliance events
- [x] Replay scene handles alliance actions
- [x] Integration tests (AI respects alliances, full simulation)
