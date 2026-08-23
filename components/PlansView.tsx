"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Product = "song_pass" | "pro_monthly" | "credit_pack";
type SongChoice = { id: string; title: string; unlocked: boolean };
type PlanSummary = { tier: "free" | "pro"; songsRemaining: number; purchasedCredits: number };

export default function PlansView() {
  const params = useSearchParams();
  const [songs, setSongs] = useState<SongChoice[]>([]);
  const [songId, setSongId] = useState("");
  const [entitlement, setEntitlement] = useState<PlanSummary | null>(null);
  const [busy, setBusy] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/songs")
      .then(async (response) => {
        if (!response.ok) return { songs: [], entitlement: null };
        const body = (await response.json()) as {
          songs?: SongChoice[];
          entitlement?: PlanSummary;
        };
        return { songs: body.songs ?? [], entitlement: body.entitlement ?? null };
      })
      .then((account) => {
        const locked = account.songs.filter((song) => !song.unlocked);
        setSongs(locked);
        setSongId(locked[0]?.id ?? "");
        setEntitlement(account.entitlement);
      })
      .catch(() => setSongs([]));
  }, []);

  async function checkout(product: Product) {
    if (product === "song_pass" && !songId) {
      setError("Create a song first, then return here to add a Song Pass.");
      return;
    }
    setBusy(product);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          returnTo: "/plans",
          ...(product === "song_pass" ? { songId } : {}),
        }),
      });
      const body = (await response.json()) as { url?: string; error?: string; reason?: string };
      if (!response.ok || !body.url) {
        if (body.reason === "signin_required") throw new Error("Sign in before choosing a plan.");
        throw new Error(body.error ?? "Checkout could not be opened.");
      }
      window.location.assign(body.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not be opened.");
      setBusy(null);
    }
  }

  return (
    <section className="plans-page">
      <header className="plans-head">
        <p className="eyebrow">Choose what fits</p>
        <h1>Turn the songs that matter into something you can keep.</h1>
        <p>Start with one free preview. Pay only for the finished songs or render credits you want.</p>
      </header>

      {params.get("billing") === "success" && (
        <div className="banner banner-success" role="status">Payment received. Your access appears as soon as Stripe confirms it.</div>
      )}
      {params.get("billing") === "cancelled" && (
        <div className="banner" role="status">Checkout was cancelled. Nothing was charged.</div>
      )}
      {error && <div className="banner banner-error" role="alert">{error}</div>}

      <div className="paywall-grid plans-grid">
        <article className="plan-card">
          <p className="plan-label">One special song</p>
          <h2>Song Pass</h2>
          <p className="plan-price">$9.99<span> one-time</span></p>
          <ul>
            <li>Up to 3 total takes</li>
            <li>Permanent full playback</li>
            <li>Download included</li>
          </ul>
          {songs.length > 0 ? (
            <label className="plan-song-select">
              Choose a song
              <select value={songId} onChange={(event) => setSongId(event.target.value)}>
                {songs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}
              </select>
            </label>
          ) : (
            <p className="field-hint">You’ll choose this after creating your free preview.</p>
          )}
          <button className="btn btn-secondary" disabled={busy !== null} onClick={() => void checkout("song_pass")}>
            {busy === "song_pass" ? "Opening checkout…" : "Get a Song Pass"}
          </button>
        </article>

        <article className="plan-card plan-card-featured">
          <p className="plan-label">Create regularly</p>
          <h2>Unwritten Pro</h2>
          <p className="plan-price">$19<span>/month</span></p>
          <ul>
            <li>20 renders each month</li>
            <li>Full playback and downloads</li>
            <li>Cancel anytime</li>
          </ul>
          <button
            className="btn btn-primary"
            disabled={busy !== null || entitlement?.tier === "pro"}
            onClick={() => void checkout("pro_monthly")}
          >
            {busy === "pro_monthly" ? "Opening checkout…" : entitlement?.tier === "pro" ? "Current plan" : "Choose Pro"}
          </button>
          {entitlement?.tier === "pro" && <p className="plan-owned">You have this</p>}
        </article>

        <article className="plan-card">
          <p className="plan-label">No subscription</p>
          <h2>10 Credit Pack</h2>
          <p className="plan-price">$7.99<span> one-time</span></p>
          <ul>
            <li>10 full-quality renders</li>
            <li>Credits never expire</li>
            <li>Use them on any song</li>
          </ul>
          <button className="btn btn-secondary" disabled={busy !== null} onClick={() => void checkout("credit_pack")}>
            {busy === "credit_pack" ? "Opening checkout…" : "Buy 10 credits"}
          </button>
          {(entitlement?.purchasedCredits ?? 0) > 0 && (
            <p className="plan-owned">You have {entitlement?.purchasedCredits} extra credits</p>
          )}
        </article>
      </div>

      <p className="plans-footnote">Not ready yet? <Link href="/create">Write lyrics for free</Link>.</p>
    </section>
  );
}
