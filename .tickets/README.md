# .tickets — DiceWars Issue Tracker

Markdown-based ticket system. Each ticket is a `.md` file inside a phase folder. Completed tickets are removed — only open/pending work remains here.

## Ticket Format

```markdown
# Title
- **Status**: pending | in-progress | done
- **Phase**: N
- **Depends on**: (other ticket IDs or "none")
- **Files**: (key files to create/modify)

## Description
What needs to be done.

## Tasks
- [ ] Task 1
- [ ] Task 2
```

## Open Tickets

| Phase | Folder | Tickets |
|-------|--------|---------|
| 9 | `phase-9-quality-of-life/` | Background music, Save/Load, Tooltips & Tutorial |
| 10 | `phase-10-advanced-mechanics/` | Territory upgrades, Custom AI builder, Tournament mode |

Also completed from open phases (tickets removed):
- Phase 7: Map shape selector, Fog of war toggle, Power-ups toggle
- Phase 9: Game replay, Undo attack
- Phase 10: Alliance system, Achievements

## Quick Status

```bash
grep -r "Status" .tickets/ --include="*.md" | grep -v README
```
