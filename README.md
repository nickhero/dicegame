# 🎲 DiceWars

A browser-based territory strategy game inspired by [DiceWars](http://www.gamedesign.jp/flash/dice/dice.html) and [KDice](https://kdice.com). Conquer the map by rolling dice against your opponents!

Built as a monorepo with a **server-authoritative multiplayer backend** — Phaser 3 + TypeScript + Hono + Socket.IO. All graphics are procedural pixel art, no external assets needed.

![Game Type](https://img.shields.io/badge/genre-strategy-blue)
![Tech](https://img.shields.io/badge/stack-Phaser_3_+_TypeScript-green)

## ✨ Features

- **2–6 player** territory strategy with multiplayer support (Socket.IO)
- **Server-authoritative** — Hono backend validates all moves, clients send intents
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
npm run dev          # Client dev server on :3000
npm run dev:server   # Backend server on :3001
```

Open [http://localhost:3000](http://localhost:3000) in your browser. For multiplayer, both client and server must be running.

### Other Commands

```bash
npm run test         # Run shared package tests (478+)
npm run test:server  # Run server tests including E2E (306+)
npm run test:all     # Run all tests (784+)
npm run build        # Build shared + client for production
npm run typecheck    # Type-check all packages (tsc --build)
```

## 🏗️ Project Structure

This is a **monorepo** (npm workspaces) with three packages:

```
packages/
├── shared/            ← @dicewars/shared — Pure TypeScript game logic + utilities
│   └── src/game/          20 modules: Territory, Player, GameState, MapGenerator,
│                          DiceBattle, GameRules, AIPlayer, Alliance, PowerUps, FogOfWar, etc.
│
├── server/            ← @dicewars/server — Hono backend (REST + Socket.IO)
│   └── src/
│       ├── services/      GameEngine, AITurnRunner, TurnTimer, FogFilter, LobbyService, etc.
│       ├── ws/            WebSocket handlers (game, lobby, disconnect, spectator)
│       ├── routes/        REST endpoints (auth, lobby, history, AI presets)
│       ├── middleware/    Auth, rate limiting, error handling, security headers
│       └── db/            SQLite + Drizzle ORM schema & migrations
│
└── client/            ← @dicewars/client — Phaser 3 frontend (thin renderer)
    └── src/
        ├── scenes/        7 scenes: Boot, Menu, Setup, Game, GameOver, Replay, History
        └── rendering/     MapRenderer, DiceRenderer, UIRenderer, BattleAnimator, etc.
```

### Architecture Philosophy

Game logic is **completely separated** from rendering and server code. Everything in `packages/shared/` is pure TypeScript with zero framework dependencies. This means:

- **Fully testable** — 784+ tests run without a browser or DOM
- **Easy to refactor** — Change game rules without touching rendering or server
- **Server-authoritative** — Server validates all moves using shared game logic
- **AI-friendly** — Copilot/AI tools can reason about game logic without Phaser knowledge

Rendering is **stateless** — it reads from `GameState` and draws. No game decisions happen in rendering code.

## 📖 Game Logic Reference

See [GAME_LOGIC.md](./GAME_LOGIC.md) for detailed documentation of all game mechanics, probability tables, and AI behavior.

## 🧪 Testing

784+ tests across shared and server packages using Vitest:

```bash
npm run test         # Shared game logic (478+ tests)
npm run test:server  # Server unit + E2E (306+ tests)
npm run test:all     # Everything
```

Tests use **seeded RNG** for deterministic, reproducible results. E2E tests exercise full WebSocket flows (game lifecycle, multi-client, reconnection, stress, fuzz).

## 📄 License

MIT
