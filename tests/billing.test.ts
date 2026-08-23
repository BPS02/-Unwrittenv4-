import { beforeEach, describe, expect, it, vi } from "vitest";

const authState: { userId: string | null } = { userId: null };

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: authState.userId }),
  clerkClient: async () => {
    throw new Error("clerkClient must not be reached — entitlement lives in Postgres");
  },
}));

const WEBHOOK_SECRET = "whsec_test_secret";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  authState.userId = null;
  // No DATABASE_URL → the entitlement service uses its in-memory backend, so
  // the suite runs without a database and never touches a real one.
  vi.stubEnv("DATABASE_URL", "");
});

describe("Stripe webhook signature verification", () => {
  it("accepts a correctly signed payload and rejects tampering", async () => {
    const { signStripePayload, verifyStripeSignature } = await import("@/lib/billing/stripe");
    const payload = JSON.stringify({ id: "evt_1", type: "x", data: { object: {} } });
    const header = signStripePayload(payload, WEBHOOK_SECRET);
    expect(() => verifyStripeSignature(payload, header, WEBHOOK_SECRET)).not.toThrow();
    expect(() => verifyStripeSignature(payload + " ", header, WEBHOOK_SECRET)).toThrow();
    expect(() => verifyStripeSignature(payload, header, "whsec_other")).toThrow();
    expect(() => verifyStripeSignature(payload, null, WEBHOOK_SECRET)).toThrow();
  });

  it("rejects stale timestamps", async () => {
    const { signStripePayload, verifyStripeSignature } = await import("@/lib/billing/stripe");
    const payload = "{}";
    const old = Math.floor(Date.now() / 1000) - 3600;
    const header = signStripePayload(payload, WEBHOOK_SECRET, old);
    expect(() => verifyStripeSignature(payload, header, WEBHOOK_SECRET)).toThrow();
  });
});

describe("Stripe event mapping", () => {
  it("maps an unlock checkout, subscription checkout, renewal, and cancellation", async () => {
    const { mapStripeEvent } = await import("@/lib/billing/stripe");
    expect(
      mapStripeEvent({
        id: "evt_unlock",
        type: "checkout.session.completed",
        data: {
          object: {
            mode: "payment",
            metadata: { userId: "user_1", product: "song_pass", songId: "song-1" },
          },
        },
      })
    ).toEqual([{ id: "evt_unlock", userId: "user_1", type: "song_pass_purchased", songId: "song-1" }]);

    // A payment-mode checkout with no songId is unattributable — dropped.
    expect(
      mapStripeEvent({
        id: "evt_unlock_bad",
        type: "checkout.session.completed",
        data: { object: { mode: "payment", metadata: { userId: "user_1", product: "song_pass" } } },
      })
    ).toEqual([]);

    expect(
      mapStripeEvent({
        id: "evt_sub",
        type: "checkout.session.completed",
        data: { object: { mode: "subscription", client_reference_id: "user_1", metadata: {} } },
      })
    ).toEqual([{ id: "evt_sub", userId: "user_1", type: "subscription_started" }]);

    expect(
      mapStripeEvent({
        id: "evt_renew",
        type: "invoice.paid",
        data: {
          object: {
            billing_reason: "subscription_cycle",
            parent: { subscription_details: { metadata: { userId: "user_1" } } },
          },
        },
      })
    ).toEqual([{ id: "evt_renew", userId: "user_1", type: "subscription_renewed" }]);

    expect(
      mapStripeEvent({
        id: "evt_cancel",
        type: "customer.subscription.deleted",
        data: { object: { metadata: { userId: "user_1" } } },
      })
    ).toEqual([{ id: "evt_cancel", userId: "user_1", type: "subscription_canceled" }]);

    expect(
      mapStripeEvent({ id: "evt_other", type: "charge.refunded", data: { object: {} } })
    ).toEqual([]);

    expect(
      mapStripeEvent({
        id: "evt_pack",
        type: "checkout.session.completed",
        data: {
          object: {
            mode: "payment",
            metadata: { userId: "user_1", product: "credit_pack" },
          },
        },
      })
    ).toEqual([{ id: "evt_pack", userId: "user_1", type: "credit_pack_purchased" }]);
  });
});

describe("POST /api/billing/webhook", () => {
  let service: typeof import("@/lib/entitlement/service");

  async function loadWebhook() {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    service = await import("@/lib/entitlement/service");
    // Entitlement state is globalThis-pinned (dev bundling), so it survives
    // vi.resetModules — clear it so each test starts from a fresh account.
    service.resetEntitlementsForTesting();
    const songs = await import("@/lib/songs-store");
    songs.clearSongsStoreForTesting();
    return import("@/app/api/billing/webhook/route");
  }

  /** Unlocks are rows now, so read them back through the service. */
  async function unlockedIds(userId: string, songId: string) {
    return (await service.getEntitlement(userId, new Date(), songId)).unlockedSongIds;
  }

  function signedRequest(payload: string, header?: string) {
    return new Request("http://test/api/billing/webhook", {
      method: "POST",
      headers: header ? { "stripe-signature": header } : {},
      body: payload,
    });
  }

  it("grants entitlement idempotently — a duplicate delivery never double-credits", async () => {
    const { POST } = await loadWebhook();
    const { signStripePayload } = await import("@/lib/billing/stripe");
    const payload = JSON.stringify({
      id: "evt_unlock_1",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "payment",
          metadata: { userId: "user_1", product: "song_pass", songId: "song-1" },
        },
      },
    });
    const header = signStripePayload(payload, WEBHOOK_SECRET);

    const first = await POST(signedRequest(payload, header));
    expect(first.status).toBe(200);
    expect(((await first.json()) as { applied: number }).applied).toBe(1);
    expect(await unlockedIds("user_1", "song-1")).toEqual(["song-1"]);
    expect((await service.getEntitlement("user_1")).purchasedCredits).toBe(2);

    const replay = await POST(signedRequest(payload, header));
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { applied: number }).applied).toBe(0);
    expect(await unlockedIds("user_1", "song-1")).toEqual(["song-1"]);
    expect((await service.getEntitlement("user_1")).purchasedCredits).toBe(2);
  });

  it("rejects unsigned or badly signed deliveries", async () => {
    const { POST } = await loadWebhook();
    const payload = JSON.stringify({ id: "evt_x", type: "checkout.session.completed" });
    expect((await POST(signedRequest(payload))).status).toBe(400);
    expect((await POST(signedRequest(payload, "t=1,v1=deadbeef"))).status).toBe(400);
  });
});

describe("POST /api/billing/checkout", () => {
  function checkoutRequest(body: Record<string, unknown>) {
    return new Request("http://test/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns a calm billing_not_configured state instead of crashing without credentials", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    authState.userId = "user_1";
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(checkoutRequest({ product: "pro_monthly" }));
    expect(res.status).toBe(503);
    const data = (await res.json()) as { reason: string };
    expect(data.reason).toBe("billing_not_configured");
  });

  it("requires sign-in with a structured refusal", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(checkoutRequest({ product: "pro_monthly" }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { reason: string }).reason).toBe("signin_required");
  });

  it("rejects unknown products and unlocks without a song", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    authState.userId = "user_1";
    const { POST } = await import("@/app/api/billing/checkout/route");
    expect((await POST(checkoutRequest({ product: "lifetime_deal" }))).status).toBe(400);
    expect((await POST(checkoutRequest({ product: "song_pass" }))).status).toBe(400);
  });
});
