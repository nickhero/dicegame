# Territory Upgrades

- **Status**: pending
- **Phase**: 10
- **Depends on**: none
- **Files**: `src/game/Territory.ts`, `src/game/DiceBattle.ts`, `src/rendering/MapRenderer.ts`

## Description

Territories held for 3+ consecutive turns become "fortified", granting +1 defense bonus in battles. Visual indicator on map. Encourages defensive play.

## Tasks

- [ ] Add `turnsHeld` counter to Territory
- [ ] Increment counter each turn the territory is held by same owner
- [ ] Reset to 0 on ownership change
- [ ] Apply +1 defense bonus in DiceBattle when territory is fortified (turnsHeld >= 3)
- [ ] Add visual indicator on map (e.g., small shield icon or border glow)
- [ ] AI should factor fortification into attack scoring
- [ ] Add tests for fortification mechanics
