import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AppDatabase } from '../db/connection';
import { customAiPresets } from '../db/schema';
import type { CustomAIPreset } from '@dicewars/shared';

export interface StoredPreset {
  id: string;
  userId: string;
  name: string;
  config: CustomAIPreset;
  createdAt: string;
}

export class AIPresetService {
  constructor(private db: AppDatabase) {}

  async createPreset(userId: string, preset: CustomAIPreset): Promise<StoredPreset> {
    this.validatePreset(preset);

    const existing = this.db
      .select({ id: customAiPresets.id })
      .from(customAiPresets)
      .where(eq(customAiPresets.userId, userId))
      .all();

    if (existing.length >= 20) {
      throw new Error('Maximum of 20 presets per user');
    }

    const id = nanoid();
    const createdAt = new Date().toISOString();

    this.db
      .insert(customAiPresets)
      .values({
        id,
        userId,
        name: preset.name,
        config: JSON.stringify(preset),
        createdAt,
      })
      .run();

    return { id, userId, name: preset.name, config: preset, createdAt };
  }

  async getPresets(userId: string): Promise<StoredPreset[]> {
    const rows = this.db
      .select()
      .from(customAiPresets)
      .where(eq(customAiPresets.userId, userId))
      .all();

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      config: JSON.parse(row.config) as CustomAIPreset,
      createdAt: row.createdAt,
    }));
  }

  async updatePreset(userId: string, presetId: string, preset: CustomAIPreset): Promise<void> {
    this.validatePreset(preset);

    const existing = this.db
      .select()
      .from(customAiPresets)
      .where(and(eq(customAiPresets.id, presetId), eq(customAiPresets.userId, userId)))
      .all();

    if (existing.length === 0) {
      throw new Error('Preset not found');
    }

    this.db
      .update(customAiPresets)
      .set({ name: preset.name, config: JSON.stringify(preset) })
      .where(and(eq(customAiPresets.id, presetId), eq(customAiPresets.userId, userId)))
      .run();
  }

  async deletePreset(userId: string, presetId: string): Promise<void> {
    const existing = this.db
      .select()
      .from(customAiPresets)
      .where(and(eq(customAiPresets.id, presetId), eq(customAiPresets.userId, userId)))
      .all();

    if (existing.length === 0) {
      throw new Error('Preset not found');
    }

    this.db
      .delete(customAiPresets)
      .where(and(eq(customAiPresets.id, presetId), eq(customAiPresets.userId, userId)))
      .run();
  }

  private validatePreset(preset: CustomAIPreset): void {
    if (!preset.name || typeof preset.name !== 'string' || preset.name.trim().length === 0) {
      throw new Error('Preset name must be a non-empty string');
    }
    if (typeof preset.minAdvantage !== 'number' || isNaN(preset.minAdvantage)) {
      throw new Error('minAdvantage must be a number');
    }
    if (
      typeof preset.maxAttacksPerTurn !== 'number' ||
      isNaN(preset.maxAttacksPerTurn) ||
      preset.maxAttacksPerTurn <= 0
    ) {
      throw new Error('maxAttacksPerTurn must be a number greater than 0');
    }
    if (typeof preset.connectivityBonus !== 'number' || isNaN(preset.connectivityBonus)) {
      throw new Error('connectivityBonus must be a number');
    }
  }
}
