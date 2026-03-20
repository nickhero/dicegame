# Power-ups System

- **Status**: open
- **Phase**: 6
- **Depends on**: Phase 1
- **Files**: `src/game/PowerUps.ts` (new), `src/game/GameRules.ts`, `src/game/Territory.ts`

## Description

Add an optional power-up system where territories can spawn special items that activate during battle or as actions.

### Power-up Types

| Power-up | Effect | When |
|----------|--------|------|
| **Shield** | Defender gets +3 to total | Applied during defense |
| **Charge** | Attacker gets +3 to total | Applied during attack |
| **Fortify** | Move up to 3 dice between adjacent owned territories | Instead of attack action |
| **Reinforce** | Immediately add 2 bonus dice to this territory | Instead of attack action |

### Spawning Rules

- At the start of each round, 1 power-up spawns on a random unoccupied (no power-up) territory
- Maximum 4 power-ups on the map at once
- Power-ups are consumed on use (one-time)
- Visual: small icon on the territory

### Implementation

Add to Territory interface:
```typescript
powerUp?: PowerUpType;
```

Modify `resolveBattle()` to check for Shield/Charge power-ups and apply bonuses.
Add `useFortify()` and `useReinforce()` functions to GameRules.

### AI Integration

AI personalities should consider power-ups in move scoring:
- Attacking a territory with Shield is less attractive
- Attacking from a territory with Charge is more attractive
- Using Fortify/Reinforce is personality-dependent

## Acceptance Criteria

- [ ] PowerUpType enum and spawn logic
- [ ] Shield and Charge modify battle resolution
- [ ] Fortify allows dice movement between owned territories
- [ ] Reinforce adds bonus dice
- [ ] Power-ups rendered on map
- [ ] AI considers power-ups in decision-making
- [ ] Tests for all power-up effects
- [ ] Optional rule (can be disabled in settings)
