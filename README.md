# Unwritten

A thoughtful, emotionally safe web app that turns your thoughts and feelings
into personalized song lyrics — and then into music.

Write down what's on your mind (feelings optional, always), shape the song with
a few gentle controls, get editable lyrics, and set them to music. The full
experience works **without any API keys** in a clearly labeled Demo Mode.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000 — works immediately in Demo Mode
```

To enable AI generation, copy the env template and add keys:

```bash
cp .env.example .env.local
# then fill in OPENROUTER_API_KEY (and optionally Langfuse / music provider keys)
```

## Commands

| Command             | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Start the dev server                  |
| `npm run build`     | Production build                      |
| `npm start`         | Serve the production build            |
| `npm run lint`      | ESLint                                |
| `npm run typecheck` | TypeScript (strict) with no emit      |
| `npm test`          | Vitest suite (105 tests)              |

## Architecture

Next.js 15 (App Router) + React 19 + TypeScript (strict). No database — drafts
live in the browser's `sessionStorage` only, by design (see Privacy below).

```
app/
  page.tsx                 Landing / onboarding
  create/page.tsx          Four-step creation flow (Write → Shape → Lyrics → Music)
  api/lyrics/route.ts      POST — lyric generation (OpenRouter or deterministic demo)
  api/music/route.ts       POST — music prompt construction + provider dispatch
components/
  CreateFlow.tsx           Flow state machine, sessionStorage draft persistence
  WriteStep / ShapeStep / LyricsStep / MusicStep
  TemplateGallery.tsx      The 10 starting points
  Stepper.tsx, CrisisNote.tsx
lib/
  types.ts                 Domain types + control vocabularies
  templates.ts             Exactly 10 starter templates (tested)
  validation.ts            Zod schemas shared by client and API routes
  prompts.ts               Local prompt templates + completion parsing
  openrouter.ts            Server-side OpenRouter chat client
  langfuse.ts              Optional Langfuse prompt management + tracing
  mock.ts                  Deterministic demo lyric generator + style prompt
  crisis.ts                Gentle, non-blocking crisis-language detection
  demo-audio.ts            Browser-side instrumental sketch synthesizer (WAV)
  music/provider.ts        Music provider abstraction + registry
  music/elevenlabs.ts      ElevenLabs Music implementation
tests/                     Vitest suites for templates, validation, generation,
                           prompts, crisis detection, and both API routes
