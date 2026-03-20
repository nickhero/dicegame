# .tickets — DiceWars Issue Tracker

Markdown-based ticket system. Each ticket is a `.md` file inside a phase folder.

## Ticket Format

Each ticket file follows this structure:

```markdown
# Title
- **Status**: open | in-progress | done
- **Phase**: 1–6
- **Depends on**: (other ticket IDs or "none")
- **Files**: (key files to create/modify)

## Description
What needs to be done.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

## Phases

| Phase | Focus | Folder |
|-------|-------|--------|
| 1 | AI Personalities | `phase-1-ai-personalities/` |
| 2 | Battle Animations | `phase-2-battle-animations/` |
| 3 | Settings & Setup | `phase-3-settings/` |
| 4 | Map Variety | `phase-4-map-variety/` |
| 5 | UI & Polish | `phase-5-ui-polish/` |
| 6 | Advanced Mechanics | `phase-6-advanced-mechanics/` |

## Quick Status

Run from project root:
```bash
grep -r "Status" .tickets/ --include="*.md" | grep -v README
```
