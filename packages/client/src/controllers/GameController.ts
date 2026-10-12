import type {
  GameState,
  AllianceProposal,
  GameError,
  AIActionPayload,
  InstantBatchPayload,
  WirePowerUp,
  SpeedMode,
} from '@dicewars/shared';

export interface BattleAnimationData {
  attackerId: number;
  defenderId: number;
  attackerDice: number[];
  defenderDice: number[];
  attackerTotal: number;
  defenderTotal: number;
  attackerWon: boolean;
  conquered: boolean;
  diceLost?: number;
  attackerPlayerIndex?: number;
  defenderPlayerIndex?: number;
}

export interface DiceDistributionData {
  playerId: number;
  deltas: Map<number, number>; // territoryId -> bonus dice count added
  totalBonus: number;
}

export interface TurnChangedData {
  previousPlayerIndex: number;
  currentPlayerIndex: number;
  turnNumber: number;
  bonusDice: number;
  distribution?: DiceDistributionData;
  powerUpSpawns?: WirePowerUp[];
}

export interface ChatMessageData {
  senderName: string;
  message: string;
  playerIndex: number;
  timestamp?: string;
}

export interface GameControllerEvents {
  onStateUpdate: (state: GameState, animated?: boolean) => void;
  onBattleResult?: (data: BattleAnimationData) => Promise<void> | void;
  onEventLog?: (message: string, color?: number) => void;
  onGameOver?: (winner: number | null, stats?: Record<string, unknown>) => void;
  onToast?: (message: string, type?: 'info' | 'warning' | 'error') => void;
  onAllianceProposal?: (proposal: AllianceProposal) => void;
  onTurnChanged?: (data: TurnChangedData) => void;
  onTimerTick?: (secondsRemaining: number) => void;
  onError?: (error: GameError) => void;
  onPlayerDisconnected?: (playerIndex: number, graceSeconds: number) => void;
  onPlayerReconnected?: (playerIndex: number) => void;
  onAIAction?: (action: AIActionPayload) => void;
  onInstantBatch?: (batch: InstantBatchPayload) => void;
  onChat?: (data: ChatMessageData) => void;
}

export interface IGameController {
  readonly isOnline: boolean;
  getState(): GameState;
  getLocalPlayerIndex(): number | undefined;
  attack(fromId: number, toId: number): Promise<boolean>;
  endTurn(): Promise<void>;
  usePowerUp(type: 'reinforce' | 'fortify', targetId: number, sourceId?: number): Promise<boolean>;
  surrender(): Promise<void>;
  undo(): Promise<boolean>;
  canUndo(): boolean;
  proposeAlliance(targetIndex: number): Promise<boolean>;
  respondAlliance(proposalId: string, accept: boolean): Promise<void>;
  sendChat?(message: string): void;
  start?(): void;
  setSpeed?(speed: SpeedMode): void;
  pause?(): void;
  resume?(): void;
  destroy(): void;
}
