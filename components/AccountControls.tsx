"use client";

import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { AUTH_RETURN_KEY } from "@/lib/draft-storage";

export default function AccountControls({ enabled, compact = false }: { enabled: boolean; compact?: boolean }) {
  const [generationActive, setGenerationActive] = useState(false);

  useEffect(() => {
    const listener = (event: Event) => setGenerationActive((event as CustomEvent<boolean>).detail);
    window.addEventListener("liner-notes:generation", listener);
    return () => window.removeEventListener("liner-notes:generation", listener);
  }, []);

  if (!enabled) {
    return <Link className="account-setup" href="/sign-in">Set up Clerk to enable accounts</Link>;
  }

  const rememberReturn = () => sessionStorage.setItem(AUTH_RETURN_KEY, window.location.pathname === "/songs" ? "/songs" : "/create");

  return (
    <div className={`account-controls${compact ? " account-controls-compact" : ""}`}>
      <Show when="signed-out">
        <SignInButton mode="redirect">
          <button className="account-link" disabled={generationActive} onClick={rememberReturn} title={generationActive ? "Finish generating before signing in" : undefined}>Sign in</button>
        </SignInButton>
        {!compact && <SignUpButton mode="redirect"><button className="account-create" disabled={generationActive} onClick={rememberReturn}>Create account</button></SignUpButton>}
      </Show>
      <Show when="signed-in">
        <Link className="account-link" href="/songs">My Songs</Link>
        <Link className="account-link" href="/profile">You</Link>
        <Link className="account-link account-link-mcp" href="/connect" title="Use Unwritten inside Claude">
          <span aria-hidden="true">🔌</span> Connect
        </Link>
        <Link className="account-link account-link-plans" href="/plans">Plans</Link>
        <UserButton />
      </Show>
    </div>
  );
}
