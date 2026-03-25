import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/connection';
import { userPreferences } from '../db/schema';

export class UserPreferencesService {
  constructor(private db: AppDatabase) {}

  async getPreferences(userId: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db
      .select({ preferences: userPreferences.preferences })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .all();

    if (rows.length === 0) {
      return null;
    }

    return rows[0].preferences as Record<string, unknown>;
  }

  async savePreferences(userId: string, preferences: Record<string, unknown>): Promise<void> {
    const existing = await this.db
      .select({ userId: userPreferences.userId })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .all();

    if (existing.length > 0) {
      await this.db
        .update(userPreferences)
        .set({ preferences })
        .where(eq(userPreferences.userId, userId))
        .run();
    } else {
      await this.db
        .insert(userPreferences)
        .values({ userId, preferences })
        .run();
    }
  }
}
