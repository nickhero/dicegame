# Fix Shield Defence Power-Up (+3 Defence) Parity and Visual Feedback
- **Status**: done
- **Priority**: 🔴 Critical
- **Depends on**: none
- **Files**:
  - `packages/shared/src/game/ServerTypes.ts`
  - `packages/shared/src/game/DiceBattle.ts`
  - `packages/server/src/ws/gameHandlers.ts`
  - `packages/server/src/services/AITurnRunner.ts`
  - `packages/client/src/controllers/OnlineGameController.ts`
  - `packages/client/src/scenes/GameScene.ts`
  - `packages/client/src/rendering/BattleAnimator.ts`
  - `packages/client/tests/rendering/BattleAnimator.test.ts`
  - `packages/shared/tests/game/DiceBattle.test.ts`

## Description
The Shield power-up ("Adds +3 to defender total when this territory is attacked") seems to not take effect because:
1. `GameScene.ts` computed `attackerTotal` and `defenderTotal` by reducing the raw dice arrays (`result.defenderDice.reduce((sum, d) => sum + d, 0)`), discarding `result.defenderTotal` and omitting the +3 Shield bonus from the event log.
2. `BattleAnimator.ts` only summed raw dice during animation and displayed `sum(defRolls)`, so the defender's total never showed the +3 defense bonus, producing baffling visual results (e.g. Attacker rolled 9, Defender rolled 7 with shield = 10, screen displayed 9 vs 7 and declared defender victory without explaining why, or player's defended territory showed roll 7 and lost without the +3 ever appearing).
3. Server `game:battleResult` events in `gameHandlers.ts` and `AITurnRunner.ts` omitted `attackerTotal` and `defenderTotal` from the broadcast payload, and `OnlineGameController.ts` recalculated totals from raw dice rolls.
4. Territory hover tooltip attack probability estimation (`estimateWinProbability`) ignored defender shield power-up.

## Tasks
- [x] Add `attackerTotal` and `defenderTotal` to `BattleResultPayload` in `ServerTypes.ts`.
- [x] Broadcast `attackerTotal` and `defenderTotal` from server `gameHandlers.ts` and `AITurnRunner.ts`.
- [x] Update `OnlineGameController.ts` to respect `attackerTotal` and `defenderTotal` from payload.
- [x] Update `GameScene.ts` to log Shield bonus in event log and pass totals to `BattleAnimator`.
- [x] Update `estimateWinProbability` in `DiceBattle.ts` to factor in Charge and Shield power-ups, and use in GameScene tooltip.
- [x] Update `BattleAnimator.ts` to display Shield badge (`🛡️ +3 DEFENSE`) and update defender total accordingly.
- [x] Add tests for `DiceBattle`, `BattleAnimator`, and server handlers.
