/**
 * Lazy request-time database client. Never import this from a module that
 * runs at build time (layouts/metadata are fine; route handlers and server
 * actions call getDb() inside the handler body).
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

// Explicit .ts extension: `npm run db:seed` runs this file through Node's
// native TypeScript stripping, which resolves relative imports literally.
import * as schema from "./schema.ts";

// Cache the connection across dev-server hot reloads so we don't exhaust
// SQLite file handles.
const globalForDb = globalThis as unknown as {
  __saasMathDb?: ReturnType<typeof createDb>;
};

function createDb() {
  const sqlite = new Database(process.env.DB_PATH ?? "dev.db");
  // WAL: concurrent readers during dev (Next server + scripts) without
  // SQLITE_BUSY; foreign_keys: SQLite defaults OFF, drizzle refs rely on it.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

/** Get the request-scoped singleton DB. Call inside handlers, not at import. */
export type SaasMathDb = ReturnType<typeof getDb>;

/** Get the request-scoped singleton DB. Call inside handlers, not at import. */
export function getDb() {
  if (!globalForDb.__saasMathDb) {
    globalForDb.__saasMathDb = createDb();
  }
  return globalForDb.__saasMathDb;
}

export { schema };
