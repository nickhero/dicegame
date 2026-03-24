import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { config } from '../config';

let db: ReturnType<typeof drizzle>;

export function getDb() {
  if (!db) {
    const sqlite = new Database(config.databaseUrl || 'dicewars.db');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
  }
  return db;
}

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const testDb = drizzle(sqlite, { schema });
  return testDb;
}

export type AppDatabase = ReturnType<typeof getDb>;
