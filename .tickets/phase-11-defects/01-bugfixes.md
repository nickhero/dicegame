# Phase 11 — Defect Tickets (Multi-Model Review)

Found by 3-model code review: Claude Opus 4.6, GPT-5.4, Gemini 3 Pro Preview.
Branch: `v2/multiplayer-backend` vs `development`.

---

## Critical

- [ ] 1 **`_internal:aiTurnNeeded` event is never handled — AI turns stall after timer/disconnect** — `TurnTimer.onTimeout()` and `disconnectHandler.convertToAI()` emit `_internal:aiTurnNeeded` but no listener exists anywhere. Games hang permanently when a turn timer expires or a player disconnects and is converted to AI during their turn. Fix: wire `aiTurnRunner.runAITurns()` into these paths. Severity: critical. Found by: Opus + GPT. Files: `TurnTimer.ts:106`, `disconnectHandler.ts:153`.

- [ ] 2 **Fog-of-war broadcasts full state to all players** — `serializeState.ts` aliases `serializeFullState` and all broadcasts (`gameHandlers.ts`, `AITurnRunner.ts`) send the same unfiltered payload to the entire room. `filterStateForPlayer()` exists in `FogFilter.ts:115` but is never called for broadcasts. Any client can see all territory owners/dice when fog is enabled. Fix: send per-player filtered state when fog is on. Severity: critical. Found by: GPT. Files: `serializeState.ts`, `gameHandlers.ts:63-69`, `FogFilter.ts:115`.

## High

- [ ] 3 **Non-final surrender leaves game stuck on dead player** — `surrenderForPlayer()` eliminates the player but never advances `currentPlayerIndex`. If the surrender doesn't end the game (3+ players), the turn stays on the dead player and all subsequent actions fail. Fix: advance to next living player after non-terminal surrender. Severity: high. Found by: GPT. Files: `GameEngine.ts:569-591`, `gameHandlers.ts:215-228`.

- [ ] 4 **`proposeAlliance` instantly forms alliance — bypasses consent** — `proposeAlliance()` calls `formAlliance()` directly instead of pushing to `allianceState.proposals`. Target player never gets to accept/reject. `respondAlliance()` is dead code (always throws PROPOSAL_NOT_FOUND). Humans also can't break alliances (attacks on allies are hard-rejected, unlike AI path which calls `breakAlliance()`). Fix: store proposal, form on acceptance, allow betrayal for humans. Severity: high. Found by: Opus + GPT. Files: `GameEngine.ts:252-286`.

- [ ] 5 **AI-ended games not saved to match history** — `AITurnRunner.emitGameOver()` emits the socket event and schedules cleanup but never calls `handleGameEnd()`. Games that end during an AI turn (AI wins, eliminates last human) are not persisted and achievements aren't checked. Fix: inject `handleGameEnd` callback into AITurnRunner. Severity: high. Found by: Gemini. Files: `AITurnRunner.ts:391`, `gameHandlers.ts:17`.

- [ ] 6 **Grid type hardcoded to `'square'`** — `GameEngine.createGame()` uses `const gridType = 'square' as const` instead of `config.gridType`. Hex grid lobbies still generate square maps. Fix: use `config.gridType`. Severity: high. Found by: GPT. Files: `GameEngine.ts:104`.

- [ ] 7 **Lobby slot index not validated** — `addAI`, `rearrangeSlots`, `createGame` accept arbitrary slot indices (e.g. 999). `GameEngine` assigns sequential player IDs by sort order, but `game:playerJoined` sends the original `slotIndex`, so the client thinks it's Player 999 when it's actually Player 1. Fix: validate `slotIndex < maxPlayers`. Severity: high. Found by: Gemini. Files: `waitingRoom.ts:260,426`, `LobbyService.ts:124`.

## Medium

- [ ] 8 **`updateConfig` skips validation** — `LobbyService.updateConfig()` merges caller config without calling `validateConfig()`. Invalid values (playerCount: 999, territoryCount: -1) can be injected and crash game creation. Fix: validate merged config. Severity: medium. Found by: Opus. Files: `LobbyService.ts:302-315`.

- [ ] 9 **Disconnect grace timer not cleared on re-disconnect** — If the same user has multiple sockets that both disconnect, the second timer overwrites the map entry without `clearTimeout` on the first. The orphaned timer can convert a reconnected player back to AI. Fix: clear existing timer before setting new one. Severity: medium. Found by: Opus. Files: `disconnectHandler.ts:52-58`.

- [ ] 10 **`deleteMatch` removes record for ALL participants** — Any participant can delete a match row, wiping it from every other player's history. Fix: soft-delete per user, or restrict to AI-only matches. Severity: medium. Found by: Opus. Files: `MatchHistoryService.ts:220-236`.

- [ ] 11 **Rate limiter trusts `X-Forwarded-For` without proxy verification** — Client can spoof IP via header to bypass rate limits on guest creation and game creation. Fix: use connection remote address or configure trusted proxies. Severity: medium. Found by: Opus. Files: `rateLimit.ts:34-37`.

- [ ] 12 **Fortify power-up fails silently when target near full** — `diceCount` is calculated from source only; if target can't hold that many, the action fails instead of clamping. Fix: clamp `diceCount` to `min(3, source.dice - 1, MAX - target.dice)`. Severity: medium. Found by: Gemini. Files: `GameEngine.ts:536`, `PowerUps.ts:83`.
