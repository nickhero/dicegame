import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import { config } from '../config';

export const authRoutes = new Hono();

const encoder = new TextEncoder();

authRoutes.post('/guest', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const displayName = body.displayName?.trim();

  if (!displayName || displayName.length < 2 || displayName.length > 20) {
    return c.json({ error: { code: 'AUTH_INVALID_NAME', message: 'Display name must be 2-20 characters' } }, 400);
  }

  if (!/^[a-zA-Z0-9 _-]+$/.test(displayName)) {
    return c.json({ error: { code: 'AUTH_INVALID_NAME', message: 'Display name can only contain letters, numbers, spaces, hyphens and underscores' } }, 400);
  }

  const guestId = `guest_${nanoid(12)}`;
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
