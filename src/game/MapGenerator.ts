import { Territory, Point } from './Territory';
import { SeededRandom } from '../utils/random';

const GRID_COLS = 20;
const GRID_ROWS = 16;
const CELL_SIZE = 32;
const MAP_OFFSET_X = 60;
const MAP_OFFSET_Y = 60;

interface Cell {
  col: number;
  row: number;
  territory: number; // territory id, -1 if unassigned
}

/**
 * Generate a territory map using grid-based region growing.
 */
export function generateMap(
  territoryCount: number,
  rng: SeededRandom
): { territories: Territory[]; adjacency: Map<number, Set<number>> } {
  // 1. Create grid
  const grid: Cell[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      grid[r][c] = { col: c, row: r, territory: -1 };
    }
  }

  // 2. Seed territory centers — spread them out
  const seeds: Point[] = [];
  const minDist = Math.max(2, Math.floor(Math.sqrt((GRID_COLS * GRID_ROWS) / territoryCount)) - 1);

  let attempts = 0;
  while (seeds.length < territoryCount && attempts < 5000) {
    const c = rng.nextInt(1, GRID_COLS - 2);
    const r = rng.nextInt(1, GRID_ROWS - 2);
    attempts++;

    const tooClose = seeds.some(
      (s) => Math.abs(s.x - c) + Math.abs(s.y - r) < minDist
    );
    if (tooClose) continue;

    seeds.push({ x: c, y: r });
    grid[r][c].territory = seeds.length - 1;
  }

  const actualCount = seeds.length;

  // 3. Region growing — BFS from all seeds simultaneously
  type QueueItem = { col: number; row: number; territory: number };
  const queue: QueueItem[] = seeds.map((s, i) => ({
    col: s.x,
    row: s.y,
    territory: i,
  }));
  rng.shuffle(queue);

  const dirs = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
  ];

  let head = 0;
  while (head < queue.length) {
    const { col, row, territory } = queue[head++];

    for (const [dc, dr] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
      if (grid[nr][nc].territory !== -1) continue;

      grid[nr][nc].territory = territory;
      queue.push({ col: nc, row: nr, territory });
    }
  }

  // 4. Build territories from grid
  const territoryCells: Point[][] = Array.from({ length: actualCount }, () => []);
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const tid = grid[r][c].territory;
      if (tid >= 0) {
        territoryCells[tid].push({ x: c, y: r });
      }
    }
  }

  // 5. Build adjacency
  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < actualCount; i++) {
    adjacency.set(i, new Set());
  }

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const tid = grid[r][c].territory;
      if (tid < 0) continue;
      for (const [dc, dr] of dirs) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
        const nid = grid[nr][nc].territory;
        if (nid >= 0 && nid !== tid) {
          adjacency.get(tid)!.add(nid);
        }
      }
    }
  }

  // 6. Compute centers and build Territory objects
  const territories: Territory[] = territoryCells.map((cells, id) => {
    const cx = cells.reduce((s, p) => s + p.x, 0) / cells.length;
    const cy = cells.reduce((s, p) => s + p.y, 0) / cells.length;
    return {
      id,
      cells,
      center: {
        x: MAP_OFFSET_X + cx * CELL_SIZE + CELL_SIZE / 2,
        y: MAP_OFFSET_Y + cy * CELL_SIZE + CELL_SIZE / 2,
      },
      neighbors: Array.from(adjacency.get(id) || []),
      owner: -1,
      dice: 1,
    };
  });

  return { territories, adjacency };
}

/**
 * Assign territories evenly to players and distribute initial dice.
 */
export function assignTerritories(
  territories: Territory[],
  playerCount: number,
  rng: SeededRandom
): void {
  const indices = territories.map((_, i) => i);
  rng.shuffle(indices);

  // Assign owners round-robin
  for (let i = 0; i < indices.length; i++) {
    territories[indices[i]].owner = i % playerCount;
  }

  // Distribute initial dice (2–4 per territory)
  for (const t of territories) {
    t.dice = rng.nextInt(2, 4);
  }
}

export { CELL_SIZE, MAP_OFFSET_X, MAP_OFFSET_Y, GRID_COLS, GRID_ROWS };
