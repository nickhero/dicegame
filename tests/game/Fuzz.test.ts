import { describe, it, expect } from 'vitest';
import { SeededRandom } from '../../src/utils/random';
import { generateMap, assignTerritories } from '../../src/game/MapGenerator';
import { createInitialGameState } from '../../src/game/GameState';
import { createPlayer } from '../../src/game/Player';
import {
  executeAttack,
  endTurn,
  isValidAttack,
  shouldAISurrender,
  distributeSurrenderedTerritories,
} from '../../src/game/GameRules';
import {
  selectBestMove,
  useAIPowerUps,
  findPossibleMoves,
} from '../../src/game/AIPlayer';
import {
  tickAlliances,
  createAllianceState,
  cleanupDeadPlayerAlliances,
  areAllied,
} from '../../src/game/Alliance';
import { getVisibleTerritories } from '../../src/game/FogOfWar';
import { MAX_DICE_PER_TERRITORY, PLAYER_COLORS } from '../../src/game/constants';
import {
  PERSONALITIES,
  getRandomPersonality,
  customPresetToPersonality,
} from '../../src/game/AIPersonality';
import type { PersonalityType } from '../../src/game/AIPersonality';
import type { MapShape } from '../../src/game/MapShapes';
import type { GameState } from '../../src/game/GameState';
import type { Player } from '../../src/game/Player';

const ALL_PERSONALITIES: PersonalityType[] = [
  'cautious', 'balanced', 'aggressive', 'reckless', 'expansionist', 'turtle',
];
const ALL_SHAPES: MapShape[] = ['rectangle', 'diamond', 'ring', 'continent'];
const GRID_TYPES: ('square' | 'hex')[] = ['square', 'hex'];

const MAX_TURNS = 1000;
const MAX_ATTACKS_PER_AI = 50; // safety cap even for Infinity personalities

interface FuzzConfig {
  seed: number;
  playerCount: number;
  territoryCount: number;
  gridType: 'square' | 'hex';
  mapShape: MapShape;
  powerUpsEnabled: boolean;
  fogOfWar: boolean;
  alliances: boolean;
  personalities: (PersonalityType | 'custom')[];
  customConfigs: ({ minAdvantage: number; maxAttacksPerTurn: number; connectivityBonus: number } | null)[];
}

function randomConfig(rng: SeededRandom, seed: number): FuzzConfig {
  const playerCount = rng.nextInt(2, 6);
  // Ensure enough territories for all players (at least 2 per player)
  const minTerritories = Math.max(12, playerCount * 2);
  const territoryCount = rng.nextInt(minTerritories, 40);
  const gridType = rng.pick(GRID_TYPES);
  const mapShape = rng.pick(ALL_SHAPES);
  const powerUpsEnabled = rng.next() < 0.5;
  const fogOfWar = rng.next() < 0.3;
  const alliances = rng.next() < 0.4;

  const personalities: (PersonalityType | 'custom')[] = [];
  const customConfigs: (FuzzConfig['customConfigs'][number])[] = [];

  for (let p = 0; p < playerCount; p++) {
    if (rng.next() < 0.15) {
      personalities.push('custom');
      customConfigs.push({
        minAdvantage: rng.nextInt(-3, 5),
        maxAttacksPerTurn: rng.next() < 0.3 ? Infinity : rng.nextInt(1, 20),
        connectivityBonus: rng.nextInt(0, 10),
      });
    } else {
      personalities.push(rng.pick(ALL_PERSONALITIES));
      customConfigs.push(null);
    }
  }

  return {
    seed, playerCount, territoryCount, gridType, mapShape,
    powerUpsEnabled, fogOfWar, alliances, personalities, customConfigs,
  };
}

function createPlayers(config: FuzzConfig): Player[] {
  const players: Player[] = [];
  for (let i = 0; i < config.playerCount; i++) {
    const personality = config.personalities[i] === 'custom' ? 'balanced' : config.personalities[i] as PersonalityType;
    const customConfig = config.customConfigs[i]
      ? customPresetToPersonality({
          name: 'FuzzCustom',
          ...config.customConfigs[i]!,
        })
      : undefined;
    players.push(
      createPlayer(i, `P${i}`, false, PLAYER_COLORS[i], personality, customConfig),
    );
  }
  return players;
}

