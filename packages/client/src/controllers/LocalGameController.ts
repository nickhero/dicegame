import {
  GameState,
  executeAttack,
  endTurn,
  distributeSurrenderedTerritories,
  useReinforce,
  useFortify,
  formAlliance,
  aiWouldAcceptProposal,
  createSnapshot,
  restoreSnapshot,
  SeededRandom,
  GameRecorder,
  GameStats,
} from '@dicewars/shared';
import type {
  IGameController,
  GameControllerEvents,
} from './GameController';

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

  constructor(
    initialState: GameState,
    localPlayerIndex: number,
    rng: SeededRandom,
    recorder: GameRecorder,
    stats: GameStats,
    undoEnabled: boolean,
    events: GameControllerEvents,
  ) {
    this.state = initialState;
    this.localPlayerIndex = localPlayerIndex;
    this.rng = rng;
    this.recorder = recorder;
    this.stats = stats;
    this.undoEnabled = undoEnabled;
    this.events = events;
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

  async attack(fromId: number, toId: number): Promise<boolean> {
    const attacker = this.state.territories[fromId];
    const defender = this.state.territories[toId];
    if (!attacker || !defender) return false;

    // Snapshot before first attack of turn
    if (this.undoEnabled && !this.undoUsedThisTurn && this.undoSnapshot === null) {
      this.undoSnapshot = createSnapshot(this.state);
    }

    const battle = executeAttack(fromId, toId, this.state, this.rng);

    this.recorder.recordAction({
      type: "attack",
      attackerId: fromId,
      defenderId: toId,
      attackerPlayerId: attacker.owner,
      defenderPlayerId: defender.owner,
      result: battle,
    });

    this.stats.recordAttack(
      attacker.owner,
      defender.owner,
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
    endTurn(this.state, this.rng);

    this.recorder.recordAction({
      type: "endTurn",
      playerId: previousPlayer,
      bonusDice: 0,
    });
    this.recorder.endCurrentTurn();
    this.recorder.startTurn(this.state.turnNumber, this.state.currentPlayerIndex);

    this.events.onTurnChanged?.(this.state.currentPlayerIndex, this.state.turnNumber);
    this.events.onStateUpdate(this.state);
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

    if (!targetPlayer.isHuman && this.state.allianceState) {
      const proposal = { fromPlayer: this.localPlayerIndex, toPlayer: targetIndex, duration: 5 };
      const accepts = aiWouldAcceptProposal(
        this.state.allianceState,
        this.state,
        proposal,
      );

      if (accepts) {
        formAlliance(this.state.allianceState, this.localPlayerIndex, targetIndex, this.state.turnNumber, 5);
        this.events.onEventLog?.(`🤝 Formed alliance with ${targetPlayer.name} (5 turns)!`, 0x44ddff);
        this.events.onStateUpdate(this.state);
        return true;
      } else {
        this.events.onToast?.(`${targetPlayer.name} declined alliance`, 'warning');
        return false;
      }
    }
    return false;
  }

  async respondAlliance(_proposalId: string, _accept: boolean): Promise<void> {
    // Local alliances handled immediately
  }

  destroy(): void {
    // Cleanup if needed
  }
}
