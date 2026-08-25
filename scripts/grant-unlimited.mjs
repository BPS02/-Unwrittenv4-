import { createClerkClient } from "@clerk/backend";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: node --env-file=.env scripts/grant-unlimited.mjs <email>");
if (!process.env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY is not configured");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const result = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });
if (result.data.length !== 1) {
  throw new Error(`Expected exactly one Clerk account for ${email}; found ${result.data.length}`);
}

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(
    `insert into entitlements (user_id, tier, unlimited, period_end)
     values ($1, 'pro', true, now() + interval '1 month')
     on conflict (user_id) do update
       set tier = 'pro', unlimited = true, updated_at = now()`,
    [result.data[0].id]
  );

  const verification = await pool.query(
    "select tier, unlimited from entitlements where user_id = $1",
    [result.data[0].id]
  );
  const row = verification.rows[0];
  if (row?.tier !== "pro" || row?.unlimited !== true) {
    throw new Error("The unlimited entitlement could not be verified after writing");
  }
  console.log(`Unlimited generation granted to ${email}.`);
} finally {
  await pool.end();
}
