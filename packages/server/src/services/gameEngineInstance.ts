import { GameEngine } from './GameEngine';

// Shared singleton — used by waiting room and future game action handlers.
export const gameEngine = new GameEngine();
