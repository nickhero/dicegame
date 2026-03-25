import { Hono } from 'hono';
import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import { config } from '../config';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { UserService } from '../services/UserService';
import { AppDatabase } from '../db/connection';
import type { AppEnv } from '../types/env';

const encoder = new TextEncoder();

const TWENTY_HOURS_SECS = 20 * 60 * 60;

const guestRateLimit = rateLimit({ maxRequests: 10, windowMs: 60 * 60 * 1000 });

export function createAuthRoutes(db: AppDatabase) {
  const routes = new Hono<AppEnv>();
  const userService = new UserService(db);

  routes.post('/guest', guestRateLimit, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const displayName = body.displayName?.trim();

    if (!displayName || displayName.length < 2 || displayName.length > 20) {
      return c.json({ error: { code: 'AUTH_INVALID_NAME', message: 'Display name must be 2-20 characters' } }, 400);
    }

    if (!/^[a-zA-Z0-9 _-]+$/.test(displayName)) {
      return c.json({ error: { code: 'AUTH_INVALID_NAME', message: 'Display name can only contain letters, numbers, spaces, hyphens and underscores' } }, 400);
    }

    const guestId = `guest_${nanoid(12)}`;

    await userService.createGuest(guestId, displayName);

    const secret = encoder.encode(config.jwtSecret);
    const token = await new SignJWT({ name: displayName, isGuest: true })
      .setSubject(guestId)
      .setIssuedAt()
      .setExpirationTime('24h')
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);

    return c.json({
      token,
      user: {
        id: guestId,
        name: displayName,
        isGuest: true,
      },
    });
  });

  routes.post('/refresh', authMiddleware, async (c) => {
    const user = c.get('user');

    // Re-verify token to access iat claim
    const authHeader = c.req.header('Authorization')!;
    const rawToken = authHeader.slice(7);
    const secret = encoder.encode(config.jwtSecret);
    const { payload } = await jwtVerify(rawToken, secret);

    const iat = payload.iat as number;
    const now = Math.floor(Date.now() / 1000);
    const tokenAge = now - iat;

    // Only allow refresh in the last 4 hours of 24h expiry (after 20 hours)
    if (tokenAge < TWENTY_HOURS_SECS) {
      return c.json(
        { error: { code: 'AUTH_INVALID_TOKEN', message: 'Token not eligible for refresh yet' } },
        400,
      );
    }

    await userService.updateLastSeen(user.sub);

    const token = await new SignJWT({ name: user.name, isGuest: user.isGuest })
      .setSubject(user.sub)
      .setIssuedAt()
      .setExpirationTime('24h')
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);

    return c.json({ token });
  });

  routes.post('/register', async (c) => {
    return c.json({ error: 'Not implemented' }, 501);
  });

  routes.post('/login', async (c) => {
    return c.json({ error: 'Not implemented' }, 501);
  });

  return routes;
}

