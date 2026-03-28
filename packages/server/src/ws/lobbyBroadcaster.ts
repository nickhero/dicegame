import type { Namespace } from 'socket.io';
import type { GameRoomSummary } from '@dicewars/shared';

export class LobbyBroadcaster {
  private lobbyNamespace: Namespace | null = null;

  setNamespace(ns: Namespace) {
    this.lobbyNamespace = ns;
  }

  broadcastGameCreated(game: GameRoomSummary) {
    this.lobbyNamespace?.emit('lobby:gameCreated', game);
  }

  broadcastGameRemoved(gameId: string) {
    this.lobbyNamespace?.emit('lobby:gameRemoved', gameId);
  }

  broadcastGameUpdated(game: GameRoomSummary) {
    this.lobbyNamespace?.emit('lobby:gameUpdated', game);
  }

  broadcastPlayerCount(gameId: string, count: number) {
    this.lobbyNamespace?.emit('lobby:playerCount', { gameId, count });
  }
}

// Singleton for cross-module access
export const lobbyBroadcaster = new LobbyBroadcaster();
