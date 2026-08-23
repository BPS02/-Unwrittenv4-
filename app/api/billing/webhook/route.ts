import { NextResponse } from "next/server";
import { BillingError, getBillingProvider } from "@/lib/billing/provider";
import { applyBillingEventForUser } from "@/lib/entitlement/service";
import { markSongUnlocked } from "@/lib/songs-store";

export const runtime = "nodejs";

/**
 * Billing webhook — the ONLY place entitlement is granted.
 *
 * - The signature is verified against the raw body before anything is parsed.
 * - Events are applied idempotently: each provider event id is recorded in
 *   the user's entitlement metadata, and a redelivered event is a no-op, so
 *   credits are never granted twice.
 * - Unattributable events are acknowledged (200) but logged, so the provider
 *   doesn't retry-storm us over an event we can never process.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const provider = getBillingProvider();
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let events;
  try {
    events = provider.parseWebhook(rawBody, signature);
  } catch (err) {
    const status = err instanceof BillingError ? err.status : 400;
    const message = err instanceof BillingError ? err.message : "Invalid webhook delivery.";
    console.error("[api/billing/webhook]", message);
    return NextResponse.json({ error: message }, { status });
  }

  let applied = 0;
  for (const event of events) {
    try {
      const result = await applyBillingEventForUser(event.userId, event);
      if (result.applied) applied += 1;
      // Mirror the unlock onto the song record so /api/songs can serve the
      // master without re-reading entitlement for every listed song.
      if (result.applied && event.type === "song_pass_purchased" && event.songId) {
        await markSongUnlocked(event.userId, event.songId).catch((err) =>
          console.error("[api/billing/webhook] could not flag song unlocked", err)
        );
      }
    } catch (err) {
      // A transient failure (e.g. Clerk unreachable) should be retried by the
      // provider — signal it with a 500.
      console.error("[api/billing/webhook] failed to apply event", event.id, err);
      return NextResponse.json({ error: "Could not apply billing event." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true, applied });
}
