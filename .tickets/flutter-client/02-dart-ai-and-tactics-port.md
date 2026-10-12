# 02 - Port AI Personalities, Power-Ups and Tactical Systems

- **Status**: pending
- **Priority**: 🔴 Critical
- **Depends on**: `01-dart-core-engine-port.md`
- **Files**:
  - `packages/client_flutter/lib/game/engine/ai_player.dart`
  - `packages/client_flutter/lib/game/engine/ai_personality.dart`
  - `packages/client_flutter/lib/game/engine/power_ups.dart`
  - `packages/client_flutter/lib/game/engine/fog_of_war.dart`
  - `packages/client_flutter/lib/game/engine/alliance.dart`
  - `packages/client_flutter/lib/game/engine/game_state_snapshot.dart`
  - `packages/client_flutter/test/game/...`

## Description

Port the advanced singleplayer features into Dart: the 6 AI personalities, tactical power-ups, fog of war visibility masking, diplomatic alliances, and state snapshotting (undo system).

## Tasks

- [ ] Port `AIPersonality` & `AIPlayer`:
  - 6 personality profiles: Cautious, Balanced, Aggressive, Reckless, Expansionist, Turtle.
  - Evaluation heuristics (risk tolerance, expansion priority, threat assessment).
  - Target selection and attack plan generation.
- [ ] Port `PowerUps`:
  - Types: Shield (+3 defense / block), Charge (+2 attack), Fortify (+2 defense / clamp), Reinforce (+3 dice).
  - Turn spawning and activation effects.
- [ ] Port `FogOfWar`:
  - Calculate player visibility set (owned territories + direct neighbors).
  - Provide state filtering for rendered views.
- [ ] Port `Alliance`:
  - Proposal flow, mutual acceptance, non-aggression pact state, betrayal handling, and reputation tracking.
- [ ] Port `GameStateSnapshot`:
  - Deep clone / serialization of `GameState` for one-step attack undo support in local matches.
- [ ] Write unit tests for AI decisions, power-ups, alliances, and snapshot restore.
