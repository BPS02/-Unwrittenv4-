import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthPageShell({ kind, children, enabled }: { kind: "sign-in" | "sign-up"; children: ReactNode; enabled: boolean }) {
  const signingIn = kind === "sign-in";
  return (
    <section className="auth-page">
      <div className="auth-glow" aria-hidden="true" />
      <div className="auth-intro">
        <Link href="/" className="auth-brand">UNWRITTEN</Link>
        <p className="auth-kicker">{signingIn ? "WELCOME BACK" : "MAKE IT YOURS"}</p>
        <h1>{signingIn ? "Keep the songs that mean something." : "A home for the songs only you could make."}</h1>
        <p>{signingIn ? "Sign in to return to unfinished songs and, soon, access your music from any device." : "Create an account to save lyrics, revisit ideas, and keep your music together."}</p>
        <p className="auth-privacy">Your private writing is not part of your public profile.</p>
        <Link href="/create" className="auth-skip">← Continue without signing in</Link>
      </div>
      <div className="auth-card-wrap">
        {enabled ? children : (
          <div className="auth-setup-card">
            <h2>Accounts aren’t connected yet</h2>
            <p>Add the Clerk publishable and secret keys to <code>.env.local</code>, then restart Unwritten. The creative demo remains available without an account.</p>
            <Link href="/create" className="btn btn-primary">Keep creating</Link>
          </div>
        )}
      </div>
    </section>
  );
}
