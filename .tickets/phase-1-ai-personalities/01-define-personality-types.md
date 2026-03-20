# Define AI Personality Types

- **Status**: open
- **Phase**: 1
- **Depends on**: none
- **Files**: `src/game/AIPersonality.ts` (new)

## Description

Create the `AIPersonality` type and configuration objects for 6 distinct AI personalities. Each personality defines how aggressively/conservatively the AI plays.

### Personality Definitions

| Personality | Min Advantage | Max Attacks/Turn | Risk Tolerance | Behavior |
|-------------|---------------|------------------|----------------|----------|
| **Cautious** | +2 | 3 | Very low | Only attacks when very safe. Builds up slowly. |
| **Balanced** | +1 | ∞ | Medium | Current default. Attacks favorable targets. |
| **Aggressive** | 0 (equal dice) | ∞ | High | Attacks even at equal odds. Expands fast, dies fast. |
| **Reckless** | -1 | ∞ | Very high | Yolo attacks, even at slight disadvantage. Chaotic wildcard. |
| **Expansionist** | +1 | ∞ | Medium | Like Balanced, but prioritizes attacks that connect disconnected territory groups. |
| **Turtle** | +3 | 2 | Very low | Almost never attacks. Hoards dice. Dangerous in the late game. |

### Interface Design

```typescript
export interface AIPersonality {
  name: string;
  minAdvantage: number;      // minimum (attacker - defender) dice to consider attacking
  maxAttacksPerTurn: number; // cap on attacks per turn (Infinity for unlimited)
  connectednessWeight: number; // bonus score for attacks that connect groups (0–2)
  description: string;
}
```

## Acceptance Criteria

- [ ] `AIPersonality` interface exported from `src/game/AIPersonality.ts`
- [ ] All 6 personality configs exported as named constants
- [ ] `ALL_PERSONALITIES` array exported for random selection
- [ ] Pure TypeScript — no Phaser imports
- [ ] File is importable from tests without DOM/browser
