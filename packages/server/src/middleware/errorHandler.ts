import { Context } from 'hono';
import { LobbyError } from '../services/LobbyService';
import { GameEngineError } from '../services/GameEngine';
import { ERROR_HTTP_STATUS } from '@dicewars/shared';

export function errorHandler(err: Error, c: Context) {
  // Known game errors
  if (err instanceof LobbyError || err instanceof GameEngineError) {
    const status = ERROR_HTTP_STATUS[err.code] || 400;
    return c.json({ error: { code: err.code, message: err.message } }, status);
  }

  // Don't leak stack traces in production
  const isProd = process.env.NODE_ENV === 'production';
  console.error(`[ERROR] ${err.message}`, isProd ? '' : err.stack);

  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  }, 500);
}
