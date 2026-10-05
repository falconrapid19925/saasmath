import { defineConfig } from "drizzle-kit";

// SQLite for local development; documented migration path to Supabase Postgres
// lives in src/db/schema.ts. `drizzle/` holds generated SQL migrations (gitignored).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "file:./dev.db",
  },
});
