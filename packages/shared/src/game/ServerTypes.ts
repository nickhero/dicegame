import type { GameError } from './ErrorContract';

// Wire-format types for server ↔ client communication.
// Named with "Wire" prefix to avoid conflicts with replay serialization in GameRecorder.

export interface WireTerritory {
  id: number;
  cells: [number, number][];
  center: [number, number];
  neighborIds: number[];
  owner: number; // -1 if fog-hidden
  dice: number; // 0 if fog-hidden
  visible: boolean;
  powerUp?: { type: string } | null;
}

export interface WirePlayer {
  index: number;
  name: string;
  color: number;
  isAI: boolean;
  personality?: string;
  alive: boolean;
  territoryCount: number;
  reserveDice: number;
  connected: boolean;
}

export interface WireAlliance {
  player1Index: number;
  player2Index: number;
  formedOnTurn: number;
}

export interface WirePowerUp {
  territoryId: number;
  type: string;
}

export interface WireGameState {
  territories: WireTerritory[];
  players: WirePlayer[];
  currentPlayerIndex: number;
  turnNumber: number;
  phase: 'selectingAttacker' | 'selectingDefender';
  alliances: WireAlliance[];
  powerUpLocations: WirePowerUp[];
  gameOver: boolean;
  winner: number | null;
  turnTimerRemaining: number | null;
}

// Server timing config for AI delays
export const SERVER_TIMING = {
  normal: {
    attackDelay: 1200,
    battleAnimDelay: 1500,
    turnEndDelay: 800,
    powerUpDelay: 600,
    allianceDelay: 1000,
    surrenderDelay: 1500,
  },
  fast: {
    attackDelay: 600,
    battleAnimDelay: 750,
    turnEndDelay: 400,
    powerUpDelay: 300,
    allianceDelay: 500,
    surrenderDelay: 750,
  },
  instant: {
    attackDelay: 0,
    battleAnimDelay: 0,
    turnEndDelay: 0,
    powerUpDelay: 0,
    allianceDelay: 0,
    surrenderDelay: 0,
  },
} as const;

export type SpeedMode = keyof typeof SERVER_TIMING;

// WebSocket event payloads - Server to Client
export interface BattleResultPayload {
  attackerTerritoryId: number;
  defenderTerritoryId: number;
  attackerDice: number[];
  defenderDice: number[];
  attackerWins: boolean;
  attackerPlayerIndex: number;
  defenderPlayerIndex: number;
}

export interface TurnChangedPayload {
  previousPlayerIndex: number;
  currentPlayerIndex: number;
  turnNumber: number;
  bonusDice: number;
  powerUpSpawns?: WirePowerUp[];
}

export interface AIActionPayload {
  playerIndex: number;
  actionType: 'attack' | 'endTurn' | 'powerUp' | 'surrender' | 'alliance';
  details: Record<string, unknown>;
}

export interface GameOverPayload {
  winnerIndex: number;
  stats: Record<string, unknown>;
  recording?: unknown;
}

export interface PlayerConnectionPayload {
  playerIndex: number;
  graceSeconds?: number;
}

export interface InstantBatchPayload {
  actions: AIActionPayload[];
  finalState: WireGameState;
}

// WebSocket event payloads - Client to Server
export interface AttackIntent {
  fromTerritoryId: number;
  toTerritoryId: number;
}

export interface PowerUpIntent {
  type: string;
  targetTerritoryId: number;
  sourceTerritoryId?: number;
}

export interface AllianceProposalIntent {
  targetPlayerIndex: number;
}

export interface AllianceResponseIntent {
  proposalId: string;
  accept: boolean;
}

// WebSocket ack format
export interface SocketAck<T = unknown> {
  success: boolean;
  data?: T;
  error?: GameError;
}

// Lobby types
export interface GameRoomSummary {
  id: string;
  name: string;
  creatorName: string;
  status: 'waiting' | 'started' | 'finished' | 'abandoned';
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  config: GameSetupSummary;
  createdAt: string;
}

export interface GameSetupSummary {
  mapShape: string;
  gridType: string;
  territoryCount: number;
  powerUps: boolean;
  fogOfWar: boolean;
  alliances: boolean;
}

// Socket.IO typed event maps
export interface ServerToClientEvents {
  'lobby:gameList': (games: GameRoomSummary[]) => void;
  'lobby:gameCreated': (game: GameRoomSummary) => void;
  'lobby:gameRemoved': (gameId: string) => void;
  'lobby:gameUpdated': (game: GameRoomSummary) => void;
  'lobby:playerCount': (data: { gameId: string; count: number }) => void;
  'game:stateUpdate': (state: WireGameState) => void;
  'game:battleResult': (result: BattleResultPayload) => void;
  'game:turnChanged': (data: TurnChangedPayload) => void;
  'game:aiAction': (action: AIActionPayload) => void;
  'game:playerJoined': (data: {
    playerIndex: number;
    name: string;
    isAI: boolean;
  }) => void;
  'game:playerLeft': (data: { playerIndex: number }) => void;
  'game:gameOver': (data: GameOverPayload) => void;
  'game:chat': (data: {
    playerIndex: number;
    message: string;
    timestamp: string;
  }) => void;
  'game:error': (error: GameError) => void;
  'game:playerDisconnected': (data: PlayerConnectionPayload) => void;
  'game:playerReconnected': (data: PlayerConnectionPayload) => void;
  'game:instantBatch': (data: InstantBatchPayload) => void;
  'game:spectatorCount': (data: { count: number }) => void;
  'game:readyState': (data: { userId: string; ready: boolean; readyPlayers: string[] }) => void;
}

export interface ClientToServerEvents {
  'game:attack': (
    data: AttackIntent,
    ack: (res: SocketAck<BattleResultPayload>) => void,
  ) => void;
  'game:endTurn': (
    ack: (res: SocketAck<TurnChangedPayload>) => void,
  ) => void;
  'game:usePowerUp': (
    data: PowerUpIntent,
    ack: (res: SocketAck) => void,
  ) => void;
  'game:surrender': (ack: (res: SocketAck) => void) => void;
  'game:undo': (
    ack: (res: SocketAck<WireGameState>) => void,
  ) => void;
  'game:proposeAlliance': (
    data: AllianceProposalIntent,
    ack: (res: SocketAck) => void,
  ) => void;
  'game:respondAlliance': (
    data: AllianceResponseIntent,
    ack: (res: SocketAck) => void,
  ) => void;
  'game:chat': (data: { message: string }) => void;
  'game:join': (
    data: { gameId: string },
    ack: (res: SocketAck<WireGameState>) => void,
  ) => void;
  'game:leave': (ack: (res: SocketAck) => void) => void;
  'game:ready': (ack: (res: SocketAck) => void) => void;
  'game:reconnect': (
    data: { gameId: string },
    ack: (res: SocketAck<WireGameState>) => void,
  ) => void;
  'game:spectate': (
    data: { gameId: string },
    ack: (res: SocketAck) => void,
  ) => void;
  'game:leaveSpectate': (
    ack: (res: SocketAck) => void,
  ) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
  userName: string;
  gameId?: string;
  isSpectator?: boolean;
}
