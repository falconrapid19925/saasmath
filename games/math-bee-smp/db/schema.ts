import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable('guest_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  id: text('id').notNull().unique(),
  name: text('name').notNull(),
  avatar: integer('avatar').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const rooms = sqliteTable('game_rooms', {
  code: text('code').primaryKey(),
  version: integer('version').notNull(),
  state: text('state').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const limits = sqliteTable('api_limits', {
  key: text('key').primaryKey(),
  hits: integer('hits').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
