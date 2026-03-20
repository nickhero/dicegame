import { Territory, Point } from './Territory';
import { SeededRandom } from '../utils/random';
import { MapShape, getShapeMask } from './MapShapes';

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

// Hex neighbor offsets (odd-q offset coordinates)
const HEX_DIRS_EVEN: number[][] = [
  [-1, 0], [1, 0], [-1, -1], [1, -1], [0, -1], [0, 1],
];
const HEX_DIRS_ODD: number[][] = [
  [-1, 0], [1, 0], [-1, 1], [1, 1], [0, -1], [0, 1],
];
const SQUARE_DIRS: number[][] = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
];

function getDirs(gridType: 'square' | 'hex', col: number): number[][] {
  if (gridType === 'square') return SQUARE_DIRS;
  return col % 2 === 0 ? HEX_DIRS_EVEN : HEX_DIRS_ODD;
}

/** Convert hex grid coordinates to pixel position. */
export function hexCellToPixel(col: number, row: number): { x: number; y: number } {
  const radius = CELL_SIZE / 2;
  const colSpacing = Math.sqrt(3) * radius;
  const rowSpacing = 1.5 * radius;
  return {
    x: MAP_OFFSET_X + col * colSpacing + colSpacing / 2,
    y: MAP_OFFSET_Y + row * rowSpacing + radius + (col % 2 === 1 ? rowSpacing / 2 : 0),
  };
}

/**
 * Generate a territory map using grid-based region growing.
 */
export function generateMap(
  territoryCount: number,
  rng: SeededRandom,
  gridType: 'square' | 'hex' = 'square',
  shape: MapShape = 'rectangle'
): { territories: Territory[]; adjacency: Map<number, Set<number>> } {
  const mask = getShapeMask(shape, GRID_COLS, GRID_ROWS);

  // 1. Create grid
  const grid: Cell[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      grid[r][c] = { col: c, row: r, territory: mask[r][c] ? -1 : -2 };
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

    if (!mask[r][c]) continue;

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

  let head = 0;
  while (head < queue.length) {
    const { col, row, territory } = queue[head++];

    for (const [dc, dr] of getDirs(gridType, col)) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
      if (!mask[nr][nc]) continue;
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
      for (const [dc, dr] of getDirs(gridType, c)) {
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
    let center: Point;
    if (gridType === 'hex') {
      let totalX = 0, totalY = 0;
      for (const p of cells) {
        const px = hexCellToPixel(p.x, p.y);
        totalX += px.x;
        totalY += px.y;
      }
      center = { x: totalX / cells.length, y: totalY / cells.length };
    } else {
      const cx = cells.reduce((s, p) => s + p.x, 0) / cells.length;
      const cy = cells.reduce((s, p) => s + p.y, 0) / cells.length;
      center = {
        x: MAP_OFFSET_X + cx * CELL_SIZE + CELL_SIZE / 2,
        y: MAP_OFFSET_Y + cy * CELL_SIZE + CELL_SIZE / 2,
      };
    }
    return {
      id,
      cells,
      center,
      neighbors: Array.from(adjacency.get(id) || []),
      owner: -1,
      dice: 1,
      gridType,
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
