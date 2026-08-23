import type { BillingEvent } from "../entitlement/types";
import { StripeBillingProvider } from "./stripe";

/**
 * Provider-agnostic billing interface. The entitlement service knows nothing
 * about the vendor: routes ask the billing provider for a checkout URL, and
 * the webhook route turns verified vendor events into neutral BillingEvents
 * that lib/entitlement applies idempotently.
 *
 * Entitlement is granted ONLY from the verified webhook — never from the
 * browser's post-checkout redirect, which proves nothing.
 */

export type BillingProduct = "song_pass" | "pro_monthly" | "credit_pack";

export const PRODUCT_COPY: Record<BillingProduct, string> = {
  song_pass: "Song Pass — $9.99 one-time, 3 takes and permanent download",
  pro_monthly: "Unwritten Pro — $19/month, 20 render credits",
  credit_pack: "10 render credits — $7.99 one-time, never expire",
};

export interface CheckoutRequest {
  userId: string;
  product: BillingProduct;
  /** Required for a Song Pass: the song being purchased. */
  songId?: string;
  successUrl: string;
  cancelUrl: string;
}

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly status: number = 502
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export interface BillingProvider {
  readonly name: string;
  /** Whether all credentials/price ids required for checkout are present. */
  isConfigured(): boolean;
  createCheckoutSession(req: CheckoutRequest): Promise<{ url: string }>;
  /**
   * Verifies and parses a webhook delivery into neutral billing events.
   * Throws BillingError(400) on a bad or missing signature.
   */
  parseWebhook(rawBody: string, signatureHeader: string | null): BillingEvent[];
}

export function getBillingProvider(): BillingProvider {
  return new StripeBillingProvider();
}