function runGame(config: FuzzConfig): { turnCount: number; winner: number | null; state: GameState } {
  const rng = new SeededRandom(config.seed);

  const { territories, adjacency } = generateMap(
    config.territoryCount, rng, config.gridType, config.mapShape,
  );
  const players = createPlayers(config);
  assignTerritories(territories, config.playerCount, rng);

  const state = createInitialGameState(territories, players, adjacency);
  state.powerUpsEnabled = config.powerUpsEnabled;

  if (config.alliances) {
    state.allianceState = createAllianceState(config.playerCount);
  }

  let turnCount = 0;

  while (state.phase !== 'gameOver' && turnCount < MAX_TURNS) {
    const currentPlayer = state.players[state.currentPlayerIndex];

    if (!currentPlayer.isAlive) {
      endTurn(state, rng);
      turnCount++;
      continue;
    }

    // Surrender check
    if (shouldAISurrender(state, currentPlayer.id)) {
      distributeSurrenderedTerritories(state, currentPlayer.id);
      if (state.allianceState) {
        cleanupDeadPlayerAlliances(state.allianceState, currentPlayer.id);
      }
      if (state.phase === 'gameOver') break;
      endTurn(state, rng);
      turnCount++;
      continue;
    }

    // Alliance tick
    if (state.allianceState) {
      tickAlliances(state.allianceState, state, rng);
    }

    // Use power-ups
    if (state.powerUpsEnabled) {
      useAIPowerUps(state);
    }

    // Fog of war visibility
    const visibleSet = config.fogOfWar
      ? getVisibleTerritories(state, currentPlayer.id)
      : undefined;

    // Execute attacks
    let attacks = 0;
    for (let a = 0; a < MAX_ATTACKS_PER_AI; a++) {
      const move = selectBestMove(state, rng, undefined, visibleSet);
      if (!move || !isValidAttack(move.attackerId, move.defenderId, state)) break;
      executeAttack(move.attackerId, move.defenderId, state, rng);
      attacks++;
      if (state.phase === 'gameOver') break;
    }

    if (state.phase === 'gameOver') break;

    endTurn(state, rng);
    turnCount++;
  }

  return { turnCount, winner: state.winner, state };
}

function validateState(state: GameState, config: FuzzConfig): void {
  const alivePlayers = state.players.filter(p => p.isAlive);

  // Every territory has a valid owner
  for (const t of state.territories) {
    expect(t.owner).toBeGreaterThanOrEqual(0);
    expect(t.owner).toBeLessThan(config.playerCount);
  }

  // Every territory dice count is 1–MAX_DICE
  for (const t of state.territories) {
    expect(t.dice).toBeGreaterThanOrEqual(1);
    expect(t.dice).toBeLessThanOrEqual(MAX_DICE_PER_TERRITORY);
  }

  // Adjacency is symmetric
  for (const [id, neighbors] of state.adjacency) {
    for (const n of neighbors) {
      expect(
        state.adjacency.get(n)?.has(id),
        `Adjacency not symmetric: ${n} should have ${id} as neighbor`,
      ).toBe(true);
    }
  }

  // No player has negative reserveDice
  for (const p of state.players) {
    expect(p.reserveDice).toBeGreaterThanOrEqual(0);
  }

  // If game ended, exactly one living player and winner is set
  if (state.phase === 'gameOver') {
    expect(alivePlayers.length).toBe(1);
    expect(state.winner).toBe(alivePlayers[0].id);
  }

  // Alliance invariants
  if (state.allianceState) {
    for (const alliance of state.allianceState.alliances) {
      // No self-alliances
      expect(alliance.player1).not.toBe(alliance.player2);
      // No alliances with dead players
      const p1 = state.players[alliance.player1];
      const p2 = state.players[alliance.player2];
      if (state.phase === 'gameOver') {
        // After game over, cleanup may not have run — skip
      } else {
        expect(p1.isAlive || p2.isAlive).toBe(true);
      }
    }
  }

  // Dead players own no territories
  for (const p of state.players) {
    if (!p.isAlive) {
      const owned = state.territories.filter(t => t.owner === p.id);
      // After surrender/elimination, dead players should have 0 territories
      // (unless game just ended and cleanup is partial)
      if (state.phase !== 'gameOver') {
        expect(owned.length).toBe(0);
      }
    }
  }
}

// ─── Fuzz tests ───────────────────────────────────────────────────────────────

describe('Fuzz tests — randomized full games', () => {
  const BASE_SEED = Date.now();

  for (let i = 0; i < 50; i++) {
    const seed = BASE_SEED + i;
    it(`game #${i} (seed: ${seed})`, () => {
      const configRng = new SeededRandom(seed);
      const config = randomConfig(configRng, seed);

      const { state } = runGame(config);
      validateState(state, config);
    });
  }
});

