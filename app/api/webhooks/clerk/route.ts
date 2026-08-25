import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { deleteAccountData } from "@/lib/account-cleanup";

export const runtime = "nodejs";

/**
 * Clerk account lifecycle webhook. Configure this endpoint for user.deleted:
 *   https://YOUR_DOMAIN/api/webhooks/clerk
 *
 * verifyWebhook validates the Standard Webhooks signature before any user id
 * reaches the database. A failed cleanup returns 500 so Clerk retries it.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    console.error("[api/webhooks/clerk] signature verification failed", error);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  if (event.type !== "user.deleted") {
    return new Response("Ignored", { status: 200 });
  }

  const userId = event.data.id;
  if (!userId) return new Response("Deleted user id missing", { status: 400 });

  try {
    await deleteAccountData(userId);
    return new Response("Account data deleted", { status: 200 });
  } catch (error) {
    console.error("[api/webhooks/clerk] account cleanup failed", error);
    return new Response("Account cleanup failed", { status: 500 });
  }
}
