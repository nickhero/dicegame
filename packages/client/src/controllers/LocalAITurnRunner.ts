import {
  GameState,
  SeededRandom,
  GameRecorder,
  GameStats,
  SpeedMode,
  SERVER_TIMING,
  AIActionPayload,
  selectBestMove,
  useAIPowerUps,
  shouldAISurrender,
  isValidAttack,
  getVisibleTerritories,
  tickAlliances,
  aiWouldAcceptProposal,
  formAlliance,
  wouldBreakAlliance,
  breakAlliance,
  PERSONALITIES,
  executeAttack,
  endTurn,
  distributeSurrenderedTerritories,
  largestContiguousGroup,
} from '@dicewars/shared';
import type {
  GameControllerEvents,
  DiceDistributionData,
} from './GameController';

export interface LocalAITurnRunnerOptions {
  speed?: SpeedMode;
  fogOfWar?: boolean;
  spectatorMode?: boolean;
}

export class LocalAITurnRunner {
  private state: GameState;
  private rng: SeededRandom;
  private recorder: GameRecorder;
  private stats: GameStats;
  private events: GameControllerEvents;
  private speed: SpeedMode;
  private fogOfWar: boolean;
  private spectatorMode: boolean;
  private isRunning = false;
  private isPaused = false;
  private isDestroyed = false;
  private resumeResolve: (() => void) | null = null;

  constructor(
    state: GameState,
    rng: SeededRandom,
    recorder: GameRecorder,
    stats: GameStats,
    events: GameControllerEvents,
    options: LocalAITurnRunnerOptions = {},
  ) {
    this.state = state;
    this.rng = rng;
    this.recorder = recorder;
    this.stats = stats;
    this.events = events;
    this.speed = options.speed ?? 'normal';
    this.fogOfWar = options.fogOfWar ?? false;
    this.spectatorMode = options.spectatorMode ?? false;
  }

  setSpeed(speed: SpeedMode): void {
    this.speed = speed;
  }

  getSpeed(): SpeedMode {
    return this.speed;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      if (this.resumeResolve) {
        this.resumeResolve();
        this.resumeResolve = null;
      }
    }
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getIsPaused(): boolean {
    return this.isPaused;
  }

  destroy(): void {
    this.isDestroyed = true;
    this.resume();
  }

  private async delay(ms: number): Promise<void> {
    if (this.isDestroyed || ms <= 0) return;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async checkPause(): Promise<void> {
    while (this.isPaused && !this.isDestroyed) {
      await new Promise<void>((resolve) => {
        this.resumeResolve = resolve;
      });
    }
  }

  private shouldContinueAI(): boolean {
    if (this.isDestroyed || this.state.phase === 'gameOver' || this.state.winner !== null) {
      return false;
    }
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.isAlive) {
      return false;
    }
    if (this.spectatorMode) {
      // In spectator mode, continue running turns for any alive player (or AI)
      return true;
    }
    return !currentPlayer.isHuman;
  }

