# Unwritten: Product Evaluation and End-to-End Plan

## Executive verdict

Yes, this product is technically possible. The current repository is already a credible working prototype: a user can begin from a blank thought or one of ten templates, optionally describe feelings and context, select songwriting controls, generate editable lyrics, and generate either a local demo sketch or real audio through a configured music provider.

The prototype proves the interaction model. It is not yet a production-ready consumer product. The largest remaining risks are not whether the screens can be built; they are music-provider reliability and rights, privacy and consent for sensitive writing, output quality, operating cost, abuse controls, and proving that people return after the novelty of their first song.

Recommendation: proceed with a narrow private beta. Do not launch broadly until real-provider quality, consent, deletion/retention behavior, observability redaction, rate limits, and cost controls have been tested with real users.

## Product thesis

Unwritten turns a thought, memory, or feeling into a song through a low-pressure creative flow. It is a creative-expression product, not therapy and not a mental-health diagnostic tool.

The strongest promise is:

> Put a moment into words. Shape it into lyrics. Hear what it could become.

The product should serve two user states:

1. “I know what I want to say.” The user starts with freeform writing.
2. “I feel something, but I do not know how to begin.” The user selects one of ten templates and edits the prefilled thought and feelings.

Feelings must always remain optional. The minimum viable input is a short thought.

## Evaluation of the current prototype

### What is strong

- The four-step flow—Write, Shape, Lyrics, Music—matches the user’s mental model.
- Freeform and template entry modes solve both confident and blocked starting states.
- Exactly ten templates keep choice useful without creating an endless gallery.
- Generated lyrics are editable, which preserves user authorship and gives the AI a collaborative role.
- The app remains demonstrable without credentials through deterministic lyric generation and a clearly labeled instrumental sketch.
- Secrets are handled server-side, inputs are validated, and the provider layer separates language generation from audio generation.
- Session-only draft storage is a sensible privacy-first prototype default.
- OpenRouter is correctly used for language tasks, while actual music is delegated to a music provider.
- Langfuse integration provides a route to prompt versioning and quality experiments.
- The current test suite covers core contracts, validation, mock generation, prompt parsing, crisis-language boundaries, and API behavior.

### What is incomplete or risky

- The demo sketch is not a finished song and does not include sung vocals. User expectations must stay explicit.
- Real music generation depends on a separate provider. Latency, pricing, content rules, commercial rights, availability, and vocal quality require provider-specific validation.
- The current synchronous audio/data-URL design will become fragile for long tracks and concurrent traffic. Production should use asynchronous jobs and object storage.
- Langfuse traces may contain intimate writing. Full raw prompts should not be logged by default without explicit consent and a documented retention policy.
- There is no account, project library, durable save, cross-device access, deletion workflow, billing, quota system, moderation system, or administrative support tooling.
- Narrow crisis-language detection is useful as a gentle intervention, but it is not a safety system and must not be represented as one.
- Quality has been validated technically, not yet with target users. The essential unknown is whether the lyrics feel personally true rather than generically “AI-written.”
- The product needs clear terms covering user ownership, generated-content rights, provider rights, prohibited uses, minors, impersonation, copyrighted lyrics, and voice cloning.
- Accessibility needs a deliberate audit beyond keyboard focus and contrast: screen readers, reduced motion, error announcements, mobile zoom, and audio transcripts/lyrics synchronization.

## Feasibility by subsystem

| Subsystem | Feasibility | Notes |
| --- | --- | --- |
| Thought/template intake | High | Already implemented; straightforward to refine. |
| Lyric generation | High | OpenRouter can route to capable text models. Quality depends heavily on prompt design and evaluation. |
| Prompt management | High | Langfuse is suitable for versioning, traces, and experiments, subject to privacy controls. |
| Instrumental demo | High | Already available locally, but it is only a product demonstration. |
| Full song generation | Medium–High | Requires a dedicated music provider. Provider terms, cost, queue time, and quality are the main constraints. |
| Sung vocals | Medium | Provider dependent; identity and voice-cloning safeguards are required. |
| Production scale | Medium | Requires asynchronous jobs, storage, quotas, abuse controls, monitoring, and billing. |
| Emotional safety | Medium | Good copy and escalation resources are feasible; the app must avoid claiming clinical protection. |

