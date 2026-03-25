import { gameEngine } from './gameEngineInstance';
import { TurnTimer } from './TurnTimer';
import type { AITurnRunner } from './AITurnRunner';

let _turnTimer: TurnTimer | null = null;

export function initTurnTimer(
  gameNamespace: import('socket.io').Namespace,
  aiTurnRunner?: AITurnRunner,
): TurnTimer {
  _turnTimer = new TurnTimer(gameEngine, gameNamespace, aiTurnRunner);
  return _turnTimer;
}

export function getTurnTimer(): TurnTimer {
  if (!_turnTimer) {
    throw new Error('TurnTimer not initialized — call initTurnTimer first');
  }
  return _turnTimer;
}
