import { Context, Next } from 'hono';
import { config } from '../config';

export function rateLimit(options: { maxRequests: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Periodically clean up expired entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now >= entry.resetAt) {
        hits.delete(key);
      }
    }
  }, options.windowMs);

  // Allow GC of the interval
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return async (c: Context, next: Next) => {
    // Skip rate limiting in test environment
    if (config.nodeEnv === 'test') {
      await next();
      return;
    }

    // WARNING: These headers are only trustworthy behind a reverse proxy that
    // strips/overwrites them. Without one, clients can spoof their IP to bypass
    // rate limiting. Configure your proxy to set X-Real-IP from the actual connection.
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || now >= entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + options.windowMs });
      await next();
      return;
    }

    entry.count++;

    if (entry.count > options.maxRequests) {
      return c.json(
        {
          error: {
            code: 'AUTH_RATE_LIMITED',
            message: 'Too many requests, please try again later',
          },
        },
        429,
      );
    }

    await next();
  };
}
