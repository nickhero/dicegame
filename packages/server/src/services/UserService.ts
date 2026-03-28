import { eq } from 'drizzle-orm';
import { AppDatabase } from '../db/connection';
import { users } from '../db/schema';

export class UserService {
  constructor(private db: AppDatabase) {}

  async createGuest(id: string, displayName: string): Promise<typeof users.$inferSelect> {
    const now = new Date().toISOString();
    const [user] = this.db
      .insert(users)
      .values({
        id,
        displayName,
        isGuest: true,
        createdAt: now,
        lastSeenAt: now,
      })
      .returning()
      .all();
    return user;
  }

  async findById(id: string): Promise<typeof users.$inferSelect | undefined> {
    const results = this.db.select().from(users).where(eq(users.id, id)).all();
    return results[0];
  }

  async updateLastSeen(id: string): Promise<void> {
    this.db
      .update(users)
      .set({ lastSeenAt: new Date().toISOString() })
      .where(eq(users.id, id))
      .run();
  }
}
