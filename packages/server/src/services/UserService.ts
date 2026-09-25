import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import { AppDatabase } from "../db/connection";
import { users } from "../db/schema";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, combinedHash: string): Promise<boolean> {
  try {
    const [salt, key] = combinedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    if (keyBuffer.length !== derivedKey.length) return false;
    return timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

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

  async createRegisteredUser(
    id: string,
    displayName: string,
    passwordHash: string,
  ): Promise<typeof users.$inferSelect> {
    const now = new Date().toISOString();
    const [user] = this.db
      .insert(users)
      .values({
        id,
        displayName,
        isGuest: false,
        passwordHash,
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

  async findByDisplayName(displayName: string): Promise<typeof users.$inferSelect | undefined> {
    const results = this.db
      .select()
      .from(users)
      .where(sql`lower(${users.displayName}) = lower(${displayName})`)
      .all();
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
