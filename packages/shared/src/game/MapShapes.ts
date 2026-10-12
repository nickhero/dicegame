export type MapShape = 'rectangle' | 'diamond' | 'ring' | 'continent' | 'islands';

/**
 * Returns a 2D boolean mask where true means the cell is valid for map generation.
 */
export function getShapeMask(shape: MapShape, cols: number, rows: number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  switch (shape) {
    case 'rectangle':
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          mask[r][c] = true;
      break;

    case 'diamond': {
      const cx = (cols - 1) / 2;
      const cy = (rows - 1) / 2;
      const maxDist = Math.floor(Math.min(cols, rows) / 2);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const dist = Math.abs(c - cx) / (cols / rows) + Math.abs(r - cy);
          mask[r][c] = dist <= maxDist;
        }
      break;
    }

    case 'ring': {
      const cx = (cols - 1) / 2;
      const cy = (rows - 1) / 2;
      const outerRadius = Math.min(cols, rows) / 2;
      const innerRadius = outerRadius * 0.3;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          // Normalize distance to account for aspect ratio
          const dx = (c - cx) / (cols / 2);
          const dy = (r - cy) / (rows / 2);
          const normalizedDist = Math.sqrt(dx * dx + dy * dy);
          const dist = normalizedDist * outerRadius;
          mask[r][c] = dist >= innerRadius && dist <= outerRadius;
        }
      break;
    }

    case 'continent': {
      const splitCol = Math.floor(cols * 0.4);
      // Left land: 0..splitCol-2, gap: splitCol-1..splitCol, right: splitCol+1..cols-1
      const gapLeft = splitCol - 1;
      const gapRight = splitCol;
      const bridgeMidRow = Math.floor(rows / 2);

      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const inLeft = c < gapLeft;
          const inRight = c > gapRight;
          const inBridge =
            c >= gapLeft &&
            c <= gapRight &&
            r >= bridgeMidRow - 1 &&
            r <= bridgeMidRow;
          mask[r][c] = inLeft || inRight || inBridge;
        }
      break;
    }

    case 'islands': {
      // 4 archipelagos (NW, NE, SW, SE) connected via chokepoint land bridges
      const rx = cols * 0.19;
      const ry = rows * 0.19;
      const centers = [
        { cx: cols * 0.28, cy: rows * 0.28 },
        { cx: cols * 0.72, cy: rows * 0.28 },
        { cx: cols * 0.28, cy: rows * 0.72 },
        { cx: cols * 0.72, cy: rows * 0.72 },
      ];

      // Mark the 4 distinct island landmasses
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          for (const { cx, cy } of centers) {
            const dx = (c - cx) / rx;
            const dy = (r - cy) / ry;
            if (dx * dx + dy * dy <= 1.0) {
              mask[r][c] = true;
              break;
            }
          }
        }
      }

      // Connect islands with land bridges to guarantee a single connected component
      const nRow = Math.round(rows * 0.28);
      const sRow = Math.round(rows * 0.72);
      const wCol = Math.round(cols * 0.28);
      const eCol = Math.round(cols * 0.72);

      // North bridge (NW <-> NE)
      for (let c = wCol; c <= eCol; c++) {
        mask[nRow][c] = true;
        if (nRow + 1 < rows) mask[nRow + 1][c] = true;
      }
      // South bridge (SW <-> SE)
      for (let c = wCol; c <= eCol; c++) {
        mask[sRow][c] = true;
        if (sRow - 1 >= 0) mask[sRow - 1][c] = true;
      }
      // West bridge (NW <-> SW)
      for (let r = nRow; r <= sRow; r++) {
        mask[r][wCol] = true;
        if (wCol + 1 < cols) mask[r][wCol + 1] = true;
      }
      // East bridge (NE <-> SE)
      for (let r = nRow; r <= sRow; r++) {
        mask[r][eCol] = true;
        if (eCol - 1 >= 0) mask[r][eCol - 1] = true;
      }
      break;
    }
  }

  return mask;
}
