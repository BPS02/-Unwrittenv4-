import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyWebhook = vi.fn();
const deleteAccountData = vi.fn();

vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook }));
vi.mock("@/lib/account-cleanup", () => ({ deleteAccountData }));

const { POST } = await import("@/app/api/webhooks/clerk/route");

function request(): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/clerk", { method: "POST" });
}

describe("Clerk account deletion webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unverified webhook without touching Neon", async () => {
    verifyWebhook.mockRejectedValue(new Error("bad signature"));
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(deleteAccountData).not.toHaveBeenCalled();
  });

  it("ignores unrelated verified Clerk events", async () => {
    verifyWebhook.mockResolvedValue({ type: "user.updated", data: { id: "user_123" } });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(deleteAccountData).not.toHaveBeenCalled();
  });

  it("deletes Neon data for a verified user.deleted event", async () => {
    verifyWebhook.mockResolvedValue({ type: "user.deleted", data: { id: "user_123" } });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(deleteAccountData).toHaveBeenCalledOnce();
    expect(deleteAccountData).toHaveBeenCalledWith("user_123");
  });

  it("returns 500 so Clerk retries a failed cleanup", async () => {
    verifyWebhook.mockResolvedValue({ type: "user.deleted", data: { id: "user_123" } });
    deleteAccountData.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(500);
  });
});
