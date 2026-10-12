# Extract Scene Dialogs, Overlays & In-Game Chat

- **Status**: done
- **Priority**: 🟢 Normal
- **Depends on**: `03-unify-gamescene-controller.md`
- **Files**:
  - `packages/client/src/rendering/DialogManager.ts` (new)
  - `packages/client/src/rendering/ChatManager.ts` (new)
  - `packages/client/src/scenes/GameScene.ts`

## Description

`GameScene.ts` currently embeds ~800 lines of imperative Phaser container and graphics drawing code for modal dialogs and chat overlays:
- Help Overlay
- Exit and Surrender Confirmation Dialogs
- Alliance Confirmation & Proposal Modals
- Power-Up Selection Popup
- Disconnection Grace Period Overlay
- In-Game Chat Box (input handling, cursor blink timer, text rendering)

Extracting these UI concerns into modular managers will drastically reduce `GameScene.ts` complexity, eliminate DOM/keyboard event listener leaks, and isolate UI presentation from game loop mechanics.

## Tasks

- [x] **Create `DialogManager` (`packages/client/src/rendering/DialogManager.ts`)**:
  - Implement reusable modal containers for Help, Surrender, Exit, and Alliance confirmation.
  - Implement Alliance Proposal response modal.
  - Implement Power-Up selection popup (reinforce/fortify).
  - Implement Disconnection grace period overlay.
  - Expose promise-based confirmation methods (e.g. `confirm(title, message): Promise<boolean>`).
- [x] **Create `ChatManager` (`packages/client/src/rendering/ChatManager.ts`)**:
  - Encapsulate chat trigger button, text entry graphics, cursor blink timer, and history display.
  - Handle keyboard inputs (Enter, Escape, typing) cleanly.
  - Expose callback `onSendMessage: (text: string) => void`.
- [x] **Integrate into `GameScene`**:
  - Replace inline dialog methods in `GameScene` with calls to `DialogManager` and `ChatManager`.
  - Ensure dialog cleanup is called on scene shutdown.
