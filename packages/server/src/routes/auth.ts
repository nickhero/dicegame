import { Hono } from 'hono';
import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import { config } from '../config';
import { AppDatabase } from '../db/connection';
import { UserService, hashPassword, verifyPassword } from '../services/UserService';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import type { AppEnv } from '../types/env';

const encoder = new TextEncoder();
const TWENTY_HOURS_SECS = 20 * 60 * 60;

const guestRateLimit = rateLimit({ maxRequests: 60, windowMs: 60 * 60 * 1000 });

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

    const registeredUser = await userService.findRegisteredByDisplayName(displayName);
    if (registeredUser) {
      return c.json(
        {
          error: {
            code: 'AUTH_USERNAME_TAKEN',
            message: 'This name belongs to a registered account. Please log in or choose a different name.',
          },
        },
        409,
      );
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

  routes.post('/register', guestRateLimit, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const username = (body.username ?? body.displayName)?.trim();
    const password = body.password;

    if (!username || username.length < 3 || username.length > 20) {
      return c.json(
        { error: { code: 'AUTH_INVALID_NAME', message: 'Username must be 3-20 characters' } },
        400,
      );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return c.json(
        {
          error: {
            code: 'AUTH_INVALID_NAME',
            message: 'Username can only contain letters, numbers, and underscores',
          },
        },
        400,
      );
    }

    if (!password || typeof password !== "string" || password.length < 8 || password.length > 128) {
      return c.json(
        {
          error: {
            code: "AUTH_INVALID_PASSWORD",
            message: "Password must be between 8 and 128 characters",
          },
        },
        400,
      );
    }

    const existingRegistered = await userService.findRegisteredByDisplayName(username);
    if (existingRegistered) {
      return c.json(
        {
          error: {
            code: 'AUTH_USER_EXISTS',
            message: 'A user with that username already exists',
          },
        },
        409,
      );
    }

    const userId = `user_${nanoid(12)}`;
    const passwordHash = await hashPassword(password);
    await userService.createRegisteredUser(userId, username, passwordHash);

    const secret = encoder.encode(config.jwtSecret);
    const token = await new SignJWT({ name: username, isGuest: false })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('24h')
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);

    return c.json({
      token,
      user: {
        id: userId,
        name: username,
        isGuest: false,
      },
    });
  });

  routes.post('/login', guestRateLimit, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const username = (body.username ?? body.displayName)?.trim();
    const password = body.password;

    if (!username || !password || typeof password !== "string" || password.length > 128) {
      return c.json(
        {
          error: {
            code: 'AUTH_INVALID_CREDENTIALS',
            message: 'Username and password are required',
          },
        },
        400,
      );
    }

    const user = await userService.findRegisteredByDisplayName(username);
    if (!user || !user.passwordHash) {
      return c.json(
        {
          error: {
            code: 'AUTH_INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        },
        401,
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return c.json(
        {
          error: {
            code: 'AUTH_INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        },
        401,
      );
    }

    await userService.updateLastSeen(user.id);

    const secret = encoder.encode(config.jwtSecret);
    const token = await new SignJWT({ name: user.displayName, isGuest: false })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('24h')
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);

    return c.json({
      token,
      user: {
        id: user.id,
        name: user.displayName,
        isGuest: false,
      },
    });
  });

  return routes;
}
