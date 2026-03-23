# Bugfixes

- **Status**: pending
- **Phase**: 11
- **Depends on**: none
- **Files**: various

## Description

User-reported bugs to fix. Add new bugs to the list below as they are discovered.

## Bug List

<!-- Add bugs here in the format below: -->
<!-- - [ ] **Short description** — Details about the bug, how to reproduce, expected vs actual behavior -->
- [ ] 7 **Duplicate elimination events corrupt achievements** — Human attacks don't track pre-attack alive state. Previously eliminated AI players trigger elimination events on every subsequent human attack, causing `triple_kill` and `first_blood` achievements to fire incorrectly. Fix: Capture alive state before attacks and gate elimination recording (see `src/scenes/GameScene.ts:668–677`).
- [ ] 8 **O(n²) performance in AI pathfinding** — `findConnectedComponents` in `src/utils/graph.ts:25` uses `Array.includes()` inside BFS loop. Fix: Use `Set` for O(1) lookups instead of O(n) array scan.
- [ ] 9 **AI surrender logic ignores power-ups and alliances** — `shouldAISurrender()` in `src/game/GameRules.ts:222` only checks raw dice counts, not `charge`/`shield` or alliance restrictions. AI can surrender with favorable attacks, or refuse to surrender when blocked by allies. Fix: Base surrender on the same effective/legal attack rules used for actual move selection.
- [ ] 10 **Dead players' alliances aren't cleaned up** — When a player is eliminated, their alliances and proposals aren't removed in `src/game/GameRules.ts:82`. AI gets stuck thinking it still has a dead ally and refuses new alliance proposals. Fix: Clean up alliances/proposals in elimination/surrender flow and add defensive cleanup in `tickAlliances()`.
- [ ] 11 **"Underdog" achievement has wrong logic** — `src/game/Achievements.ts:127` implementation doesn't match description. Code checks "fewer territories than at least one opponent" but text says "fewer than any opponent". Fix: Require human start < every opponent's count, or update text to match.
- [ ] 12 **Player 0 forms self-alliance in spectator mode** — In spectator mode, player 0 is an AI. `generateAIProposal()` in `src/game/Alliance.ts:195` hardcodes player 0 as human and excludes it from normal loop, but special-case logic proposes alliance with itself. Creates self-alliance that locks player 0 out of diplomacy permanently. Fix: Add self-proposal guard or check `isHuman` instead of hardcoding.
- [ ] 13 **Undo doesn't revert alliance state** — `StateSnapshot` in `src/game/GameStateSnapshot.ts` doesn't capture `allianceState`. Alliance breaks, reputation penalties, and betrayals persist after undo. Fix: Capture/restore alliance state or defer breaks until after attack resolves.
- [ ] 14 **SeededRandom degenerates with seed 0** — LCG in `src/utils/random.ts:10` is fixed point at seed 0, producing negative numbers and violating `[0, 1)` contract. Currently guarded against in production but latent defect. Fix: Clamp seed in constructor (`this.seed = seed || 1`).

## Fix Analysis & Dependencies (Opus 4.6)

### Critical Dependencies

1. **Bug 12 (self-alliance) must be fixed BEFORE Bug 10 (dead player cleanup)** — Bug 10's cleanup can partially mask Bug 12, so prevent self-alliance creation first.
2. **Bug 7 (duplicate elimination events) is prerequisite to achievement correctness** — Eliminate duplicate events first, then verify achievements fire correctly.

### Cascading Issues & Better Fixes

**Bug 1 (map preview desync)** — The proposed fix (match preview to game) is incomplete. The preview replicates seed+1 for territories but misses intermediate RNG consumption for AI personalities. **Better fix:** Make GameScene use fresh `SeededRandom(seed)` and `SeededRandom(seed+1)` sub-seeds matching the preview pattern, making them deterministic regardless of RNG consumption order.

**Bug 7 + Bug 10 interaction** — After tracking eliminations correctly (Bug 7), dead players' alliances persist (Bug 10). Their former allies refuse new alliances or won't attack their territories. **Must fix both together** to avoid ghost alliance side effects.

**Bug 9 (surrender logic)** — The "base on move selection rules" approach is overkill and creates tight coupling. **Better fix:** Just add power-up awareness to `hasPositiveAdvantageAttack()` (e.g., `charge` adds +3 effective dice). Also check alliances so AI won't consider allied targets as escape routes unless it would break the alliance.

**Bug 10 (dead cleanup)** — The proposal only addresses alliances, but `allianceState` also stores `proposals` and `reputation` for dead players. **Must also clean:** Remove proposals involving dead players (both `to` and `from`).

**Bug 12 (self-alliance)** — Just adding a guard fixes the symptom. **Better fix:** Replace hardcoded `other.id === 0` check with `other.isHuman` on line 195, and guard the "propose to human" block (line 226) with `gameState.players[0].isHuman`. Fixes spectator mode AND future-proofs against other modes.

**Bug 8 (O(n²) graph)** — Proposed fix is correct but verify no duplicate node IDs. Safe to proceed.

**Bug 14 (seed=0)** — `seed || 1` doesn't catch negative seeds. **Better fix:** `this.seed = (seed > 0 && Number.isFinite(seed)) ? seed : 1` for full robustness.

### Concerns & Caveats

**Bug 8 (remove undo) — highest risk:**
- Touches GameScene, UIRenderer, tests, and GameStateSnapshot.ts
- **Verify:** ReplayScene doesn't import StateSnapshot types before deletion
- Affects 11 tests in GameStateSnapshot.test.ts

### Recommended Fix Order

1. **Bug 14** — Trivial, zero risk
2. **Bug 12** — Small, targeted guard (or better: use `isHuman` check)
3. **Bug 7** — Mechanical refactor, easy to test
4. **Bug 6** — Core elimination tracking fix
5. **Bug 10** — Dead player cleanup (alliances + proposals)
6. **Bug 8** — Remove undo (verify ReplayScene first)
8. **Bug 9** — Power-up awareness for surrender
9. **Bug 11** — Design decision (update text or logic)

### Testing Strategy

**Unit tests needed for:**
- Bug 6: 0 elimination events if no death, 1 event if death, 0 new events if already dead
- Bug 7: Benchmark results identical with Set vs Array
- Bug 9: AI with charge power-up + only allied neighbors shouldn't surrender
- Bug 10: Eliminated player's alliances/proposals removed; no dangling references
- Bug 12: `generateAIProposal(playerId=0)` never returns self-proposal
- Bug 14: `SeededRandom(0).next()` returns value in `[0, 1)`

**Integration tests:**
- 100 full game simulations in spectator mode: no self-alliances, no dead player references, no duplicate eliminations, no negative RNG values

