import { describe, expect, it } from "vitest";
import { checkGenerationRateLimit } from "@/lib/rate-limit";

describe("generation rate limiting", () => {
  it("limits repeated requests by device", () => {
    const request = new Request("http://localhost/api/lyrics", { headers: { "x-linernotes-device": `test-${crypto.randomUUID()}`, "x-forwarded-for": "203.0.113.10" } });
    for (let i = 0; i < 10; i += 1) expect(checkGenerationRateLimit(request, 1_000).ok).toBe(true);
    expect(checkGenerationRateLimit(request, 1_000).ok).toBe(false);
  });

  it("resets after one hour", () => {
    const request = new Request("http://localhost/api/music", { headers: { "x-linernotes-device": `reset-${crypto.randomUUID()}`, "x-forwarded-for": "203.0.113.11" } });
    expect(checkGenerationRateLimit(request, 1_000).ok).toBe(true);
    expect(checkGenerationRateLimit(request, 1_000 + 60 * 60 * 1000 + 1).ok).toBe(true);
  });
});
