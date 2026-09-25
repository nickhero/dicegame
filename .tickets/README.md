# .tickets — DiceWars Issue Tracker

Markdown-based ticket system. Each ticket is a `.md` file inside a phase folder. Completed tickets are removed — only open/pending work remains here.

## Ticket Format

See `_template.md` for a starter template.

```markdown
# Title
- **Status**: pending | in-progress | done
- **Priority**: 🔴 Critical | 🟡 High | 🟢 Normal
- **Depends on**: (other ticket IDs or "none")
- **Files**: (key files to create/modify)

## Description
What needs to be done.

## Tasks
- [ ] Task 1
- [ ] Task 2
```

## Active Phase

- *(None currently active — ready for next milestone)*

## Completed Phases

- **v2.1-rework**: Local parity restoration, online alliances, account registration/login auth, stats/history sync, islands map shape, in-game chat, GameScene controller architecture refactor, and client test suite
- **Phases 1–8**: Core game, map gen, AI, power-ups, fog of war, alliances, achievements, replay, history
- **Multiplayer backend**: Monorepo, Hono + Socket.IO, auth, lobby, game engine, AI turns, persistence, spectator
- **Phase 11**: Defect fixes from multi-model code review

## Quick Status

```bash
grep -r "Status" .tickets/ --include="*.md" | grep -v README
```
