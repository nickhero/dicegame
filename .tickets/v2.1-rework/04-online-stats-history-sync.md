# Online Match History & Profile Stats UI Sync

- **Status**: pending
- **Priority**: 🟡 High
- **Depends on**: `03-account-registration-login.md`
- **Files**:
  - `packages/client/src/network/LobbyClient.ts`
  - `packages/client/src/scenes/HistoryScene.ts`
  - `packages/client/src/scenes/MenuScene.ts`
  - `packages/server/src/routes/history.ts`
  - `packages/server/src/routes/stats.ts`

## Description

The server provides complete, tested REST endpoints for user stats and match records:
- `GET /api/me/history` (paginated match records)
- `GET /api/me/history/:id` (full match details + replay data)
- `DELETE /api/me/history/:id` (soft-delete match)
- `GET /api/me/stats` (games played, win rate, territory captures, turns played)

However, `packages/client` never connects to any of these endpoints:
1. `HistoryScene.ts` only loads from browser `localStorage` (`loadHistory()`). Matches played online are recorded into the server's SQLite database but are invisible to players in the client UI.
2. `MenuScene.ts` displays local achievements, but has no view for player stats (win/loss ratio, online rank/history).
3. `LobbyClient.ts` lacks client helper methods to fetch stats and history.

## Tasks

- [ ] **LobbyClient / ApiClient Expansion**:
  - Add API methods in `LobbyClient.ts`:
    - `getMatchHistory(page?: number, limit?: number)`
    - `getMatchDetails(matchId: string)`
    - `getUserStats()`
- [ ] **HistoryScene Multi-Tab Support**:
  - In `HistoryScene.ts`: add a toggle/tab bar between **"Local Matches"** (existing localStorage data) and **"Online Matches"** (server `/api/me/history`).
  - Render server match history rows: Date, Winner, Number of players, Turns, Result (Win/Loss).
  - Add "Delete" button wired to `DELETE /api/me/history/:id`.
- [ ] **Player Stats Profile Modal in MenuScene**:
  - Add a "PROFILE / STATS" button in `MenuScene.ts` when authenticated.
  - Fetch and display stats card: Games Played, Wins, Losses, Win Rate %, Total Territories Captured.
- [ ] **Tests**:
  - Add tests for `LobbyClient` history and stats fetch methods.
  - Verify pagination and empty states in HistoryScene.
