import { defineConfig } from "drizzle-kit";

// Only `drizzle-kit migrate`/`push` need a live connection; `generate` works
// offline from the schema, so DATABASE_URL is optional here.
const connectionString = process.env.DATABASE_URL;

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  ...(connectionString ? { dbCredentials: { url: connectionString } } : {}),
});
