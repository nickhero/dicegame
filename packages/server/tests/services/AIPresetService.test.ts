import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../../src/db/connection';
import { AIPresetService } from '../../src/services/AIPresetService';
import type { CustomAIPreset } from '@dicewars/shared';

type TestDb = ReturnType<typeof createTestDb>;

function applySchema(db: TestDb) {
  db.run(sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
    is_guest INTEGER NOT NULL DEFAULT 1, password_hash TEXT,
    created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS custom_ai_presets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
}

function seedUser(db: TestDb, id: string, name: string) {
  const now = new Date().toISOString();
  db.run(sql`INSERT INTO users (id, display_name, is_guest, created_at, last_seen_at)
    VALUES (${id}, ${name}, 1, ${now}, ${now})`);
}

const validPreset: CustomAIPreset = {
  name: 'Test Preset',
  minAdvantage: 2,
  maxAttacksPerTurn: 5,
  connectivityBonus: 1.5,
};

describe('AIPresetService', () => {
  let db: TestDb;
  let service: AIPresetService;

  beforeEach(() => {
    db = createTestDb();
    applySchema(db);
    service = new AIPresetService(db);
  });

  it('creates a preset and returns it with id', async () => {
    seedUser(db, 'user-1', 'Alice');
    const result = await service.createPreset('user-1', validPreset);

    expect(result.id).toBeDefined();
    expect(result.name).toBe('Test Preset');
    expect(result.config).toEqual(validPreset);
    expect(result.userId).toBe('user-1');
    expect(result.createdAt).toBeDefined();
  });

  it('gets presets returns only the user\'s presets', async () => {
    seedUser(db, 'user-1', 'Alice');
    seedUser(db, 'user-2', 'Bob');

    await service.createPreset('user-1', validPreset);
    await service.createPreset('user-1', { ...validPreset, name: 'Second' });
    await service.createPreset('user-2', { ...validPreset, name: 'Bob Preset' });

    const user1Presets = await service.getPresets('user-1');
    const user2Presets = await service.getPresets('user-2');

    expect(user1Presets).toHaveLength(2);
    expect(user1Presets.every((p) => p.userId === 'user-1')).toBe(true);
    expect(user2Presets).toHaveLength(1);
    expect(user2Presets[0].name).toBe('Bob Preset');
  });

  it('updates preset validates ownership', async () => {
    seedUser(db, 'user-1', 'Alice');
    seedUser(db, 'user-2', 'Bob');

    const preset = await service.createPreset('user-1', validPreset);

    // Owner can update
    await expect(
      service.updatePreset('user-1', preset.id, { ...validPreset, name: 'Updated' }),
    ).resolves.toBeUndefined();

    const updated = await service.getPresets('user-1');
    expect(updated[0].name).toBe('Updated');

    // Non-owner cannot update
    await expect(
      service.updatePreset('user-2', preset.id, { ...validPreset, name: 'Hacked' }),
    ).rejects.toThrow('Preset not found');
  });

  it('deletes preset validates ownership', async () => {
    seedUser(db, 'user-1', 'Alice');
    seedUser(db, 'user-2', 'Bob');

    const preset = await service.createPreset('user-1', validPreset);

    // Non-owner cannot delete
    await expect(service.deletePreset('user-2', preset.id)).rejects.toThrow('Preset not found');

    // Owner can delete
    await expect(service.deletePreset('user-1', preset.id)).resolves.toBeUndefined();

    const remaining = await service.getPresets('user-1');
    expect(remaining).toHaveLength(0);
  });

  it('enforces max 20 presets per user', async () => {
    seedUser(db, 'user-1', 'Alice');

    for (let i = 0; i < 20; i++) {
      await service.createPreset('user-1', { ...validPreset, name: `Preset ${i}` });
    }

    await expect(
      service.createPreset('user-1', { ...validPreset, name: 'One Too Many' }),
    ).rejects.toThrow('Maximum of 20 presets per user');
  });

  it('rejects preset with empty name', async () => {
    seedUser(db, 'user-1', 'Alice');
    await expect(
      service.createPreset('user-1', { ...validPreset, name: '' }),
    ).rejects.toThrow('Preset name must be a non-empty string');
  });

  it('rejects preset with non-number minAdvantage', async () => {
    seedUser(db, 'user-1', 'Alice');
    await expect(
      service.createPreset('user-1', { ...validPreset, minAdvantage: 'bad' as any }),
    ).rejects.toThrow('minAdvantage must be a number');
  });

  it('rejects preset with maxAttacksPerTurn <= 0', async () => {
    seedUser(db, 'user-1', 'Alice');
    await expect(
      service.createPreset('user-1', { ...validPreset, maxAttacksPerTurn: 0 }),
    ).rejects.toThrow('maxAttacksPerTurn must be a number greater than 0');
  });

  it('rejects preset with non-number connectivityBonus', async () => {
    seedUser(db, 'user-1', 'Alice');
    await expect(
      service.createPreset('user-1', { ...validPreset, connectivityBonus: 'bad' as any }),
    ).rejects.toThrow('connectivityBonus must be a number');
  });

  it('returns empty array for user with no presets', async () => {
    seedUser(db, 'user-1', 'Alice');
    const presets = await service.getPresets('user-1');
    expect(presets).toEqual([]);
  });
});