  async runAITurns(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      while (this.shouldContinueAI()) {
        await this.checkPause();
        if (this.isDestroyed || !this.shouldContinueAI()) break;

        const playerIndex = this.state.currentPlayerIndex;
        await this.executeSingleAITurn(playerIndex);

        if (this.state.phase === 'gameOver' || this.state.winner !== null) {
          break;
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async executeSingleAITurn(playerIndex: number): Promise<void> {
    const timing = SERVER_TIMING[this.speed] ?? SERVER_TIMING.normal;
    const player = this.state.players[playerIndex];
    if (!player || !player.isAlive) return;

    // 1. Check surrender
    if (shouldAISurrender(this.state, playerIndex)) {
      this.events.onAIAction?.({
        playerIndex,
        actionType: 'surrender',
        details: {},
      });
      this.events.onEventLog?.(`${player.name} surrendered!`, 0xff4444);
      this.recorder.recordAction({ type: 'surrender', playerId: playerIndex });
      distributeSurrenderedTerritories(this.state, playerIndex);
      player.isAlive = false;

      this.events.onStateUpdate(this.state);

      if (this.state.winner !== null) {
        this.events.onGameOver?.(this.state.winner);
        return;
      }

      await this.delay(timing.surrenderDelay);

      // Advance turn past surrendered player
      this.advanceTurnPastSurrender(playerIndex);
      return;
    }

    // 2. Alliance tick
    if (this.state.allianceState) {
      this.processAllianceTick();
      await this.delay(timing.allianceDelay);
    }

    // 3. Power-ups
    if (this.state.powerUpsEnabled) {
      const results = useAIPowerUps(this.state);
      for (const res of results) {
        if (res.action) {
          this.events.onAIAction?.({
            playerIndex,
            actionType: 'powerUp',
            details: { description: res.description },
          });
          this.events.onEventLog?.(`${player.name} ${res.description}`, player.color);
          this.recorder.recordAction(res.action);
        }
      }
      if (results.length > 0) {
        this.events.onStateUpdate(this.state);
        await this.delay(timing.powerUpDelay);
      }
    }

    // 4. Attacks
    const personality = player.customPersonalityConfig ?? PERSONALITIES[player.personality ?? 'balanced'];
    const maxAttacks = Math.min(personality.maxAttacksPerTurn, 50);
    let attackCount = 0;
    let wins = 0;
    let losses = 0;

    const visibleSet = this.fogOfWar ? getVisibleTerritories(this.state, playerIndex) : undefined;

    while (attackCount < maxAttacks && this.state.phase !== 'gameOver') {
      await this.checkPause();
      if (this.isDestroyed) break;

      const move = selectBestMove(this.state, this.rng, undefined, visibleSet);
      if (!move) break;
      if (!isValidAttack(move.attackerId, move.defenderId, this.state)) break;

      const defenderOwner = this.state.territories[move.defenderId].owner;

      // Handle alliance betrayal
      if (
        this.state.allianceState &&
        wouldBreakAlliance(this.state.allianceState, playerIndex, defenderOwner)
      ) {
        breakAlliance(this.state.allianceState, playerIndex, defenderOwner);
        this.events.onAIAction?.({
          playerIndex,
          actionType: 'alliance',
          details: { type: 'broken', targetPlayerIndex: defenderOwner },
        });
        const defName = this.state.players[defenderOwner]?.name ?? `Player ${defenderOwner}`;
        this.events.onEventLog?.(`⚔️ ${player.name} betrayed ${defName}!`, 0xff6644);
        this.recorder.recordAction({
          type: 'allianceBroken',
          breakerId: playerIndex,
          otherId: defenderOwner,
        });
      }

      this.events.onAIAction?.({
        playerIndex,
        actionType: 'attack',
        details: { from: move.attackerId, to: move.defenderId },
      });

      const battle = executeAttack(move.attackerId, move.defenderId, this.state, this.rng);
      this.stats.recordAttack(playerIndex, defenderOwner, battle, this.state);
      this.recorder.recordAction({
        type: 'attack',
        attackerId: move.attackerId,
        defenderId: move.defenderId,
        attackerPlayerId: playerIndex,
        defenderPlayerId: defenderOwner,
        result: battle,
      });

      attackCount++;
      if (battle.attackerWins) wins++;
      else losses++;

      await this.events.onBattleResult?.({
        attackerId: move.attackerId,
        defenderId: move.defenderId,
        attackerDice: battle.attackerRolls,
        defenderDice: battle.defenderRolls,
        attackerTotal: battle.attackerTotal,
        defenderTotal: battle.defenderTotal,
        attackerWon: battle.attackerWins,
        conquered: battle.attackerWins,
        attackerPlayerIndex: playerIndex,
        defenderPlayerIndex: defenderOwner,
      });

      this.events.onStateUpdate(this.state);

      if (this.state.winner !== null) {
        this.events.onGameOver?.(this.state.winner);
        return;
      }

      await this.delay(timing.attackDelay);
    }

    if (attackCount > 0) {
      this.events.onEventLog?.(
        `${player.name} made ${attackCount} attack${attackCount !== 1 ? 's' : ''} (won ${wins}, lost ${losses})`,
        player.color,
      );
    }

    // 5. End Turn
    await this.delay(timing.turnEndDelay);
    this.advanceTurn(playerIndex);
  }

  private advanceTurnPastSurrender(playerIndex: number): void {
    const diceBefore = this.snapshotDice(playerIndex);
    endTurn(this.state, this.rng);

    this.recorder.recordAction({ type: 'endTurn', playerId: playerIndex, bonusDice: 0 });
    this.recorder.endCurrentTurn();
    this.stats.recordTurnStart(this.state);
    this.recorder.startTurn(this.state.turnNumber, this.state.currentPlayerIndex);

    this.events.onTurnChanged?.({
      previousPlayerIndex: playerIndex,
      currentPlayerIndex: this.state.currentPlayerIndex,
      turnNumber: this.state.turnNumber,
      bonusDice: 0,
    });
    this.events.onStateUpdate(this.state);
  }

  private advanceTurn(playerIndex: number): void {
    const player = this.state.players[playerIndex];
    const diceBefore = this.snapshotDice(playerIndex);

    const { spawn } = endTurn(this.state, this.rng);

    const diceAfter = this.snapshotDice(playerIndex);
    const deltas = new Map<number, number>();
    let totalBonus = 0;
    diceAfter.forEach((count, id) => {
      const prev = diceBefore.get(id) ?? 0;
      if (count > prev) {
        const diff = count - prev;
        deltas.set(id, diff);
        totalBonus += diff;
      }
    });

    const distribution: DiceDistributionData = {
      playerId: playerIndex,
      deltas,
      totalBonus,
    };

    this.recorder.recordAction({
      type: 'endTurn',
      playerId: playerIndex,
      bonusDice: totalBonus,
    });
    this.recorder.endCurrentTurn();
    this.stats.recordTurnStart(this.state);
    this.recorder.startTurn(this.state.turnNumber, this.state.currentPlayerIndex);

    if (totalBonus > 0 && player) {
      this.events.onEventLog?.(`${player.name} received ${totalBonus} bonus dice`, player.color);
    }

    const nextPlayer = this.state.players[this.state.currentPlayerIndex];
    if (nextPlayer) {
      this.events.onEventLog?.(
        `Turn ${this.state.turnNumber} — ${nextPlayer.name}'s turn`,
        0xffffff,
      );
    }

    this.events.onTurnChanged?.({
      previousPlayerIndex: playerIndex,
      currentPlayerIndex: this.state.currentPlayerIndex,
      turnNumber: this.state.turnNumber,
      bonusDice: totalBonus,
      distribution,
      powerUpSpawns: spawn ? [{ territoryId: spawn.territoryId, type: spawn.powerUpType }] : undefined,
    });

    this.events.onStateUpdate(this.state);

    if (this.state.winner !== null) {
      this.events.onGameOver?.(this.state.winner);
    }
  }

  private snapshotDice(playerId: number): Map<number, number> {
    const dice = new Map<number, number>();
    for (const t of this.state.territories) {
      if (t.owner === playerId) {
        dice.set(t.id, t.dice);
      }
    }
    return dice;
  }

  private processAllianceTick(): void {
    if (!this.state.allianceState) return;

    const tickResult = tickAlliances(this.state.allianceState, this.state, this.rng);

    for (const a of tickResult.expired) {
      const p1 = this.state.players[a.player1]?.name ?? `Player ${a.player1}`;
      const p2 = this.state.players[a.player2]?.name ?? `Player ${a.player2}`;
      this.events.onEventLog?.(`📜 Alliance between ${p1} and ${p2} expired`, 0x999999);
      this.recorder.recordAction({ type: 'allianceExpired', player1: a.player1, player2: a.player2 });
    }

    for (const proposal of tickResult.newProposals) {
      this.recorder.recordAction({
        type: 'allianceProposal',
        fromPlayer: proposal.fromPlayer,
        toPlayer: proposal.toPlayer,
      });

      const target = this.state.players[proposal.toPlayer];
      if (target?.isHuman && !this.spectatorMode) {
        this.events.onAllianceProposal?.({
          proposalId: `${proposal.fromPlayer}-${proposal.toPlayer}-${this.state.turnNumber}`,
          fromPlayer: proposal.fromPlayer,
          toPlayer: proposal.toPlayer,
          duration: 5,
        });
      } else if (target && target.isAlive && target.personality) {
        if (aiWouldAcceptProposal(this.state.allianceState, this.state, proposal)) {
          formAlliance(this.state.allianceState, proposal.fromPlayer, proposal.toPlayer, this.state.turnNumber, 5);
          const p1 = this.state.players[proposal.fromPlayer]?.name ?? `Player ${proposal.fromPlayer}`;
          this.events.onEventLog?.(`🤝 ${p1} and ${target.name} formed an alliance`, 0x44ddff);
          this.recorder.recordAction({
            type: 'allianceFormed',
            player1: proposal.fromPlayer,
            player2: proposal.toPlayer,
            duration: 5,
          });
        }
      }
    }
  }
}
