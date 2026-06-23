import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.SUPABASE_DB_URL) {
  throw new Error("SUPABASE_DB_URL is required");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL,
  },
  // Only manage the tables explicitly defined in this Drizzle schema.
  // All other tables (created via ensureTables() in pg.ts) are managed
  // separately and must NOT be touched by Drizzle migrations.
  tablesFilter: ["blacklist", "reimbursements", "admin_settings", "disciplines"],
});
