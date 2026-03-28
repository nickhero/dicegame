import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server as HttpServer } from 'node:http';
import { type Socket, io as ioClient } from 'socket.io-client';
import { SignJWT } from 'jose';
import { createSocketServer } from '../../src/ws';
import { config } from '../../src/config';
import { AddressInfo } from 'node:net';

const secret = new TextEncoder().encode(config.jwtSecret);

async function createTestToken(userId: string, userName: string) {
  return new SignJWT({ sub: userId, name: userName })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
}

function connectClient(port: number, opts: { token?: string; namespace?: string } = {}): Socket {
  const ns = opts.namespace ?? '/';
  return ioClient(`http://localhost:${port}${ns}`, {
    autoConnect: false,
    auth: opts.token ? { token: opts.token } : undefined,
    transports: ['websocket'],
    reconnection: false,
  });
}

describe('Socket.IO Server', () => {
  let httpServer: HttpServer;
  let port: number;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        httpServer = createServer();
        createSocketServer(httpServer);
        httpServer.listen(0, () => {
          port = (httpServer.address() as AddressInfo).port;
          resolve();
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      }),
  );

  it('should reject connection without token', async () => {
    const client = connectClient(port);
    const error = await new Promise<Error>((resolve) => {
      client.on('connect_error', resolve);
      client.connect();
    });
    expect(error.message).toBe('AUTH_REQUIRED');
    client.disconnect();
  });

  it('should reject connection with invalid token', async () => {
    const client = connectClient(port, { token: 'bad.token.value' });
    const error = await new Promise<Error>((resolve) => {
      client.on('connect_error', resolve);
      client.connect();
    });
    expect(error.message).toBe('AUTH_INVALID_TOKEN');
    client.disconnect();
  });

  it('should accept connection with valid token', async () => {
    const token = await createTestToken('user-1', 'Alice');
    const client = connectClient(port, { token });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
      client.connect();
    });

    expect(client.connected).toBe(true);
    client.disconnect();
  });

  it('should authenticate on /lobby namespace', async () => {
    const token = await createTestToken('user-2', 'Bob');
    const client = connectClient(port, { token, namespace: '/lobby' });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
      client.connect();
    });

    expect(client.connected).toBe(true);
    client.disconnect();
  });

  it('should reject unauthenticated /lobby connection', async () => {
    const client = connectClient(port, { namespace: '/lobby' });
    const error = await new Promise<Error>((resolve) => {
      client.on('connect_error', resolve);
      client.connect();
    });
    expect(error.message).toBe('AUTH_REQUIRED');
    client.disconnect();
  });

  it('should authenticate on /game namespace', async () => {
    const token = await createTestToken('user-3', 'Charlie');
    const client = connectClient(port, { token, namespace: '/game' });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
      client.connect();
    });

    expect(client.connected).toBe(true);
    client.disconnect();
  });

  it('should reject unauthenticated /game connection', async () => {
    const client = connectClient(port, { namespace: '/game' });
    const error = await new Promise<Error>((resolve) => {
      client.on('connect_error', resolve);
      client.connect();
    });
    expect(error.message).toBe('AUTH_REQUIRED');
    client.disconnect();
  });

  it('should reject expired token', async () => {
    const token = await new SignJWT({ sub: 'user-4', name: 'Dave' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('-1h')
      .sign(secret);

    const client = connectClient(port, { token });
    const error = await new Promise<Error>((resolve) => {
      client.on('connect_error', resolve);
      client.connect();
    });
    expect(error.message).toBe('AUTH_INVALID_TOKEN');
    client.disconnect();
  });
});
