import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { LobbyService, LobbyError } from '../services/LobbyService';
import { ERROR_HTTP_STATUS, GameErrorCode } from '@dicewars/shared';
import type { AppDatabase } from '../db/connection';

export function createLobbyRoutes(db: AppDatabase) {
  const lobby = new Hono();
  const lobbyService = new LobbyService(db);

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
  lobby.post('/', async (c) => {
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
      return c.json(game, 201);
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = ERROR_HTTP_STATUS[err.code] || 400;
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
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = ERROR_HTTP_STATUS[err.code] || 400;
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      throw err;
    }
  });

  // DELETE /api/games/:id — Cancel game (creator only)
  lobby.delete('/:id', async (c) => {
    const user = c.get('user');

    try {
      await lobbyService.cancelGame(c.req.param('id'), user.sub);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = ERROR_HTTP_STATUS[err.code] || 400;
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
      await lobbyService.joinGame(c.req.param('id'), user.sub, body.password);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = ERROR_HTTP_STATUS[err.code] || 400;
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      throw err;
    }
  });

  // POST /api/games/:id/leave — Leave game
  lobby.post('/:id/leave', async (c) => {
    const user = c.get('user');

    try {
      await lobbyService.leaveGame(c.req.param('id'), user.sub);
      return c.json({ success: true });
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = ERROR_HTTP_STATUS[err.code] || 400;
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      throw err;
    }
  });

  // POST /api/games/:id/start — Start game (creator only)
  lobby.post('/:id/start', async (c) => {
    const user = c.get('user');

    try {
      const game = await lobbyService.startGame(c.req.param('id'), user.sub);
      return c.json(game);
    } catch (err) {
      if (err instanceof LobbyError) {
        const status = ERROR_HTTP_STATUS[err.code] || 400;
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      throw err;
    }
  });

  return lobby;
}
