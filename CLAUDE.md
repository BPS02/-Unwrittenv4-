# Unwritten — build notes

Turn a thought or feeling into personalized lyrics, then into a real recorded
song. This file is the working guide for anyone (human or agent) building on
this codebase: what exists, why it's shaped this way, and the things that cost
real time to discover.

This is V3, ported from V2 (`github.com/BPS02/v2-feelmatch`). The port kept the
pure entitlement core, the music-provider abstraction, and the byte-math
preview cutter, and replaced Clerk-metadata storage with Neon Postgres.

## Rebuilding this app from the repository

The source is the specification. Do not rebuild from this document alone — it
explains *why* the code is shaped the way it is, not every line of it.

```bash
git clone https://github.com/BPS02/Liner-Notes.git
cd Liner-Notes
npm install          # from PowerShell on Windows — see "Hard-won lessons"
cp .env.example .env # fill in only what you need; see the table at the end
npm test             # 207 tests, no database or API keys required
npm run dev          # http://localhost:3000
```

**It runs with an empty `.env`.** No keys at all gives you deterministic demo
lyrics, a locally synthesised instrumental, in-memory storage and anonymous
mode — the whole flow end to end. Add keys to make each piece real, in this
order of value:

1. `OPENROUTER_API_KEY` — real lyrics, follow-up questions, starting points.
2. `DATABASE_URL` (Neon, **pooled**) — durable songs, entitlements, audio.
   Then `npm run db:migrate`.
3. Clerk keys — accounts, the vault, the MCP server.
4. `MUSIC_PROVIDER` + its key — actual recorded audio.
5. Stripe keys — payment. Everything works without it; the paywall just says
   billing is not configured.

If you are an agent picking this up cold: read the **Non-negotiable
invariants** below before changing anything that touches money or audio, and
run `npm test` before and after. Every pricing bug this app has had was caught
by that suite first.

## Stack

Next.js 15 (App Router) · strict TypeScript · React 19 · Clerk (auth + OAuth
provider) · **Neon Postgres + Drizzle** (entitlements, songs, and the audio
bytes themselves) · Stripe (billing) · Langfuse (managed prompts + tracing) ·
OpenRouter (LLMs) · Mureka (music) · Vitest.

```
npm run dev         # localhost:3000
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run db:generate # drizzle-kit generate — after editing lib/db/schema.ts
npm run db:migrate  # apply migrations (needs DATABASE_URL)
```

Without `DATABASE_URL` the app degrades honestly to an in-memory store, so
`npm run dev` and the whole test suite run with no database at all.

## The product in one paragraph

Anyone can write lyrics anonymously — that's the hook and it stays free.
Recording a song requires a signed-in account. Every account gets **one
lifetime free song** and each take is served as a **15-second preview** only.
The full-length master of every take is generated and stored but never served
until the song is unlocked — a **Song Pass at $9.99** for that song, a
**10-render credit pack at $7.99**, or **Pro at $19/month for 20 songs**.
Songs live in a personal vault, grouped into playlists.

Pricing lives in `lib/entitlement/types.ts` and nowhere else. If the numbers
above disagree with that file, the file is right and this paragraph is stale.

## Non-negotiable invariants

These are the rules the whole product rests on. Break one and you either leak
paid product or charge someone twice.

1. **Identity comes from Clerk `auth()` only.** Never from a request body,
   never from email, never from a device token. The MCP server gets it from
   the verified OAuth token (`authInfo.extra.userId`).
2. **Entitlement is computed server-side in `lib/entitlement/logic.ts`.**
   Nothing client-side ever computes or supplies it. Clients receive only the
   `EntitlementSummary` shape.
3. **Reserve BEFORE calling a provider; commit AFTER it succeeds.**
   `reserveMusicGeneration` atomically checks the gate and places a hold;
   `recordMusicGeneration` commits it; `releaseMusicGeneration` hands it back
   on failure. A failed render must cost the user nothing, and two
   simultaneous renders must not both pass on the last remaining take. Tests
   assert this ordering by comparing source positions of the call sites.
4. **The master audio path never crosses to an unentitled client** — not in a
   render response, not in `/api/songs`, not in a share link. The route mints
   a preview token instead.
