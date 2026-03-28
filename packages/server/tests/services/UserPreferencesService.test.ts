import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../../src/db/connection';
import { UserPreferencesService } from '../../src/services/UserPreferencesService';

function applySchema(db: ReturnType<typeof createTestDb>) {
  db.run(sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
    is_guest INTEGER NOT NULL DEFAULT 1, password_hash TEXT,
    created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    preferences TEXT NOT NULL
  )`);
}

function seedUser(db: ReturnType<typeof createTestDb>, id: string, name: string) {
  const now = new Date().toISOString();
  db.run(sql`INSERT INTO users (id, display_name, is_guest, created_at, last_seen_at)
    VALUES (${id}, ${name}, 1, ${now}, ${now})`);
}

describe('UserPreferencesService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: UserPreferencesService;

  beforeEach(() => {
    db = createTestDb();
    applySchema(db);
    service = new UserPreferencesService(db);
  });

  it('returns null for user with no preferences', async () => {
    seedUser(db, 'user-1', 'Alice');
    const prefs = await service.getPreferences('user-1');
    expect(prefs).toBeNull();
  });

  it('saves and retrieves preferences', async () => {
    seedUser(db, 'user-1', 'Alice');
    const preferences = { theme: 'dark', volume: 0.8 };

    await service.savePreferences('user-1', preferences);
    const result = await service.getPreferences('user-1');

    expect(result).toEqual(preferences);
  });

  it('updates existing preferences (upsert)', async () => {
    seedUser(db, 'user-1', 'Alice');

    await service.savePreferences('user-1', { theme: 'light' });
    await service.savePreferences('user-1', { theme: 'dark', musicEnabled: true });

    const result = await service.getPreferences('user-1');
    expect(result).toEqual({ theme: 'dark', musicEnabled: true });
  });

  it('handles complex nested preference objects', async () => {
    seedUser(db, 'user-1', 'Alice');
    const preferences = {
      display: { theme: 'dark', fontSize: 14 },
      audio: { volume: 0.5, muted: false },
      gameplay: { autoEndTurn: true },
    };

    await service.savePreferences('user-1', preferences);
    const result = await service.getPreferences('user-1');

    expect(result).toEqual(preferences);
  });

  it('stores preferences independently per user', async () => {
    seedUser(db, 'user-1', 'Alice');
    seedUser(db, 'user-2', 'Bob');

    await service.savePreferences('user-1', { theme: 'dark' });
    await service.savePreferences('user-2', { theme: 'light' });

    const prefs1 = await service.getPreferences('user-1');
    const prefs2 = await service.getPreferences('user-2');

    expect(prefs1).toEqual({ theme: 'dark' });
    expect(prefs2).toEqual({ theme: 'light' });
  });
});
