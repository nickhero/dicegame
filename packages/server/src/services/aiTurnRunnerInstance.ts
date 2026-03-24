import { gameEngine } from './gameEngineInstance';
import { AITurnRunner } from './AITurnRunner';

// Lazy-initialized — requires the game namespace to be set before use.
let _aiTurnRunner: AITurnRunner | null = null;

export function initAITurnRunner(gameNamespace: import('socket.io').Namespace): AITurnRunner {
  _aiTurnRunner = new AITurnRunner(gameEngine, gameNamespace);
  return _aiTurnRunner;
}

export function getAITurnRunner(): AITurnRunner {
  if (!_aiTurnRunner) {
    throw new Error('AITurnRunner not initialized — call initAITurnRunner first');
  }
  return _aiTurnRunner;
}
