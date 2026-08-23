/**
 * One-off developer grant: give an account Pro without paying.
 *
 * Deliberately goes through applyBillingEventForUser rather than writing SQL,
 * so PRO_SONGS_PER_PERIOD stays the single source of pricing truth and the
 * grant is idempotent by event id like any real webhook delivery.
 *
 * The event id is prefixed `manual-grant-` so it is obvious in billing_events
 * that this was not a Stripe payment — revenue queries can exclude it.
 *
 * This does NOT weaken invariant 5: no application code path grants
 * entitlement here. This is an operator action against their own database.
 *
 *   npx tsx grant-pro.ts <email>
 */
import { loadEnvConfig } from "@next/env";
import { createClerkClient } from "@clerk/backend";
import { applyBillingEventForUser, getEntitlement } from "./lib/entitlement/service";
import { addMonth } from "./lib/entitlement/types";

async function main() {
  loadEnvConfig(process.cwd());

  const email = process.argv[2];
  if (!email) {
    console.error("usage: npx tsx grant-pro.ts <email>");
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const { data: users } = await clerk.users.getUserList({ emailAddress: [email] });
  if (users.length === 0) {
    console.error(`No Clerk user with email ${email}.`);
    console.error("Sign in once at http://localhost:3000, then re-run.");
    process.exit(1);
  }

  const user = users[0]!;
  console.log(`Clerk user : ${user.id}`);
  console.log(`Email      : ${user.emailAddresses[0]?.emailAddress}`);

  const before = await getEntitlement(user.id);
  console.log(`Before     : tier=${before.tier} songsRemaining=${before.songsRemaining}`);

  const periodEnd = addMonth(new Date()).toISOString();
  const result = await applyBillingEventForUser(user.id, {
    id: `manual-grant-${user.id}-${periodEnd.slice(0, 10)}`,
    type: "subscription_started",
    userId: user.id,
    periodEnd,
  });

  const after = await getEntitlement(user.id);
  console.log(`Applied    : ${result.applied}${result.applied ? "" : "  (already granted for this period)"}`);
  console.log(`After      : tier=${after.tier} songsRemaining=${after.songsRemaining} periodEnd=${after.periodEnd}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
