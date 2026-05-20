import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

export async function migrate() {
  const schema = await readFile(join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
}

export async function ensureSettings(ownerKey) {
  const result = await pool.query(
    `
      insert into user_settings (owner_key)
      values ($1)
      on conflict (owner_key) do update
        set owner_key = excluded.owner_key
      returning daily_goal_minutes
    `,
    [ownerKey],
  );

  return result.rows[0];
}
