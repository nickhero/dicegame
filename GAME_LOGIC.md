# Game Logic Reference

Detailed documentation of DiceWars game mechanics, algorithms, and AI behavior.

## Core Rules

### Setup

- A map of **15–42 territories** is generated (default 28; see [Game Configuration](#game-configuration))
- **2–6 players** (1 human by default, rest AI) are each assigned territories equally
- Each territory starts with **2–4 dice**
- Optional features (fog of war, power-ups, alliances) are set before the game begins

### Turn Flow

1. **Attack phase** — The active player may attack any number of times
2. **End turn** — Player clicks "END TURN" (or AI finishes automatically)
3. **Dice distribution** — Bonus dice are awarded and placed randomly
4. **Next player** — Turn passes to the next living player
5. **Power-up spawn** — When a new round begins (turn wraps to player 0), a power-up may spawn

### Attacking

An attack requires:
- An **owned territory** with **more than 1 die**
- An **adjacent enemy territory** as the target

**Battle resolution:**
- Attacker rolls `N` dice (their stack size), defender rolls `M` dice (their stack size)
- Each die rolls 1–6 independently
- **Power-up bonuses** are applied after rolling (see [Power-Ups](#power-ups))
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
3. Add any **reserve dice** from prior turns
4. Dice are placed **randomly** across the player's territories (shuffled order)
5. Maximum **8 dice** per territory
6. Surplus dice are stored as **reserve** (up to 32)

### Winning

- A player is **eliminated** when they lose all territories
- AI players may **surrender** when in a desperate state (see [AI Surrender](#ai-surrender))
- The game ends when **only one player remains alive**

## Battle Probability Table

Probability of attacker winning (percentages), **without power-ups**:

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

**With power-ups:** A Charge or Shield power-up adds **+3** to the respective total. This is roughly equivalent to having 1 extra die (average die = 3.5).

## Power-Ups

Power-ups are an optional system enabled in the game configuration. When enabled, power-ups spawn on the map and provide tactical bonuses.

### Power-Up Types

| Type | Label | Effect | Activation |
|------|-------|--------|------------|
| **Shield** | Shield | Adds **+3** to defender's total when this territory is attacked | Automatic — consumed on defense |
| **Charge** | Charge | Adds **+3** to attacker's total when attacking from this territory | Automatic — consumed on attack |
| **Fortify** | Fortify | Move **1–3 dice** from this territory to an adjacent owned territory | Manual — player activates it |
| **Reinforce** | Reinforce | Add **2 dice** to this territory (up to max 8) | Manual — player activates it |

### Spawning Rules

- Power-ups spawn at the **start of each new round** (when turn wraps back to player 0)
- A random type is chosen from all 4 types with equal probability
- Placed on a random territory that **doesn't already have a power-up**
- Maximum **4 power-ups** on the map at any time
- No spawn occurs if 4 are already present or no eligible territory exists

### Activation Details

- **Shield & Charge** are consumed **automatically** during battle resolution. The +3 bonus is added after dice are rolled but before comparing totals. Both can be active in the same battle.
- **Fortify** requires selecting the source territory (must have the power-up), then an adjacent owned territory. Must keep at least 1 die on the source. Target cannot exceed 8 dice. Consumes the power-up on use.
- **Reinforce** adds up to 2 dice (capped at 8 max). Consumes the power-up on use. Does nothing if the territory is already at 8 dice.

## Fog of War

Fog of war is an optional mode that limits each player's visibility.

### Visibility Rules

A territory is **visible** to a player if:
- It is **owned by the player**, OR
- It is **adjacent to any territory owned by the player**

All other territories are hidden — the player cannot see their owner, dice count, or power-ups.

### AI Behavior Under Fog

AI players use the same visibility rules. They can only evaluate attacks against territories they can see, which naturally limits their decision-making to border conflicts.

## Alliance System

The alliance system allows temporary non-aggression pacts between players.

### Non-Aggression Pacts

- An alliance is a **non-aggression pact** between two players lasting a fixed number of turns
- Default duration: **5 turns**
- Maximum alliances per player: **1** (must wait for current pact to end or break it)
- Alliances are processed at the **end of each round** — durations tick down, expired pacts are removed, and AI proposals are generated

### Reputation System

Each player has a **reputation score** from 0 to 100 (starts at **50**).

| Event | Reputation Change |
|-------|-------------------|
| **Breaking an alliance** (betrayal) | **−25** to the breaker |
| **Alliance expires naturally** | **+5** to both players |

- A player with reputation **below 20** cannot receive or send alliance proposals
- Reputation affects AI willingness to ally (see below)

### AI Alliance Behavior

**Proposal generation** — At the end of each round, each AI player may propose an alliance:
- Can only propose if they **have no current ally**
- Willingness to propose depends on personality:

| Personality | Willingness |
|-------------|-------------|
| Turtle | 80% |
| Cautious | 70% |
| Expansionist | 50% |
| Balanced | 40% |
| Aggressive | 20% |
| Reckless | 10% |

- AI prefers targets of **similar territory count** (lower strength difference = higher score)
- Cautious/Turtle personalities get a **+3** scoring bonus; Reckless gets **−3**
- Past betrayals penalize scoring (**−5** per betrayal count)
- 30% chance to propose to the human player instead of the best AI target

**Acceptance** — AI accepts a proposal if:
- Proposer's reputation is ≥ 20
- The AI has no current ally
- The AI's alliance willingness is > 0.3

**Breaking alliances** — AI may break an alliance to attack an ally:
- **Reckless**: Always willing to break
- **Aggressive**: Breaks if they own **>40%** of all territories
- All others: Never break voluntarily

### Betrayal Tracking

- Each betrayal between a pair of players is counted
- After **2 betrayals** between the same pair, no further alliances can form between them

## AI Surrender

AI players can surrender when their position is hopeless.

### Standard Conditions (all must be true)

1. Player has **≤ 2 territories**
2. **No attack** with dice advantage ≥ 1 exists
3. Player has been in this desperate state for **≥ 2 consecutive turns**

### Personality Overrides

| Personality | Override |
|-------------|----------|
| **Reckless** | **Never surrenders** |
| **Aggressive** | Surrenders only when down to **1 territory** (threshold lowered from 2 to 1) |
| All others | Standard rules apply |

### Territory Distribution on Surrender

When an AI surrenders:
1. Each of their territories goes to the **neighboring player with the most adjacent territories**
2. Ties are broken by **lower player ID**
3. If no alive neighbor is adjacent, the territory goes to the player with the **most territories overall**
4. Dice on surrendered territories remain unchanged
5. The surrendering player is eliminated

## Achievements

12 achievements are tracked across games and persisted in `localStorage`.

| # | ID | Name | Emoji | Condition |
|---|-----|------|-------|-----------|
| 1 | `flawless_victory` | Flawless Victory | 💎 | Win without losing a single battle |
| 2 | `david_vs_goliath` | David vs Goliath | 🪨 | Win a battle with 1–2 dice against 7–8 dice |
| 3 | `world_dominator` | World Dominator | 🌍 | Win on a Huge map (42 territories) |
| 4 | `speed_demon` | Speed Demon | ⚡ | Win in under 10 turns |
| 5 | `pacifist_start` | Pacifist Start | ☮️ | End your first turn without attacking |
| 6 | `comeback_king` | Comeback King | 👑 | Win after being reduced to 1 territory |
| 7 | `full_house` | Full House | 🏠 | Hold all territories at once |
| 8 | `win_streak_5` | On a Roll | 🔥 | Win 5 battles in a row in a single game |
| 9 | `underdog` | Underdog | 🐕 | Win with fewer starting territories than any opponent |
| 10 | `battle_hardened` | Battle Hardened | ⚔️ | Fight 50 battles in a single game |
| 11 | `first_blood` | First Blood | 🗡️ | Eliminate a player |
| 12 | `triple_kill` | Triple Kill | 💀 | Eliminate all 3 opponents yourself |

Achievements are checked at the end of each game. Only the **human player** (player 0) can unlock achievements. Unlocked achievements are stored with their unlock date and are never reset unless explicitly cleared.

## Match History & Replay

### Match History

Completed games are saved to `localStorage` for review.

**Stored per match:**
- Unique ID and date
- Winner name and ID
- All player names
- Turn count and total battles
- Full game recording (for replay)

**Limits:**
- Maximum **20 matches** stored (oldest removed first)
- If `localStorage` is full, entries are removed until the save succeeds (minimum 5 kept)

### Game Recording

The `GameRecorder` captures everything needed to replay a game:

**Initial state snapshot:**
- All territories (cells, centers, neighbors, owner, dice, grid type, power-ups)
- All players (name, color, personality, human/AI)
- Full adjacency graph
- Whether power-ups are enabled

**Recorded actions (per turn):**
| Action Type | Data |
|-------------|------|
| `attack` | Attacker/defender territory IDs, player IDs, full `BattleResult` (rolls, totals, winner) |
| `endTurn` | Player ID, bonus dice count |
| `surrender` | Player ID |
| `elimination` | Eliminated player ID, eliminated-by player ID |
| `fortify` | Source/target territory IDs, dice count, player ID |
| `reinforce` | Territory ID, player ID |
| `powerUpSpawn` | Territory ID, power-up type, owner ID |
| `allianceFormed` | Both player IDs, duration |
| `allianceBroken` | Breaker ID, other player ID |
| `allianceExpired` | Both player IDs |
| `allianceProposal` | From/to player IDs |

Recordings include an ISO date string, winner info, and total turn count.

## Game Configuration

All options are set before starting a game via `GameSetupConfig`.

| Option | Type | Values | Default |
|--------|------|--------|---------|
| **Player count** | number | 2–6 | 4 |
| **Territory count** | preset | 15 (small), 20 (medium), 28 (standard), 35 (large), 42 (huge) | 28 |
| **Map seed** | string or null | Any string for reproducible maps | null (random) |
| **Speed** | enum | `normal` (1×), `fast` (0.5×), `instant` (0×) | normal |
| **AI personalities** | array | Up to 5 slots, each: `cautious`, `balanced`, `aggressive`, `reckless`, `expansionist`, `turtle`, or `random` | All `random` |
| **Map shape** | enum | `rectangle`, `diamond`, `ring`, `continent` | rectangle |
| **Fog of war** | boolean | true/false | false |
| **Power-ups** | boolean | true/false | false |
| **Spectator mode** | boolean | true/false (all players AI) | false |

Preferences (except map seed) are persisted in `localStorage` and restored on next visit.

## Undo System

The player can **undo once per turn** to revert the last attack.

### How It Works

A **snapshot** is taken before each attack. The snapshot captures:
- Territory ownership and dice counts (including power-ups)
- Player alive status and reserve dice
- Current player index and turn number
- Selected territory state
- Consecutive desperate counters (for AI surrender tracking)
- Power-ups enabled flag

Calling undo **restores** the snapshot, reverting all state changes from the last attack. Only the most recent snapshot is kept — undo is available once per action, not a full history.

## AI Behavior

### Personality System

Each AI opponent has a **personality** that determines their attack strategy. Personalities are assigned randomly at game start and displayed in the HUD.

| Personality | Min Advantage | Max Attacks/Turn | Special |
|-------------|---------------|------------------|---------|
| **Cautious** | +2 | 3 | Only attacks when very safe |
| **Balanced** | +1 | ∞ | Standard strategy |
| **Aggressive** | 0 | ∞ | Attacks at equal odds |
| **Reckless** | -1 | ∞ | Attacks even at disadvantage |
| **Expansionist** | +1 | ∞ | Bonus for connecting territory groups |
| **Turtle** | +3 | 2 | Hoards dice, rarely attacks |

### How AI Decisions Work

1. **Find all possible attacks** — Territories with >1 die adjacent to enemies
2. **Filter by personality** — Only consider attacks meeting the personality's minimum advantage threshold
3. **Score moves** — Base score = dice advantage. Expansionist adds bonus for moves that connect disconnected territory groups.
4. **Select with randomness** — Pick randomly from top-scored moves (within 1 point of best)
5. **Repeat** — Continue attacking until no valid moves remain or attack limit is reached
6. **End turn** — Automatically end turn

### Personality Characteristics

- **Cautious**: Slow but safe. Rarely loses battles but may fall behind in territory.
- **Balanced**: Well-rounded. The default "smart" player.
- **Aggressive**: Expands quickly but fragile. Can snowball or collapse early.
- **Reckless**: Chaotic. Makes exciting but often suicidal attacks.
- **Expansionist**: Prioritizes connecting isolated territory groups for larger contiguous bonuses.
- **Turtle**: Almost never attacks. Accumulates huge dice reserves. Extremely dangerous if it survives to late game.

## Map Generation

### Algorithm: Grid-Based Region Growing

1. **Grid creation** — 20×16 grid of 32px cells
2. **Seed placement** — Place N seed points with minimum Manhattan distance between them (prevents tiny territories)
3. **Simultaneous BFS** — All seeds grow outward simultaneously. Each cell is claimed by the first seed to reach it
4. **Adjacency detection** — Two territories are adjacent if any of their cells share a grid edge
5. **Center calculation** — Each territory's visual center is the average position of its cells

### Map Shapes

The grid can be masked into different shapes before region growing:
- **Rectangle** — Full grid (default)
- **Diamond** — Diamond/rhombus mask
- **Ring** — Donut shape with a hollow center
- **Continent** — Irregular landmass shape

### Properties
- Every territory has ≥1 cell and ≥1 neighbor
- Adjacency is always symmetric
- No cell belongs to two territories
- Deterministic with the same RNG seed

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
