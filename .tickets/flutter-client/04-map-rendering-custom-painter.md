# 04 - Map Rendering with CustomPainter and Hit Testing

- **Status**: pending
- **Priority**: 🔴 Critical
- **Depends on**: `01-dart-core-engine-port.md`, `03-game-controllers-and-state-management.md`
- **Files**:
  - `packages/client_flutter/lib/ui/game/map_widget.dart`
  - `packages/client_flutter/lib/ui/game/painters/map_painter.dart`
  - `packages/client_flutter/lib/ui/game/painters/territory_path_builder.dart`
  - `packages/client_flutter/lib/ui/game/painters/dice_stack_painter.dart`
  - `packages/client_flutter/test/ui/map_widget_test.dart`

## Description

Implement the core game board using Flutter's high-performance `CustomPainter`. The painter renders polygon boundaries for territories, player color fills, alliance outlines, fog of war masks, and isometric/stacked 2D pixel-art dice on territory centers, with responsive scaling and precise touch/pointer hit testing.

## Tasks

- [ ] Build `TerritoryPathBuilder` to generate smooth `Path` objects for square and hexagon grid cells.
- [ ] Implement `MapPainter`:
  - Draw territory fills by owner color.
  - Draw dark borders and cyan/highlight borders for allied or selected territories.
  - Draw fog-of-war dark overlay for undiscovered territories.
  - Render pulsing/highlight outlines on valid attack targets.
- [ ] Implement `DiceStackPainter`:
  - Render clean, readable dice stacks (1–8 dice) centered on each territory.
  - Support high-DPI scaling and clean pixel-style aesthetics.
- [ ] Implement interaction & hit-testing:
  - Coordinate transformations (fit/center map in available screen viewport).
  - Detect tap/click on territory polygons (`Path.contains(offset)`).
- [ ] Write widget tests for tap selection and highlight states.