```

### How generation works

1. **Lyrics** — `POST /api/lyrics` validates the request with Zod, then:
   - **With `OPENROUTER_API_KEY`**: builds a songwriting prompt from the user's
     thought, optional feelings, context, and controls, and calls the model in
     `OPENROUTER_MODEL` via OpenRouter. Responses follow a `TITLE:`/`LYRICS:`
     contract with tolerant parsing.
   - **Without a key (Demo Mode)**: a deterministic local generator
     (`lib/mock.ts`) weaves the user's own words and feelings into
     mood-appropriate imagery. Same input → same song; the "Another take"
     button bumps a variation seed. The UI labels the result "Demo mode".
2. **Music** — `POST /api/music` first constructs a *production brief* (style
   prompt): LLM-crafted via OpenRouter when configured, deterministically
   otherwise. It then dispatches to the provider in `MUSIC_PROVIDER`:
   - `demo` (default): returns the brief; the browser synthesizes a 24-second
     instrumental sketch locally with `OfflineAudioContext` (keyed to the
     song's mood/genre, honestly labeled a "Demo sketch").
   - `elevenlabs`: calls the ElevenLabs Music API and streams real audio back
     as a data URL (nothing is stored server-side).

> **Important:** OpenRouter is an LLM gateway — it does **not** generate audio.
> That's why audio goes through the provider abstraction below.

### Langfuse (prompt versioning + tracing)

When `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` are set, the server:

- fetches the shared **guide** prompt
  (`LANGFUSE_GUIDE_PROMPT_NAME`, default `unwritten-guide`: asks the follow-up
  questions, then puts everything together into the song brief) and the
  genre-specific **generator** (`LANGFUSE_GENERATOR_PROMPT_NAME` is the base
  name, default `unwritten-generator`; the app appends `-pop`, `-country`,
  `-hip-hop`, and the other supported genre slugs). Each writes title, STYLE
  production brief, and lyrics in one completion. Create them as **chat prompts** with a `production` label
  in Langfuse to iterate/version without a deploy; the local templates in
  `lib/prompts.ts` are used as automatic fallbacks if a prompt or the service
  is unavailable;
- traces each generation as a root observation (model, prompts, output, token
  usage, environment, and release) through the OpenTelemetry-based Langfuse
  JS/TS v5 SDK, which is compatible with the Langfuse v4 data model.

Note: traces include prompt content, i.e. the user's writing. Enable Langfuse
only against a project whose retention policy you're comfortable with.

## Environment variables

All secrets are read **server-side only** — nothing is exposed to the client.
See `.env.example` for the full annotated list:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | No — Demo Mode without it | LLM lyric generation + music prompt crafting |
| `OPENROUTER_MODEL` | No (default `anthropic/claude-sonnet-4.5`) | Any OpenRouter chat model id |
| `OPENROUTER_LYRICS_MODEL` | No (falls back to `OPENROUTER_MODEL`) | Model for lyric generation only |
| `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` | No | OpenRouter attribution headers |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | No | Enables prompt management + tracing |
| `LANGFUSE_BASE_URL` | No | Langfuse Cloud or self-hosted URL |
| `LANGFUSE_TRACING_ENVIRONMENT`, `LANGFUSE_RELEASE` | No | Observation filters for deployment environment and release |
| `LANGFUSE_GUIDE_PROMPT_NAME`, `LANGFUSE_GENERATOR_PROMPT_NAME` | No | Shared guide name and base name for genre generators |
| `MUSIC_PROVIDER` | No (default `demo`) | `demo` or `elevenlabs` |
| `ELEVENLABS_API_KEY` | Only if `MUSIC_PROVIDER=elevenlabs` | ElevenLabs Music API |
| `MUSIC_LENGTH_MS` | No (default 30000) | Track length for real providers |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | No — accounts disabled without them | Clerk identity & sessions |
| `STRIPE_SECRET_KEY` | No — free-tier only without it | Stripe Checkout sessions |
| `STRIPE_WEBHOOK_SECRET` | Only for webhook grants | Verifies `/api/billing/webhook` deliveries |
| `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_ANNUAL`, `STRIPE_PRICE_PACK` | With Stripe | Dashboard price ids for the three products |
| `APP_URL` | No (request origin fallback) | Origin for checkout success/cancel URLs |
| `MAX_DAILY_RENDERS` | No (default 200) | App-wide daily ceiling on real renders |
| `ALERT_WEBHOOK_URL` | No | POSTed a JSON alert when the ceiling trips |
| `RATE_LIMIT_DEVICE_PER_HOUR`, `RATE_LIMIT_IP_PER_HOUR` | No | Public generation rate limits |

## Connecting a real music API

The shipped `elevenlabs` provider is wired end-to-end:

1. Get an API key from https://elevenlabs.io (Music API access required).
2. In `.env.local`: `MUSIC_PROVIDER=elevenlabs` and `ELEVENLABS_API_KEY=...`.
3. Restart the dev server. The Music step now returns real generated audio
   (lyrics + the production brief are sent as the composition prompt).

To add another provider (Suno via a gateway, Stability Audio, Replicate, …):

1. Create `lib/music/<name>.ts` implementing the `MusicProvider` interface
   from `lib/music/provider.ts` (`name`, `isConfigured()`, `generate()`).
   Return either `{ mode: "audio", stylePrompt, provider, audio: { dataUrl,
   mimeType } }` or throw `MusicProviderError` with a user-readable message.
2. Register it in the `switch` inside `getMusicProvider()`.
3. Document its env vars in `.env.example` and this table.

Provider limitations to be aware of:

- **Demo audio** is an instrumental sketch only — no vocals. It exists so the
  UX is fully demonstrable offline, and it is labeled as such in the UI.
- **ElevenLabs Music** returns audio bytes synchronously; long tracks can take
  a minute or more (the route allows up to 2 minutes). Audio is relayed as a
  data URL and never persisted server-side.
- **Suno** has no official public API; if you use a third-party gateway,
  implement it as a new provider rather than pointing OpenRouter at it.

## Privacy & safety

- **Feelings are optional** and the UI says so explicitly at every point.
- **No accounts, no database.** Drafts persist in `sessionStorage` only and
  clear when the tab session ends or the user taps "Start a new song". Audio
  is never stored server-side.
- User text is sent to third parties **only** when the user presses a generate
  button, and only to the services configured in `.env.local`.
- **No diagnostic or therapeutic claims** — copy consistently frames the app
  as creative expression, with a footer disclaimer.
- A **gentle crisis-support note** (988 / findahelpline.com) appears only when
  writing contains crisis-related language, and it never blocks creating.
  Detection is deliberately narrow (`lib/crisis.ts`, tested) so ordinary
  sadness, grief, and heartbreak — normal songwriting material — don't trigger it.

## Testing

`npm test` runs 105 Vitest tests covering: the 10-template contract, Zod
validation, deterministic demo generation (including structure, feelings
weaving, and the clean-language guarantee), prompt construction and completion
parsing, crisis detection boundaries, both API routes in demo mode, and the
entire entitlement layer — free-song and take enforcement, structured
refusals, failed renders costing nothing, webhook signature verification and
idempotency, streaming-only free-tier downloads, and the pending-action
sign-in round trip.

## Accounts with Clerk

Clerk manages identity, sessions, profile settings, and sign-out; it does not
store songs. The opening page, creation flow, and demo lyrics remain public.
`/songs` is authenticated, and ALL music generation (demo sketches included)
requires a signed-in user once Clerk is configured — each account gets exactly
one free generation.

1. Create or select the Unwritten application in Clerk.
2. Enable Email and Google under User & Authentication (Apple is optional).
3. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env.local`.
4. Use `/sign-in` and `/sign-up` as the auth paths, with `/create` as the
   fallback redirect.
