# Fix Alliance Proposals in GameScene and UIRenderer
- **Status**: done
- **Priority**: 🔴 Critical
- **Depends on**: none
- **Files**:
  - `packages/client/src/scenes/GameScene.ts`
  - `packages/client/src/rendering/UIRenderer.ts`
  - `packages/client/src/controllers/LocalGameController.ts`
  - `packages/client/tests/rendering/UIRenderer.test.ts`
  - `packages/client/tests/controllers/LocalGameController.test.ts`

## Description
Players cannot make alliance offers on their turn in offline (and in some online) scenarios:
1. `GameScene.ts` only sets `this.localPlayerIndex` when `this.isOnlineGame` is true. In offline games, `this.localPlayerIndex` remained `undefined`, causing `UIRenderer.update()` to evaluate `canPropose` to false for every player slot.
2. The alliance button in `UIRenderer.ts` was a tiny 12px raw text emoji `'🤝'` rendered without background or button bounds, positioned at the extreme right screen edge (`panelX + 175`), making it invisible or impossible to click.
3. Formed alliances had no visual indicator in the player list, and `canPropose` did not check if the players were already allied (`areAllied`).
4. `LocalGameController.proposeAlliance` lacked checks for the 2-player minimum rule and already-allied state, and did not give feedback toasts on alliance creation.

## Tasks
- [x] Initialize `this.localPlayerIndex` properly in `GameScene` for both offline and online modes.
- [x] Redesign player panel alliance UI in `UIRenderer.ts`: clear `🤝 Ally` button with hit area, hover state, and `🤝 Pact` badge when pact is formed.
- [x] Guard alliance proposals in `LocalGameController`: handle `<= 2` alive players, already-allied checks, and user feedback toasts.
- [x] Add unit tests verifying alliance button visibility, interaction, and state changes.
