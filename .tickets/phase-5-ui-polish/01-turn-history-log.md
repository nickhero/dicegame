# Turn History Event Log

- **Status**: open
- **Phase**: 5
- **Depends on**: none
- **Files**: `src/rendering/EventLog.ts` (new), `src/scenes/GameScene.ts`

## Description

Add a scrollable text panel showing recent game events so players can follow what happened, especially during AI turns.

### Events to Log

- `"Player attacked T5 → T8 (won 18 vs 12)"`
- `"AI Red attacked T3 → T7 (lost 9 vs 14)"`
- `"AI Green was eliminated!"`
- `"Player received 5 bonus dice"`
- `"Turn 4 — AI Yellow's turn"`

### UI

- Panel on the left or bottom of the screen
- Shows last 15–20 events
- Scrollable (mouse wheel or drag)
- Semi-transparent background
- Color-coded by player
- Auto-scrolls to latest event

### Implementation

```typescript
class EventLog {
  addEvent(text: string, color?: number): void;
  clear(): void;
}
```

Wire into GameScene: call `eventLog.addEvent()` after each attack, turn change, elimination, etc.

## Acceptance Criteria

- [ ] Event log visible during gameplay
- [ ] Attack results logged with dice totals
- [ ] Player eliminations logged
- [ ] Dice distribution logged
- [ ] Turn changes logged
- [ ] Scrollable when events exceed visible area
- [ ] Color-coded by player
- [ ] Doesn't overlap with map or HUD
