export type MapShape = 'rectangle' | 'diamond' | 'ring' | 'continent';

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
  }

  return mask;
}
