import { describe, it, expect } from 'vitest';
import { getShapeMask, MapShape } from '../../src/game/MapShapes';
import { generateMap } from '../../src/game/MapGenerator';
import { SeededRandom } from '../../src/utils/random';
import { findConnectedComponents } from '../../src/utils/graph';

describe('MapShapes', () => {
  const shapes: MapShape[] = ['rectangle', 'diamond', 'ring', 'continent', 'islands'];

  shapes.forEach((shape) => {
    it(`generates valid dimensions for ${shape}`, () => {
      const mask = getShapeMask(shape, 20, 16);
      expect(mask.length).toBe(16);
      expect(mask[0].length).toBe(20);
      const trueCount = mask.flat().filter(Boolean).length;
      expect(trueCount).toBeGreaterThan(0);
      expect(trueCount).toBeLessThanOrEqual(20 * 16);
    });
  });

  describe('islands shape', () => {
    it('creates land and water regions with balanced fill ratio', () => {
      const mask = getShapeMask('islands', 20, 16);
      const totalCells = 20 * 16;
      const landCount = mask.flat().filter(Boolean).length;
      const fillRatio = landCount / totalCells;

      // Expect between 35% and 65% land coverage
      expect(fillRatio).toBeGreaterThan(0.35);
      expect(fillRatio).toBeLessThan(0.65);
    });

    it('ensures all active cells form a single connected component via BFS', () => {
      for (const [cols, rows] of [[20, 16], [15, 12], [28, 22], [32, 24]]) {
        const mask = getShapeMask('islands', cols, rows);
        let start: { r: number; c: number } | null = null;
        let totalLand = 0;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (mask[r][c]) {
              totalLand++;
              if (!start) start = { r, c };
            }
          }
        }

        expect(start).not.toBeNull();
        expect(totalLand).toBeGreaterThan(0);

        // BFS connectivity check
        const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
        const queue = [start!];
        visited[start!.r][start!.c] = true;
        let visitedCount = 0;

        while (queue.length > 0) {
          const current = queue.shift()!;
          visitedCount++;

          const neighbors = [
            [current.r - 1, current.c],
            [current.r + 1, current.c],
            [current.r, current.c - 1],
            [current.r, current.c + 1],
          ];

          for (const [nr, nc] of neighbors) {
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              if (mask[nr][nc] && !visited[nr][nc]) {
                visited[nr][nc] = true;
                queue.push({ r: nr, c: nc });
              }
            }
          }
        }

        expect(visitedCount).toBe(totalLand);
      }
    });

    it('generates playable maps in MapGenerator for square and hex grids', () => {
      const rng1 = new SeededRandom(12345);
      const squareMap = generateMap(20, rng1, 'square', 'islands');
      expect(squareMap.territories.length).toBeGreaterThanOrEqual(15);
      const squareNodes = squareMap.territories.map((t) => t.id);
      const squareComponents = findConnectedComponents(squareNodes, squareMap.adjacency);
      expect(squareComponents.length).toBe(1);

      const rng2 = new SeededRandom(67890);
      const hexMap = generateMap(20, rng2, 'hex', 'islands');
      expect(hexMap.territories.length).toBeGreaterThanOrEqual(15);
      const hexNodes = hexMap.territories.map((t) => t.id);
      const hexComponents = findConnectedComponents(hexNodes, hexMap.adjacency);
      expect(hexComponents.length).toBe(1);
    });
  });
});
