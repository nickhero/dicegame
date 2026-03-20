# Alliance System

- **Status**: pending
- **Phase**: 10
- **Depends on**: none
- **Files**: `src/game/Alliance.ts` (new), `src/game/AIPlayer.ts`, `src/scenes/GameScene.ts`

## Description

AI players can propose temporary non-aggression pacts. Alliances last N turns and are shown visually. Breaking an alliance has a diplomatic penalty. Human can accept/reject proposals.

## Tasks

- [ ] Create Alliance data model (parties, duration, turn created)
- [ ] AI logic for proposing alliances (when mutually beneficial)
- [ ] AI logic for honoring/breaking alliances
- [ ] Diplomatic reputation system (breaking pacts reduces trust)
- [ ] Human UI for accepting/rejecting alliance proposals
- [ ] Visual indicator on map for allied territories
- [ ] Event log entries for alliance events
- [ ] Add tests for alliance logic
