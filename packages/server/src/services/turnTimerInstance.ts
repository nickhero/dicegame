import { gameEngine } from './gameEngineInstance';
import { TurnTimer } from './TurnTimer';

let _turnTimer: TurnTimer | null = null;

export function initTurnTimer(gameNamespace: import('socket.io').Namespace): TurnTimer {
  _turnTimer = new TurnTimer(gameEngine, gameNamespace);
  return _turnTimer;
}

export function getTurnTimer(): TurnTimer {
  if (!_turnTimer) {
    throw new Error('TurnTimer not initialized — call initTurnTimer first');
  }
  return _turnTimer;
}
