import type {
  GameState,
  WireGameState,
  BattleResultPayload,
  TurnChangedPayload,
  GameOverPayload,
  PlayerConnectionPayload,
  AllianceProposalPayload,
  GameError,
} from '@dicewars/shared';
import { SocketClient } from '../network/SocketClient';
import { deserializeWireState } from '../network/deserializeState';
import type {
  IGameController,
  GameControllerEvents,
} from './GameController';

export class OnlineGameController implements IGameController {
  readonly isOnline = true;
  private socketClient: SocketClient;
  private currentState: GameState;
  private localPlayerIndex: number | undefined;
  private events: GameControllerEvents;

  // Stored listener references for unsubscription
  private stateUpdateHandler!: (wireState: WireGameState) => void;
  private battleResultHandler!: (result: BattleResultPayload) => void;
  private turnChangedHandler!: (data: TurnChangedPayload) => void;
  private gameOverHandler!: (data: GameOverPayload) => void;
  private playerDisconnectedHandler!: (data: PlayerConnectionPayload) => void;
  private playerReconnectedHandler!: (data: PlayerConnectionPayload) => void;
  private allianceProposalHandler!: (data: AllianceProposalPayload) => void;
  private errorHandler!: (error: GameError) => void;

  constructor(
    socketClient: SocketClient,
    initialWireState: WireGameState,
    events: GameControllerEvents,
  ) {
    this.socketClient = socketClient;
    this.events = events;
    this.currentState = deserializeWireState(initialWireState);
    this.localPlayerIndex = initialWireState.localPlayerIndex;

    this.setupListeners();
  }

  getState(): GameState {
    return this.currentState;
  }

  getLocalPlayerIndex(): number | undefined {
    return this.localPlayerIndex;
  }

  canUndo(): boolean {
    return false; // Online undo governed by server
  }

  private setupListeners(): void {
    this.stateUpdateHandler = (wireState: WireGameState) => {
      this.currentState = deserializeWireState(wireState);
      if (wireState.localPlayerIndex !== undefined) {
        this.localPlayerIndex = wireState.localPlayerIndex;
      }
      this.events.onStateUpdate(this.currentState);
    };

    this.battleResultHandler = (result: BattleResultPayload) => {
      const attackerTotal = result.attackerDice.reduce((a, b) => a + b, 0);
      const defenderTotal = result.defenderDice.reduce((a, b) => a + b, 0);
      this.events.onBattleResult?.({
        attackerId: result.attackerTerritoryId,
        defenderId: result.defenderTerritoryId,
        attackerDice: result.attackerDice,
        defenderDice: result.defenderDice,
        attackerTotal,
        defenderTotal,
        attackerWon: result.attackerWins,
        conquered: result.attackerWins,
      });
    };

    this.turnChangedHandler = (data: TurnChangedPayload) => {
      this.events.onTurnChanged?.(data.currentPlayerIndex, data.turnNumber);
    };

    this.gameOverHandler = (data: GameOverPayload) => {
      this.events.onGameOver?.(data.winnerIndex, data.stats as Record<string, unknown>);
    };

    this.playerDisconnectedHandler = (data: PlayerConnectionPayload) => {
      this.events.onPlayerDisconnected?.(data.playerIndex, data.graceSeconds ?? 60);
    };

    this.playerReconnectedHandler = (data: PlayerConnectionPayload) => {
      this.events.onPlayerReconnected?.(data.playerIndex);
    };

    this.allianceProposalHandler = (data: AllianceProposalPayload) => {
      this.events.onAllianceProposal?.({
        fromPlayer: data.fromPlayerIndex,
        toPlayer: data.toPlayerIndex,
        duration: data.duration,
      });
    };

    this.errorHandler = (error: GameError) => {
      this.events.onError?.(error);
    };

    this.socketClient.on('game:stateUpdate', this.stateUpdateHandler);
    this.socketClient.on('game:battleResult', this.battleResultHandler);
    this.socketClient.on('game:turnChanged', this.turnChangedHandler);
    this.socketClient.on('game:gameOver', this.gameOverHandler);
    this.socketClient.on('game:playerDisconnected', this.playerDisconnectedHandler);
    this.socketClient.on('game:playerReconnected', this.playerReconnectedHandler);
    this.socketClient.on('game:allianceProposal', this.allianceProposalHandler);
    this.socketClient.on('game:error', this.errorHandler);
  }

  async attack(fromId: number, toId: number): Promise<boolean> {
    const ack = await this.socketClient.attack(fromId, toId);
    return ack.success;
  }

  async endTurn(): Promise<void> {
    await this.socketClient.endTurn();
  }

  async usePowerUp(
    type: 'reinforce' | 'fortify',
    targetId: number,
    sourceId?: number,
  ): Promise<boolean> {
    const ack = await this.socketClient.usePowerUp(type, targetId, sourceId);
    return ack.success;
  }

  async surrender(): Promise<void> {
    await this.socketClient.surrender();
  }

  async undo(): Promise<boolean> {
    const ack = await this.socketClient.undo();
    return ack.success;
  }

  async proposeAlliance(targetIndex: number): Promise<boolean> {
    const ack = await this.socketClient.proposeAlliance(targetIndex);
    return ack.success;
  }

  async respondAlliance(proposalId: string, accept: boolean): Promise<void> {
    await this.socketClient.respondAlliance(proposalId, accept);
  }

  destroy(): void {
    this.socketClient.off('game:stateUpdate', this.stateUpdateHandler);
    this.socketClient.off('game:battleResult', this.battleResultHandler);
    this.socketClient.off('game:turnChanged', this.turnChangedHandler);
    this.socketClient.off('game:gameOver', this.gameOverHandler);
    this.socketClient.off('game:playerDisconnected', this.playerDisconnectedHandler);
    this.socketClient.off('game:playerReconnected', this.playerReconnectedHandler);
    this.socketClient.off('game:allianceProposal', this.allianceProposalHandler);
    this.socketClient.off('game:error', this.errorHandler);
  }
}
