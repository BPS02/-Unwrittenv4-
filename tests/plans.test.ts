import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Plans page", () => {
  it("is linked beside the signed-in account navigation", () => {
    const controls = source("components/AccountControls.tsx");
    expect(controls.indexOf('href="/connect"')).toBeLessThan(controls.indexOf('href="/plans"'));
    expect(controls.indexOf('href="/plans"')).toBeLessThan(controls.indexOf("<UserButton"));
  });

  it("offers every Stripe product through the server checkout route", () => {
    const plans = source("components/PlansView.tsx");
    expect(plans).toContain('checkout("song_pass")');
    expect(plans).toContain('checkout("pro_monthly")');
    expect(plans).toContain('checkout("credit_pack")');
    expect(plans).toContain('fetch("/api/billing/checkout"');
    expect(plans).toContain('fetch("/api/songs"');
    expect(plans).toContain("You have this");
    expect(plans).toContain('entitlement?.tier === "pro"');
  });

  it("returns checkout to the Plans page without accepting arbitrary redirects", () => {
    const checkout = source("app/api/billing/checkout/route.ts");
    expect(checkout).toContain('z.enum(["/create", "/plans"])');
    expect(checkout).toContain('parsed.data.returnTo ?? "/create"');
    expect(checkout).toContain("const origin = new URL(request.url).origin");
    expect(checkout).not.toContain("process.env.APP_URL || new URL(request.url).origin");
  });
});
