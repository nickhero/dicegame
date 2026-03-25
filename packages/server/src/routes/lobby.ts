import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { LobbyService, LobbyError } from '../services/LobbyService';
import { ERROR_HTTP_STATUS, GameErrorCode } from '@dicewars/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppDatabase } from '../db/connection';
import type { AppEnv } from '../types/env';
import { lobbyBroadcaster } from '../ws/lobbyBroadcaster';

const createGameRateLimit = rateLimit({ maxRequests: 10, windowMs: 60 * 60 * 1000 });

export function createLobbyRoutes(db: AppDatabase) {
  const lobby = new Hono<AppEnv>();
  const lobbyService = new LobbyService(db);

  function lobbyErrorStatus(code: GameErrorCode): ContentfulStatusCode {
    return (ERROR_HTTP_STATUS[code] || 400) as ContentfulStatusCode;
  }

  lobby.use('*', authMiddleware);

  // GET /api/games — List public waiting games
  lobby.get('/', async (c) => {
    const games = await lobbyService.listGames();
    return c.json(games);
  });

  // GET /api/games/invite/:code — Resolve invite code (must be before /:id)
  lobby.get('/invite/:code', async (c) => {
    const game = await lobbyService.resolveInvite(c.req.param('code'));
    if (!game) {
      return c.json(
        { error: { code: GameErrorCode.LOBBY_GAME_NOT_FOUND, message: 'Invalid invite code' } },
        404,
      );
    }
    return c.json(game);
  });

  // GET /api/games/:id — Game details
  lobby.get('/:id', async (c) => {
    const game = await lobbyService.getGame(c.req.param('id'));
    if (!game) {
      return c.json(
        { error: { code: GameErrorCode.LOBBY_GAME_NOT_FOUND, message: 'Game not found' } },
        404,
      );
    }
    return c.json(game);
  });

  // POST /api/games — Create game
  lobby.post('/', createGameRateLimit, async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return c.json(
        { error: { code: GameErrorCode.LOBBY_INVALID_CONFIG, message: 'Game name is required' } },
        400,
      );
    }

    if (!body.config || typeof body.config !== 'object') {
      return c.json(
        { error: { code: GameErrorCode.LOBBY_INVALID_CONFIG, message: 'Game config is required' } },
        400,
      );
    }

    try {
      const game = await lobbyService.createGame(user.sub, {
        name: body.name.trim(),
        config: body.config,
        password: body.password,
        aiSlots: body.aiSlots,
      });
      lobbyBroadcaster.broadcastGameCreated(game);
      return c.json(game, 201);
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = lobbyErrorStatus(err.code);
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      throw err;
    }
  });

  // PATCH /api/games/:id — Update config (creator only)
  lobby.patch('/:id', async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    try {
      await lobbyService.updateConfig(c.req.param('id'), user.sub, body.config || body);
      const updated = await lobbyService.getGame(c.req.param('id'));
      if (updated) {
        lobbyBroadcaster.broadcastGameUpdated(updated);
      }
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = lobbyErrorStatus(err.code);
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      throw err;
    }
  });

  // DELETE /api/games/:id — Cancel game (creator only)
  lobby.delete('/:id', async (c) => {
    const user = c.get('user');

    try {
      const gameId = c.req.param('id');
      await lobbyService.cancelGame(gameId, user.sub);
      lobbyBroadcaster.broadcastGameRemoved(gameId);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = lobbyErrorStatus(err.code);
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      throw err;
    }
  });

  // POST /api/games/:id/join — Join game
  lobby.post('/:id/join', async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    try {
      const gameId = c.req.param('id');
      await lobbyService.joinGame(gameId, user.sub, body.password);
      const updated = await lobbyService.getGame(gameId);
      if (updated) {
        lobbyBroadcaster.broadcastPlayerCount(gameId, updated.playerCount);
      }
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = lobbyErrorStatus(err.code);
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      throw err;
    }
  });

  // POST /api/games/:id/leave — Leave game
  lobby.post('/:id/leave', async (c) => {
    const user = c.get('user');

    try {
      const gameId = c.req.param('id');
      await lobbyService.leaveGame(gameId, user.sub);
      const updated = await lobbyService.getGame(gameId);
      if (updated) {
        if (updated.status === 'abandoned') {
          lobbyBroadcaster.broadcastGameRemoved(gameId);
        } else {
          lobbyBroadcaster.broadcastPlayerCount(gameId, updated.playerCount);
        }
      }
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = lobbyErrorStatus(err.code);
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      throw err;
    }
  });

  // POST /api/games/:id/start — Start game (creator only)
  lobby.post('/:id/start', async (c) => {
    const user = c.get('user');

    try {
      const gameId = c.req.param('id');
      const game = await lobbyService.startGame(gameId, user.sub);
      lobbyBroadcaster.broadcastGameRemoved(gameId);
      return c.json(game);
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = lobbyErrorStatus(err.code);
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      throw err;
    }
  });

  return lobby;
}
