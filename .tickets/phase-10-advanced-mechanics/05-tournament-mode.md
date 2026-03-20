# Tournament Mode

- **Status**: pending
- **Phase**: 10
- **Depends on**: `../phase-8-spectator/01-spectator-mode`
- **Files**: `src/scenes/TournamentScene.ts` (new), `src/game/Tournament.ts` (new)

## Description

Best-of-N game series against the same AI lineup. Track wins across rounds. Show a final leaderboard after the series.

## Tasks

- [ ] Create Tournament data model (rounds, results, standings)
- [ ] Add "Tournament" option in MenuScene/SetupScene
- [ ] Configure number of rounds (3, 5, 7)
- [ ] Auto-start next round after game over
- [ ] Track wins, losses, territories held across rounds
- [ ] Show between-round standings screen
- [ ] Final leaderboard with series MVP stats
- [ ] Add tests for tournament scoring
