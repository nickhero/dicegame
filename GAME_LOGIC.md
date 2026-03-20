# Game Logic Reference

Detailed documentation of DiceWars game mechanics, algorithms, and AI behavior.

## Core Rules

### Setup

- A map of **28 territories** is randomly generated
- **4 players** (1 human, 3 AI) are each assigned 7 territories
- Each territory starts with **2–4 dice**

### Turn Flow

1. **Attack phase** — The active player may attack any number of times
2. **End turn** — Player clicks "END TURN" (or AI finishes automatically)
3. **Dice distribution** — Bonus dice are awarded and placed randomly
4. **Next player** — Turn passes to the next living player

### Attacking

An attack requires:
- An **owned territory** with **more than 1 die**
- An **adjacent enemy territory** as the target

**Battle resolution:**
- Attacker rolls `N` dice (their stack size), defender rolls `M` dice (their stack size)
- Each die rolls 1–6 independently
- **Attacker wins** if their total is **strictly greater** than defender's total
- **Ties go to the defender**

**Outcomes:**
| Result | Attacker's territory | Defender's territory |
|--------|---------------------|---------------------|
| Attacker wins | Reduced to **1 die** | Changes owner to attacker, gets **N-1 dice** |
| Defender wins | Reduced to **1 die** | Unchanged |

### End-of-Turn Dice Distribution

When a player ends their turn:
1. Calculate the **largest contiguous group** of territories they own
2. That number = bonus dice to distribute
3. Dice are placed **randomly** across the player's territories
4. Maximum **8 dice** per territory
5. Surplus dice are stored as **reserve** (up to 32)
6. Reserve dice are distributed first on subsequent turns

### Winning

- A player is **eliminated** when they lose all territories
- The game ends when **only one player remains alive**

## Battle Probability Table

Probability of attacker winning (percentages):

| Attacker \ Defender | 1 die | 2 dice | 3 dice | 4 dice | 5 dice | 6 dice | 7 dice | 8 dice |
|---------------------|-------|--------|--------|--------|--------|--------|--------|--------|
| **2 dice** | 83.8% | 44.4% | 15.2% | 3.6% | 0.6% | 0.1% | ~0% | ~0% |
| **3 dice** | 97.3% | 77.9% | 45.4% | 19.2% | 6.1% | 1.5% | 0.3% | ~0% |
| **4 dice** | 99.7% | 93.9% | 74.3% | 46.0% | 22.0% | 8.3% | 2.6% | 0.6% |
| **5 dice** | ~100% | 98.8% | 90.9% | 71.8% | 46.4% | 24.2% | 10.4% | 3.7% |
| **6 dice** | ~100% | 99.8% | 97.5% | 88.4% | 70.0% | 46.7% | 26.0% | 12.2% |
| **7 dice** | 100% | ~100% | 99.5% | 96.2% | 86.2% | 68.6% | 46.9% | 27.4% |
| **8 dice** | 100% | ~100% | 99.9% | 99.0% | 94.8% | 84.4% | 67.3% | 47.1% |

**Key insight:** Equal dice counts always favor the defender (<50% for attacker). The attacker needs at least 1 die advantage for favorable odds.

## Map Generation

### Algorithm: Grid-Based Region Growing

1. **Grid creation** — 20×16 grid of 32px cells
2. **Seed placement** — Place N seed points with minimum Manhattan distance between them (prevents tiny territories)
3. **Simultaneous BFS** — All seeds grow outward simultaneously. Each cell is claimed by the first seed to reach it
4. **Adjacency detection** — Two territories are adjacent if any of their cells share a grid edge
5. **Center calculation** — Each territory's visual center is the average position of its cells

### Properties
- Every territory has ≥1 cell and ≥1 neighbor
- Adjacency is always symmetric
- No cell belongs to two territories
- Deterministic with the same RNG seed

## AI Behavior

### Strategy: Greedy with Threshold

The AI uses a simple but effective greedy strategy:

1. **Find all possible attacks** — Territories with >1 die adjacent to enemies
2. **Filter to favorable attacks** — Only consider attacks where `own_dice - enemy_dice ≥ 1`
3. **Rank by advantage** — Sort attacks by dice advantage (descending)
4. **Select with randomness** — Pick randomly from top moves (within 1 of the best advantage) to add unpredictability
5. **Repeat** — Continue attacking until no favorable moves remain
6. **End turn** — Automatically end turn

### AI Characteristics
- **Conservative** — Won't attack with equal or fewer dice
- **Opportunistic** — Takes easy targets (large advantage) first
- **Somewhat random** — Doesn't always pick the mathematically optimal move
- **No long-term planning** — Doesn't consider multi-step consequences

## Seeded Random Number Generator

All randomness uses a deterministic LCG (Linear Congruential Generator):

```
seed = (seed × 16807) % 2147483647
```

This ensures:
- **Deterministic** — Same seed → same game
- **Testable** — Unit tests produce consistent results
- **Reproducible** — Bugs can be reproduced by reusing the seed

## Data Flow

```
User Click → GameScene → GameRules (mutates GameState) → Refresh Display
                                                              ↓
                                                     MapRenderer.drawMap()
                                                     DiceRenderer.drawDiceStacks()
                                                     UIRenderer.update()
```

The rendering layer is **stateless** — it reads `GameState` and draws the current situation. All game decisions happen in `src/game/`.
