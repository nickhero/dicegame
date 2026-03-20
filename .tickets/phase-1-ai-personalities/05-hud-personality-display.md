# Show Personality in HUD

- **Status**: done
- **Phase**: 1
- **Depends on**: `03-assign-personalities`
- **Files**: `src/rendering/UIRenderer.ts`

## Description

Display each AI player's personality name next to their name in the HUD panel.

### Current Display
```
▶ Player (You)
   7T 24D
  AI Red
   7T 21D
```

### New Display
```
▶ Player (You)
   7T 24D
  AI Red (Aggressive)
   7T 21D
  AI Green (Turtle)
   7T 19D
```

## Acceptance Criteria

- [ ] Personality name shown in parentheses after AI player name
- [ ] Human player shows "(You)" not a personality
- [ ] Text doesn't overflow the HUD panel (truncate if needed)
- [ ] Eliminated players still show personality (greyed out)
