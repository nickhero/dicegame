export interface Point {
  x: number;
  y: number;
}

export interface Territory {
  id: number;
  cells: Point[];      // grid cells belonging to this territory
  center: Point;       // visual center for rendering
  neighbors: number[]; // adjacent territory IDs
  owner: number;       // player index (-1 = unowned)
  dice: number;        // dice count (1–8)
  gridType?: 'square' | 'hex';
  powerUp?: import('./PowerUps').PowerUpType;
}
