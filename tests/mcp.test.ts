import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guards for the MCP surface. The MCP server is a second front
 * door to the same paid product, so it must obey the same rules as the web
 * routes: identity from the OAuth token only, entitlement checked before any
 * provider call, and masters never handed to unentitled callers.
 */

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

const route = source("app/[transport]/route.ts");

describe("MCP server", () => {
  it("resolves identity from the verified OAuth token only", () => {
    expect(route).toContain("verifyClerkToken");
    expect(route).toContain('authInfo?.extra?.userId');
    // Never trusts a caller-supplied user id.
    expect(route).not.toMatch(/args\.userId/);
    expect(route).not.toContain("privateMetadata");
  });

  it("gates generation on entitlement BEFORE calling the music provider", () => {
    // Compare call sites, not the import block.
    const gate = route.indexOf("await reserveMusicGeneration(userId");
    const render = route.indexOf("await provider.generate(");
    const record = route.indexOf("await recordMusicGeneration(userId");
    expect(gate).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(render); // entitlement decided (and held) before spending money
    expect(render).toBeLessThan(record); // nothing consumed until the render lands
    expect(route.indexOf("await storeAudio(")).toBeLessThan(record);
    expect(route.indexOf("await saveSongTake(")).toBeLessThan(record);
    expect(route).toContain("rollbackSongTake");
    expect(route).toContain("deleteAudio(storedAudioIds)");
    // A failed render releases the hold instead of committing it.
    expect(route).toContain("releaseMusicGeneration");
  });

  it("serves the preview token unless the render is entitled", () => {
    expect(route).toContain("const servedToken = unlocked ? masterRef.token : previewRef.token");
  });

  it("logs generation cost so MCP margin is queryable alongside the web", () => {
    expect(route).toContain("GENERATION_COST_USD");
    expect(route).toContain('surface: "mcp"');
  });

  it("keeps paid tools behind sign-in while lyrics stay free", () => {
    expect(route).toContain("required: false");
    // The two paid tools bail out without a caller id.
    const paidGuards = route.match(/if \(!userId\) return text|if \(!userId\) \{/g) ?? [];
    expect(paidGuards.length).toBeGreaterThanOrEqual(3);
  });
});

describe("OAuth discovery routes", () => {
  it("advertises Clerk as the authorization server", () => {
    expect(source("app/.well-known/oauth-authorization-server/route.ts")).toContain(
      "authServerMetadataHandlerClerk"
    );
    expect(source("app/.well-known/oauth-protected-resource/mcp/route.ts")).toContain(
      "protectedResourceHandlerClerk"
    );
  });

  it("middleware never redirects the MCP or discovery routes", () => {
    const middleware = source("middleware.ts");
    expect(middleware).toContain("isMcpRoute");
    expect(middleware).toContain('"/.well-known/(.*)"');
    expect(middleware.indexOf("if (isMcpRoute(request)) return;")).toBeLessThan(
      middleware.indexOf("if (isProtectedRoute(request))")
    );
  });
});