## Proposed customer experience

### 1. Arrival

The landing page explains the outcome with one primary action: **Start with a thought**. A secondary action opens **Choose a starting point**. It clearly states that feelings are optional and that the product is creative expression rather than therapy.

### 2. Write

Freeform mode asks:

- “What is on your mind?”—required, with a short minimum length.
- “How does it feel?”—optional, using a few selectable feeling chips plus optional text.
- “Any detail you want the song to remember?”—optional context such as a place, person, phrase, or moment.

Template mode presents ten scan-friendly themes. Selecting one prefills a starter thought, associated feelings, and suggested musical direction. Everything remains editable. Selecting a template should never lock the user into its wording.

### 3. Shape

Use progressive disclosure. Show only the most influential controls first:

- Genre
- Mood/energy
- Perspective

Place lyrical style, structure, and explicit-language preference under an optional “Fine-tune” section. Show a short natural-language summary before generation.

### 4. Lyrics

Generate a title and structured lyrics. Let the user:

- Edit any line directly
- Request another take
- Ask for a targeted revision, such as “make the chorus simpler”
- Copy or download lyrics
- Compare the latest take with the prior take

The system should preserve user-specific details while avoiding invented personal facts. The interface should label demo output and provider-generated output accurately.

### 5. Music

Translate the approved lyrics and controls into a production brief, display a concise version for review, and then create music. Real generation should run as an asynchronous job with states for queued, composing, rendering, ready, and failed. Users should be able to leave and return without losing a job.

The result should support playback, lyrics viewing, regeneration, download where provider terms allow it, and a clear statement of usage rights.

### 6. Return loop

After a successful song, offer **Make another version**, **Start a new song**, and—only after accounts exist—**Save to my songs**. Do not force signup before the user experiences the first result.

## Technical architecture

### Prototype architecture to retain

- Next.js App Router, React, and strict TypeScript
- Zod validation shared across client and server boundaries
- Server-only OpenRouter and provider credentials
- A provider interface for audio generation
- Deterministic demo mode for development and evaluation
- Langfuse-managed prompt fallback to versioned local prompts

### Production architecture to add

1. **Web application:** Next.js frontend and server/API layer.
2. **Authentication:** passwordless email or trusted OAuth, introduced after first-value experience.
3. **Database:** users, song projects, lyric versions, generation jobs, provider metadata, consent records, and deletion state. Store sensitive fields encrypted where practical.
4. **Job queue:** enqueue music generation, retry transient failures with idempotency keys, and expose job status.
5. **Object storage:** signed URLs for generated audio; lifecycle policies should remove abandoned files automatically.
6. **LLM gateway:** OpenRouter for lyrics and production-brief construction, with model allowlists, timeouts, structured output, fallbacks, and spend limits.
7. **Prompt operations:** Langfuse for versioned prompts and experiments. Default telemetry should use redacted or hashed input attributes; raw-content tracing requires explicit opt-in.
8. **Music adapters:** retain a common provider contract so providers can be evaluated or replaced without rewriting the product flow.
9. **Safety layer:** input/output policy checks, rate limits, reporting, provider-policy enforcement, and a non-blocking support-resource UI for narrowly detected crisis language.
10. **Observability:** latency, error class, provider, model, prompt version, cost, queue time, and quality feedback—without leaking raw personal content into routine logs.

## Data and privacy plan

Classify thoughts, feelings, names, memories, lyrics, and audio as sensitive user content.

- Collect only data needed to generate and save a song.
- Keep anonymous drafts in session storage during the prototype/beta.
- Before every third-party generation, disclose which data leaves the browser and why.
- Do not enable raw Langfuse traces by default in production. Redact personal text or require informed opt-in.
- Publish retention periods for prompts, provider requests, generated audio, logs, and deleted projects.
- Provide export and permanent deletion controls before introducing accounts broadly.
- Never use private writing for model training unless the user gives separate, revocable, explicit consent.
- Review every provider’s data use, retention, training, regional processing, and commercial-output terms.
- Add age requirements and a minors policy before public launch.