5. **Entitlement is granted only by the verified Stripe webhook**, never by
   the browser's post-checkout redirect (which proves nothing), and always
   idempotently by event id — enforced by the `billing_events` primary key,
   so a duplicate delivery cannot grant twice even under a race.

## Architecture

### Entitlement (`lib/entitlement/`)
- `types.ts` — the metadata shape and the pricing constants
  (`FREE_SONG_TAKES`, `PRO_SONGS_PER_PERIOD`, `SONG_PASS_PRICE_USD`,
  `CREDIT_PACK_PRICE_USD`, `PRO_PRICE_USD`, `GENERATION_COST_USD`).
- `logic.ts` — pure functions, the single source of pricing truth:
  `assessGeneration`, `recordGeneration`, `masterAccessAllowed`,
  `applyBillingEvent`, `summarize`.
- `service.ts` — persistence on Neon Postgres, plus the reserve/commit gate.
  Falls back to an in-memory backend when `DATABASE_URL` is absent.

`logic.ts` stayed pure through the port. The service hydrates the metadata
shape it expects from rows and scopes the unlock lookup to the one song being
asked about, so pricing truth still lives in exactly one side-effect-free file.

### Database (`lib/db/`)
- `schema.ts` — nine tables: `entitlements`, `render_reservations`, `songs`,
  `takes`, `audio_blobs`, `playlists`, `playlist_items`, `song_unlocks`,
  `billing_events`. Migrations live in `drizzle/`.
- `client.ts` — the Neon pool. Uses the **WebSocket** driver
  (`drizzle-orm/neon-serverless`), not the HTTP one, because reserve/commit
  needs an interactive transaction with `SELECT ... FOR UPDATE`.

