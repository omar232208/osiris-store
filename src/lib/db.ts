import { createClient } from "@libsql/client";

export let db: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (db) return db;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) return null;
  db = createClient(
    authToken
      ? { url, authToken }
      : { url },
  );
  return db;
}

export async function initDb() {
  const client = getDb();
  if (!client) return;
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      uuid TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      gold INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT DEFAULT (datetime('now'))
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      cost INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      delivered_at TEXT,
      FOREIGN KEY (uuid) REFERENCES users(uuid)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS server_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

export async function getUser(uuid: string) {
  const client = getDb();
  if (!client) return null;
  const result = await client.execute({
    sql: "SELECT * FROM users WHERE uuid = ?",
    args: [uuid],
  });
  return result.rows[0] || null;
}

export async function createOrUpdateUser(uuid: string, username: string) {
  const client = getDb();
  if (!client) return null;
  await client.execute({
    sql: `INSERT INTO users (uuid, username, gold) VALUES (?, ?, 100) 
          ON CONFLICT(uuid) DO UPDATE SET username = ?, last_login = datetime('now')`,
    args: [uuid, username, username],
  });
  return getUser(uuid);
}

export async function addPurchase(uuid: string, itemId: string, itemName: string, cost: number) {
  const client = getDb();
  if (!client) return null;
  await client.execute({
    sql: `INSERT INTO purchases (uuid, item_id, item_name, cost, status) VALUES (?, ?, ?, ?, 'pending')`,
    args: [uuid, itemId, itemName, cost],
  });
}

export async function getPendingDeliveries(uuid: string) {
  const client = getDb();
  if (!client) return [];
  const result = await client.execute({
    sql: "SELECT * FROM purchases WHERE uuid = ? AND status = 'pending' ORDER BY created_at ASC",
    args: [uuid],
  });
  return result.rows;
}

export async function markDelivered(id: number) {
  const client = getDb();
  if (!client) return;
  await client.execute({
    sql: "UPDATE purchases SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?",
    args: [id],
  });
}
