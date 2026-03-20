import { describe, it, expect } from 'vitest';
import { generateMap, assignTerritories, GRID_COLS, GRID_ROWS } from '../../src/game/MapGenerator';
import { getShapeMask, MapShape } from '../../src/game/MapShapes';
import { SeededRandom } from '../../src/utils/random';

describe('generateMap', () => {
  it('generates the requested number of territories', () => {
    const rng = new SeededRandom(42);
    const { territories } = generateMap(28, rng);
    expect(territories.length).toBe(28);
  });

  it('every territory has at least one neighbor', () => {
    const rng = new SeededRandom(42);
    const { territories } = generateMap(28, rng);
    for (const t of territories) {
      expect(t.neighbors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('adjacency is symmetric', () => {
    const rng = new SeededRandom(42);
    const { territories, adjacency } = generateMap(28, rng);
    for (const t of territories) {
      for (const nId of t.neighbors) {
        expect(adjacency.get(nId)!.has(t.id)).toBe(true);
      }
    }
  });

  it('every territory has cells', () => {
    const rng = new SeededRandom(42);
    const { territories } = generateMap(28, rng);
    for (const t of territories) {
      expect(t.cells.length).toBeGreaterThan(0);
    }
  });

  it('no cell belongs to two territories', () => {
    const rng = new SeededRandom(42);
    const { territories } = generateMap(28, rng);
    const cellSet = new Set<string>();
    for (const t of territories) {
      for (const c of t.cells) {
        const key = `${c.x},${c.y}`;
        expect(cellSet.has(key)).toBe(false);
        cellSet.add(key);
      }
    }
  });

  it('is deterministic with same seed', () => {
    const map1 = generateMap(20, new SeededRandom(42));
    const map2 = generateMap(20, new SeededRandom(42));
    expect(map1.territories.length).toBe(map2.territories.length);
    for (let i = 0; i < map1.territories.length; i++) {
      expect(map1.territories[i].center).toEqual(map2.territories[i].center);
      expect(map1.territories[i].neighbors.sort()).toEqual(
        map2.territories[i].neighbors.sort()
      );
    }
  });

  it('works with different territory counts', () => {
    for (const count of [10, 15, 20, 25, 30]) {
      const rng = new SeededRandom(count);
      const { territories } = generateMap(count, rng);
      // May not get exactly `count` if grid is too small, but should be close
      expect(territories.length).toBeGreaterThanOrEqual(count - 5);
      expect(territories.length).toBeLessThanOrEqual(count);
    }
  });
});

describe('generateMap (hex grid)', () => {
  it('generates valid territories', () => {
    const rng = new SeededRandom(42);
    const { territories } = generateMap(28, rng, 'hex');
    expect(territories.length).toBeGreaterThan(0);
    for (const t of territories) {
      expect(t.cells.length).toBeGreaterThan(0);
      expect(t.gridType).toBe('hex');
    }
  });

  it('hex territories have correct neighbor counts (up to 6)', () => {
    const rng = new SeededRandom(42);
    const { territories } = generateMap(28, rng, 'hex');
    for (const t of territories) {
      expect(t.neighbors.length).toBeLessThanOrEqual(6 * t.cells.length);
      // Each territory should have a reasonable number of neighbors
      expect(t.neighbors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('adjacency is symmetric for hex grid', () => {
    const rng = new SeededRandom(42);
    const { territories, adjacency } = generateMap(28, rng, 'hex');
    for (const t of territories) {
      for (const nId of t.neighbors) {
        expect(adjacency.get(nId)!.has(t.id)).toBe(true);
      }
    }
  });

  it('every hex territory has at least 1 neighbor', () => {
    const rng = new SeededRandom(99);
    const { territories } = generateMap(20, rng, 'hex');
    for (const t of territories) {
      expect(t.neighbors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('hex grid produces similar territory count to square grid', () => {
    for (const count of [15, 20, 25]) {
      const hexResult = generateMap(count, new SeededRandom(count), 'hex');
      const squareResult = generateMap(count, new SeededRandom(count), 'square');
      // Both should produce close to the requested count
      expect(hexResult.territories.length).toBeGreaterThanOrEqual(count - 5);
      expect(hexResult.territories.length).toBeLessThanOrEqual(count);
      expect(squareResult.territories.length).toBeGreaterThanOrEqual(count - 5);
    }
  });

  it('no cell belongs to two hex territories', () => {
    const rng = new SeededRandom(42);
    const { territories } = generateMap(28, rng, 'hex');
    const cellSet = new Set<string>();
    for (const t of territories) {
      for (const c of t.cells) {
        const key = `${c.x},${c.y}`;
        expect(cellSet.has(key)).toBe(false);
        cellSet.add(key);
      }
    }
  });
});

describe('assignTerritories', () => {
  it('assigns all territories to players', () => {
    const rng = new SeededRandom(42);
    const { territories } = generateMap(28, rng);
    assignTerritories(territories, 4, rng);

    for (const t of territories) {
      expect(t.owner).toBeGreaterThanOrEqual(0);
      expect(t.owner).toBeLessThan(4);
    }
  });

  it('distributes territories roughly evenly', () => {
    const rng = new SeededRandom(42);
    const { territories } = generateMap(28, rng);
    assignTerritories(territories, 4, rng);

    const counts = [0, 0, 0, 0];
    for (const t of territories) {
      counts[t.owner]++;
    }

    // Each player should have 7 territories (28/4)
    for (const c of counts) {
      expect(c).toBe(7);
    }
  });

  it('assigns dice between 2 and 4', () => {
    const rng = new SeededRandom(42);
    const { territories } = generateMap(28, rng);
    assignTerritories(territories, 4, rng);

    for (const t of territories) {
      expect(t.dice).toBeGreaterThanOrEqual(2);
      expect(t.dice).toBeLessThanOrEqual(4);
    }
  });
});

describe('generateMap (map shapes)', () => {
  const shapes: MapShape[] = ['rectangle', 'diamond', 'ring', 'continent'];

  for (const shape of shapes) {
    it(`${shape} shape produces valid territories`, () => {
      const rng = new SeededRandom(42);
      const { territories } = generateMap(20, rng, 'square', shape);
      expect(territories.length).toBeGreaterThan(0);
      for (const t of territories) {
        expect(t.cells.length).toBeGreaterThan(0);
        expect(t.neighbors.length).toBeGreaterThanOrEqual(1);
      }
    });
  }

  for (const shape of shapes) {
    it(`${shape} shape has symmetric adjacency`, () => {
      const rng = new SeededRandom(42);
      const { territories, adjacency } = generateMap(20, rng, 'square', shape);
      for (const t of territories) {
        for (const nId of t.neighbors) {
          expect(adjacency.get(nId)!.has(t.id)).toBe(true);
        }
      }
    });
  }

  it('diamond shape has fewer cells than rectangle', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);
    const rectResult = generateMap(20, rng1, 'square', 'rectangle');
    const diamondResult = generateMap(20, rng2, 'square', 'diamond');
    const rectCells = rectResult.territories.reduce((s, t) => s + t.cells.length, 0);
    const diamondCells = diamondResult.territories.reduce((s, t) => s + t.cells.length, 0);
    expect(diamondCells).toBeLessThan(rectCells);
  });

  it('ring shape has empty center', () => {
    const mask = getShapeMask('ring', GRID_COLS, GRID_ROWS);
    const centerCol = Math.floor((GRID_COLS - 1) / 2);
    const centerRow = Math.floor((GRID_ROWS - 1) / 2);
    // Center cells should be invalid
    expect(mask[centerRow][centerCol]).toBe(false);
    expect(mask[centerRow][centerCol + 1]).toBe(false);
  });

  it('continent shape has a bridge connecting two land masses', () => {
    const mask = getShapeMask('continent', GRID_COLS, GRID_ROWS);
    const splitCol = Math.floor(GRID_COLS * 0.4);
    const gapLeft = splitCol - 1;
    const gapRight = splitCol;
    const bridgeMidRow = Math.floor(GRID_ROWS / 2);

    // Gap cells outside bridge should be invalid
    expect(mask[0][gapLeft]).toBe(false);
    expect(mask[0][gapRight]).toBe(false);

    // Bridge cells should be valid
    expect(mask[bridgeMidRow - 1][gapLeft]).toBe(true);
    expect(mask[bridgeMidRow - 1][gapRight]).toBe(true);
    expect(mask[bridgeMidRow][gapLeft]).toBe(true);
    expect(mask[bridgeMidRow][gapRight]).toBe(true);

    // Left and right land masses should exist
    expect(mask[0][0]).toBe(true);
    expect(mask[0][GRID_COLS - 1]).toBe(true);
  });

  it('default behavior is unchanged (no shape param)', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);
    const defaultResult = generateMap(20, rng1);
    const rectResult = generateMap(20, rng2, 'square', 'rectangle');
    expect(defaultResult.territories.length).toBe(rectResult.territories.length);
    for (let i = 0; i < defaultResult.territories.length; i++) {
      expect(defaultResult.territories[i].center).toEqual(rectResult.territories[i].center);
    }
  });
});
