# 🎲 DiceWars

A browser-based territory strategy game inspired by [DiceWars](http://www.gamedesign.jp/flash/dice/dice.html) and [KDice](https://kdice.com). Conquer the map by rolling dice against your opponents!

Built with Phaser 3, TypeScript, and pixel art — all generated programmatically, no external assets needed.

![Game Type](https://img.shields.io/badge/genre-strategy-blue)
![Tech](https://img.shields.io/badge/stack-Phaser_3_+_TypeScript-green)

## ✨ Features

- **2–6 player** territory strategy (1 human + AI opponents)
- **6 AI personalities** — Cautious, Balanced, Aggressive, Reckless, Expansionist, Turtle
- **Configurable setup** — Player count, map size (S/M/L/XL), map shapes (rectangle, diamond, ring, continent, islands), fog of war, power-ups, spectator mode
- **Power-ups** — Shield (block attack), Charge (+2 attack), Fortify (+2 defense), Reinforce (+3 dice)
- **Fog of war** — Only see territories adjacent to your own
- **Alliances & diplomacy** — Non-aggression pacts, reputation tracking, AI proposal/acceptance/breaking logic
- **12 achievements** tracked across games
- **Match history** with full game replay and playback controls
- **Undo attack** (once per turn)
- **AI surrender** with personality-based logic
- **Spectator mode** — All-AI games with pause/resume
- **Procedural audio** — Web Audio sound effects (dice roll, capture, attack fail, elimination, victory, and more)
- **Post-game stats** with territory-over-time chart
- **Seeded RNG** for deterministic, reproducible games

## 🎮 How to Play

1. **Configure** — Choose player count, map size/shape, and optional modes (fog of war, power-ups)
2. **Attack** — Click one of your territories (must have >1 die), then click an adjacent enemy territory
3. **Battle** — Both sides roll their dice. Higher total wins. Ties go to the defender
4. **Conquer** — If you win, you take the territory and move your dice there. If you lose, your stack drops to 1
5. **End Turn** — Press `E`/`Space` or click "END TURN". You receive bonus dice equal to your largest connected territory group
6. **Win** — Eliminate all opponents by capturing every territory!

### Power-ups & Alliances

- **Power-ups** spawn on random territories each turn (when enabled). Click a territory to activate its power-up before or during attacks
- **Alliances** can be proposed to/by AI players. Allied territories show cyan borders. Breaking a pact damages your reputation

### ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `E` / `Space` | End turn |
| `Z` | Undo last attack |
| `Escape` | Deselect territory |
| `R` | Restart game |
| `M` | Mute/unmute |
| `1` / `2` / `3` | Game speed |
| `H` / `?` | Show help |

### Strategy Tips

- **Attack with advantage** — More dice = better odds. 6 vs 3 is much safer than 4 vs 3
- **Keep connected** — Your bonus dice depend on your largest contiguous group
- **Don't overextend** — Attacking too aggressively leaves your territories with 1 die (easy prey)
- **Use power-ups wisely** — A well-timed Shield can save a key territory; Charge can punch through a strong defense
- **Manage alliances** — Pacts buy you safety on one front, but breaking them has consequences

## 🚀 Getting Started

### Prerequisites

- [Node.js 24+](https://nodejs.org/) (use `nvm use` if you have [nvm](https://github.com/nvm-sh/nvm))

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Other Commands

```bash
npm run test       # Run all unit tests
npm run build      # Type-check + production build (outputs to dist/)
npm run typecheck  # Type-check only (no emit)
```

## 🏗️ Project Structure

```
src/
├── game/              ← Pure game logic (no Phaser dependency) — 20 files
│   ├── constants.ts       # Colors, limits, dimensions
│   ├── Territory.ts       # Territory data model
│   ├── Player.ts          # Player data model + factory
│   ├── GameState.ts       # Central game state + BattleResult
│   ├── MapGenerator.ts    # Grid-based region growing (square + hex)
│   ├── MapShapes.ts       # Map shape masks (rectangle, diamond, ring, etc.)
│   ├── DiceBattle.ts      # Dice rolling & battle resolution
│   ├── GameRules.ts       # Attack rules, turn flow, dice distribution
│   ├── AIPlayer.ts        # AI opponent logic with personality system
│   ├── AIPersonality.ts   # 6 AI personality type definitions
│   ├── GameConfig.ts      # Game setup config, localStorage persistence
│   ├── GameRecorder.ts    # Action recording for replay & stats
│   ├── GameStats.ts       # Live stats + historical computation
│   ├── GameStateSnapshot.ts # Snapshot/restore for undo
│   ├── EventFormatter.ts  # GameAction → display text conversion
│   ├── MatchHistory.ts    # Match history localStorage persistence
│   ├── PowerUps.ts        # Power-up types, spawning, effects
│   ├── FogOfWar.ts        # Visibility computation
│   ├── Alliance.ts        # Alliance system, reputation, AI diplomacy
│   └── Achievements.ts    # 12 achievements with check functions
├── rendering/         ← Phaser rendering (stateless, reads GameState)
│   ├── MapRenderer.ts     # Territory map + alliance indicators
│   ├── DiceRenderer.ts    # Pixel art dice generation & stacks
│   ├── UIRenderer.ts      # HUD, player panel, buttons
│   ├── BattleAnimator.ts  # Battle popup animations
│   ├── TerritoryEffects.ts # Visual effects (arrows, glow, pulse)
│   ├── EventLog.ts        # Scrollable event log panel
│   └── SoundManager.ts    # Procedural Web Audio sound effects
├── scenes/            ← Phaser scene lifecycle
│   ├── BootScene.ts       # Loading screen
│   ├── MenuScene.ts       # Title, start, history, achievements
│   ├── SetupScene.ts      # Game configuration UI
│   ├── GameScene.ts       # Main gameplay
│   ├── GameOverScene.ts   # Victory/defeat + stats + achievements
│   ├── ReplayScene.ts     # Game replay playback
│   └── HistoryScene.ts    # Match history browser
├── utils/             ← Pure utilities
│   ├── random.ts          # Seeded RNG (LCG)
│   └── graph.ts           # Graph algorithms
├── config.ts          ← Phaser configuration
├── version.ts         ← Game version
└── main.ts            ← Entry point
tests/                 ← 355+ unit tests (mirrors src/ structure)
```

### Architecture Philosophy

Game logic is **completely separated** from rendering. Everything in `src/game/` and `src/utils/` is pure TypeScript with zero framework dependencies. This means:

- **Fully testable** — 355+ unit tests run without a browser or DOM
- **Easy to refactor** — Change game rules without touching rendering
- **AI-friendly** — Copilot/AI tools can reason about game logic without Phaser knowledge

Rendering is **stateless** — it reads from `GameState` and draws. No game decisions happen in rendering code.

## 📖 Game Logic Reference

See [GAME_LOGIC.md](./GAME_LOGIC.md) for detailed documentation of all game mechanics, probability tables, and AI behavior.

## 🧪 Testing

All game logic is covered by 355+ unit tests using Vitest:

```bash
npm run test
```

Tests use **seeded RNG** for deterministic, reproducible results. Test files are in `tests/` mirroring the `src/` structure. No DOM or Phaser required.

## 📄 License

MIT