V2's race is gone: a render holds what it is about to consume in
`render_reservations` before the provider is called, and the gate counts
unexpired holds as already spent. A crashed render's hold simply expires
(10-minute TTL, longer than the route's 300s `maxDuration`), so nothing is
stranded — which is why a hold is a row with an expiry rather than an
incremented counter.

Two V2 size caps are gone too, because unlocks and billing events are rows
rather than arrays inside a size-limited metadata blob: a user's 201st unlock
no longer silently evicts their first.

### Songs (`lib/songs-store.ts`)
`songs` + `takes` rows, one take per rendered performance, with a
`(song_id, n)` unique constraint making a duplicate take number impossible.
Audio bytes live in `audio_blobs` (see below); a take points at them by id.
`unlocked` is derived from `song_unlocks`, never stored on the song.

### The vault (`components/PlaylistsView.tsx`, `TrackList.tsx`)
Songs are browsed as a grid of playlist tiles, not a flat list. "Liked songs"
and "All songs" are **derived, never stored** — they are `favorite === true`
and the song list itself, so they cannot drift out of sync and cannot be
renamed or deleted.

Adding a song to a playlist verifies the caller owns **both**. A playlist id
is handed to the client in every listing, so it is guessable in a way a song
id is not; without the second check a playlist would be a way to pull someone
else's audio into a view that mints tokens for it. Unauthorised access
answers 404, never 403, so a probe cannot confirm that an id exists.

### The player (`components/AudioPlayer.tsx`)
Replaces `<audio controls>`, which renders differently in every browser. The
audio element still plays; it is just not what you see, so the paywall and
the token URL are unchanged. Progress runs on `requestAnimationFrame` rather
than the `timeupdate` event (which fires ~4×/second and reads as stutter),
and both bar layers animate with `transform: scaleX`, so there is no layout
work per frame.

Dropping the native element also drops its free keyboard and screen-reader
support, so that is rebuilt: `role="slider"`, arrow keys seek five seconds,
space toggles, and `aria-valuetext` reads "0:07 of 3:33".

### Audio (`lib/audio-store.ts`, `lib/audio-preview.ts`)
Audio bytes live in **Postgres** (`audio_blobs`, a `bytea` column), so the
whole product is one database. It is never handed over as a file URL: it's
served through `/api/audio/[token]`, where the token is an HMAC-signed payload
(audio row id, owner, downloadable, expiry) that any serverless instance can
verify without shared state. Range requests are sliced in the database with
`substring(bytes ...)`, so seeking costs the bytes asked for rather than a
whole 5 MB master. Previews are cut from the master with byte math — MP3
frame-header bitrate, WAV byte rate — so there's no ffmpeg dependency.

The signing key is `AUDIO_SIGNING_SECRET`, falling back to `DATABASE_URL`
(present in exactly the cases audio can exist at all). Takes rendered before
the move keep a `master_pathname` and still stream from the private Blob store
while `BLOB_READ_WRITE_TOKEN` is set; nothing new is written there. Once every
take has an `audio_id`, the pathname columns and the `@vercel/blob` dependency
can go.

### Generation (`lib/generate.ts`)
`generateQuestions`, `generateLyrics`, and `resolveStylePrompt` are shared by
the web routes and the MCP server, so a song made through Claude is produced
identically to one made on the site.

V4's pipeline is two managed prompts end to end. The **guide** asks the
follow-up questions, and at lyrics time puts everything the writer shared —
thought, feelings, details, answers — together into one song brief
(`assembleSongBrief`, best-effort: on failure the raw sections go to the
generator directly, so lyrics are never blocked on assembly). The
**generator** writes the whole song from that brief in a single completion:
`TITLE:`, the `STYLE:` production brief, and `LYRICS:`. The style travels to
the client with the lyrics and comes back in the render request — `/api/music`
makes **no LLM call at all**; `resolveStylePrompt` uses the style that
travelled with the song, falling back to the deterministic
`buildMockStylePrompt` when none did (an old draft, or a caller that skipped
`write_lyrics`).

`generateQuestions` is the one exception to "degrade honestly": it has **no
deterministic fallback on purpose**. It writes the follow-up questions for the
"Questions" step from what that person actually wrote, and a canned list would
be presented to the writer as if it had been written for them. So an
unconfigured or failing OpenRouter surfaces as an error the UI reports
(`503 QUESTIONS_UNAVAILABLE` from `/api/questions`), and the step offers a
retry plus — only after a failure — writing the lyrics without answers, so a
keyless deployment can still reach the end of the flow.

### Design (`app/globals.css`)
One dark palette, defined entirely as tokens on `:root`. There are **no
hardcoded colours** below that block — sheens go through `--sheen`, text on
accent fills through `--on-accent`, shadows are plain black. Re-theming means
editing that block and nothing else; keep it that way.

Two traps this already hit: `color-mix(var(--bg) 55%, #fff)` produced a light
input under light text once the ground went dark, and Clerk renders its own
DOM inside the page, so it needs the palette restated in
`lib/clerk-appearance.ts` — it cannot read CSS variables, and Clerk 7 renamed
them (`colorText` → `colorForeground`).

### The creation flow (`components/CreateFlow.tsx`)
`Write → Shape → Questions → Lyrics → Music`, ordered by `STEP_ORDER` in
`components/Stepper.tsx`.

**Questions** sits between shaping and lyrics: the model reads the thought,
feelings, and details and asks 3–6 follow-ups specific to them ("who was
usually in the passenger seat?"), and **every one must be answered** before
lyrics are written. Answers travel as `SongInput.answers` — each carries its
own question text, so the prompt keeps the pairing and a restored draft does
too. The guide's `TASK: BRIEF` weighs them above anything inferred from the
thought alone, and the generator's raw-sections fallback
(`buildGeneratorUserPrompt` without a brief) does the same.

`answers` is optional on `SongInput` and defaults to `[]` in the Zod schema,
because MCP's `write_lyrics` has no questions step. The "answer them all" rule
is therefore enforced **client-side only** — the server never sees the question
set, so it cannot know how many were asked. Moving that rule server-side means
persisting question sets first.

### Music providers (`lib/music/`)
A `MusicProvider` interface with `MUSIC_PROVIDER` selecting the
implementation: `mureka` (current), `lyria`, `gpt-audio`, `elevenlabs`,
`demo`. Adding one is a single file plus a registry line.

### MCP server (`app/[transport]/route.ts`)
Exposes `write_lyrics` (free, anonymous), `generate_song`, `list_my_songs`,
`my_account` over OAuth with **Clerk as the authorization server**. The paid
tools run the exact same entitlement functions as the website, so there's no
second paywall to keep in sync and no loophole.

## Prompts live in Langfuse, not in the repo

V4 runs the whole creation flow on **two chat prompts** managed in Langfuse
(US region) — deliberately down from V3's three:

1. **The guide** (`unwritten-guide`, `LANGFUSE_GUIDE_PROMPT_NAME`) — guides
   the writer through telling the personal detail behind their song and then
   puts everything they shared together. One system prompt, two tasks named
   on the request's `TASK:` line: `QUESTIONS` (the follow-up questions step)
   and `BRIEF` (assemble thought + feelings + details + answers into the song
   brief handed to the generator). Seeded from `GUIDE_SYSTEM_PROMPT`.
2. **The generator** (`unwritten-generator`, `LANGFUSE_GENERATOR_PROMPT_NAME`)
   — the lyric/music generator. Writes the complete song in one completion:
   `TITLE:`, the `STYLE:` production brief (genre, mood, BPM, instrumentation,
   vocal character, dynamic arc — handed directly to the music provider), and
   `LYRICS:`. There is no separate music-brief prompt to keep in sync. Seeded
   from `GENERATOR_SYSTEM_PROMPT`.

These two are the ONLY prompts. The browse-templates path is deliberately
model-free: the starter templates in `lib/templates.ts` are hand-curated
under research-grounded emotion families (Plutchik's primaries and their
studied blends; Cowen & Keltner's emotion categories), and choosing one
selects its feelings and drops one of its hand-written opening thoughts into
the box instantly — no API call, nothing to wait for, nothing to fail.
Picking the same template again rotates to its next thought variant.

`npx tsx seed-langfuse-prompts.ts` pushes both in-repo fallbacks to Langfuse
as chat prompts labelled `production` (re-running versions them, never
duplicates; pass a prompt name to push just one). The guide's config pins
`meta/muse-spark-1.2-contributor`, which has two account/config gates learned
the hard way: it 403s until the OpenRouter account confirms **18+**
(https://openrouter.ai/settings/preferences), and it 400s on
`reasoning: false` — reasoning is **mandatory** for this model, so its config
carries `reasoning: true` with a generous `maxTokens` (thinking spends the
budget). While the guide errors, questions surface it and the brief step
falls back to raw sections. The generator's config deliberately pins no
model, so it follows `OPENROUTER_LYRICS_MODEL` / `OPENROUTER_MODEL` until one
is set in Langfuse. Config edits take up to ~60s to reach the running app —
the SDK caches prompts.

A prompt only resolves if it carries the **`production` label** — `getPrompt`
requests that label by default, and an unlabelled prompt silently falls back
to the in-repo copy. Check which one actually served a request by reading
`metadata.promptSource` (`"langfuse"` or `"local"`) on the trace. `lib/prompts.ts` holds fallbacks used only when Langfuse is
unreachable. Each prompt version carries a `config` object read by the app:

```json
{ "model": "deepseek/deepseek-v4-pro-0813", "temperature": 0.85,
  "maxTokens": 3000, "reasoning": false }
```

So the model is chosen per prompt in Langfuse — edit and promote a version and
it goes live with no deploy. Model priority: prompt config → env → default.

The generator prompt is a Suno-style system: bracketed meta tags
(`[Chorus, Backing vocals]`, `[Beat switch]`), a long banned-AI-phrase list,
<2000 characters, varied line lengths, no repeated words outside the chorus,
and the `STYLE:` line emitted **outside** the lyrics block — that line IS the
music brief; `parseGeneratorCompletion` captures it and strips it from the
lyrics.

## Hard-won lessons (read this before V3)

**Audio generation**
- OpenRouter is an LLM gateway; only some models emit audio, and **audio only
  streams over SSE** — a non-streaming request returns "Audio output requires
  stream: true".
- `openai/gpt-audio` is a *voice* model. It performs lyrics; it does not
  compose music. It also refuses text-only tasks entirely.
- You cannot generate a short clip and later "extend" it into the full song —
  a second generation is a different song. Always render the full master, then
  serve a slice. This is why previews are cut, not generated.
- DeepSeek v4 is a reasoning model: with a large system prompt it can spend the
  entire token budget thinking and return an **empty completion**. Set
  `reasoning: false` and give generous `maxTokens`.

**Video generation — tried and removed**
- Per-song AI video was built end to end (provider, job table, poll-driven
  worker, UI) and then removed: at `minimax/hailuo-3` a clip costs **$0.13 per
  SECOND** with a 5s minimum, so **$0.65** against $0.95 of Pro revenue per
  song. The cheapest listed model was still $0.25 a clip. It never worked as a
  bundled feature; it would need its own price.
- Two things it taught, worth keeping if it is ever revisited:
  - A render takes **3-4 minutes** (measured 204s, 229s, one past 243s)
    against Vercel's 300s ceiling. Nothing that long can live inside a
    request. Submit, store the PROVIDER's job id, and let the client's own
    polling advance the job one short step at a time — that survives a closed
    tab, a redeploy and a dropped connection, with no cron or queue worker.
  - Holding the render in an `after()` continuation produced exactly two
    failures in a day: one paid render thrown away at a 240s cap, and a job
    stranded at `running` forever when the continuation died.
- The homepage hero video is unrelated and remains: one static file in
  `public/media/`, no per-render cost.

**Serverless****Serverless**
- In-memory anything breaks on Vercel: the instance that rendered is not the
  instance that serves playback. This produced "zero duration" audio. Blob
  storage plus self-contained signed tokens fixed it.
- Next dev compiles each route into its own bundle with its own module
  instance, so a module-level `Map` is *not* shared between routes. Pin dev
  stores to `globalThis`. This bit the **rate limiter** specifically: its
  buckets were unpinned, so every generation route counted into its own
  private allowance and the real limit was `configured × number of routes`.
- **A swallowed 429 is indistinguishable from a broken feature.** Every
  client fetch of a generation route must surface the error body — the
  starting-points gallery silently fell back to the shipped ten and the
  opening-line call silently produced an empty box, which read as "the AI
  stopped working" when the server was plainly answering 429.
- Expensive calls that fire on mount share the same hourly budget as the
  paid actions. V3's AI-generated starting-point tiles regenerated on every
  page view and exhausted the budget before the visitor wrote anything;
  caching per session helped, and V4 removed the model from that path
  entirely — templates are hand-curated and free to browse.
- Long jobs need `export const maxDuration` (music: 300s) or the default
  timeout kills the render.

**Vercel Blob**
- A store is private or public **at creation** and cannot be changed. Private
  is the right choice here: blobs are fetched server-side with `get()` and
  streamed through the app's own route, so the paywall has exactly one gate.

**Neon**
- Use the **pooled** connection string (host contains `-pooler`). Each Vercel
  invocation is its own instance — the same reason the in-memory `Map` failed —
  and direct connections exhaust the server's limit fast.
- The HTTP driver (`neon-http`) cannot hold an interactive transaction, so it
  can't do `SELECT ... FOR UPDATE` then insert. Reserve/commit needs the
  **WebSocket** driver (`neon-serverless` + `Pool`). Picking the cheaper HTTP
  driver silently reopens the race.
- Pin the pool to `globalThis` for the same dev-bundling reason as the stores,
  or each route opens its own pool.

**Clerk as an OAuth provider (MCP)**
- Clerk can be the OAuth server — no separate auth to build.
- **Do not advertise CIMD for CLI clients.** Claude Code opens a callback on a
  *random* localhost port; a Client ID Metadata Document has a fixed redirect
  list, so it can never match. Symptom: `invalid_request … 'redirect_uri'
  does not match any of the OAuth 2.0 Client's pre-registered redirect urls`.
  Enable **dynamic client registration** instead.
- Clients cache the OAuth client id in `~/.claude/.credentials.json` under
  `mcpOAuth`. Fixing the server does nothing until that stale entry is
  cleared.
- A **development** Clerk instance is fine for testing but production OAuth
  wants a real domain (a `*.vercel.app` host can't hold the DNS records), so
  budget for buying a domain before launch.

**Library versions**
- `mcp-handler` 2.x requires MCP SDK v2 + Zod 4. This app is SDK 1.x + Zod 3,
  so it is pinned to `mcp-handler@^1`. The SDK's bundled Zod types don't unify
  with the app's Zod, so `app/[transport]/route.ts` uses a small documented
  `ToolRegistrar` shim and re-validates every tool argument with the app's own
  schemas.

**Windows**
- Installing dependencies from a POSIX shell leaves `node_modules/.bin`
  without `.cmd` shims and `npm run dev` fails. Install from PowerShell.
- **A wrong system clock presents as a Clerk key mismatch.** Symptom: a
  signed-in user gets 401 from `/api/music` forever, the sign-in wall
  reappears after every sign-in, and the log says *"Refreshing the session
  token resulted in an infinite redirect loop … your Clerk instance keys do
  not match"*. The keys are usually fine — check the clock first. Clerk
  session tokens live **60 seconds**, so a machine more than a minute fast
  reads every freshly minted token as already expired, and each refresh
  produces another dead one. This happened here with the `w32time` service
  stopped and the clock 102s ahead. Diagnose by comparing a `curl -sI`
  `Date:` header against `date -u`; fix with `net start w32time` then
  `w32tm /resync /force` in an **elevated** shell. Only `/api/music` and the
  MCP tools break — lyrics and questions never call `auth()`.
- A stale `netsh portproxy` rule on port 3000 (left by a WSL setup) silently
  swallowed all LAN traffic while `localhost` still worked.

## Environment

See `.env.example` for the full list. The ones that matter:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Auth + OAuth provider |
| `DATABASE_URL` | Neon Postgres — use the **pooled** string. Absent → in-memory |
| `OPENROUTER_API_KEY` | Lyrics + production brief |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` | Managed prompts (US region!) |
| `MUSIC_PROVIDER` + provider key | `mureka` \| `lyria` \| `gpt-audio` \| `elevenlabs` \| `demo` |
| `AUDIO_SIGNING_SECRET` | Signs playback tokens. Falls back to `DATABASE_URL` |
| `BLOB_READ_WRITE_TOKEN` | **Legacy.** Only for takes rendered before audio moved into Postgres |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_SONG_PASS`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_CREDIT_PACK`, `STRIPE_WEBHOOK_SECRET` | Billing |
| `APP_URL` | Absolute URLs in MCP replies and checkout redirects. **Must not be localhost in production** |
| `NEXT_PUBLIC_HERO_VIDEO` | Optional ambient clip behind the landing page |

The app degrades honestly: no OpenRouter key → deterministic demo lyrics; no
Clerk → anonymous demo mode; no Stripe → a calm "billing not configured" state;
no `DATABASE_URL` → in-memory entitlements and songs.

## Testing

`npm test` — the suite covers entitlement maths, the paywall flow, webhook
signature verification and idempotency, route-level gating, reserve/commit
holds (concurrent renders, released holds, expired holds, double-commit), and
source-level guards asserting the invariants above (identity source,
reserve-before-spend ordering, no master leakage). Add to these rather than
trusting manual checks; every pricing bug this app had was caught here first.

The suite runs with no `DATABASE_URL`, against the in-memory backend. The
Postgres path enforces the same rules with row locks inside a transaction —
if you change reserve/commit, exercise it against a real Neon branch too.

## Still open

- **Buy the domain.** It unblocks a production Clerk instance, real OAuth, and
  Stripe live mode. A `*.vercel.app` host can't hold the DNS records.
- **Async renders with a job table.** A 60–90s synchronous request is tolerable
  but limits where it can be called from. The reservation row is most of the
  bookkeeping a job table would need.
- **Sweep expired reservations.** They stop counting once expired, so nothing
  is stranded, but the rows accumulate. A periodic delete is enough.
- The unit economics to hold in mind: each generation costs ~$0.27, and a free
  user can consume 3 of them (~$0.81) before ever paying.

## What earned its keep (carried from V2)

- **The provider abstraction.** Swapping music engines four times cost almost
  nothing because of it.
- **Prompts in Langfuse.** Iterating lyrics quality without deploying was the
  single biggest workflow win.
- **The pure entitlement core.** All the pricing logic living in one
  side-effect-free file is why a complete pricing model change (packs/plus →
  unlock/pro) took one session, and why swapping the entire storage layer for
  Postgres touched `service.ts` but left `logic.ts` alone.
