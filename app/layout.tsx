import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./globals.css";
import AccountControls from "@/components/AccountControls";
import SplashScreen from "@/components/SplashScreen";
import { clerkEnabled } from "@/lib/clerk-config";

export const metadata: Metadata = {
  applicationName: "Unwritten",
  title: {
    default: "Unwritten — lyrics made from your details",
    template: "%s · Unwritten",
  },
  description:
    "Tell us a moment. We ask what only you could know — the car, the street, the person — and write it into lyrics that could only be yours. Then hear them recorded.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Unwritten",
  },
};

export const viewport: Viewport = {
  // Single dark theme on every device, so this is one colour and it must
  // track --bg in globals.css — a mismatch shows as a flash of the wrong
  // colour in the mobile browser chrome.
  themeColor: "#0e1211",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {clerkEnabled ? <ClerkProvider dynamic>{renderApp(children, true)}</ClerkProvider> : renderApp(children, false)}
      </body>
    </html>
  );
}

function renderApp(children: React.ReactNode, enabled: boolean) {
  return (
    <>
          <SplashScreen />
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <header className="site-header">
            <nav className="site-nav" aria-label="Main">
              {/* Two elements so the second word can take the accent italic.
                  Keep the brand searchable: aria-label carries it whole. */}
              {/* The accent italic falls on "written" — Un/written. */}
              <Link href="/" className="wordmark" aria-label="Unwritten">Un<span>written</span></Link>
              <div className="nav-actions">
                <Link href="/create" className="btn btn-ghost btn-sm">Create</Link>
                <AccountControls enabled={enabled} compact />
              </div>
            </nav>
          </header>
          <main id="main">{children}</main>
          <footer className="site-footer">
            <p>Unwritten is a creative writing space, not a medical or therapeutic service. Your words stay in your browser session unless you choose to generate.</p>
          </footer>
    </>
  );
}
