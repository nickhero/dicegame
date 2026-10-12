# 05 - Singleplayer UI and Screens

- **Status**: pending
- **Priority**: 🟡 High
- **Depends on**: `03-game-controllers-and-state-management.md`, `04-map-rendering-custom-painter.md`
- **Files**:
  - `packages/client_flutter/lib/ui/screens/menu_screen.dart`
  - `packages/client_flutter/lib/ui/screens/setup_screen.dart`
  - `packages/client_flutter/lib/ui/screens/game_screen.dart`
  - `packages/client_flutter/lib/ui/screens/game_over_screen.dart`
  - `packages/client_flutter/lib/ui/widgets/hud_overlay.dart`
  - `packages/client_flutter/lib/ui/widgets/battle_dialog.dart`
  - `packages/client_flutter/lib/ui/widgets/player_panel.dart`
  - `packages/client_flutter/lib/ui/widgets/turn_controls.dart`
  - `packages/client_flutter/test/ui/...`

## Description

Create the full suite of singleplayer UI screens and HUD components using standard, declarative Flutter widgets.

## Tasks

- [ ] Build `MenuScreen`:
  - New Game, Match History, Achievements, Help / Rules dialog.
- [ ] Build `SetupScreen`:
  - Player configuration (2–6 players, human vs AI, AI personality selection).
  - Map settings (Size: S/M/L/XL, Shape: Rectangle, Diamond, Ring, Continent, Islands, Grid: Square/Hex).
  - Toggles (Power-ups, Fog of War, Alliances).
- [ ] Build In-Game HUD:
  - `PlayerPanel`: List of active players, territory counts, dice counts, current turn indicator, alliance badges.
  - `TurnControls`: End Turn button, Undo button, Speed controls (1x, 2x, 3x), Surrender/Leave button.
  - `BattleDialog`: Modal / animated overlay showing attacker vs defender dice rolls, sums, and outcome.
- [ ] Build `GameOverScreen`:
  - Victory / Defeat announcement.
  - Final stats summary and return to menu option.
- [ ] Write widget tests for screen transitions and button interactions.
