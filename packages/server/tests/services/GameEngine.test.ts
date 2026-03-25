import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine, GameEngineError, ServerGameConfig, PlayerSlot, ActiveGame } from '../../src/services/GameEngine';
import { GameErrorCode, PLAYER_COLORS, areAllied, SeededRandom } from '@dicewars/shared';

function makeConfig(overrides: Partial<ServerGameConfig> = {}): ServerGameConfig {
  return {
    playerCount: 4,
    territoryCount: 20,
    mapShape: 'rectangle',
    gridType: 'square',
    speed: 'normal',
    powerUps: false,
    fogOfWar: false,
    alliances: false,
    undoEnabled: true,
    seed: '42',
    ...overrides,
  };
}

function makeSlots(count: number, humanCount = 1): PlayerSlot[] {
  const slots: PlayerSlot[] = [];
  for (let i = 0; i < count; i++) {
    if (i < humanCount) {
      slots.push({
        userId: `user-${i}`,
        name: `Player ${i}`,
        isAI: false,
        color: PLAYER_COLORS[i],
      });
    } else {
      slots.push({
        name: `AI ${i}`,
        isAI: true,
        aiPersonality: 'balanced',
        color: PLAYER_COLORS[i],
      });
    }
  }
  return slots;
}

describe('GameEngine', () => {
  let engine: GameEngine;
  const roomId = 'room-1';

  beforeEach(() => {
    engine = new GameEngine();
  });

  // --- createGame ---

  describe('createGame', () => {
    it('creates a valid game with correct state', () => {
      const config = makeConfig();
      const slots = makeSlots(4);
      const game = engine.createGame(roomId, config, slots);

      expect(game.roomId).toBe(roomId);
      expect(game.status).toBe('playing');
      expect(game.state.territories.length).toBe(config.territoryCount);
      expect(game.state.players.length).toBe(4);
      expect(game.state.currentPlayerIndex).toBe(0);
      expect(game.state.turnNumber).toBe(1);

      // Every territory should be owned by a valid player
      for (const t of game.state.territories) {
        expect(t.owner).toBeGreaterThanOrEqual(0);
        expect(t.owner).toBeLessThan(4);
        // Each territory should have 2-4 dice
        expect(t.dice).toBeGreaterThanOrEqual(2);
        expect(t.dice).toBeLessThanOrEqual(4);
      }
    });

    it('marks AI players correctly', () => {
      const config = makeConfig();
      const slots = makeSlots(4, 1); // 1 human, 3 AI
      const game = engine.createGame(roomId, config, slots);

      expect(game.aiPlayerIndices.size).toBe(3);
      expect(game.aiPlayerIndices.has(0)).toBe(false);
      expect(game.aiPlayerIndices.has(1)).toBe(true);
      expect(game.aiPlayerIndices.has(2)).toBe(true);
      expect(game.aiPlayerIndices.has(3)).toBe(true);

      expect(game.state.players[0].isHuman).toBe(true);
      expect(game.state.players[1].isHuman).toBe(false);
      expect(game.state.players[2].isHuman).toBe(false);
      expect(game.state.players[3].isHuman).toBe(false);
    });

    it('builds playerMap correctly', () => {
      const config = makeConfig();
      const slots = makeSlots(4, 2); // 2 humans, 2 AI
      const game = engine.createGame(roomId, config, slots);

      expect(game.playerMap.get('user-0')).toBe(0);
      expect(game.playerMap.get('user-1')).toBe(1);
      // AI players have no userId so should not be in map
      expect(game.playerMap.size).toBe(2);
    });

    it('enables power-ups when configured', () => {
      const config = makeConfig({ powerUps: true });
      const slots = makeSlots(4);
      const game = engine.createGame(roomId, config, slots);

      expect(game.state.powerUpsEnabled).toBe(true);
    });

    it('enables alliances when configured', () => {
      const config = makeConfig({ alliances: true });
      const slots = makeSlots(4);
      const game = engine.createGame(roomId, config, slots);

      expect(game.state.allianceState).toBeDefined();
      expect(game.state.allianceState!.alliances).toEqual([]);
    });

    it('produces deterministic maps with same seed', () => {
      const config = makeConfig({ seed: '12345' });
      const slots = makeSlots(4);

      const game1 = engine.createGame('room-a', config, slots);
      const game2 = engine.createGame('room-b', config, slots);

      // Same seed should produce same territory layout
      expect(game1.state.territories.length).toBe(game2.state.territories.length);
      for (let i = 0; i < game1.state.territories.length; i++) {
        expect(game1.state.territories[i].owner).toBe(game2.state.territories[i].owner);
        expect(game1.state.territories[i].dice).toBe(game2.state.territories[i].dice);
      }

      engine.destroyGame('room-a');
      engine.destroyGame('room-b');
    });

    it('tracks active game count', () => {
      expect(engine.activeGameCount).toBe(0);
      engine.createGame('r1', makeConfig(), makeSlots(4));
      expect(engine.activeGameCount).toBe(1);
      engine.createGame('r2', makeConfig(), makeSlots(4));
      expect(engine.activeGameCount).toBe(2);
      engine.destroyGame('r1');
      expect(engine.activeGameCount).toBe(1);
    });
  });

  // --- getGame / destroyGame ---

  describe('getGame', () => {
    it('returns the game', () => {
      engine.createGame(roomId, makeConfig(), makeSlots(4));
      expect(engine.getGame(roomId)).toBeDefined();
      expect(engine.getGame(roomId)!.roomId).toBe(roomId);
    });

    it('returns undefined for non-existent game', () => {
      expect(engine.getGame('nonexistent')).toBeUndefined();
    });
  });

  describe('destroyGame', () => {
    it('removes from active games', () => {
      engine.createGame(roomId, makeConfig(), makeSlots(4));
      expect(engine.getGame(roomId)).toBeDefined();
      engine.destroyGame(roomId);
      expect(engine.getGame(roomId)).toBeUndefined();
    });

    it('handles non-existent room gracefully', () => {
      expect(() => engine.destroyGame('nonexistent')).not.toThrow();
    });
  });

  // --- executeAttack ---

  describe('executeAttack', () => {
    let game: ActiveGame;

    function setupAttackableGame(): {
      attackerId: number;
      defenderId: number;
    } {
      const config = makeConfig({ seed: '42', undoEnabled: true });
      const slots = makeSlots(4, 2);
      game = engine.createGame(roomId, config, slots);

      // Find a territory owned by player 0 with >1 dice that borders an enemy
      const state = game.state;
      const player0 = 0;

      for (const t of state.territories) {
        if (t.owner !== player0 || t.dice <= 1) continue;
        for (const nId of t.neighbors) {
          const neighbor = state.territories[nId];
          if (neighbor.owner !== player0) {
            return { attackerId: t.id, defenderId: nId };
          }
        }
      }

      // Force setup: give player 0 a territory with enough dice
      const owned = state.territories.find((t) => t.owner === player0)!;
      owned.dice = 4;
      const enemyNeighbor = owned.neighbors.find(
        (nId) => state.territories[nId].owner !== player0,
      )!;
      return { attackerId: owned.id, defenderId: enemyNeighbor };
    }

    it('valid attack succeeds and returns battle result', () => {
      const { attackerId, defenderId } = setupAttackableGame();
      const result = engine.executeAttack(roomId, 'user-0', attackerId, defenderId);

      expect(result.result).toBeDefined();
      expect(result.result.attackerRolls).toBeDefined();
      expect(result.result.defenderRolls).toBeDefined();
      expect(typeof result.result.attackerWins).toBe('boolean');
    });

    it('rejects wrong turn', () => {
      setupAttackableGame();
      // user-1 is player 1, but it's player 0's turn
      const t = game.state.territories.find((t) => t.owner === 1 && t.dice > 1);
      const target = t
        ? t.neighbors.find((nId) => game.state.territories[nId].owner !== 1)
        : undefined;

      expect(() =>
        engine.executeAttack(roomId, 'user-1', t?.id ?? 0, target ?? 0),
      ).toThrow(GameEngineError);

      try {
        engine.executeAttack(roomId, 'user-1', t?.id ?? 0, target ?? 0);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_NOT_YOUR_TURN);
      }
    });

    it('rejects unowned territory', () => {
      setupAttackableGame();
      // Find a territory NOT owned by player 0
      const enemyTerritory = game.state.territories.find((t) => t.owner !== 0)!;
      const target = enemyTerritory.neighbors[0];

      expect(() =>
        engine.executeAttack(roomId, 'user-0', enemyTerritory.id, target),
      ).toThrow(GameEngineError);

      try {
        engine.executeAttack(roomId, 'user-0', enemyTerritory.id, target);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_TERRITORY_NOT_OWNED);
      }
    });

    it('rejects insufficient dice', () => {
      setupAttackableGame();
      // Find or set up a territory with exactly 1 die
      const owned = game.state.territories.find((t) => t.owner === 0)!;
      owned.dice = 1;
      const enemy = owned.neighbors.find(
        (nId) => game.state.territories[nId].owner !== 0,
      )!;

      expect(() =>
        engine.executeAttack(roomId, 'user-0', owned.id, enemy),
      ).toThrow(GameEngineError);

      try {
        engine.executeAttack(roomId, 'user-0', owned.id, enemy);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_INSUFFICIENT_DICE);
      }
    });

    it('rejects non-adjacent territories', () => {
      setupAttackableGame();
      const owned = game.state.territories.find((t) => t.owner === 0 && t.dice > 1)!;
      // Find a territory not in neighbors
      const nonAdjacent = game.state.territories.find(
        (t) => t.owner !== 0 && !owned.neighbors.includes(t.id),
      );
      if (!nonAdjacent) return; // Skip if no such territory exists

      expect(() =>
        engine.executeAttack(roomId, 'user-0', owned.id, nonAdjacent.id),
      ).toThrow(GameEngineError);

      try {
        engine.executeAttack(roomId, 'user-0', owned.id, nonAdjacent.id);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_TERRITORY_NOT_ADJACENT);
      }
    });

    it('rejects attack on own territory', () => {
      setupAttackableGame();
      const owned = game.state.territories.find((t) => t.owner === 0 && t.dice > 1)!;
      const ownedNeighbor = owned.neighbors.find(
        (nId) => game.state.territories[nId].owner === 0,
      );
      if (ownedNeighbor === undefined) return; // Skip if no own neighbor

      expect(() =>
        engine.executeAttack(roomId, 'user-0', owned.id, ownedNeighbor),
      ).toThrow(GameEngineError);

      try {
        engine.executeAttack(roomId, 'user-0', owned.id, ownedNeighbor);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_TERRITORY_OWN);
      }
    });

    it('breaks alliance when attacking allied territory', () => {
      // Create game with alliances enabled
      const config = makeConfig({ seed: '42', alliances: true });
      const slots = makeSlots(4, 2);
      game = engine.createGame(roomId, config, slots);

      // Find an attackable pair
      const owned = game.state.territories.find((t) => t.owner === 0 && t.dice > 1)!;
      const enemyNId = owned.neighbors.find(
        (nId) => game.state.territories[nId].owner !== 0,
      );
      if (enemyNId === undefined) return;

      const enemyOwner = game.state.territories[enemyNId].owner;

      // Form an alliance (mutual proposals = auto-accept)
      engine.proposeAlliance(roomId, 'user-0', enemyOwner);
      engine.proposeAlliance(roomId, `user-${enemyOwner}`, 0);
      expect(areAllied(game.state.allianceState!, 0, enemyOwner)).toBe(true);

      // Attack should succeed and break the alliance
      owned.dice = 8; // Ensure enough dice
      engine.executeAttack(roomId, 'user-0', owned.id, enemyNId);
      expect(areAllied(game.state.allianceState!, 0, enemyOwner)).toBe(false);
    });

    it('detects elimination', () => {
      setupAttackableGame();

      // Give all territories to player 0 except one to player 1
      const lastTerritory = game.state.territories.find((t) => t.owner === 1)!;
      for (const t of game.state.territories) {
        if (t.owner === 1 && t.id !== lastTerritory.id) {
          t.owner = 0;
        }
      }

      // Make sure player 0 has a neighbor with high dice
      const attacker = game.state.territories.find(
        (t) => t.owner === 0 && t.neighbors.includes(lastTerritory.id),
      );
      if (!attacker) return;

      attacker.dice = 8;
      lastTerritory.dice = 1;

      // Use deterministic RNG — keep attacking until attacker wins
      let result;
      let attempts = 0;
      while (attempts < 50) {
        // Restore state for another attempt if needed
        if (attacker.dice <= 1) {
          attacker.dice = 8;
          lastTerritory.dice = 1;
          lastTerritory.owner = 1;
          game.state.players[1].isAlive = true;
          game.state.winner = null;
          game.state.phase = 'selectingAttacker';
        }

        result = engine.executeAttack(roomId, 'user-0', attacker.id, lastTerritory.id);
        attempts++;

        if (result.result.attackerWins) {
          break;
        }
      }

      // After successful attack on last territory, player 1 should be eliminated
      expect(result!.result.attackerWins).toBe(true);
      expect(result!.eliminated).toBe(1);
    });

    it('detects game over', () => {
      setupAttackableGame();

      // Set up so only players 0 and 1 are alive, player 1 has 1 territory
      game.state.players[2].isAlive = false;
      game.state.players[3].isAlive = false;

      // Give all territories except one to player 0
      for (const t of game.state.territories) {
        if (t.owner === 2 || t.owner === 3) {
          t.owner = 0;
        }
      }

      // Player 1 gets only one territory
      const player1Territories = game.state.territories.filter((t) => t.owner === 1);
      for (let i = 1; i < player1Territories.length; i++) {
        player1Territories[i].owner = 0;
      }
      const lastTerritory = player1Territories[0];
      lastTerritory.dice = 1;

      // Find attacker
      const attacker = game.state.territories.find(
        (t) => t.owner === 0 && t.neighbors.includes(lastTerritory.id),
      );
      if (!attacker) return;
      attacker.dice = 8;

      // Keep attacking until we win
      let result;
      let attempts = 0;
      while (attempts < 50) {
        if (attacker.dice <= 1) {
          attacker.dice = 8;
          lastTerritory.dice = 1;
          lastTerritory.owner = 1;
          game.state.players[1].isAlive = true;
          game.state.winner = null;
          game.state.phase = 'selectingAttacker';
        }

        result = engine.executeAttack(roomId, 'user-0', attacker.id, lastTerritory.id);
        attempts++;

        if (result.result.attackerWins) break;
      }

      expect(result!.gameOver).toBeDefined();
      expect(result!.gameOver!.winnerIndex).toBe(0);
      expect(game.status).toBe('finished');
    });

    it('creates undo snapshot on first attack', () => {
      const { attackerId, defenderId } = setupAttackableGame();
      expect(game.snapshot).toBeNull();

      engine.executeAttack(roomId, 'user-0', attackerId, defenderId);

      expect(game.snapshot).not.toBeNull();
    });
  });

  // --- endTurn ---

  describe('endTurn', () => {
    it('advances to next alive player', () => {
      const config = makeConfig({ seed: '42' });
      const slots = makeSlots(4, 2);
      const game = engine.createGame(roomId, config, slots);

      expect(game.state.currentPlayerIndex).toBe(0);
      const result = engine.endTurn(roomId, 'user-0');
      expect(result.nextPlayerIndex).toBe(1);
      expect(game.state.currentPlayerIndex).toBe(1);
    });

    it('distributes bonus dice', () => {
      const config = makeConfig({ seed: '42' });
      const slots = makeSlots(4, 2);
      const game = engine.createGame(roomId, config, slots);

      const result = engine.endTurn(roomId, 'user-0');
      // Bonus dice should be at least 1 (smallest contiguous group)
      expect(result.bonusDice).toBeGreaterThanOrEqual(1);
    });

    it('clears undo snapshot', () => {
      const config = makeConfig({ seed: '42', undoEnabled: true });
      const slots = makeSlots(4, 2);
      const game = engine.createGame(roomId, config, slots);

      // Force a snapshot
      const owned = game.state.territories.find((t) => t.owner === 0 && t.dice > 1)!;
      const enemyNId = owned.neighbors.find(
        (nId) => game.state.territories[nId].owner !== 0,
      )!;
      engine.executeAttack(roomId, 'user-0', owned.id, enemyNId);
      expect(game.snapshot).not.toBeNull();

      engine.endTurn(roomId, 'user-0');
      expect(game.snapshot).toBeNull();
    });

    it('rejects wrong turn', () => {
      engine.createGame(roomId, makeConfig({ seed: '42' }), makeSlots(4, 2));

      expect(() => engine.endTurn(roomId, 'user-1')).toThrow(GameEngineError);
      try {
        engine.endTurn(roomId, 'user-1');
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_NOT_YOUR_TURN);
      }
    });

    it('skips eliminated players', () => {
      const config = makeConfig({ seed: '42' });
      const slots = makeSlots(4, 3);
      const game = engine.createGame(roomId, config, slots);

      // Eliminate player 1
      game.state.players[1].isAlive = false;

      const result = engine.endTurn(roomId, 'user-0');
      // Should skip player 1 and go to player 2
      expect(result.nextPlayerIndex).toBe(2);
    });
  });

  // --- usePowerUp ---

  describe('usePowerUp', () => {
    it('valid reinforce usage works', () => {
      const config = makeConfig({ seed: '42', powerUps: true });
      const slots = makeSlots(4, 1);
      const game = engine.createGame(roomId, config, slots);

      // Place a reinforce power-up on a territory owned by player 0
      const owned = game.state.territories.find((t) => t.owner === 0)!;
      owned.powerUp = 'reinforce';
      owned.dice = 3;

      engine.usePowerUp(roomId, 'user-0', 'reinforce', owned.id);

      expect(owned.powerUp).toBeUndefined();
      expect(owned.dice).toBe(5); // 3 + 2
    });

    it('valid fortify usage works', () => {
      const config = makeConfig({ seed: '42', powerUps: true });
      const slots = makeSlots(4, 1);
      const game = engine.createGame(roomId, config, slots);

      // Find two adjacent territories owned by player 0
      const source = game.state.territories.find(
        (t) => t.owner === 0 && t.dice >= 3 && t.neighbors.some(
          (nId) => game.state.territories[nId].owner === 0,
        ),
      )!;
      const targetId = source.neighbors.find(
        (nId) => game.state.territories[nId].owner === 0,
      )!;
      const target = game.state.territories[targetId];

      source.powerUp = 'fortify';
      const sourceDiceBefore = source.dice;
      const targetDiceBefore = target.dice;

      engine.usePowerUp(roomId, 'user-0', 'fortify', targetId, source.id);

      expect(source.powerUp).toBeUndefined();
      // Dice should have moved
      const moved = Math.min(3, sourceDiceBefore - 1);
      expect(source.dice).toBe(sourceDiceBefore - moved);
      expect(target.dice).toBeLessThanOrEqual(targetDiceBefore + moved);
    });

    it('rejects non-existent power-up', () => {
      const config = makeConfig({ seed: '42', powerUps: true });
      const slots = makeSlots(4, 1);
      const game = engine.createGame(roomId, config, slots);

      const owned = game.state.territories.find((t) => t.owner === 0)!;
      // No power-up on this territory
      owned.powerUp = undefined;

      expect(() =>
        engine.usePowerUp(roomId, 'user-0', 'reinforce', owned.id),
      ).toThrow(GameEngineError);

      try {
        engine.usePowerUp(roomId, 'user-0', 'reinforce', owned.id);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_POWERUP_NOT_FOUND);
      }
    });

    it('rejects unknown power-up type', () => {
      const config = makeConfig({ seed: '42', powerUps: true });
      const slots = makeSlots(4, 1);
      const game = engine.createGame(roomId, config, slots);

      const owned = game.state.territories.find((t) => t.owner === 0)!;

      expect(() =>
        engine.usePowerUp(roomId, 'user-0', 'nonexistent', owned.id),
      ).toThrow(GameEngineError);
    });
  });

  // --- undo ---

  describe('undo', () => {
    it('restores state from snapshot', () => {
      const config = makeConfig({ seed: '42', undoEnabled: true });
      const slots = makeSlots(4, 1);
      const game = engine.createGame(roomId, config, slots);

      // Find attackable pair
      const owned = game.state.territories.find((t) => t.owner === 0 && t.dice > 1)!;
      const enemyNId = owned.neighbors.find(
        (nId) => game.state.territories[nId].owner !== 0,
      )!;

      // Record state before attack
      const ownedDiceBefore = owned.dice;
      const enemyOwnerBefore = game.state.territories[enemyNId].owner;
      const enemyDiceBefore = game.state.territories[enemyNId].dice;

      engine.executeAttack(roomId, 'user-0', owned.id, enemyNId);

      // State should have changed
      const ownedDiceAfterAttack = owned.dice;
      expect(ownedDiceAfterAttack).not.toBe(ownedDiceBefore);

      // Undo
      engine.undo(roomId, 'user-0');

      // State should be restored
      expect(owned.dice).toBe(ownedDiceBefore);
      expect(game.state.territories[enemyNId].owner).toBe(enemyOwnerBefore);
      expect(game.state.territories[enemyNId].dice).toBe(enemyDiceBefore);
      expect(game.snapshot).toBeNull();
    });

    it('rejects when disabled', () => {
      const config = makeConfig({ seed: '42', undoEnabled: false });
      const slots = makeSlots(4, 1);
      engine.createGame(roomId, config, slots);

      expect(() => engine.undo(roomId, 'user-0')).toThrow(GameEngineError);
      try {
        engine.undo(roomId, 'user-0');
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_UNDO_DISABLED);
      }
    });

    it('rejects when no snapshot', () => {
      const config = makeConfig({ seed: '42', undoEnabled: true });
      const slots = makeSlots(4, 1);
      engine.createGame(roomId, config, slots);

      expect(() => engine.undo(roomId, 'user-0')).toThrow(GameEngineError);
      try {
        engine.undo(roomId, 'user-0');
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_UNDO_NO_SNAPSHOT);
      }
    });
  });

  // --- surrender ---

  describe('surrender', () => {
    it('distributes territories and checks game over', () => {
      const config = makeConfig({ seed: '42' });
      const slots = makeSlots(4, 2);
      const game = engine.createGame(roomId, config, slots);

      // Surrender player 0
      const result = engine.surrender(roomId, 'user-0');

      expect(game.state.players[0].isAlive).toBe(false);
      // All territories previously owned by player 0 should now be owned by others
      expect(game.state.territories.filter((t) => t.owner === 0).length).toBe(0);
    });

    it('detects game over on surrender', () => {
      const config = makeConfig({ seed: '42' });
      const slots = makeSlots(4, 4);
      const game = engine.createGame(roomId, config, slots);

      // Kill players 2 and 3, then surrender player 0 → only player 1 left
      game.state.players[2].isAlive = false;
      game.state.players[3].isAlive = false;
      for (const t of game.state.territories) {
        if (t.owner === 2 || t.owner === 3) t.owner = 1;
      }

      const result = engine.surrender(roomId, 'user-0');
      expect(result.gameOver).toBeDefined();
      expect(result.gameOver!.winnerIndex).toBe(1);
      expect(game.status).toBe('finished');
    });
  });

  // --- proposeAlliance ---

  describe('proposeAlliance', () => {
    it('creates alliance proposal (forms on mutual)', () => {
      const config = makeConfig({ seed: '42', alliances: true });
      const slots = makeSlots(4, 2);
      const game = engine.createGame(roomId, config, slots);

      // First propose creates a proposal, not an alliance
      engine.proposeAlliance(roomId, 'user-0', 1);
      expect(areAllied(game.state.allianceState!, 0, 1)).toBe(false);
      expect(game.state.allianceState!.proposals.length).toBe(1);

      // Mutual proposal auto-accepts
      engine.proposeAlliance(roomId, 'user-1', 0);
      expect(areAllied(game.state.allianceState!, 0, 1)).toBe(true);
    });

    it('rejects when alliances disabled', () => {
      engine.createGame(roomId, makeConfig({ seed: '42', alliances: false }), makeSlots(4, 2));

      expect(() => engine.proposeAlliance(roomId, 'user-0', 1)).toThrow(GameEngineError);
      try {
        engine.proposeAlliance(roomId, 'user-0', 1);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_ALLIANCE_DISABLED);
      }
    });

    it('rejects alliance with self', () => {
      engine.createGame(roomId, makeConfig({ seed: '42', alliances: true }), makeSlots(4, 2));

      expect(() => engine.proposeAlliance(roomId, 'user-0', 0)).toThrow(GameEngineError);
      try {
        engine.proposeAlliance(roomId, 'user-0', 0);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_ALLIANCE_INVALID_TARGET);
      }
    });

    it('rejects duplicate proposal', () => {
      engine.createGame(roomId, makeConfig({ seed: '42', alliances: true }), makeSlots(4, 2));

      engine.proposeAlliance(roomId, 'user-0', 1);
      expect(() => engine.proposeAlliance(roomId, 'user-0', 1)).toThrow(GameEngineError);
      try {
        engine.proposeAlliance(roomId, 'user-0', 1);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_ALLIANCE_INVALID_TARGET);
      }
    });
  });

  // --- respondAlliance ---

  describe('respondAlliance', () => {
    it('accepts alliance proposal', () => {
      const config = makeConfig({ seed: '42', alliances: true });
      const slots = makeSlots(4, 2);
      const game = engine.createGame(roomId, config, slots);

      // Add a proposal manually
      game.state.allianceState!.proposals.push({
        fromPlayer: 2,
        toPlayer: 1,
        duration: 5,
      });

      engine.respondAlliance(roomId, 'user-1', 2, true);

      expect(areAllied(game.state.allianceState!, 1, 2)).toBe(true);
    });

    it('rejects alliance proposal', () => {
      const config = makeConfig({ seed: '42', alliances: true });
      const slots = makeSlots(4, 2);
      const game = engine.createGame(roomId, config, slots);

      game.state.allianceState!.proposals.push({
        fromPlayer: 2,
        toPlayer: 1,
        duration: 5,
      });

      engine.respondAlliance(roomId, 'user-1', 2, false);

      expect(areAllied(game.state.allianceState!, 1, 2)).toBe(false);
      // Proposal should be removed
      expect(game.state.allianceState!.proposals.length).toBe(0);
    });

    it('rejects when proposal not found', () => {
      const config = makeConfig({ seed: '42', alliances: true });
      engine.createGame(roomId, config, makeSlots(4, 2));

      expect(() =>
        engine.respondAlliance(roomId, 'user-1', 2, true),
      ).toThrow(GameEngineError);

      try {
        engine.respondAlliance(roomId, 'user-1', 2, true);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(
          GameErrorCode.GAME_ALLIANCE_PROPOSAL_NOT_FOUND,
        );
      }
    });
  });

  // --- AI support ---

  describe('executeAIAttack', () => {
    it('executes attack using player index directly', () => {
      const config = makeConfig({ seed: '42' });
      const slots = makeSlots(4, 1);
      const game = engine.createGame(roomId, config, slots);

      // End turn for player 0 to get to player 1 (AI)
      engine.endTurn(roomId, 'user-0');
      expect(game.state.currentPlayerIndex).toBe(1);

      // Find attackable pair for player 1
      const owned = game.state.territories.find((t) => t.owner === 1 && t.dice > 1);
      if (!owned) return; // may not have attackable territory

      const enemyNId = owned.neighbors.find(
        (nId) => game.state.territories[nId].owner !== 1,
      );
      if (enemyNId === undefined) return;

      const result = engine.executeAIAttack(roomId, 1, owned.id, enemyNId);
      expect(result.result).toBeDefined();
      expect(typeof result.result.attackerWins).toBe('boolean');
    });
  });

  describe('endAITurn', () => {
    it('ends turn using player index directly', () => {
      const config = makeConfig({ seed: '42' });
      const slots = makeSlots(4, 1);
      const game = engine.createGame(roomId, config, slots);

      // End turn for player 0 to get to player 1 (AI)
      engine.endTurn(roomId, 'user-0');
      expect(game.state.currentPlayerIndex).toBe(1);

      const result = engine.endAITurn(roomId, 1);
      expect(result.nextPlayerIndex).toBe(2);
      expect(result.bonusDice).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Error handling ---

  describe('error handling', () => {
    it('throws GAME_NOT_FOUND for non-existent room', () => {
      expect(() =>
        engine.executeAttack('nonexistent', 'user-0', 0, 1),
      ).toThrow(GameEngineError);

      try {
        engine.executeAttack('nonexistent', 'user-0', 0, 1);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_NOT_FOUND);
      }
    });

    it('throws GAME_ALREADY_OVER for finished game', () => {
      const config = makeConfig({ seed: '42' });
      const slots = makeSlots(4, 1);
      const game = engine.createGame(roomId, config, slots);
      game.status = 'finished';

      expect(() =>
        engine.executeAttack(roomId, 'user-0', 0, 1),
      ).toThrow(GameEngineError);

      try {
        engine.executeAttack(roomId, 'user-0', 0, 1);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.GAME_ALREADY_OVER);
      }
    });

    it('throws CONNECTION_NOT_IN_GAME for unknown user', () => {
      engine.createGame(roomId, makeConfig({ seed: '42' }), makeSlots(4, 1));

      expect(() =>
        engine.executeAttack(roomId, 'unknown-user', 0, 1),
      ).toThrow(GameEngineError);

      try {
        engine.executeAttack(roomId, 'unknown-user', 0, 1);
      } catch (e) {
        expect((e as GameEngineError).code).toBe(GameErrorCode.CONNECTION_NOT_IN_GAME);
      }
    });
  });

  // --- Full game simulation ---

  describe('full game simulation', () => {
    it('create → attack → end turn → repeat until game over', () => {
      const config = makeConfig({
        seed: '99',
        playerCount: 2,
        territoryCount: 15,
        undoEnabled: false,
      });
      const slots: PlayerSlot[] = [
        { userId: 'p1', name: 'Player 1', isAI: false, color: PLAYER_COLORS[0] },
        { userId: 'p2', name: 'Player 2', isAI: false, color: PLAYER_COLORS[1] },
      ];
      const game = engine.createGame(roomId, config, slots);

      let turnCount = 0;
      const maxTurns = 500;

      while (game.status === 'playing' && turnCount < maxTurns) {
        const currentPlayer = game.state.currentPlayerIndex;
        const userId = `p${currentPlayer + 1}`;

        // Try to attack
        let attacked = false;
        for (const t of game.state.territories) {
          if (t.owner !== currentPlayer || t.dice <= 1) continue;
          for (const nId of t.neighbors) {
            const neighbor = game.state.territories[nId];
            if (neighbor.owner === currentPlayer) continue;
            try {
              const result = engine.executeAttack(roomId, userId, t.id, nId);
              attacked = true;
              if (result.gameOver) break;
            } catch {
              // Attack validation may fail after state changes, that's ok
            }
            break;
          }
          if (attacked) break;
        }

        if (game.status !== 'playing') break;

        // End turn
        engine.endTurn(roomId, userId);
        turnCount++;
      }

      // Game should either finish or hit max turns
      if (game.status === 'finished') {
        expect(game.state.winner).not.toBeNull();
        const alivePlayers = game.state.players.filter((p) => p.isAlive);
        expect(alivePlayers.length).toBe(1);
      }
      // If max turns reached, that's acceptable for a random game
      expect(turnCount).toBeLessThanOrEqual(maxTurns);
    });
  });
});
