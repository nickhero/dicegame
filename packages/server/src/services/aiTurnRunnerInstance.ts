import { gameEngine } from './gameEngineInstance';
import { AITurnRunner } from './AITurnRunner';
import type { ActiveGame } from './GameEngine';
import type { AppDatabase } from '../db/connection';
import { getDb } from '../db/connection';
import { handleGameEnd } from './handleGameEnd';

// Lazy-initialized — requires the game namespace to be set before use.
let _aiTurnRunner: AITurnRunner | null = null;

export function initAITurnRunner(gameNamespace: import('socket.io').Namespace, db?: AppDatabase): AITurnRunner {
  const database = db ?? getDb();
  _aiTurnRunner = new AITurnRunner(gameEngine, gameNamespace, (gameId: string, game: ActiveGame) => {
    handleGameEnd(gameId, game, database);
  });
  return _aiTurnRunner;
}

export function getAITurnRunner(): AITurnRunner {
  if (!_aiTurnRunner) {
    throw new Error('AITurnRunner not initialized — call initAITurnRunner first');
  }
  return _aiTurnRunner;
}
