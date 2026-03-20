# Achievements System

- **Status**: pending
- **Phase**: 10
- **Depends on**: none
- **Files**: `src/game/Achievements.ts` (new), `src/scenes/MenuScene.ts`, `src/scenes/GameOverScene.ts`

## Description

Track gameplay milestones and display unlocked achievements in the menu. Encourages replayability.

## Achievements

- [ ] **Flawless Victory** — Win without losing a single battle
- [ ] **David vs Goliath** — Win a 1v8 (or similar extreme upset) battle
- [ ] **World Dominator** — Win on a Huge map
- [ ] **Speed Demon** — Win in under 10 turns
- [ ] **Pacifist Start** — End first turn without attacking
- [ ] **Comeback King** — Win after being reduced to 1 territory
- [ ] **Full House** — Hold all territories simultaneously

## Tasks

- [ ] Create Achievement definitions and unlock conditions
- [ ] Check conditions at relevant game events (battle, turn end, game over)
- [ ] Persist unlocked achievements in localStorage
- [ ] Show achievement popup when unlocked during gameplay
- [ ] Add achievements gallery to MenuScene
- [ ] Add tests for unlock condition logic
