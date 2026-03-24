import {
  BattleResult,
  createPlayer,
  createInitialGameState,
  generateMap,
  assignTerritories,
  SeededRandom,
  executeAttack,
  endTurn,
  distributeSurrenderedTerritories,
  GameRecorder,
  createSnapshot,
  restoreSnapshot,
  useFortify,
  useReinforce,
  GameErrorCode,
  createAllianceState,
  areAllied,
  formAlliance,
  wouldBreakAlliance,
  largestContiguousGroup,
} from '@dicewars/shared';
import type { GameState, MapShape, StateSnapshot, Player } from '@dicewars/shared';

// Server-specific game setup config (extends shared config concept for multiplayer)
export interface ServerGameConfig {
  playerCount: number;
  territoryCount: number;
  mapShape: string;
  gridType: string;
  speed: string;
  powerUps: boolean;
  fogOfWar: boolean;
  alliances: boolean;
  undoEnabled: boolean;
  seed?: string;
}

// In-memory active game
export interface ActiveGame {
  roomId: string;
  state: GameState;
  rng: SeededRandom;
  recorder: GameRecorder;
  snapshot: StateSnapshot | null;
  config: ServerGameConfig;
  playerMap: Map<string, number>; // userId → playerIndex
  aiPlayerIndices: Set<number>;
  disconnectedPlayers: Map<string, number>; // userId → disconnect timestamp
  turnTimer: ReturnType<typeof setTimeout> | null;
  status: 'playing' | 'finished' | 'abandoned';
}

export interface PlayerSlot {
  userId?: string;
  name: string;
  isAI: boolean;
  aiPersonality?: string;
  color: number;
}

export class GameEngineError extends Error {
  constructor(
    public code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameEngineError';
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash) || 1;
}

