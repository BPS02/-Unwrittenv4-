import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingEvent } from "../entitlement/types";
import {
  BillingError,
  type BillingProduct,
  type BillingProvider,
  type CheckoutRequest,
} from "./provider";

/**
 * Stripe Checkout implementation (no SDK — plain fetch + manual webhook
 * signature verification, matching this codebase's fetch-based providers).
 *
 * - One-time pack → Checkout mode "payment".
 * - Plus monthly/annual → Checkout mode "subscription".
 * - Webhooks verified with STRIPE_WEBHOOK_SECRET (t/v1 HMAC-SHA256 scheme,
 *   timing-safe comparison, 5-minute tolerance).
 * - userId travels in session metadata + client_reference_id, and is copied
 *   onto the subscription via subscription_data.metadata so renewal and
 *   cancellation events can be attributed without a database.
 */

const STRIPE_API = "https://api.stripe.com/v1";
export const WEBHOOK_TOLERANCE_S = 5 * 60;

function priceIdFor(product: BillingProduct): string | undefined {
  switch (product) {
    case "song_pass":
      return process.env.STRIPE_PRICE_SONG_PASS;
    case "pro_monthly":
      return process.env.STRIPE_PRICE_PRO_MONTHLY;
    case "credit_pack":
      return process.env.STRIPE_PRICE_CREDIT_PACK;
  }
}

export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";

  isConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }

  async createCheckoutSession(req: CheckoutRequest): Promise<{ url: string }> {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const price = priceIdFor(req.product);
    if (!secretKey || !price) {
      throw new BillingError("Billing is not configured for this product.", 503);
    }
    if (req.product === "song_pass" && !req.songId) {
      throw new BillingError("A Song Pass purchase must reference a song.", 400);
    }
    const mode = req.product === "pro_monthly" ? "subscription" : "payment";
    const params = new URLSearchParams({
      mode,
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      client_reference_id: req.userId,
      "metadata[userId]": req.userId,
      "metadata[product]": req.product,
      allow_promotion_codes: "true",
    });
    if (req.songId) params.set("metadata[songId]", req.songId);
    if (mode === "subscription") {
      params.set("subscription_data[metadata][userId]", req.userId);
      params.set("subscription_data[metadata][product]", req.product);
    }

    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        data && typeof data === "object" && "error" in data
          ? String((data.error as { message?: string })?.message ?? "Stripe error")
          : `Stripe responded with ${res.status}`;
      throw new BillingError(`Could not start checkout: ${message}`);
    }
    const url = (data as { url?: string })?.url;
    if (!url) throw new BillingError("Stripe did not return a checkout URL.");
    return { url };
  }

  parseWebhook(rawBody: string, signatureHeader: string | null): BillingEvent[] {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BillingError("STRIPE_WEBHOOK_SECRET is not configured.", 503);
    verifyStripeSignature(rawBody, signatureHeader, secret);

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new BillingError("Webhook payload is not valid JSON.", 400);
    }
    return mapStripeEvent(payload);
  }
}

/** Verifies Stripe's `t=...,v1=...` signature header. Throws BillingError(400). */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  now = Math.floor(Date.now() / 1000),
  toleranceS = WEBHOOK_TOLERANCE_S
): void {
  if (!header) throw new BillingError("Missing Stripe-Signature header.", 400);
  const parts = new Map<string, string[]>();
  for (const piece of header.split(",")) {
    const [key, value] = piece.split("=", 2);
    if (!key || value === undefined) continue;
    const list = parts.get(key.trim()) ?? [];
    list.push(value.trim());
    parts.set(key.trim(), list);
  }
  const timestamp = Number(parts.get("t")?.[0]);
  const signatures = parts.get("v1") ?? [];
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new BillingError("Malformed Stripe-Signature header.", 400);
  }
  if (Math.abs(now - timestamp) > toleranceS) {
    throw new BillingError("Stripe webhook timestamp outside tolerance.", 400);
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const matches = signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
  if (!matches) throw new BillingError("Stripe webhook signature mismatch.", 400);
}

/** Signs a payload the way Stripe does — used by tests and local tooling. */
export function signStripePayload(
  payload: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000)
): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

interface StripeEventShape {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
}

/** Maps a verified Stripe event to neutral billing events (possibly none). */
export function mapStripeEvent(payload: unknown): BillingEvent[] {
  const event = payload as StripeEventShape;
  if (!event?.id || !event.type || !event.data?.object) return [];
  const object = event.data.object;

  const metadataUserId = (obj: unknown): string | undefined => {
    if (!obj || typeof obj !== "object") return undefined;
    const meta = (obj as { metadata?: Record<string, unknown> }).metadata;
    const id = meta?.userId;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const userId =
        metadataUserId(object) ??
        (typeof object.client_reference_id === "string" ? object.client_reference_id : undefined);
      if (!userId) return [];
      const meta = object.metadata as Record<string, unknown> | undefined;
      if (meta?.product === "song_pass") {
        const songId = typeof meta?.songId === "string" ? meta.songId : undefined;
        if (!songId) return [];
        return [{ id: event.id, userId, type: "song_pass_purchased", songId }];
      }
      if (meta?.product === "credit_pack") {
        return [{ id: event.id, userId, type: "credit_pack_purchased" }];
      }
      return [{ id: event.id, userId, type: "subscription_started" }];
    }
    case "invoice.paid": {
      // Renewals only; the initial subscription is granted by
      // checkout.session.completed. userId lives in subscription metadata,
      // surfaced on the invoice in either the modern or legacy location.
      const billingReason = object.billing_reason;
      if (billingReason !== "subscription_cycle") return [];
      const parent = object.parent as { subscription_details?: { metadata?: Record<string, unknown> } } | undefined;
      const legacy = object.subscription_details as { metadata?: Record<string, unknown> } | undefined;
      const userId =
        metadataUserId({ metadata: parent?.subscription_details?.metadata }) ??
        metadataUserId({ metadata: legacy?.metadata });
      if (!userId) return [];
      return [{ id: event.id, userId, type: "subscription_renewed" }];
    }
    case "customer.subscription.deleted": {
      const userId = metadataUserId(object);
      if (!userId) return [];
      return [{ id: event.id, userId, type: "subscription_canceled" }];
    }
    default:
      return [];
  }
}