## Safety and trust plan

- Maintain the framing of creative expression—not treatment, diagnosis, or crisis care.
- Keep feelings optional and avoid manipulative prompts that pressure disclosure.
- Continue narrow crisis-language handling with a gentle, localized resource message that never claims the app assessed the user.
- Add report controls for harmful or infringing outputs.
- Block non-consensual voice cloning and deceptive impersonation.
- Add safeguards against requests to imitate living artists too closely; convert them into descriptive musical attributes.
- Detect and reject requests to reproduce copyrighted lyrics verbatim beyond permitted limits.
- Document how user edits, AI contributions, and provider terms affect ownership and commercial use.
- Conduct legal review before monetization or public release.

## Quality and evaluation framework

Create a versioned evaluation set representing the real product surface:

- Freeform versus template starts
- Minimal versus detailed input
- Optional feelings omitted versus included
- Joy, grief, love, anger, nostalgia, ambiguity, and mixed emotions
- Multiple genres, perspectives, structures, and clean/explicit preferences
- Inputs containing names and personal details
- Adversarial, copyrighted, impersonation, and crisis-adjacent cases

Score each lyric result on a 1–5 rubric:

1. Personal-detail fidelity
2. Emotional alignment without diagnosis
3. Specificity and freshness
4. Song structure and singability
5. Respect for requested controls
6. Absence of fabricated facts
7. Safety and policy compliance

Score music on:

1. Alignment with the approved lyrics and production brief
2. Audio quality
3. Vocal intelligibility, if applicable
4. Genre and mood adherence
5. Structural coherence
6. Generation latency and failure rate
7. User preference in blinded comparisons

Run automated checks on every change and human/blinded evaluations on prompt or model changes. Langfuse experiments should compare prompt versions against the same frozen dataset. Never promote a prompt solely because it produces longer or more ornate lyrics.

## Metrics

### North-star candidate

**Meaningful song completion rate:** the percentage of new creation sessions that produce a song the user plays and then saves, downloads, shares, or positively rates.

### Funnel metrics

- Landing → creation start
- Creation start → valid thought entered
- Write → lyric generation
- Lyric generation → meaningful edit or positive rating
- Lyrics → music generation
- Music generation success and time to first playback
- Save/download/share rate
- Seven-day return rate

### Guardrail metrics

- Generation failure and retry rate
- p50/p95 lyric and music latency
- Cost per completed song
- Safety-trigger precision from reviewed samples
- Report rate and upheld-report rate
- Deletion completion time
- Raw sensitive-content exposure in logs: target zero by default

## Delivery plan

### Phase 0: Validate the prototype (1–2 weeks)

- Conduct structured walkthroughs with 8–12 target users.
- Test both entry modes and observe where people hesitate.
- Ask users to rate personal truth, lyric quality, control, safety, and likelihood of returning.
- Audit the interface on mobile, keyboard, screen reader, reduced motion, and slow connections.
- Fix any misleading “generate music” language when only demo audio is active.
- Establish the first frozen lyric evaluation set and scoring rubric.

Exit criteria: users understand the product without explanation; at least 70% complete lyrics; no critical accessibility or misleading-output issue remains.

### Phase 1: Private real-audio alpha (2–4 weeks)

- Configure one contractually acceptable real music provider.
- Replace synchronous generation with a job model if provider latency regularly exceeds normal request limits.
- Add provider timeouts, cancellation, idempotency, retry rules, and cost caps.
- Create a rights/usage disclosure beside generation and download.
- Redact Langfuse and application telemetry by default.
- Add rate limiting, abuse controls, and structured error reporting.
- Compare at least two lyric models/prompts and music configurations using the frozen evaluation set.

Exit criteria: at least 90% successful music jobs, transparent rights messaging, controlled cost per song, and no raw private writing in routine logs.

### Phase 2: Private beta and retention test (3–6 weeks)

