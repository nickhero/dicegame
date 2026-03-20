# Map Shape Variants

- **Status**: done
- **Phase**: 4
- **Depends on**: `01-hex-grid`
- **Files**: `src/game/MapShapes.ts` (new), `src/game/MapGenerator.ts`

## Description

Add different map shapes beyond the default rectangle. Shapes define which cells are valid (mask), creating varied strategic landscapes.

### Shapes

1. **Rectangle** (current default) — Full grid, standard play
2. **Continent** — 2–3 land masses connected by narrow 1–2 cell bridges. Creates chokepoints.
3. **Ring** — Donut shape with empty center. Forces circular expansion.
4. **Diamond** — Diamond/rhombus shape. Smaller map with tight borders.
5. **Random Islands** — Multiple disconnected islands connected by single-cell bridges

### Implementation

```typescript
export type MapShape = 'rectangle' | 'continent' | 'ring' | 'diamond' | 'islands';

export function getShapeMask(shape: MapShape, cols: number, rows: number): boolean[][];
```

The mask function returns a 2D boolean grid — `true` means the cell is valid, `false` means it's out of bounds. MapGenerator respects the mask during region growing.

### Bridge Validation

For shapes with bridges (continent, islands): after generation, verify all territories are reachable. If not, regenerate with a different seed.

## Acceptance Criteria

- [ ] `MapShape` type and `getShapeMask()` exported from `MapShapes.ts`
- [ ] All 5 shapes produce valid, connected maps
- [ ] MapGenerator respects shape mask
- [ ] Tests for each shape variant
- [ ] SetupScene includes shape selector (if Phase 3 is done)
