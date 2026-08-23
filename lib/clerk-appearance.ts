import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";

/**
 * Taken from the component's own props rather than @clerk/types, which is a
 * transitive package this app does not depend on directly.
 */
type Appearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

/**
 * How Clerk's hosted components are dressed to match the app.
 *
 * Clerk renders its own DOM inside our page, so it needs to be told the
 * palette explicitly — it cannot read our CSS variables. Left on its
 * defaults (or, worse, on a stale light palette) it renders a bright card on
 * the near-black page, and our global element rules bleed in and paint its
 * text the page's near-white ink: white on white, invisible.
 *
 * These values mirror the tokens in app/globals.css. If the palette there
 * changes, change it here too — there is no way to share them at runtime.
 */
export const clerkAppearance: Appearance = {
  // NOTE: Clerk 7 renamed these — colorText became colorForeground,
  // colorInputBackground became colorInput, and so on. The old v5 names are
  // silently... not silently, thankfully: they fail typecheck.
  variables: {
    // --raised, so the card sits above the page ground like our own cards.
    colorBackground: "#171c1b",
    // --accent. It is light on dark, so text ON it must be dark (--on-accent).
    colorPrimary: "#8fb9bc",
    colorPrimaryForeground: "#0b0f0e",
    colorForeground: "#edf1ef",
    colorMutedForeground: "#a7b2af",
    colorMuted: "#080b0a",
    // Inputs sit at the page ground, matching .field inputs elsewhere.
    colorInput: "#0e1211",
    colorInputForeground: "#edf1ef",
    colorBorder: "#37403d",
    colorRing: "#8fb9bc",
    colorNeutral: "#edf1ef",
    colorDanger: "#d98d7e",
    colorSuccess: "#74b193",
    colorWarning: "#c9ab82",
    borderRadius: "0.85rem",
    fontFamily: '"Inter Variable", "Inter", system-ui, sans-serif',
  },
  elements: {
    // The card sits inside AuthPageShell, which already carries the heading
    // and the explanation — Clerk's own title repeated it, and it carried the
    // application name from the Clerk dashboard, which still reads the old
    // product name. Rename it there too: it also appears in emails and on the
    // Google consent screen, which no appearance setting can reach.
    headerTitle: { display: "none" },
    headerSubtitle: { display: "none" },
    card: { boxShadow: "0 2px 4px rgb(0 0 0 / 0.45), 0 16px 44px -14px rgb(0 0 0 / 0.7)" },
  },
  options: {
    socialButtonsVariant: "blockButton",
    socialButtonsPlacement: "top",
  },
};