- Add optional accounts after the first generated result.
- Add song library, lyric version history, durable job recovery, export, and permanent deletion.
- Add thumbs-up/down plus reason codes for lyrics and music.
- Add targeted lyric revisions instead of only full regeneration.
- Instrument the complete funnel and cohort retention.
- Run weekly quality review of poor ratings and provider failures.

Exit criteria: a defined segment shows repeat use, positive quality ratings are stable, deletion/export work reliably, and unit economics fit the intended pricing.

### Phase 3: Paid beta (4–8 weeks)

- Introduce credits or subscription limits tied to real generation cost.
- Add billing, receipts, quota display, refunds/failure credit restoration, and fraud controls.
- Complete legal review, terms, privacy policy, provider agreements, age policy, and support procedures.
- Add background processing, storage lifecycle rules, operational dashboards, alerts, and incident runbooks.
- Test a limited sharing flow with private-by-default links and explicit publication consent.

Exit criteria: healthy gross margin at expected usage, reliable support/incident handling, acceptable retention, and no unresolved high-risk legal or privacy issue.

### Phase 4: Public launch

- Scale only after a launch-readiness review covering capacity, cost ceilings, moderation, privacy requests, accessibility, support, and provider failover.
- Roll out gradually with quotas and a kill switch for expensive or unsafe generation paths.
- Continue prompt/model changes through evaluations and controlled experiments.

## Immediate engineering backlog

### Highest priority

- Test the current experience with real users before adding broad functionality.
- Correct any text-encoding/mojibake issue observed outside UTF-8 environments.
- Add explicit provider/mode labeling at every music-generation action and result.
- Decide whether Langfuse will receive redacted content, sampled raw content with opt-in, or metadata only.
- Validate ElevenLabs Music access, output rights, latency, maximum duration, and failure behavior with the actual account.
- Add request rate limits and payload-size limits to generation endpoints.
- Add AbortController timeouts to upstream calls and user-facing cancellation.
- Add browser-level end-to-end tests for freeform, template, demo lyrics, editing, demo audio, reset, and restoration.

### Before storing user projects

- Choose authentication, database, storage, and queue infrastructure.
- Define a data map and retention/deletion policy.
- Encrypt or otherwise protect sensitive stored content.
- Add export, delete, consent records, and audit events.
- Ensure provider and observability systems honor deletion requirements where possible.

### Before charging users

- Add cost accounting per model/provider request.
- Add quotas, idempotent billing, failure refunds, fraud prevention, and spend alerts.
- Display commercial-use limitations and provider-specific rights.
- Complete security, privacy, legal, and accessibility reviews.

## Key decisions that need an owner

1. Who is the first target user: personal journaler, songwriter, gift creator, or social creator?
2. Is the core outcome editable lyrics, a finished vocal song, or both?
3. Which music provider has acceptable quality, rights, price, latency, and API reliability?
4. Will anonymous use remain available after launch?
5. What content is allowed in Langfuse, application logs, and support tooling?
6. Who owns generated output, and what commercial use can the product promise?
7. What is the first paid unit: songs, credits, subscription, or a hybrid?
8. Which countries and age groups will the first release support?

## Suggested build/no-build decision

Build the private beta if the team can secure a suitable music provider and commit to privacy-first telemetry. Do not invest heavily in accounts, social feeds, or growth features until user research shows that people value and revisit the finished result.

The near-term proof should be behavioral: can a person create a song that feels recognizably theirs, and do they want to create another one? If the answer is yes at an acceptable generation cost, the product has a credible path forward.

## Questions for reviewing AI agents

Ask reviewers to challenge this document with evidence and provide concrete alternatives:

1. What critical product assumption is missing or weak?
2. Is the separation between OpenRouter, Langfuse, and the music provider technically correct?
3. Which architecture decision will fail first under real traffic?
4. What privacy or legal risk is understated?
5. What should be removed from the MVP?
6. What experiment would invalidate the product fastest and least expensively?
7. Are the phase exit criteria measurable and sufficiently strict?
8. Which music-provider evaluation criteria or fallback strategies are missing?
9. Does the safety design respect users without presenting the app as therapy?
10. What would you change before allowing the first 100 real users in?
