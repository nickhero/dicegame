# 06 - Audio, Battle Animations and Game Juice

- **Status**: pending
- **Priority**: 🟢 Normal
- **Depends on**: `04-map-rendering-custom-painter.md`, `05-singleplayer-ui-and-screens.md`
- **Files**:
  - `packages/client_flutter/lib/audio/sound_effects.dart`
  - `packages/client_flutter/lib/ui/animations/dice_roll_animation.dart`
  - `packages/client_flutter/lib/ui/animations/conquest_particles.dart`

## Description

Add game juice: sound effects for dice rolling, battle wins/losses, turn transitions, screen shake on close battles, and haptic feedback on mobile devices.

## Tasks

- [ ] Implement `SoundEffects` service:
  - Play dice roll rattle, victory chime, defeat thud, turn bell, button click.
  - Support volume control and mute toggle.
- [ ] Add 2D dice tumble / roll animations in the battle dialog using Flutter `AnimationController`.
- [ ] Add subtle camera/screen shake on high-stakes battles (e.g. 8 vs 8 dice).
- [ ] Add haptic feedback (`HapticFeedback.lightImpact()`) on territory taps and battle roll on mobile.
