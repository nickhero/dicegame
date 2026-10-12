import {
  GameState,
  executeAttack,
  endTurn,
  distributeSurrenderedTerritories,
  useReinforce,
  useFortify,
  formAlliance,
  areAllied,
  aiWouldAcceptProposal,
  wouldBreakAlliance,
  breakAlliance,
  createSnapshot,
  restoreSnapshot,
  SeededRandom,
  GameRecorder,
  GameStats,
  SpeedMode,
  tickAlliances,
} from '@dicewars/shared';
import type {
  IGameController,
  GameControllerEvents,
  DiceDistributionData,
} from './GameController';
import { LocalAITurnRunner, type LocalAITurnRunnerOptions } from './LocalAITurnRunner';

export interface LocalGameControllerOptions extends LocalAITurnRunnerOptions {}

export class LocalGameController implements IGameController {
  readonly isOnline = false;
  private state: GameState;
  private localPlayerIndex: number;
  private rng: SeededRandom;
  private recorder: GameRecorder;
  private stats: GameStats;
  private events: GameControllerEvents;
  private undoSnapshot: ReturnType<typeof createSnapshot> | null = null;
  private undoUsedThisTurn = false;
  private undoEnabled: boolean;
  private spectatorMode: boolean;
  private aiRunner: LocalAITurnRunner;

  constructor(
    initialState: GameState,
    localPlayerIndex: number,
    rng: SeededRandom,
    recorder: GameRecorder,
    stats: GameStats,
    undoEnabled: boolean,
    events: GameControllerEvents,
    options: LocalGameControllerOptions = {},
  ) {
    this.state = initialState;
    this.localPlayerIndex = localPlayerIndex;
    this.rng = rng;
    this.recorder = recorder;
    this.stats = stats;
    this.undoEnabled = undoEnabled;
    this.events = events;
    this.spectatorMode = options.spectatorMode ?? false;

    this.aiRunner = new LocalAITurnRunner(
      this.state,
      this.rng,
      this.recorder,
      this.stats,
      this.events,
      options,
    );
  }

  getState(): GameState {
    return this.state;
  }

  getLocalPlayerIndex(): number | undefined {
    return this.localPlayerIndex;
  }

  canUndo(): boolean {
    return this.undoEnabled && this.undoSnapshot !== null && !this.undoUsedThisTurn;
  }

  start(): void {
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (
      this.state.phase !== 'gameOver' &&
      this.state.winner === null &&
      (this.spectatorMode || (currentPlayer && !currentPlayer.isHuman && currentPlayer.isAlive))
    ) {
      this.aiRunner.runAITurns().catch((err) => {
        console.error('Error starting AI turn runner:', err);
      });
    }
  }

  setSpeed(speed: SpeedMode): void {
    this.aiRunner.setSpeed(speed);
  }

  pause(): void {
    this.aiRunner.pause();
  }

  resume(): void {
    this.aiRunner.resume();
  }

  isAITurnRunning(): boolean {
    return this.aiRunner.getIsRunning();
  }

  async attack(fromId: number, toId: number): Promise<boolean> {
    const attacker = this.state.territories[fromId];
    const defender = this.state.territories[toId];
    if (!attacker || !defender) return false;

    const attackerPlayerId = attacker.owner;
    const defenderPlayerId = defender.owner;

    // Snapshot before first attack of turn
    if (this.undoEnabled && !this.undoUsedThisTurn && this.undoSnapshot === null) {
      this.undoSnapshot = createSnapshot(this.state);
    }

    // Break alliance if attacking ally
    if (this.state.allianceState && wouldBreakAlliance(this.state.allianceState, attackerPlayerId, defenderPlayerId)) {
      breakAlliance(this.state.allianceState, attackerPlayerId, defenderPlayerId);
    }

    const battle = executeAttack(fromId, toId, this.state, this.rng);

    this.recorder.recordAction({
      type: "attack",
      attackerId: fromId,
      defenderId: toId,
      attackerPlayerId,
      defenderPlayerId,
      result: battle,
    });

    this.stats.recordAttack(
      attackerPlayerId,
      defenderPlayerId,
      battle,
      this.state,
    );

    await this.events.onBattleResult?.({
      attackerId: fromId,
      defenderId: toId,
      attackerDice: battle.attackerRolls,
      defenderDice: battle.defenderRolls,
      attackerTotal: battle.attackerTotal,
      defenderTotal: battle.defenderTotal,
      attackerWon: battle.attackerWins,
      conquered: battle.attackerWins,
      attackerPlayerIndex: attackerPlayerId,
      defenderPlayerIndex: defenderPlayerId,
    });

    if (this.state.winner !== null) {
      this.events.onGameOver?.(this.state.winner);
    }

    this.events.onStateUpdate(this.state);
    return battle.attackerWins;
  }

  async endTurn(): Promise<void> {
    this.undoSnapshot = null;
    this.undoUsedThisTurn = false;

    const previousPlayer = this.state.currentPlayerIndex;
    const diceBefore = this.snapshotDice(previousPlayer);

    const { spawn } = endTurn(this.state, this.rng);

    const diceAfter = this.snapshotDice(previousPlayer);
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
      playerId: previousPlayer,
      deltas,
      totalBonus,
    };

    this.recorder.recordAction({
      type: "endTurn",
      playerId: previousPlayer,
      bonusDice: totalBonus,
    });
    this.recorder.endCurrentTurn();
    this.stats.recordTurnStart(this.state);
    this.recorder.startTurn(this.state.turnNumber, this.state.currentPlayerIndex);

