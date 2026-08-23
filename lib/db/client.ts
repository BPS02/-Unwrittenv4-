import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

/**
 * Neon connection.
 *
 * Driver choice matters here. The HTTP driver (`drizzle-orm/neon-http`) is
 * cheaper per query but cannot hold an interactive transaction, and the
 * entitlement reserve/commit path needs `SELECT ... FOR UPDATE` followed by an
 * insert inside one transaction. So this uses the WebSocket pool driver, which
 * supports real interactive transactions.
 *
 * Always point DATABASE_URL at Neon's POOLED connection string. Each Vercel
 * invocation is its own instance — the same reason V2's in-memory Map failed —
 * and direct (unpooled) connections exhaust the server's limit quickly.
 *
 * With no DATABASE_URL the app degrades honestly: the stores fall back to an
 * in-memory backend so local dev and the test suite run without a database.
 */

if (!globalThis.WebSocket) {
  // Node 22+ has a global WebSocket; older runtimes need the ws polyfill.
  neonConfig.webSocketConstructor = ws;
}

export type Db = NeonDatabase<typeof schema>;

let pool: Pool | null = null;
let db: Db | null = null;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Returns the Drizzle client, or null when no database is configured. */
export function getDb(): Db | null {
  if (!dbConfigured()) return null;
  if (!db) {
    // Pinned to globalThis for the same reason as the dev stores: Next dev
    // compiles each route into its own bundle with its own module instance,
    // so a plain module-level pool is not shared and connections multiply.
    const g = globalThis as Record<string, unknown>;
    pool = (g.__linerNotesPool as Pool | undefined) ?? new Pool({ connectionString: process.env.DATABASE_URL });
    g.__linerNotesPool = pool;
    db = drizzle(pool, { schema });
  }
  return db;
}

/** Test seam — drops the cached client so env changes take effect. */
export function resetDbForTesting(): void {
  db = null;
  pool = null;
  delete (globalThis as Record<string, unknown>).__linerNotesPool;
}

export { schema };
