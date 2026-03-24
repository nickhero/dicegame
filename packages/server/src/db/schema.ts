import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  isGuest: integer('is_guest', { mode: 'boolean' }).notNull().default(true),
  passwordHash: text('password_hash'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  lastSeenAt: text('last_seen_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const gameRooms = sqliteTable('game_rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  creatorId: text('creator_id').notNull().references(() => users.id),
  status: text('status', { enum: ['waiting', 'started', 'finished', 'abandoned'] }).notNull().default('waiting'),
  passwordHash: text('password_hash'),
  inviteCode: text('invite_code').unique(),
  config: text('config', { mode: 'json' }).notNull(),
  maxPlayers: integer('max_players').notNull().default(8),
  currentPlayerCount: integer('current_player_count').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
  winnerId: text('winner_id'),
});

export const gamePlayers = sqliteTable('game_players', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => gameRooms.id),
  userId: text('user_id').references(() => users.id),
  slotIndex: integer('slot_index').notNull(),
  isAI: integer('is_ai', { mode: 'boolean' }).notNull().default(false),
  aiPersonality: text('ai_personality'),
  isSpectator: integer('is_spectator', { mode: 'boolean' }).notNull().default(false),
  joinedAt: text('joined_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  roomId: text('room_id').references(() => gameRooms.id),
  recording: text('recording', { mode: 'json' }),
  stats: text('stats', { mode: 'json' }),
  seed: text('seed'),
  config: text('config', { mode: 'json' }),
  winnerIndex: integer('winner_index'),
  turnCount: integer('turn_count'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const matchPlayers = sqliteTable('match_players', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull().references(() => matches.id),
  userId: text('user_id').references(() => users.id),
  playerIndex: integer('player_index').notNull(),
  isAI: integer('is_ai', { mode: 'boolean' }).notNull().default(false),
  aiPersonality: text('ai_personality'),
  isWinner: integer('is_winner', { mode: 'boolean' }).notNull().default(false),
});

export const userAchievements = sqliteTable('user_achievements', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  achievementId: text('achievement_id').notNull(),
  unlockedAt: text('unlocked_at').notNull().$defaultFn(() => new Date().toISOString()),
  matchId: text('match_id').references(() => matches.id),
});

export const userPreferences = sqliteTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id),
  preferences: text('preferences', { mode: 'json' }).notNull(),
});
