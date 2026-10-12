# Agent Instructions — DiceWars

Welcome, AI agent! This repository is configured with guidelines and tools to help you navigate, understand, and safely modify the codebase.

## 🧭 Master Instructions & Architecture

Before making any changes or reasoning about project boundaries, **always consult the primary project instructions**:

- 📖 **[Copilot Instructions (.github/copilot-instructions.md)](.github/copilot-instructions.md)** — Architectural principles, strict package boundaries (`shared`, `server`, `client`), rendering pipelines, networking, test requirements, conventional commits, and release workflows.
- 🎲 **[Game Logic Reference (GAME_LOGIC.md)](GAME_LOGIC.md)** — Core game mechanics, probability tables, dice battle algorithms, power-ups, fog of war, and AI personalities.
- 📋 **[Issue Tracker (.tickets/README.md)](.tickets/README.md)** — Ticket formats and project phase tracking.

---

## 🕸️ Knowledge Graph (`graphify` — ALWAYS check first)

This project has a pre-built code knowledge graph located in `graphify-out/`.

**Before searching or grepping the codebase**, consult the graph:

1. **Read `graphify-out/GRAPH_REPORT.md` first** — contains god nodes, community structure, and module relationships. This gives you a high-level map of the codebase before you start exploring.
2. **If `graphify-out/wiki/index.md` exists**, navigate the wiki instead of reading raw source files — it provides structured summaries of each module and their interactions.
3. **Use grep/glob as a second step** — only after consulting the graph, to find specific implementation details the graph doesn't cover.

After modifying code files, rebuild the graph:
```bash
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

---

## ⚡ Quick Rules & Verification Checklist

- **Strict Boundaries**:
  - `packages/shared`: Zero browser/Node APIs, zero Phaser. Authoritative rules and data structures.
  - `packages/server`: Imports `@dicewars/shared`. Never imports `client`. Validates all moves.
  - `packages/client`: Imports `@dicewars/shared`. Never imports `server`. Renders state and delegates to controllers (`LocalGameController`, `OnlineGameController`).
- **Tests**:
  - `npm run test` (shared game logic)
  - `npm run test:server` (server unit & integration)
  - `npm run test:client` (client controllers & networking)
  - `npm run test:all` (all tests)
- **Type Checking**:
  - `npm run typecheck` (`tsc --build`)
- **Git Commits**:
  - Conventional commits format (`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`, `chore: ...`).
