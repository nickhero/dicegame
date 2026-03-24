import type { AppDatabase } from '../db/connection';
import { LobbyService } from '../services/LobbyService';
import type { LobbyBroadcaster } from './lobbyBroadcaster';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startCleanupJob(db: AppDatabase, broadcaster: LobbyBroadcaster): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      const lobbyService = new LobbyService(db);
      const staleRoomIds = await lobbyService.cleanupStaleRooms();
      for (const roomId of staleRoomIds) {
        broadcaster.broadcastGameRemoved(roomId);
      }
      if (staleRoomIds.length > 0) {
        console.log(`[Cleanup] Removed ${staleRoomIds.length} stale room(s)`);
      }
    } catch (err) {
      console.error('[Cleanup] Error during stale room cleanup:', err);
    }
  }, CLEANUP_INTERVAL_MS);

  return timer;
}