5. Restart the server after changing environment variables.

Without Clerk keys, the app renders without `ClerkProvider`: the creative demo
remains usable, auth pages explain setup, and `/songs` shows a setup state.

Anonymous drafts use `sessionStorage` with a 24-hour TTL and never appear in
URLs. OAuth uses same-tab redirects. Sign-in controls are disabled while lyric
or music generation is in flight, preventing an unfinished result from being
abandoned.

The thought-entry flow intentionally keeps exactly one session draft record.
Because `sessionStorage` is tab-scoped, an unsaved personal draft is lost when
the tab closes; this is a privacy tradeoff for shared devices. A future opt-in
“Keep this on this device?” feature can add durable local storage, but the
default should remain session-only.

### Generation rate limits

`/api/lyrics` and `/api/music` use an in-memory IP plus session-device limit:
10 requests/hour/device and 30 requests/hour/IP by default. Configure these with
`RATE_LIMIT_DEVICE_PER_HOUR` and `RATE_LIMIT_IP_PER_HOUR`. This is suitable for
a single-instance beta; multi-instance production should use shared Redis/KV.

## Music gating, free song, and billing

Lyrics are free and anonymous, always. Music is the paid product:

| Stage | Requires |
| --- | --- |
| Thought entry, Shape, lyric generation and editing | Nothing — fully anonymous |
| First music generation (demo or real) | Sign-in only, no payment |
| Every later music generation | Active entitlement (Plus or song pack) |

### Pricing

- **Free** — one generation ever per account (one song, one take), streaming only
  (no download, no file export). The share/listen link is enabled — it costs
  nothing.
- **Unwritten Plus — $10/month** (or **$80/year**) — 20 songs/month, up to
  3 takes each, downloads, no watermark.
- **Song pack — $5** — 10 songs, non-expiring, 3 takes each, downloads.

A "song" is one thought rendered to music (a client-generated `songId`); a
"take" is one render of that song. **Takes are what cost money and takes are
what's counted** — a take beyond a song's included allowance consumes a fresh
song credit, which buys another block of takes.

### The entitlement service

`lib/entitlement/` is the only place entitlement is decided — no route,
component, or client computes it:

- `logic.ts` — pure decisions: may the user start a song, may they take
  another render, remaining songs/takes, derived plan
  (`free | plus | pack | none`), downloads allowed.
- `service.ts` — resolves state for a Clerk `userId` and persists it.

