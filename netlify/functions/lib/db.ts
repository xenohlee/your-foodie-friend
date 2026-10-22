import { getDatabase } from "@netlify/database";

export interface SqlClient {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number | null }>;
  release(): void;
}

export async function withDb<T>(
  work: (client: SqlClient) => Promise<T>
): Promise<T> {
  const database = getDatabase();
  const client = (await database.pool.connect()) as unknown as SqlClient;
  try {
    await client.query("SET TIME ZONE 'Africa/Lagos'");
    return await work(client);
  } finally {
    client.release();
  }
}

export async function inTransaction<T>(
  client: SqlClient,
  work: () => Promise<T>
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
