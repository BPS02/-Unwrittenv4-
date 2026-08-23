import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { packExpiring, safeReturnRoute, unpackExpiring } from "@/lib/draft-storage";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Clerk authentication milestone", () => {
  it("protects My Songs on the server", () => {
    const page = source("app/songs/page.tsx");
    expect(page).toContain('from "@clerk/nextjs/server"');
    expect(page).toContain("await auth()");
    expect(page).toContain("redirectToSignIn");
  });

  it("restores an unexpired anonymous draft and rejects an expired one", () => {
    const draft = { step: "lyrics", thought: "Something private" };
    const packed = packExpiring(draft, 1_000);
    expect(unpackExpiring<typeof draft>(packed, 2_000)).toEqual(draft);
    expect(unpackExpiring<typeof draft>(packed, 1_000 + 24 * 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("contains an explicit no-Clerk provider and middleware fallback", () => {
    expect(source("app/layout.tsx")).toContain("clerkEnabled ? <ClerkProvider");
    expect(source("middleware.ts")).toContain(": () => NextResponse.next()");
    expect(source("app/songs/page.tsx")).toContain("Set up Clerk to enable accounts");
  });

  it("restricts auth return destinations and never serializes draft content into a URL", () => {
    expect(safeReturnRoute("/songs")).toBe("/songs");
    expect(safeReturnRoute("/create?thought=private")).toBe("/create");
    expect(source("components/CreateFlow.tsx")).not.toMatch(/URLSearchParams.*(?:thought|lyrics|feelings)/s);
    expect(source("components/AccountControls.tsx")).not.toMatch(/(?:thought|lyrics|feelings).*returnBackUrl/i);
  });
});
