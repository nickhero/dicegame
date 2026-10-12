import type {
  GameState,
  WireGameState,
  BattleResultPayload,
  TurnChangedPayload,
  GameOverPayload,
  PlayerConnectionPayload,
  AllianceProposalPayload,
  AIActionPayload,
  InstantBatchPayload,
  GameError,
} from '@dicewars/shared';
import { SocketClient } from '../network/SocketClient';
import { deserializeWireState } from '../network/deserializeState';
import type {
  IGameController,
  GameControllerEvents,
  ChatMessageData,
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
  private aiActionHandler!: (action: AIActionPayload) => void;
  private instantBatchHandler!: (batch: InstantBatchPayload) => void;
  private chatHandler!: (data: ChatMessageData) => void;
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
      const atkDice = result.attackerDice ?? [];
      const defDice = result.defenderDice ?? [];
      const attackerTotal = result.attackerTotal ?? atkDice.reduce((a, b) => a + b, 0);
      const defenderTotal = result.defenderTotal ?? defDice.reduce((a, b) => a + b, 0);
      this.events.onBattleResult?.({
        attackerId: result.attackerTerritoryId,
        defenderId: result.defenderTerritoryId,
        attackerDice: atkDice,
        defenderDice: defDice,
        attackerTotal,
        defenderTotal,
        attackerWon: result.attackerWins,
        conquered: result.attackerWins,
        attackerPlayerIndex: result.attackerPlayerIndex,
        defenderPlayerIndex: result.defenderPlayerIndex,
      });
    };

    this.turnChangedHandler = (data: TurnChangedPayload) => {
      this.events.onTurnChanged?.({
        previousPlayerIndex: data.previousPlayerIndex,
        currentPlayerIndex: data.currentPlayerIndex,
        turnNumber: data.turnNumber,
        bonusDice: data.bonusDice,
        powerUpSpawns: data.powerUpSpawns,
      });
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
        proposalId: data.proposalId,
        fromPlayer: data.fromPlayerIndex,
        toPlayer: data.toPlayerIndex,
        duration: data.duration,
      });
    };

    this.aiActionHandler = (action: AIActionPayload) => {
      this.events.onAIAction?.(action);
    };

    this.instantBatchHandler = (batch: InstantBatchPayload) => {
      if (batch.finalState.localPlayerIndex !== undefined) {
        this.localPlayerIndex = batch.finalState.localPlayerIndex;
      }
      this.currentState = deserializeWireState(batch.finalState);
      this.events.onInstantBatch?.(batch);
      this.events.onStateUpdate(this.currentState);
    };

    this.chatHandler = (data: ChatMessageData) => {
      this.events.onChat?.(data);
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
    this.socketClient.on('game:aiAction', this.aiActionHandler);
    this.socketClient.on('game:instantBatch', this.instantBatchHandler);
    this.socketClient.on('game:chat', this.chatHandler);
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
    if (!ack.success) {
      if (ack.error?.message) {
        this.events.onToast?.(ack.error.message, 'warning');
      }
      return false;
    }
    return true;
  }

  async respondAlliance(proposalId: string, accept: boolean): Promise<void> {
    await this.socketClient.respondAlliance(proposalId, accept);
  }

  sendChat(message: string): void {
    this.socketClient.sendChat(message);
  }

  destroy(): void {
    this.socketClient.off('game:stateUpdate', this.stateUpdateHandler);
    this.socketClient.off('game:battleResult', this.battleResultHandler);
    this.socketClient.off('game:turnChanged', this.turnChangedHandler);
    this.socketClient.off('game:gameOver', this.gameOverHandler);
    this.socketClient.off('game:playerDisconnected', this.playerDisconnectedHandler);
    this.socketClient.off('game:playerReconnected', this.playerReconnectedHandler);
    this.socketClient.off('game:allianceProposal', this.allianceProposalHandler);
    this.socketClient.off('game:aiAction', this.aiActionHandler);
    this.socketClient.off('game:instantBatch', this.instantBatchHandler);
    this.socketClient.off('game:chat', this.chatHandler);
    this.socketClient.off('game:error', this.errorHandler);
  }
}
