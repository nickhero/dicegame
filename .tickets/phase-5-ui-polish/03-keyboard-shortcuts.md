# Keyboard Shortcuts

- **Status**: done
- **Phase**: 5
- **Depends on**: none
- **Files**: `src/scenes/GameScene.ts`

## Description

Add keyboard shortcuts for common actions to improve gameplay flow.

### Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `E` or `Space` | End turn | During player's attack phase |
| `Escape` | Deselect / cancel | When territory is selected |
| `R` | Restart game | Any time (with confirmation) |
| `M` | Toggle mute | Any time (if sound is implemented) |
| `1` / `2` / `3` | Speed: Normal / Fast / Instant | Any time |
| `?` or `H` | Toggle help overlay | Any time |

### Help Overlay

When `?` or `H` is pressed, show a semi-transparent overlay listing all shortcuts. Press again to dismiss.

### Confirmation

- `R` (restart) should show a small "Are you sure?" dialog before restarting
- Use a simple Phaser-rendered dialog, not `window.confirm()`

## Acceptance Criteria

- [ ] End turn via keyboard (E or Space)
- [ ] Escape to deselect
- [ ] R to restart (with confirmation)
- [ ] Help overlay toggled with ? or H
- [ ] Shortcuts don't fire during text input (if setup scene has text fields)
- [ ] Shortcuts listed in help overlay
