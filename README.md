# 🎲 DiceWars

A browser-based territory strategy game inspired by [DiceWars](http://www.gamedesign.jp/flash/dice/dice.html) and [KDice](https://kdice.com). Conquer the map by rolling dice against your opponents!

Built with Phaser 3, TypeScript, and pixel art — all generated programmatically, no external assets needed.

![Game Type](https://img.shields.io/badge/genre-strategy-blue)
![Tech](https://img.shields.io/badge/stack-Phaser_3_+_TypeScript-green)

## 🎮 How to Play

1. **Start** — Territories are randomly divided among you (blue) and 3 AI players
2. **Attack** — Click one of your territories (must have >1 die), then click an adjacent enemy territory
3. **Battle** — Both sides roll their dice. Higher total wins. Ties go to the defender
4. **Conquer** — If you win, you take the territory and move your dice there. If you lose, your stack drops to 1
5. **End Turn** — Click "END TURN" when done attacking. You receive bonus dice equal to your largest connected territory group
6. **Win** — Eliminate all opponents by capturing every territory!

### Strategy Tips

- **Attack with advantage** — More dice = better odds. 6 vs 3 is much safer than 4 vs 3
- **Keep connected** — Your bonus dice depend on your largest contiguous group
- **Don't overextend** — Attacking too aggressively leaves your territories with 1 die (easy prey)
- **Watch the borders** — Territories with 1 die adjacent to strong enemies will fall

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
npm run test       # Run unit tests
npm run build      # Production build (outputs to dist/)
npm run preview    # Preview production build
npm run typecheck  # Type-check without building
```

## 🏗️ Project Structure

```
src/
├── game/           ← Pure game logic (no Phaser dependency)
│   ├── constants.ts    # Colors, limits, dimensions
│   ├── Territory.ts    # Territory data model
│   ├── Player.ts       # Player data model
│   ├── GameState.ts    # Central game state
│   ├── MapGenerator.ts # Random map generation
│   ├── DiceBattle.ts   # Dice rolling & battle resolution
│   ├── GameRules.ts    # Attack rules, turn flow, dice distribution
│   └── AIPlayer.ts     # AI opponent logic
├── rendering/      ← Visual rendering (Phaser Graphics)
│   ├── MapRenderer.ts  # Territory map drawing
│   ├── DiceRenderer.ts # Pixel art dice generation & stacks
│   └── UIRenderer.ts   # HUD, player panel, buttons
├── scenes/         ← Phaser scene lifecycle
│   ├── BootScene.ts    # Loading screen
│   ├── MenuScene.ts    # Title & start button
│   ├── GameScene.ts    # Main gameplay
│   └── GameOverScene.ts# Victory/defeat screen
├── utils/          ← Pure utilities
│   ├── random.ts       # Seeded RNG
│   └── graph.ts        # Graph algorithms (connected components, adjacency)
├── config.ts       ← Phaser configuration
└── main.ts         ← Entry point
tests/              ← Unit tests (mirrors src/ structure)
```

### Architecture Philosophy

Game logic is **completely separated** from rendering. Everything in `src/game/` and `src/utils/` is pure TypeScript with zero framework dependencies. This means:

- **Fully testable** — 59 unit tests run without a browser
- **Easy to refactor** — Change game rules without touching rendering
- **AI-friendly** — Copilot/AI tools can reason about game logic without Phaser knowledge

## 📖 Game Logic Reference

See [GAME_LOGIC.md](./GAME_LOGIC.md) for detailed documentation of all game mechanics, probability tables, and AI behavior.

## 🧪 Testing

All game logic is covered by unit tests using Vitest:

```bash
npm run test
```

Tests use **seeded RNG** for deterministic, reproducible results. Test files are in `tests/` mirroring the `src/` structure.

## 📄 License

MIT
