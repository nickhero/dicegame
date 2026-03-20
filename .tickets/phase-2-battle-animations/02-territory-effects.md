# Territory Visual Effects

- **Status**: open
- **Phase**: 2
- **Depends on**: `01-battle-popup`
- **Files**: `src/rendering/MapRenderer.ts`

## Description

Add visual feedback to territory interactions to make the game feel more responsive and readable.

### Effects

1. **Attack arrow**: When player selects attacker and hovers a valid target, draw a dashed arrow from attacker center to target center
2. **Capture pulse**: When a territory is captured, flash it white (200ms) then fade to new owner color (300ms)
3. **Hover tooltip**: On territory hover, show small tooltip with "Territory #N | 5 dice | AI Red"
4. **Low-dice warning**: Territories with 1 die adjacent to enemy territories get a subtle pulsing red border
5. **Valid target glow**: Valid attack targets get a pulsing brightness effect (not just static highlight)

## Acceptance Criteria

- [ ] Attack arrow renders from selected territory to hovered valid target
- [ ] Capture pulse plays on territory ownership change
- [ ] Hover tooltip shows territory info
- [ ] Low-dice warning visible on vulnerable territories
- [ ] Valid targets pulse instead of static highlight
- [ ] Effects don't cause performance issues (no per-frame allocations)
