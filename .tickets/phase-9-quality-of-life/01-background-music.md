# Background Music

- **Status**: pending
- **Phase**: 9
- **Depends on**: none
- **Files**: `src/rendering/SoundManager.ts`, `src/scenes/SetupScene.ts`

## Description

Procedurally generate an ambient background music loop using Web Audio API. Low drone + slow arpeggios for atmosphere. Add separate volume controls for music and SFX.

## Tasks

- [ ] Add ambient loop generator to SoundManager (oscillators + gain envelope)
- [ ] Create calming low-frequency drone with slow evolving harmonics
- [ ] Add music on/off toggle separate from SFX mute
- [ ] Add volume slider or presets for music vs SFX
- [ ] Start/stop music on scene transitions
- [ ] Persist music volume/mute preference in localStorage
