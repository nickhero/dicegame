# Sound Effects

- **Status**: open
- **Phase**: 5
- **Depends on**: none
- **Files**: `src/rendering/SoundManager.ts` (new), `src/scenes/GameScene.ts`

## Description

Add procedural/simple sound effects to make the game feel more alive. Use Web Audio API for procedural sounds (no asset files needed).

### Sounds

| Event | Sound | Method |
|-------|-------|--------|
| Dice roll | Rapid clicking/rattling | Procedural: filtered noise bursts |
| Territory capture | Rising chime | Procedural: ascending sine sweep |
| Attack failed | Low thud | Procedural: low freq sine decay |
| Turn start | Short notification ping | Procedural: two-tone beep |
| Player eliminated | Dramatic chord | Procedural: minor chord sweep |
| Victory | Fanfare | Procedural: ascending major arpeggio |
| Defeat | Descending tone | Procedural: descending minor |
| Button hover | Soft click | Procedural: short noise burst |

### Settings

- Global mute toggle (saved to localStorage)
- Volume slider (0–100%)
- Accessible via settings/setup and in-game (M key to toggle mute)

### Implementation

Use `Phaser.Sound.WebAudioSoundManager` or direct Web Audio API:
- Create short procedural sounds via oscillator + gain nodes
- Cache generated audio buffers
- No external audio files needed (keeps the "no assets" philosophy)

## Acceptance Criteria

- [ ] At least 4 distinct sounds (roll, capture, fail, turn notification)
- [ ] Mute toggle works (M key + settings)
- [ ] Volume control
- [ ] Mute preference persisted in localStorage
- [ ] Sounds don't overlap/stack unpleasantly during rapid AI turns
- [ ] No external audio files
