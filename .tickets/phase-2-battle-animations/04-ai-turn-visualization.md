# Visualize AI Turns

- **Status**: done
- **Phase**: 2
- **Depends on**: `01-battle-popup`
- **Files**: `src/scenes/GameScene.ts`

## Description

Currently AI turns execute all attacks instantly, then render the final state. Instead, show each AI attack one at a time with the battle animation.

### Flow

1. AI's turn starts → status shows "AI Red is thinking..."
2. AI calculates first attack
3. Highlight attacker and defender territories
4. Play battle animation (at faster speed)
5. Update map rendering
6. Brief pause (300ms)
7. Repeat for next attack, or end turn if no more moves
8. Show dice distribution animation
9. Advance to next player

### Implementation

Change `executeAITurn()` from synchronous batch execution to a step-by-step approach:
- Return an iterator/queue of planned moves instead of executing all at once
- GameScene processes one move at a time with delays between each

## Acceptance Criteria

- [ ] Each AI attack is shown individually with battle animation
- [ ] Attacker and defender are highlighted during the attack
- [ ] Brief pause between consecutive attacks
- [ ] AI turn doesn't block the game (uses Phaser time events)
- [ ] "Instant" speed mode skips animations but still shows final state
- [ ] Works correctly when AI is eliminated mid-turn
