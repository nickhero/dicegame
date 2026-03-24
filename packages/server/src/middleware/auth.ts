import { Context, Next } from 'hono';
import { jwtVerify } from 'jose';
import { config } from '../config';

const encoder = new TextEncoder();

export interface JWTPayload {
  sub: string;
  name: string;
  isGuest: boolean;
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const secret = encoder.encode(config.jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    c.set('user', payload as unknown as JWTPayload);
    await next();
  } catch {
    return c.json({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Invalid or expired token' } }, 401);
  }
}
