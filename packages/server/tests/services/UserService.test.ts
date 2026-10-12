import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../../src/db/connection';
import { UserService, hashPassword, verifyPassword } from '../../src/services/UserService';
import { users } from '../../src/db/schema';

function applyUsersSchema(db: ReturnType<typeof createTestDb>) {
  db.run(sql`CREATE TABLE IF NOT EXISTS users (\n    id TEXT PRIMARY KEY,\n    display_name TEXT NOT NULL,\n    is_guest INTEGER NOT NULL DEFAULT 1,\n    password_hash TEXT,\n    created_at TEXT NOT NULL,\n    last_seen_at TEXT NOT NULL\n  )`);
}

describe('UserService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: UserService;

  beforeEach(() => {
    db = createTestDb();
    applyUsersSchema(db);
    service = new UserService(db);
  });

  it('creates a guest user', async () => {
    const user = await service.createGuest('guest_abc123', 'Alice');
    expect(user.id).toBe('guest_abc123');
    expect(user.displayName).toBe('Alice');
    expect(user.isGuest).toBe(true);
    expect(user.createdAt).toBeTruthy();
    expect(user.lastSeenAt).toBeTruthy();
  });

  it('finds user by ID', async () => {
    await service.createGuest('guest_abc123', 'Alice');
    const user = await service.findById('guest_abc123');
    expect(user).toBeDefined();
    expect(user!.displayName).toBe('Alice');
  });

  it('returns undefined for non-existent user', async () => {
    const user = await service.findById('nonexistent');
    expect(user).toBeUndefined();
  });

  it('updates last seen timestamp', async () => {
    await service.createGuest('guest_abc123', 'Alice');
    const before = (await service.findById('guest_abc123'))!.lastSeenAt;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 10));
    await service.updateLastSeen('guest_abc123');

    const after = (await service.findById('guest_abc123'))!.lastSeenAt;
    expect(after).not.toBe(before);
  });

  it('hashes and verifies password correctly', async () => {
    const hash = await hashPassword('mySecurePassword123');
    expect(hash).toContain(':');
    expect(await verifyPassword('mySecurePassword123', hash)).toBe(true);
    expect(await verifyPassword('wrongPassword', hash)).toBe(false);
  });

  it('creates registered user and finds by display name', async () => {
    const hash = await hashPassword('regpass123');
    const user = await service.createRegisteredUser('usr_registered1', 'TestRegUser', hash);
    expect(user.id).toBe('usr_registered1');
    expect(user.displayName).toBe('TestRegUser');
    expect(user.isGuest).toBe(false);
    expect(user.passwordHash).toBe(hash);

    const found = await service.findByDisplayName('testreguser');
    expect(found).toBeDefined();
    expect(found!.id).toBe('usr_registered1');
  });
});
