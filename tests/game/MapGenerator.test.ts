import { describe, it, expect } from 'vitest';
import { generateMap, assignTerritories } from '../../src/game/MapGenerator';
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
