# Hex Grid Map Generation

- **Status**: open
- **Phase**: 4
- **Depends on**: none
- **Files**: `src/game/MapGenerator.ts`

## Description

Add an alternative hex-based grid for map generation. Hex grids produce more organic, natural-looking territory shapes because each cell has 6 neighbors instead of 4.

### Hex Grid Layout

Use "offset coordinates" (odd-q) for simplicity:
- Even columns: neighbors are NE, E, SE, SW, W, NW
- Odd columns: offset by half a row

### Changes to MapGenerator

- Add `gridType: 'square' | 'hex'` parameter to `generateMap()`
- Hex grid BFS uses 6 directions instead of 4
- Hex cell rendering: each cell is a hexagon instead of a square
- Adjacency still detected by shared cell edges

### Visual

Hex cells need different rendering in MapRenderer:
- Each cell drawn as a hexagon (6-point polygon)
- Cell size remains ~32px but as hex radius
- Map offset adjusted for hex staggering

## Acceptance Criteria

- [ ] `generateMap()` accepts `gridType` parameter
- [ ] Hex grid produces valid territories with correct adjacency
- [ ] Adjacency is symmetric
- [ ] Every territory has ≥1 neighbor
- [ ] Tests cover hex grid variant
- [ ] MapRenderer draws hex cells correctly
- [ ] Square grid (default) behavior unchanged
