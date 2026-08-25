"use client";

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { FormEvent, useEffect, useState } from "react";
import type { StoryMemoryWire } from "@/lib/story-memory";

interface StoryResponse { enabled: boolean; memories: StoryMemoryWire[] }

export default function StoryProfile() {
  const { openUserProfile } = useClerk();
  const [data, setData] = useState<StoryResponse | null>(null);
  const [newDetail, setNewDetail] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function request(url: string, init?: RequestInit) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, init);
      const body = await response.json() as Partial<StoryResponse> & { error?: string };
      if (!response.ok) throw new Error(body.error || "Your Story could not be updated.");
      setData((current) => ({
        enabled: body.enabled ?? current?.enabled ?? true,
        memories: body.memories ?? current?.memories ?? [],
      }));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your Story could not be updated.");
      return false;
    } finally { setBusy(false); }
  }

  useEffect(() => { void request("/api/profile/memories"); }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!newDetail.trim()) return;
    if (await request("/api/profile/memories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ detail: newDetail }) })) setNewDetail("");
  }

  return (
    <main className="story-profile">
      <div className="story-profile-inner">
        <Link href="/" className="story-back">← Back home</Link>
        <header><p>YOUR PRIVATE PROFILE</p><h1>Your Story</h1><span>The details that make your songs sound like yours.</span></header>

        <section className="story-control">
          <div><h2>Remember my story</h2><p>When this is on, details you share while creating lyrics are saved and can help shape future songs.</p></div>
          <button type="button" role="switch" aria-checked={data?.enabled ?? true} className={(data?.enabled ?? true) ? "is-on" : ""} disabled={!data || busy}
            onClick={() => void request("/api/profile/memories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memoryEnabled: !data?.enabled }) })}>
            <span />
          </button>
        </section>

        <section className="story-add">
          <h2>Add something you want remembered</h2>
          <form onSubmit={add}>
            <textarea value={newDetail} onChange={(event) => setNewDetail(event.target.value)} maxLength={2000} placeholder="For example: My grandfather taught me guitar on his front porch every Sunday." />
            <button disabled={busy || newDetail.trim().length < 2}>Add to my story</button>
          </form>
        </section>

        <section className="story-list">
          <div className="story-list-title"><h2>Saved details</h2><span>{data?.memories.length ?? 0}</span></div>
          {!data && !error && <p className="story-empty">Opening your story…</p>}
          {data?.memories.length === 0 && <p className="story-empty">Nothing saved yet. The details you share in your next song will appear here.</p>}
          {data?.memories.map((memory) => {
            const value = editing[memory.id];
            return <article key={memory.id}>
              {value === undefined ? <p>{memory.detail}</p> : <textarea value={value} maxLength={2000} onChange={(event) => setEditing({ ...editing, [memory.id]: event.target.value })} />}
              <div><small>{memory.source === "song" ? "Saved from a song" : "Added by you"}</small>
                {value === undefined ? <><button onClick={() => setEditing({ ...editing, [memory.id]: memory.detail })}>Edit</button><button onClick={() => void request(`/api/profile/memories?id=${memory.id}`, { method: "DELETE" })}>Delete</button></>
                  : <><button onClick={() => setEditing(Object.fromEntries(Object.entries(editing).filter(([id]) => id !== memory.id)))}>Cancel</button><button disabled={busy || value.trim().length < 2} onClick={async () => { if (await request("/api/profile/memories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: memory.id, detail: value }) })) setEditing(Object.fromEntries(Object.entries(editing).filter(([id]) => id !== memory.id))); }}>Save</button></>}
              </div>
            </article>;
          })}
        </section>

        {error && <p className="story-error" role="alert">{error}</p>}
        <footer>
          {confirmClear ? <div className="story-clear-confirm"><span>This permanently removes every saved detail.</span><button onClick={() => setConfirmClear(false)}>Cancel</button><button disabled={busy} onClick={async () => { if (await request("/api/profile/memories?id=all", { method: "DELETE" })) setConfirmClear(false); }}>Delete all</button></div>
            : <button className="story-clear" disabled={!data?.memories.length} onClick={() => setConfirmClear(true)}>Clear Your Story</button>}
          <button className="story-account" onClick={() => openUserProfile()}>Account settings</button>
        </footer>
      </div>
    </main>
  );
}
