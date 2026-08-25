import { afterEach, describe, expect, it, vi } from "vitest";
import { chatComplete } from "@/lib/openrouter";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OpenRouter reasoning compatibility", () => {
  it("retries without reasoning=false when the selected model requires reasoning", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Reasoning is mandatory and cannot be disabled." } }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "TITLE: Test" } }], model: "test" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chatComplete({ system: "system", user: "user", reasoning: false })
    ).resolves.toMatchObject({ text: "TITLE: Test" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(retryBody).not.toHaveProperty("reasoning");
  });
});