function seedFromConfig(mapSeed: string | null): number {
  if (mapSeed) {
    const parsed = Number(mapSeed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : hashString(mapSeed);
  }
  return Date.now();
}

export class GameEngine {
  private games = new Map<string, ActiveGame>();

  // --- Lifecycle ---

  createGame(
    roomId: string,
    config: ServerGameConfig,
    playerSlots: PlayerSlot[],
  ): ActiveGame {
    const seed = seedFromConfig(config.seed ?? null);
    const rng = new SeededRandom(seed);

    // Generate map
    const gridType = 'square' as const;
    const mapShape = (config.mapShape || 'rectangle') as MapShape;
    const { territories, adjacency } = generateMap(
      config.territoryCount,
      rng,
      gridType,
      mapShape,
    );

    // Create players from slots
    const players: Player[] = playerSlots.map((slot, index) =>
      createPlayer(
        index,
        slot.name,
        !slot.isAI,
        slot.color,
        slot.isAI ? (slot.aiPersonality as Parameters<typeof createPlayer>[4]) ?? 'balanced' : null,
      ),
    );

    // Assign territories to players (round-robin) and distribute initial dice (2-4)
    assignTerritories(territories, players.length, rng);

    // Build GameState
    const state = createInitialGameState(territories, players, adjacency);

    if (config.powerUps) {
      state.powerUpsEnabled = true;
    }
    if (config.alliances) {
      state.allianceState = createAllianceState(players.length);
    }

    // Create GameRecorder
    const recorder = new GameRecorder();
    recorder.setInitialState(
      state.territories,
      state.players,
      state.adjacency,
      !!state.powerUpsEnabled,
    );
    recorder.startTurn(state.turnNumber, state.currentPlayerIndex);

    // Build playerMap and aiPlayerIndices
    const playerMap = new Map<string, number>();
    const aiPlayerIndices = new Set<number>();
    playerSlots.forEach((slot, index) => {
      if (slot.userId) playerMap.set(slot.userId, index);
      if (slot.isAI) aiPlayerIndices.add(index);
    });

    const activeGame: ActiveGame = {
      roomId,
      state,
      rng,
      recorder,
      snapshot: null,
      config,
      playerMap,
      aiPlayerIndices,
      disconnectedPlayers: new Map(),
      turnTimer: null,
      status: 'playing',
    };

    this.games.set(roomId, activeGame);
    return activeGame;
  }

  getGame(roomId: string): ActiveGame | undefined {
    return this.games.get(roomId);
  }

  destroyGame(roomId: string): void {
    const game = this.games.get(roomId);
    if (game?.turnTimer) clearTimeout(game.turnTimer);
    this.games.delete(roomId);
  }

  // --- Actions ---

  executeAttack(
    roomId: string,
    userId: string,
    fromTerritoryId: number,
    toTerritoryId: number,
  ): {
    result: BattleResult;
    eliminated?: number;
    gameOver?: { winnerIndex: number };
  } {
    const game = this.getGameOrThrow(roomId);
    const playerIndex = this.getPlayerIndexOrThrow(game, userId);
    return this.executeAttackForPlayer(game, playerIndex, fromTerritoryId, toTerritoryId);
  }

  endTurn(
    roomId: string,
    userId: string,
  ): {
    bonusDice: number;
    nextPlayerIndex: number;
    powerUpSpawns?: Array<{ territoryId: number; type: string }>;
  } {
    const game = this.getGameOrThrow(roomId);
    const playerIndex = this.getPlayerIndexOrThrow(game, userId);
    return this.endTurnForPlayer(game, playerIndex);
  }

  usePowerUp(
    roomId: string,
    userId: string,
    type: string,
    targetTerritoryId: number,
    sourceTerritoryId?: number,
  ): void {
    const game = this.getGameOrThrow(roomId);
    const playerIndex = this.getPlayerIndexOrThrow(game, userId);
    this.usePowerUpForPlayer(game, playerIndex, type, targetTerritoryId, sourceTerritoryId);
  }

  undo(roomId: string, userId: string): void {
    const game = this.getGameOrThrow(roomId);
    const playerIndex = this.getPlayerIndexOrThrow(game, userId);

    if (!game.config.undoEnabled) {
      throw new GameEngineError(GameErrorCode.GAME_UNDO_DISABLED, 'Undo is disabled');
    }
    if (!game.snapshot) {
      throw new GameEngineError(GameErrorCode.GAME_UNDO_NO_SNAPSHOT, 'No snapshot to restore');
    }
    if (game.state.currentPlayerIndex !== playerIndex) {
      throw new GameEngineError(GameErrorCode.GAME_NOT_YOUR_TURN, "It's not your turn");
    }

    restoreSnapshot(game.state, game.snapshot);
    game.snapshot = null;
  }

  surrender(
    roomId: string,
    userId: string,
  ): { gameOver?: { winnerIndex: number } } {
    const game = this.getGameOrThrow(roomId);
    const playerIndex = this.getPlayerIndexOrThrow(game, userId);
    return this.surrenderForPlayer(game, playerIndex);
  }

  proposeAlliance(
    roomId: string,
    userId: string,
    targetPlayerIndex: number,
  ): void {
    const game = this.getGameOrThrow(roomId);
    const playerIndex = this.getPlayerIndexOrThrow(game, userId);

    if (!game.config.alliances) {
      throw new GameEngineError(GameErrorCode.GAME_ALLIANCE_DISABLED, 'Alliances are disabled');
    }
    const allianceState = game.state.allianceState;
    if (!allianceState) {
      throw new GameEngineError(GameErrorCode.GAME_ALLIANCE_DISABLED, 'Alliances are disabled');
    }

    const target = game.state.players[targetPlayerIndex];
    if (!target || !target.isAlive) {
      throw new GameEngineError(GameErrorCode.GAME_ALLIANCE_INVALID_TARGET, 'Invalid alliance target');
    }
    if (targetPlayerIndex === playerIndex) {
      throw new GameEngineError(GameErrorCode.GAME_ALLIANCE_INVALID_TARGET, 'Cannot ally with yourself');
    }
    if (areAllied(allianceState, playerIndex, targetPlayerIndex)) {
      throw new GameEngineError(GameErrorCode.GAME_ALLIANCE_ALREADY_ALLIED, 'Already allied');
    }

    formAlliance(allianceState, playerIndex, targetPlayerIndex, game.state.turnNumber);
    game.recorder.recordAction({
      type: 'allianceFormed',
      player1: playerIndex,
      player2: targetPlayerIndex,
      duration: 5,
    });
  }

  respondAlliance(
    roomId: string,
    userId: string,
    proposerIndex: number,
    accept: boolean,
  ): void {
    const game = this.getGameOrThrow(roomId);
    const playerIndex = this.getPlayerIndexOrThrow(game, userId);

    if (!game.config.alliances) {
      throw new GameEngineError(GameErrorCode.GAME_ALLIANCE_DISABLED, 'Alliances are disabled');
    }
    const allianceState = game.state.allianceState;
    if (!allianceState) {
      throw new GameEngineError(GameErrorCode.GAME_ALLIANCE_DISABLED, 'Alliances are disabled');
    }

    // Find matching proposal
    const proposalIdx = allianceState.proposals.findIndex(
      (p) => p.fromPlayer === proposerIndex && p.toPlayer === playerIndex,
    );
    if (proposalIdx === -1) {
      throw new GameEngineError(
        GameErrorCode.GAME_ALLIANCE_PROPOSAL_NOT_FOUND,
        'Alliance proposal not found',
      );
    }

    allianceState.proposals.splice(proposalIdx, 1);

    if (accept) {
      formAlliance(allianceState, proposerIndex, playerIndex, game.state.turnNumber);
      game.recorder.recordAction({
        type: 'allianceFormed',
        player1: proposerIndex,
        player2: playerIndex,
        duration: 5,
      });
    }
  }

  // --- AI support ---

  executeAIAttack(
    roomId: string,
    playerIndex: number,
    fromId: number,
    toId: number,
  ): {
    result: BattleResult;
    eliminated?: number;
    gameOver?: { winnerIndex: number };
  } {
    const game = this.getGameOrThrow(roomId);
    return this.executeAttackForPlayer(game, playerIndex, fromId, toId);
  }

  endAITurn(
    roomId: string,
    playerIndex: number,
  ): {
    bonusDice: number;
    nextPlayerIndex: number;
    powerUpSpawns?: Array<{ territoryId: number; type: string }>;
  } {
    const game = this.getGameOrThrow(roomId);
    return this.endTurnForPlayer(game, playerIndex);
  }

  surrenderAI(
    roomId: string,
    playerIndex: number,
  ): { gameOver?: { winnerIndex: number } } {
    const game = this.getGameOrThrow(roomId);
    return this.surrenderForPlayer(game, playerIndex);
  }

  // --- Core logic (shared by human and AI methods) ---

  private executeAttackForPlayer(
    game: ActiveGame,
    playerIndex: number,
    fromTerritoryId: number,
    toTerritoryId: number,
  ): {
    result: BattleResult;
    eliminated?: number;
    gameOver?: { winnerIndex: number };
  } {
    if (game.state.currentPlayerIndex !== playerIndex) {
      throw new GameEngineError(GameErrorCode.GAME_NOT_YOUR_TURN, "It's not your turn");
    }

    const from = game.state.territories[fromTerritoryId];
    const to = game.state.territories[toTerritoryId];
    if (!from || !to) {
      throw new GameEngineError(GameErrorCode.GAME_INVALID_TERRITORY, 'Invalid territory');
    }
    if (from.owner !== playerIndex) {
      throw new GameEngineError(GameErrorCode.GAME_TERRITORY_NOT_OWNED, 'You do not own this territory');
    }
    if (from.dice <= 1) {
      throw new GameEngineError(GameErrorCode.GAME_INSUFFICIENT_DICE, 'Need more than 1 die to attack');
    }
    if (!from.neighbors.includes(toTerritoryId)) {
      throw new GameEngineError(GameErrorCode.GAME_TERRITORY_NOT_ADJACENT, 'Territories are not adjacent');
    }
    if (to.owner === playerIndex) {
      throw new GameEngineError(GameErrorCode.GAME_TERRITORY_OWN, 'Cannot attack own territory');
    }

    // Check alliance
    if (
      game.config.alliances &&
      game.state.allianceState &&
      wouldBreakAlliance(game.state.allianceState, playerIndex, to.owner)
    ) {
      throw new GameEngineError(GameErrorCode.GAME_ALLIED_TERRITORY, 'Cannot attack allied territory');
    }

    // Snapshot for undo (if enabled and first attack this turn)
    if (game.config.undoEnabled && !game.snapshot) {
      game.snapshot = createSnapshot(game.state);
    }

    const defenderOwner = to.owner;

    // Execute attack using shared logic
    const result = executeAttack(fromTerritoryId, toTerritoryId, game.state, game.rng);

    // Record action
    game.recorder.recordAction({
      type: 'attack',
      attackerId: fromTerritoryId,
      defenderId: toTerritoryId,
      attackerPlayerId: playerIndex,
      defenderPlayerId: defenderOwner,
      result,
    });

    // Check if defender eliminated
    let eliminated: number | undefined;
    if (!game.state.players[defenderOwner].isAlive) {
      eliminated = defenderOwner;
      game.recorder.recordAction({
        type: 'elimination',
        playerId: defenderOwner,
        eliminatedBy: playerIndex,
      });
    }

    // Check game over
    let gameOver: { winnerIndex: number } | undefined;
    if (game.state.winner !== null) {
      gameOver = { winnerIndex: game.state.winner };
      game.status = 'finished';
    }

    return { result, eliminated, gameOver };
  }

  private endTurnForPlayer(
    game: ActiveGame,
    playerIndex: number,
  ): {
    bonusDice: number;
    nextPlayerIndex: number;
    powerUpSpawns?: Array<{ territoryId: number; type: string }>;
  } {
    if (game.state.currentPlayerIndex !== playerIndex) {
      throw new GameEngineError(GameErrorCode.GAME_NOT_YOUR_TURN, "It's not your turn");
    }

    // Calculate bonus before endTurn mutates state
    const playerTerritories = game.state.territories
      .filter((t) => t.owner === playerIndex)
      .map((t) => t.id);

    const bonusDice = largestContiguousGroup(playerTerritories, game.state.adjacency);

    const { spawn } = endTurn(game.state, game.rng);

    // Record action
    game.recorder.recordAction({
      type: 'endTurn',
      playerId: playerIndex,
      bonusDice,
    });

    // Record power-up spawn
    if (spawn) {
      game.recorder.recordAction({
        type: 'powerUpSpawn',
        territoryId: spawn.territoryId,
        powerUpType: spawn.powerUpType,
        ownerId: spawn.ownerId,
      });
    }

    // Clear undo snapshot
    game.snapshot = null;

    // Start new turn recording
    game.recorder.startTurn(game.state.turnNumber, game.state.currentPlayerIndex);

    const powerUpSpawns = spawn
      ? [{ territoryId: spawn.territoryId, type: spawn.powerUpType }]
      : undefined;

    return {
      bonusDice,
      nextPlayerIndex: game.state.currentPlayerIndex,
      powerUpSpawns,
    };
  }

  private usePowerUpForPlayer(
    game: ActiveGame,
    playerIndex: number,
    type: string,
    targetTerritoryId: number,
    sourceTerritoryId?: number,
  ): void {
    if (game.state.currentPlayerIndex !== playerIndex) {
      throw new GameEngineError(GameErrorCode.GAME_NOT_YOUR_TURN, "It's not your turn");
    }

    const target = game.state.territories[targetTerritoryId];
    if (!target) {
      throw new GameEngineError(GameErrorCode.GAME_POWERUP_INVALID_TARGET, 'Invalid target territory');
    }

    if (type === 'fortify') {
      if (sourceTerritoryId === undefined) {
        throw new GameEngineError(GameErrorCode.GAME_POWERUP_INVALID_SOURCE, 'Fortify requires a source territory');
      }
      const source = game.state.territories[sourceTerritoryId];
      if (!source) {
        throw new GameEngineError(GameErrorCode.GAME_POWERUP_INVALID_SOURCE, 'Invalid source territory');
      }
      // For fortify, the source has the power-up and dice move TO the target
      if (source.powerUp !== 'fortify') {
        throw new GameEngineError(GameErrorCode.GAME_POWERUP_NOT_FOUND, 'No fortify power-up on source territory');
      }
      if (source.owner !== playerIndex) {
        throw new GameEngineError(GameErrorCode.GAME_TERRITORY_NOT_OWNED, 'You do not own the source territory');
      }
      // Calculate dice to move (up to 3, keeping at least 1)
      const diceCount = Math.min(3, source.dice - 1);
      const success = useFortify(sourceTerritoryId, targetTerritoryId, diceCount, game.state);
      if (!success) {
        throw new GameEngineError(GameErrorCode.GAME_POWERUP_INVALID_TARGET, 'Fortify failed');
      }
      game.recorder.recordAction({
        type: 'fortify',
        fromId: sourceTerritoryId,
        toId: targetTerritoryId,
        diceCount,
        playerId: playerIndex,
      });
    } else if (type === 'reinforce') {
      if (target.powerUp !== 'reinforce') {
        throw new GameEngineError(GameErrorCode.GAME_POWERUP_NOT_FOUND, 'No reinforce power-up on territory');
      }
      if (target.owner !== playerIndex) {
        throw new GameEngineError(GameErrorCode.GAME_TERRITORY_NOT_OWNED, 'You do not own this territory');
      }
      const success = useReinforce(targetTerritoryId, game.state);
      if (!success) {
        throw new GameEngineError(GameErrorCode.GAME_POWERUP_INVALID_TARGET, 'Reinforce failed');
      }
      game.recorder.recordAction({
        type: 'reinforce',
        territoryId: targetTerritoryId,
        playerId: playerIndex,
      });
    } else {
      throw new GameEngineError(GameErrorCode.GAME_POWERUP_NOT_FOUND, `Unknown power-up type: ${type}`);
    }
  }

  private surrenderForPlayer(
    game: ActiveGame,
    playerIndex: number,
  ): { gameOver?: { winnerIndex: number } } {
    const player = game.state.players[playerIndex];
    if (!player.isAlive) {
      throw new GameEngineError(GameErrorCode.GAME_ALREADY_OVER, 'Player is already eliminated');
    }

    distributeSurrenderedTerritories(game.state, playerIndex);

    game.recorder.recordAction({
      type: 'surrender',
      playerId: playerIndex,
    });

    let gameOver: { winnerIndex: number } | undefined;
    if (game.state.winner !== null) {
      gameOver = { winnerIndex: game.state.winner };
      game.status = 'finished';
    }

    return { gameOver };
  }

  // --- Helpers ---

  private getGameOrThrow(roomId: string): ActiveGame {
    const game = this.games.get(roomId);
    if (!game) {
      throw new GameEngineError(GameErrorCode.GAME_NOT_FOUND, 'Game not found');
    }
    if (game.status === 'finished') {
      throw new GameEngineError(GameErrorCode.GAME_ALREADY_OVER, 'Game is already over');
    }
    return game;
  }

  private getPlayerIndexOrThrow(game: ActiveGame, userId: string): number {
    const index = game.playerMap.get(userId);
    if (index === undefined) {
      throw new GameEngineError(GameErrorCode.CONNECTION_NOT_IN_GAME, 'You are not in this game');
    }
    return index;
  }

  get activeGameCount(): number {
    return this.games.size;
  }
}
