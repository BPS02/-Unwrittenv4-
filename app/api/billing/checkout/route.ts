import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { clerkEnabled } from "@/lib/clerk-config";
import { BillingError, getBillingProvider } from "@/lib/billing/provider";

export const runtime = "nodejs";

const checkoutSchema = z
  .object({
    product: z.enum(["song_pass", "pro_monthly", "credit_pack"]),
    songId: z.string().min(6).max(64).optional(),
    returnTo: z.enum(["/create", "/plans"]).optional(),
  })
  .refine((v) => v.product !== "song_pass" || Boolean(v.songId), {
    message: "A Song Pass purchase must reference a song.",
  });

/**
 * Starts a checkout session for the signed-in user. This never grants
 * entitlement — the webhook does that after payment is verified.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!clerkEnabled) {
    return NextResponse.json(
      { reason: "billing_not_configured", error: "Accounts aren’t configured on this server." },
      { status: 503 }
    );
  }
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { reason: "signin_required", error: "Sign in before purchasing." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown product." }, { status: 400 });
  }

  const provider = getBillingProvider();
  if (!provider.isConfigured()) {
    return NextResponse.json(
      {
        reason: "billing_not_configured",
        error:
          "Billing isn’t configured on this server yet. Your song and lyrics are safe — check back soon.",
      },
      { status: 503 }
    );
  }

  // Browser checkout must return to the exact deployment that initiated it.
  // APP_URL is also used by MCP and may legitimately point somewhere else
  // (or be stale/local), so it must never control browser redirects.
  const origin = new URL(request.url).origin;
  try {
    const { url } = await provider.createCheckoutSession({
      userId,
      product: parsed.data.product,
      songId: parsed.data.songId,
      successUrl: `${origin}${parsed.data.returnTo ?? "/create"}?billing=success`,
      cancelUrl: `${origin}${parsed.data.returnTo ?? "/create"}?billing=cancelled`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    const status = err instanceof BillingError ? err.status : 502;
    const message = err instanceof BillingError ? err.message : "Could not start checkout.";
    console.error("[api/billing/checkout]", err);
    return NextResponse.json({ error: message }, { status });
  }
}
