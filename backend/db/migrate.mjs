// Applies db/schema.sql to DATABASE_URL. Usage: npm run migrate
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));

export async function migrate(pool) {
  await pool.query(await readFile(schemaPath, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(pool);
    console.log("Schema applied.");
  } finally {
    await pool.end();
  }
}
