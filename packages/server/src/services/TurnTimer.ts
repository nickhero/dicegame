import type { Namespace } from 'socket.io';
import type { GameEngine, ActiveGame } from './GameEngine';
import { serializeFullState } from './FogFilter';

export type TurnTimerDuration = 30 | 60 | 90 | 0; // 0 = unlimited

interface TimerEntry {
  timeout: NodeJS.Timeout;
  startedAt: number;
  duration: number; // milliseconds
}

export class TurnTimer {
  private timers = new Map<string, TimerEntry>();

  constructor(
    private gameEngine: GameEngine,
    private gameNamespace: Namespace,
  ) {}

  /** Start timer for a human player's turn. */
  startTimer(gameId: string, duration: TurnTimerDuration): void {
    if (duration === 0) return; // Unlimited — no timer

    const game = this.gameEngine.getGame(gameId);
    if (!game) return;

    const currentPlayer = game.state.currentPlayerIndex;

    // Don't set timer for AI players
    if (game.aiPlayerIndices.has(currentPlayer)) return;

    // Don't set timer for single-player games (only 1 human alive)
    const humanCount = game.state.players.filter(
      (p, i) => !game.aiPlayerIndices.has(i) && p.isAlive,
    ).length;
    if (humanCount <= 1) return;

    // Clear existing timer for this game
    this.clearTimer(gameId);

    const startedAt = Date.now();
    const durationMs = duration * 1000;

    const timeout = setTimeout(() => {
      this.onTimeout(gameId);
    }, durationMs);

    this.timers.set(gameId, { timeout, startedAt, duration: durationMs });
  }

  /** Clear timer for a game (on turn end or game end). */
  clearTimer(gameId: string): void {
    const timer = this.timers.get(gameId);
    if (timer) {
      clearTimeout(timer.timeout);
      this.timers.delete(gameId);
    }
  }

  /** Get remaining seconds for a game's turn timer. Returns null if no timer is active. */
  getRemainingSeconds(gameId: string): number | null {
    const timer = this.timers.get(gameId);
    if (!timer) return null;

    const elapsed = Date.now() - timer.startedAt;
    return Math.max(0, Math.ceil((timer.duration - elapsed) / 1000));
  }

  private onTimeout(gameId: string): void {
    this.timers.delete(gameId);

    const game = this.gameEngine.getGame(gameId);
    if (!game || game.status !== 'playing') return;

    const playerIndex = game.state.currentPlayerIndex;
    const userId = getUserIdForPlayer(game, playerIndex);
    if (!userId) return;

    console.log(
      `[Timer] Turn timer expired for player ${playerIndex} in ${gameId}`,
    );

    try {
      const result = this.gameEngine.endTurn(gameId, userId);

      // Broadcast turn change
      this.gameNamespace.to(`game:${gameId}`).emit('game:turnChanged', {
        previousPlayerIndex: playerIndex,
        currentPlayerIndex: result.nextPlayerIndex,
        turnNumber: game.state.turnNumber,
        bonusDice: result.bonusDice,
        powerUpSpawns: result.powerUpSpawns?.map((s) => ({
          territoryId: s.territoryId,
          type: s.type,
        })),
      });

      // Broadcast updated state
      this.gameNamespace
        .to(`game:${gameId}`)
        .emit('game:stateUpdate', serializeFullState(game));

      // Signal AI turn if next player is AI
      if (game.aiPlayerIndices.has(result.nextPlayerIndex)) {
        this.gameNamespace.emit('_internal:aiTurnNeeded' as never, {
          gameId,
          playerIndex: result.nextPlayerIndex,
        } as never);
      }
    } catch (err) {
      console.error(`[Timer] Auto end turn failed for ${gameId}:`, err);
    }
  }

  /** Clean up all timers for a game. */
  destroyGame(gameId: string): void {
    this.clearTimer(gameId);
  }

  /** Exposed for testing — access the internal timers map. */
  _getTimers(): Map<string, TimerEntry> {
    return this.timers;
  }
}

function getUserIdForPlayer(
  game: ActiveGame,
  playerIndex: number,
): string | undefined {
  for (const [userId, idx] of game.playerMap.entries()) {
    if (idx === playerIndex) return userId;
  }
  return undefined;
}