    if (this.state.allianceState) {
      this.processAllianceTick();
    }

    this.events.onTurnChanged?.({
      previousPlayerIndex: previousPlayer,
      currentPlayerIndex: this.state.currentPlayerIndex,
      turnNumber: this.state.turnNumber,
      bonusDice: totalBonus,
      distribution,
      powerUpSpawns: spawn ? [{ territoryId: spawn.territoryId, type: spawn.powerUpType }] : undefined,
    });
    this.events.onStateUpdate(this.state);

    if (this.state.winner !== null) {
      this.events.onGameOver?.(this.state.winner);
      return;
    }

    // If next player is AI or spectator mode, run AI turns
    const nextPlayer = this.state.players[this.state.currentPlayerIndex];
    if (
      this.state.phase !== 'gameOver' &&
      this.state.winner === null &&
      (this.spectatorMode || (nextPlayer && !nextPlayer.isHuman && nextPlayer.isAlive))
    ) {
      this.aiRunner.runAITurns().catch((err) => {
        console.error('Error running AI turns:', err);
      });
    }
  }

  async usePowerUp(
    type: 'reinforce' | 'fortify',
    targetId: number,
    sourceId?: number,
  ): Promise<boolean> {
    if (type === 'reinforce') {
      const success = useReinforce(targetId, this.state);
      if (success) {
        this.recorder.recordAction({ type: "reinforce", territoryId: targetId, playerId: this.state.currentPlayerIndex });
        this.events.onStateUpdate(this.state);
      }
      return success;
    } else if (type === 'fortify' && sourceId !== undefined) {
      const success = useFortify(sourceId, targetId, 1, this.state);
      if (success) {
        this.recorder.recordAction({ type: "fortify", fromId: sourceId, toId: targetId, diceCount: 0, playerId: this.state.currentPlayerIndex });
        this.events.onStateUpdate(this.state);
      }
      return success;
    }
    return false;
  }

  async surrender(): Promise<void> {
    const player = this.state.players[this.localPlayerIndex];
    if (!player || !player.isAlive) return;

    distributeSurrenderedTerritories(this.state, this.localPlayerIndex);
    player.isAlive = false;

    this.events.onEventLog?.(`${player.name} surrendered!`, 0xff6666);
    await this.endTurn();
  }

  async undo(): Promise<boolean> {
    if (!this.canUndo()) return false;

    restoreSnapshot(this.state, this.undoSnapshot!);
    this.undoSnapshot = null;
    this.undoUsedThisTurn = true;

    this.events.onEventLog?.('↩️ Attack undone', 0x88bbff);
    this.events.onStateUpdate(this.state);
    return true;
  }

  async proposeAlliance(targetIndex: number): Promise<boolean> {
    const targetPlayer = this.state.players[targetIndex];
    if (!targetPlayer || !this.state.allianceState) return false;

    const alivePlayers = this.state.players.filter((p) => p.isAlive);
    if (this.state.players.length > 2 && alivePlayers.length <= 2) {
      this.events.onToast?.('Cannot form alliances when only 2 players remain', 'warning');
      return false;
    }

    if (areAllied(this.state.allianceState, this.localPlayerIndex, targetIndex)) {
      this.events.onToast?.(`Already allied with ${targetPlayer.name}`, 'info');
      return false;
    }

    if (!targetPlayer.isHuman) {
      const proposal = { fromPlayer: this.localPlayerIndex, toPlayer: targetIndex, duration: 5 };
      const accepts = aiWouldAcceptProposal(
        this.state.allianceState,
        this.state,
        proposal,
      );

      if (accepts) {
        formAlliance(this.state.allianceState, this.localPlayerIndex, targetIndex, this.state.turnNumber, 5);
        this.events.onEventLog?.(`🤝 Formed alliance with ${targetPlayer.name} (5 turns)!`, 0x44ddff);
        this.events.onToast?.(`🤝 Alliance formed with ${targetPlayer.name}!`, 'info');
        this.events.onStateUpdate(this.state);
        return true;
      } else {
        this.events.onToast?.(`${targetPlayer.name} declined alliance`, 'warning');
        return false;
      }
    } else {
      // Local human-to-human proposal (hotseat)
      const proposalId = `${this.localPlayerIndex}-${targetIndex}-${this.state.turnNumber}`;
      this.events.onAllianceProposal?.({
        proposalId,
        fromPlayer: this.localPlayerIndex,
        toPlayer: targetIndex,
        duration: 5,
      });
      return true;
    }
  }

  async respondAlliance(proposalId: string, accept: boolean): Promise<void> {
    if (!this.state.allianceState) return;
    const parts = proposalId.split("-");
    const proposerIndex = parseInt(parts[0], 10);
    const targetIndex = parts[1] !== undefined ? parseInt(parts[1], 10) : this.localPlayerIndex;

    if (accept) {
      formAlliance(this.state.allianceState, proposerIndex, targetIndex, this.state.turnNumber, 5);
      const p1 = this.state.players[proposerIndex]?.name ?? `Player ${proposerIndex + 1}`;
      const p2 = this.state.players[targetIndex]?.name ?? `Player ${targetIndex + 1}`;
      this.events.onEventLog?.(`🤝 Formed alliance between ${p1} and ${p2} (5 turns)!`, 0x44ddff);
      this.events.onStateUpdate(this.state);
    } else {
      this.events.onToast?.("Alliance proposal declined", "info");
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

  destroy(): void {
    this.aiRunner.destroy();
  }
}
