interface Bucket { count: number; resetAt: number }

const WINDOW_MS = 60 * 60 * 1000;

/**
 * Pinned to globalThis for the same reason as the audio, songs and
 * entitlement stores: Next dev compiles each route into its own bundle with
 * its own module instance, so a bare module-level Map gives every route a
 * SEPARATE counter. That silently multiplies the effective limit by the
 * number of routes — /api/lyrics, /api/music, /api/questions,
 * /api/starting-points and /api/template-thought were each counting alone.
 *
 * NOTE: this fixes dev (and a single serverless instance). Across Vercel
 * instances the limit is still per-instance — see "Still open" in CLAUDE.md.
 */
const buckets: Map<string, Bucket> = ((globalThis as Record<string, unknown>)
  .__linerNotesRateBuckets ??= new Map<string, Bucket>()) as Map<string, Bucket>;

function configuredLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function consume(key: string, limit: number, now: number): { ok: boolean; retryAfter: number } {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  if (current.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true, retryAfter: 0 };
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export function checkGenerationRateLimit(request: Request, now = Date.now()) {
  const device = request.headers.get("x-linernotes-device") || "missing-device";
  const deviceResult = consume(`device:${device}`, configuredLimit("RATE_LIMIT_DEVICE_PER_HOUR", 10), now);
  const ipResult = consume(`ip:${clientIp(request)}`, configuredLimit("RATE_LIMIT_IP_PER_HOUR", 30), now);
  const ok = deviceResult.ok && ipResult.ok;
  return { ok, retryAfter: Math.max(deviceResult.retryAfter, ipResult.retryAfter) };
}

export function rateLimitResponse(retryAfter: number): Response {
  return Response.json(
    { error: "You’ve created a lot in a short time. Take a breath and try again in about an hour.", code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

// ── Application-wide daily render ceiling ─────────────────────────────────
// A hard cap on real (billed) music renders per UTC day across the whole app,
// so a shared link can never produce an unbounded provider bill. Attempts are
// counted before the provider is called (conservative). When the ceiling is
// first hit each day, an alert is logged and optionally POSTed to
// ALERT_WEBHOOK_URL.

// Pinned for the same reason as the buckets above — otherwise the app-wide
// ceiling is counted separately by every route that can bill a render.
const dailyRenders: { date: string; count: number; alerted: boolean } = ((
  globalThis as Record<string, unknown>
).__linerNotesDailyRenders ??= { date: "", count: 0, alerted: false }) as {
  date: string;
  count: number;
  alerted: boolean;
};

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function dailyRenderCeiling(): number {
  return configuredLimit("MAX_DAILY_RENDERS", 200);
}

export function checkDailyRenderCeiling(now = Date.now()): { ok: boolean } {
  const day = utcDay(now);
  if (dailyRenders.date !== day) {
    dailyRenders.date = day;
    dailyRenders.count = 0;
    dailyRenders.alerted = false;
  }
  const ceiling = dailyRenderCeiling();
  if (dailyRenders.count >= ceiling) {
    if (!dailyRenders.alerted) {
      dailyRenders.alerted = true;
      const payload = { type: "daily_render_ceiling_reached", date: day, ceiling };
      console.error("[alert]", JSON.stringify(payload));
      const url = process.env.ALERT_WEBHOOK_URL;
      if (url) {
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => {});
      }
    }
    return { ok: false };
  }
  dailyRenders.count += 1;
  return { ok: true };
}

export function dailyCeilingResponse(): Response {
  return Response.json(
    {
      error:
        "Unwritten has reached today’s music-generation capacity. Your lyrics are safe — please try the music again tomorrow.",
      code: "DAILY_CEILING",
    },
    { status: 503 }
  );
}

/** Test seam. */
export function resetDailyRenderCounterForTesting(): void {
  dailyRenders.date = "";
  dailyRenders.count = 0;
  dailyRenders.alerted = false;
}