// ─── Edge case games ──────────────────────────────────────────────────────────

describe('Fuzz edge cases', () => {
  const BASE_SEED = Date.now();

  it('2 players, minimum territories', () => {
    const seed = BASE_SEED + 100;
    const config: FuzzConfig = {
      seed,
      playerCount: 2,
      territoryCount: 6,
      gridType: 'square',
      mapShape: 'rectangle',
      powerUpsEnabled: false,
      fogOfWar: false,
      alliances: false,
      personalities: ['aggressive', 'aggressive'],
      customConfigs: [null, null],
    };
    const { state } = runGame(config);
    validateState(state, config);
  });

  it('6 players, maximum territories', () => {
    const seed = BASE_SEED + 101;
    const config: FuzzConfig = {
      seed,
      playerCount: 6,
      territoryCount: 42,
      gridType: 'hex',
      mapShape: 'rectangle',
      powerUpsEnabled: true,
      fogOfWar: true,
      alliances: true,
      personalities: ['cautious', 'balanced', 'aggressive', 'reckless', 'expansionist', 'turtle'],
      customConfigs: [null, null, null, null, null, null],
    };
    const { state } = runGame(config);
    validateState(state, config);
  });

  it('all reckless personalities', () => {
    const seed = BASE_SEED + 102;
    const config: FuzzConfig = {
      seed,
      playerCount: 4,
      territoryCount: 20,
      gridType: 'square',
      mapShape: 'diamond',
      powerUpsEnabled: true,
      fogOfWar: false,
      alliances: false,
      personalities: ['reckless', 'reckless', 'reckless', 'reckless'],
      customConfigs: [null, null, null, null],
    };
    const { state } = runGame(config);
    validateState(state, config);
  });

  it('all turtle personalities', () => {
    const seed = BASE_SEED + 103;
    const config: FuzzConfig = {
      seed,
      playerCount: 4,
      territoryCount: 20,
      gridType: 'hex',
      mapShape: 'ring',
      powerUpsEnabled: false,
      fogOfWar: false,
      alliances: true,
      personalities: ['turtle', 'turtle', 'turtle', 'turtle'],
      customConfigs: [null, null, null, null],
    };
    const { state } = runGame(config);
    validateState(state, config);
  });

  it('all custom with extreme settings', () => {
    const seed = BASE_SEED + 104;
    const extreme = customPresetToPersonality({
      name: 'Extreme',
      minAdvantage: -3,
      maxAttacksPerTurn: 100,
      connectivityBonus: 10,
    });
    const config: FuzzConfig = {
      seed,
      playerCount: 4,
      territoryCount: 20,
      gridType: 'square',
      mapShape: 'continent',
      powerUpsEnabled: true,
      fogOfWar: true,
      alliances: true,
      personalities: ['custom', 'custom', 'custom', 'custom'],
      customConfigs: [
        { minAdvantage: -3, maxAttacksPerTurn: 100, connectivityBonus: 10 },
        { minAdvantage: 5, maxAttacksPerTurn: 1, connectivityBonus: 0 },
        { minAdvantage: -2, maxAttacksPerTurn: Infinity, connectivityBonus: 0 },
        { minAdvantage: 0, maxAttacksPerTurn: 3, connectivityBonus: 8 },
      ],
    };
    const { state } = runGame(config);
    validateState(state, config);
  });

  it('hex grid with all map shapes', () => {
    for (const shape of ALL_SHAPES) {
      const seed = BASE_SEED + 200 + ALL_SHAPES.indexOf(shape);
      const config: FuzzConfig = {
        seed,
        playerCount: 3,
        territoryCount: 18,
        gridType: 'hex',
        mapShape: shape,
        powerUpsEnabled: true,
        fogOfWar: false,
        alliances: false,
        personalities: ['balanced', 'aggressive', 'cautious'],
        customConfigs: [null, null, null],
      };
      const { state } = runGame(config);
      validateState(state, config);
    }
  });

  it('fog of war + alliances + power-ups combined', () => {
    const seed = BASE_SEED + 300;
    const config: FuzzConfig = {
      seed,
      playerCount: 5,
      territoryCount: 30,
      gridType: 'square',
      mapShape: 'continent',
      powerUpsEnabled: true,
      fogOfWar: true,
      alliances: true,
      personalities: ['balanced', 'reckless', 'turtle', 'expansionist', 'cautious'],
      customConfigs: [null, null, null, null, null],
    };
    const { state } = runGame(config);
    validateState(state, config);
  });
});