**Storage is deliberately interim:** entitlement lives in Clerk
`privateMetadata` (`freeSongUsed`, `freeSongId`, `songsUsedThisPeriod`,
`takesUsedBySong`, `packCreditsRemaining`, `plan`, `periodResetsAt`, plus
processed webhook event ids). It is written only from server code via the
Clerk backend SDK, is never returned to the client wholesale (clients only see
the derived summary: plan, remaining songs/takes, downloads allowed), and
moves to the database in the next milestone. Known interim limitation:
metadata writes are read-modify-write without a transaction, so two
simultaneous renders by one user can race.

### Gating points and refusals

- `/api/lyrics` — public and anonymous, rate limited.
- `/api/music` with `MUSIC_PROVIDER=demo` — authenticated **and** entitled
  like real generation whenever Clerk is configured (the sketch counts as the
  free generation); public and rate limited only on a bare checkout with no
  Clerk keys.
- `/api/music` real generation — authenticated **and** entitled. The `userId`
  comes from Clerk `auth()` only; user id, plan, or credits in the request
  body are stripped and ignored. Entitlement is checked **before** the
  provider is called and the take is recorded **after** a confirmed success —
  a failed render never consumes a credit. Refusals are structured:
  `401 { reason: "signin_required" }` or `402 { reason: "payment_required" }`,
  so the UI knows which wall it hit. The route is protected independently of
  any page-level protection.
- `/api/audio/[token]` — rendered audio is streamed from a short-lived
  in-memory token (1-hour TTL, gone on restart). Plain GET streams inline for
  anyone with the link (that's the share link). `?download=1` is refused with
  `payment_required` for free-tier renders and requires the signed-in owner
  otherwise. Free-tier songs never receive a file/data URL.

The two walls are separate moments by design: the sign-in wall ("Your lyrics
are ready. Sign in to hear them as a song — your first one is on us.") never
mentions payment; the paywall shows the $5 pack and $10/month side by side
with a dismiss path that loses no work. Before the sign-in redirect the full
draft (including finished lyrics) stays in `sessionStorage` and only the
pending action name (`generate_music`) plus a safe return route are stored —
never content, never in URLs. On return the flow restores the draft and
re-fires generation automatically.

### Stripe billing

Payment sits behind a provider-agnostic interface (`lib/billing/provider.ts`)
so the entitlement service never touches the vendor. The Stripe implementation
(`lib/billing/stripe.ts`) uses Stripe Checkout for both products:

1. Create three Prices in the Stripe Dashboard: Plus $10/month (recurring),
   Plus $80/year (recurring), Song pack $5 (one-time).
2. Fill `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PLUS_MONTHLY`,
   `STRIPE_PRICE_PLUS_ANNUAL`, `STRIPE_PRICE_PACK` in `.env.local`.
3. Add a webhook endpoint for `checkout.session.completed`, `invoice.paid`,
   and `customer.subscription.deleted` pointing at
   `/api/billing/webhook`, and set `STRIPE_WEBHOOK_SECRET`.
   Locally: `stripe listen --forward-to localhost:3000/api/billing/webhook`.

Entitlement is granted **only** by the verified webhook — never from the
browser's post-checkout redirect (landing on the success page proves nothing;
it only shows a toast). Webhook handling is idempotent: each Stripe event id
is recorded in the user's entitlement metadata and a redelivered event is a
no-op, so credits are never granted twice. With no Stripe credentials the app
builds and runs normally — everyone is free-tier and the paywall shows a calm
"billing not configured" note instead of crashing.

### Abuse guards

- IP + device-token rate limit on `/api/lyrics` and demo music (unchanged).
- The free-song limit is enforced on `userId` only — no device
  fingerprinting. A determined user can make a second account; at ~8¢ a
  render that leakage is cheaper than any prevention system, so none is built.
- `MAX_DAILY_RENDERS` (default 200) is a hard ceiling on real renders per UTC
  day across the whole app, so a shared link can't run up an unbounded
  provider bill. The first time it trips each day an alert is logged and,
  if `ALERT_WEBHOOK_URL` is set, POSTed as JSON.

The next milestone moves entitlement and saved songs into the database keyed to Clerk's
server-derived `userId`, with export and deletion controls.
