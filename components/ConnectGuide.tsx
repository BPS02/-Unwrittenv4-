"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

type ClientKey = "claude-code" | "claude-desktop" | "other";

const TABS: Array<{ key: ClientKey; label: string }> = [
  { key: "claude-code", label: "Claude Code" },
  { key: "claude-desktop", label: "Claude app" },
  { key: "other", label: "Other clients" },
];

export default function ConnectGuide({ mcpUrl }: { mcpUrl: string }) {
  const [tab, setTab] = useState<ClientKey>("claude-code");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast(`${what} copied`);
    } catch {
      setToast("Couldn't copy — your browser blocked it");
    }
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const cliCommand = `claude mcp add liner-notes --http ${mcpUrl}`;
  const jsonConfig = `{
  "mcpServers": {
    "liner-notes": {
      "url": "${mcpUrl}"
    }
  }
}`;

  return (
    <section className="connect-page">
      <header className="connect-head">
        <span className="connect-glyph" aria-hidden="true">🔌</span>
        <h1>Use Unwritten inside Claude</h1>
        <p>
          Connect your account and you can write and record songs straight from
          a conversation — they land in this same vault, on the same plan.
        </p>
      </header>

      <div className="connect-url">
        <code>{mcpUrl}</code>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(mcpUrl, "Server URL")}>
          Copy
        </button>
      </div>

      <div className="connect-tabs" role="tablist" aria-label="Choose your client">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className="vault-filter"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "claude-code" && (
        <ol className="connect-steps">
          <li>
            <strong>Run this in your terminal</strong>
            <div className="connect-code">
              <code>{cliCommand}</code>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(cliCommand, "Command")}>
                Copy
              </button>
            </div>
          </li>
          <li>
            <strong>Sign in when the browser opens</strong>
            <p>Approve the consent screen — that links your Unwritten account.</p>
          </li>
          <li>
            <strong>Ask for a song</strong>
            <p>
              “Write me a song about the drive home from my grandmother’s
              house,” then “now record it.”
            </p>
          </li>
        </ol>
      )}

      {tab === "claude-desktop" && (
        <ol className="connect-steps">
          <li>
            <strong>Open Settings → Connectors</strong>
            <p>In the Claude app, choose “Add custom connector”.</p>
          </li>
          <li>
            <strong>Paste the server URL</strong>
            <div className="connect-code">
              <code>{mcpUrl}</code>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(mcpUrl, "Server URL")}>
                Copy
              </button>
            </div>
          </li>
          <li>
            <strong>Sign in when prompted</strong>
            <p>Approve access, and Unwritten appears in your tools.</p>
          </li>
        </ol>
      )}

      {tab === "other" && (
        <ol className="connect-steps">
          <li>
            <strong>Add this to your client’s MCP config</strong>
            <div className="connect-code connect-code-block">
              <pre>{jsonConfig}</pre>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(jsonConfig, "Config")}>
                Copy
              </button>
            </div>
          </li>
          <li>
            <strong>Sign in through the OAuth prompt</strong>
            <p>
              Unwritten speaks streamable HTTP and authorizes with OAuth 2.1 —
              any spec-compliant MCP client works.
            </p>
          </li>
        </ol>
      )}

      <div className="connect-tools card">
        <h2>What Claude can do once connected</h2>
        <ul>
          <li>
            <strong>Write lyrics</strong> — free, no account needed
          </li>
          <li>
            <strong>Record the song</strong> — uses your plan, exactly like the site
          </li>
          <li>
            <strong>List your songs</strong> — everything in your vault, with listening links
          </li>
          <li>
            <strong>Check your plan</strong> — takes left, or songs left this month
          </li>
        </ul>
        <p className="field-hint">
          Recording takes about a minute — Claude will wait while the song is made.
        </p>
      </div>

      <div className="action-row">
        <Link href="/songs" className="btn btn-secondary">
          ← Back to my songs
        </Link>
      </div>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </section>
  );
}
