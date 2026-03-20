# Test All AI Personalities

- **Status**: done
- **Phase**: 1
- **Depends on**: `01-define-personality-types`
- **Files**: `tests/game/AIPersonality.test.ts` (new), `tests/game/AIPlayer.test.ts`

## Description

Write comprehensive tests verifying each personality behaves distinctly and correctly.

### Test Cases Per Personality

**Cautious**:
- Does NOT attack at +1 advantage (needs +2)
- Stops after 3 attacks even if favorable moves remain
- Never attacks at equal or negative advantage

**Balanced**:
- Attacks at +1 advantage (existing behavior)
- Does NOT attack at 0 advantage
- No attack cap (continues until no favorable moves)

**Aggressive**:
- Attacks at 0 advantage (equal dice)
- Does NOT attack at -1 advantage
- No attack cap

**Reckless**:
- Attacks at -1 advantage (slight disadvantage)
- Only stops when at -2 or worse
- No attack cap

**Expansionist**:
- Same min advantage as Balanced (+1)
- Prefers moves that connect disconnected territory groups
- Given two moves with same advantage, picks the one connecting groups

**Turtle**:
- Needs +3 advantage to attack
- Stops after 2 attacks per turn
- Very rarely attacks

### Cross-Personality Tests
- All personalities find the same set of possible moves
- Different personalities filter/rank those moves differently
- Personality configs are all valid (no negative maxAttacks, etc.)

## Acceptance Criteria

- [ ] At least 2 test cases per personality verifying threshold behavior
- [ ] Test that Expansionist prefers connecting moves
- [ ] Test that Turtle and Cautious cap their attack count
- [ ] Cross-personality comparison test
- [ ] All tests pass with `npm test`
