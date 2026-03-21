# Achievements System

- **Status**: done
- **Phase**: 10
- **Depends on**: none
- **Files**: `src/game/Achievements.ts`, `src/scenes/MenuScene.ts`, `src/scenes/GameOverScene.ts`, `src/scenes/GameScene.ts`

## Description

Track gameplay milestones and display unlocked achievements in the menu. Encourages replayability.

## Achievements

- [x] **Flawless Victory** — Win without losing a single battle
- [x] **David vs Goliath** — Win a 1v8 (or similar extreme upset) battle
- [x] **World Dominator** — Win on a Huge map
- [x] **Speed Demon** — Win in under 10 turns
- [x] **Pacifist Start** — End first turn without attacking
- [x] **Comeback King** — Win after being reduced to 1 territory
- [x] **Full House** — Hold all territories simultaneously
- [x] **On a Roll** — Win 3 battles in a row
- [x] **Underdog** — Win with fewest territories at game start
- [x] **Battle Hardened** — Win 50+ battles in a single game
- [x] **First Blood** — Win the first battle of the game
- [x] **Triple Kill** — Eliminate 3 opponents yourself

## Tasks

- [x] Create Achievement definitions and unlock conditions
- [x] Check conditions at relevant game events (game over)
- [x] Persist unlocked achievements in localStorage
- [x] Show newly unlocked achievements in GameOverScene
- [x] Add achievements gallery to MenuScene
- [x] Add tests for unlock condition logic (39 tests)
