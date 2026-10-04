import pg from "pg";

export function createPool(connectionString) {
  return new pg.Pool({ connectionString });
}

// Runs fn(client) inside a transaction.
export async function withTx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
