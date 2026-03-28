import { Server } from 'node:http';
import { createAdaptorServer } from '@hono/node-server';
import { createApp } from './app';
import { createSocketServer } from './ws';
import { config } from './config';
import { getDb } from './db/connection';
import { runMigrations } from './db/migrate';
import { lobbyBroadcaster } from './ws/lobbyBroadcaster';
import { startCleanupJob } from './ws/cleanupJob';

// Run database migrations before anything else
if (config.nodeEnv !== 'test') {
  runMigrations(config.databaseUrl || 'dicewars.db');
}

const app = createApp();

// Create Node HTTP server with Hono as the request handler
const httpServer = createAdaptorServer({ fetch: app.fetch }) as Server;

// Attach Socket.IO to the same HTTP server
const io = createSocketServer(httpServer);

// Start periodic cleanup of stale game rooms
if (config.nodeEnv !== 'test') {
  startCleanupJob(getDb(), lobbyBroadcaster);
}

httpServer.listen(config.port, () => {
  console.log(`🎲 DiceWars server running on http://localhost:${config.port}`);
  console.log(`🔌 Socket.IO attached to same port`);
  console.log(`   Environment: ${config.nodeEnv}`);
});

export { app, io, httpServer };
