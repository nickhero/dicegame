# Bugfixes

- **Status**: done
- **Phase**: 11
- **Depends on**: none
- **Files**: various

## Description

User-reported bugs to fix. Add new bugs to the list below as they are discovered.

## Bug List

<!-- Add bugs here in the format below: -->
<!-- - [ ] **Short description** — Details about the bug, how to reproduce, expected vs actual behavior -->
- [x] 7 **Duplicate elimination events corrupt achievements** — Fixed: capture alive state before attack, only fire elimination for newly dead players.
- [x] 8 **O(n²) performance in AI pathfinding** — Fixed: converted `nodes` to `Set` for O(1) lookups in BFS.
- [x] 9 **AI surrender logic ignores power-ups and alliances** — Fixed: charge adds +2 effective dice, allied targets filtered unless personality would break.
- [x] 10 **Dead players' alliances aren't cleaned up** — Fixed: `cleanupDeadPlayerAlliances()` called on elimination and surrender; defensive cleanup in `tickAlliances()`.
- [x] 11 **"Underdog" achievement has wrong logic** — Fixed: now requires human < ALL opponents' starting territories.
- [x] 12 **Player 0 forms self-alliance in spectator mode** — Fixed: replaced hardcoded player 0 check with `isHuman`; added self-proposal guards.
- [x] 13 **Undo doesn't revert alliance state** — Fixed: `StateSnapshot` now captures and restores full `allianceState`.
- [x] 14 **SeededRandom degenerates with seed 0** — Fixed: constructor clamps seed for 0, negative, NaN, Infinity.

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

