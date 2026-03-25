import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { jwtVerify } from 'jose';
import type { ServerToClientEvents, ClientToServerEvents, SocketData } from '../types/events';
import { config } from '../config';
import { getDb, type AppDatabase } from '../db/connection';
import { LobbyService } from '../services/LobbyService';
import { lobbyBroadcaster } from './lobbyBroadcaster';
import { setupWaitingRoomHandlers } from './waitingRoom';
import { setupGameActionHandlers } from './gameHandlers';
import { setupDisconnectHandler, setupReconnectHandler } from './disconnectHandler';
import { setupSpectatorHandlers } from './spectatorHandlers';
import { gameEngine } from '../services/gameEngineInstance';
import { initAITurnRunner } from '../services/aiTurnRunnerInstance';
import { initTurnTimer } from '../services/turnTimerInstance';

type TypedServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const secret = new TextEncoder().encode(config.jwtSecret);

async function verifySocketToken(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('AUTH_REQUIRED'));
    }

    const { payload } = await jwtVerify(token, secret);

    socket.data.userId = payload.sub as string;
    socket.data.userName = payload.name as string;

    next();
  } catch {
    next(new Error('AUTH_INVALID_TOKEN'));
  }
}

export function createSocketServer(httpServer: HttpServer, db?: AppDatabase): TypedServer {
  const database = db ?? getDb();

  const io: TypedServer = new SocketIOServer(httpServer, {
    cors: {
      origin: config.clientOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 10_000,
    pingInterval: 25_000,
  });

  // JWT authentication middleware for ALL socket connections
  io.use(verifySocketToken);

  io.on('connection', (socket) => {
    console.log(`[WS] ${socket.data.userName} connected`);
    socket.on('disconnect', (reason) => {
      console.log(`[WS] ${socket.data.userName} disconnected: ${reason}`);
    });
  });

  setupLobbyNamespace(io, database);
  setupGameNamespace(io, database);

  return io;
}

function setupLobbyNamespace(io: TypedServer, db: AppDatabase) {
  const lobby = io.of('/lobby');
  lobbyBroadcaster.setNamespace(lobby);

  lobby.use(verifySocketToken);

  lobby.on('connection', async (socket) => {
    console.log(`[Lobby] ${socket.data.userName} connected`);

    // Send current game list on connect
    try {
      const lobbyService = new LobbyService(db);
      const games = await lobbyService.listGames();
      socket.emit('lobby:gameList', games);
    } catch (err) {
      console.error('[Lobby] Failed to send game list:', err);
      socket.emit('lobby:gameList', []);
    }

    socket.on('disconnect', () => {
      console.log(`[Lobby] ${socket.data.userName} disconnected`);
    });
  });
}

function setupGameNamespace(io: TypedServer, db: AppDatabase) {
  const game = io.of('/game');
  const aiTurnRunner = initAITurnRunner(game, db);
  const turnTimer = initTurnTimer(game, aiTurnRunner);

  game.use(verifySocketToken);

  game.on('connection', (socket) => {
    console.log(`[Game] ${socket.data.userName} connected`);

    setupWaitingRoomHandlers(socket, game, gameEngine, db, aiTurnRunner);
    setupGameActionHandlers(socket, game, gameEngine, db, aiTurnRunner, turnTimer);
    setupSpectatorHandlers(socket, game, gameEngine, db);
    setupDisconnectHandler(socket, game, gameEngine, aiTurnRunner);
    setupReconnectHandler(socket, game, gameEngine);

    socket.on('disconnect', (reason) => {
      console.log(`[Game] ${socket.data.userName} disconnected: ${reason}`);
    });
  });
}
