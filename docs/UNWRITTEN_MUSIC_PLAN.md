# Unwritten Music plan

## Decision log

- First validated genre family: country / folk / acoustic.
- Narrative control: one past-to-present weight plus a separate song intent.
- Names and places: disabled by default and enabled per song in a later approval-screen step.

## Checkpoint 1 — contracts

Status: ready for founder review.

- `story_map.v1` is defined in `lib/story-map.ts`. It is not persisted or used by the live flow yet.
- Twenty approved fictional fixtures live under `tests/fixtures/story-maps/`; the immediate-danger fixture is isolated under `safety/`.
- `core.v1` is defined in `lib/songwriting-core.ts`. It is not published to Langfuse or used by production generation yet.
- No database migration, approval screen, composition-plan provider, or live-flow change belongs to this checkpoint.

## Next checkpoint after approval

Status: staging contracts implemented; production remains unchanged.

1. `country_folk.v1` and `solo.v1` are defined in `lib/songwriting-modules.ts`.
2. `songwriter-assembly.v1` combines an approved Story Map with `core.v1`, `country_folk.v1`, and `solo.v1` in `lib/songwriting-prompt.ts`.
3. The assembly is staging-only and is guarded by tests proving `lib/generate.ts` does not import it.
4. Next: story extraction, the “What I heard” approval screen, and validator v1 before production promotion.

## Checkpoint 3 — story extraction

Status: staging contract implemented; no live route calls it.

- `story-extractor.v1` is defined in `lib/story-map-extraction.ts`.
- Interview text is serialized as quoted JSON data with stable answer IDs.
- Parsed output is always forced to `draft`; the server supplies `story_map_id`.
- Non-`none` interpretive fields require answer evidence, and contradiction flags require at least two answer IDs.
- Next: the “What I heard” approval screen. No songwriting generation may consume the draft until that screen sets it to approved.

## Checkpoint 4 — Story Map approval

Status: staging component implemented; no live route renders it.

- `story-approval.v1` is defined in `lib/story-map-approval.ts`.
- `components/StoryMapReview.tsx` separates supplied details from model interpretations and shows interpretation evidence.
- Names and places remain off by default; writers can list details that must never appear.
- Unresolved contradiction flags disable approval.
- Approval changes a validated draft to `approved`; the staging songwriter still independently enforces approved status.
- Next: validator v1, then a reviewed decision about wiring extraction and approval into the live flow.

## Checkpoint 5 — output validation

Status: staging contracts implemented; production generation remains unchanged.

- `validator.v1` in `lib/song-validator.ts` mechanically checks the exact output envelope, STYLE limits, BPM and key, section labels, required sections, approved cues, exact phrases, exclusions, privacy permissions, clean-language permission, line length, solo-vocal assignments, and prohibited artist names.
- `claims-audit.v1` defines a separate model-assisted audit. Every factual lyric claim must point to direct Story Map support; a null mapping becomes an invention flag.
- Story Map and lyric content are passed to the audit as quoted data, never instructions.
- Mutation tests prove malformed and policy-breaking outputs fail, and a source guard proves the validator is not wired into `lib/generate.ts`.
- Next: review validator findings on fixture-generated songs, then decide whether to wire the staged extraction, approval, songwriter, and validator pipeline into the live flow.

## Checkpoint 6 — staging evaluation gate

Status: deterministic evaluation harness implemented; no production route calls it.

- `song-evaluation.v1` in `lib/song-evaluation.ts` assembles the staged country/folk songwriter, validates its candidate, and runs the claims audit only after mechanical checks pass.
- Model calls are injected adapters, so tests exercise orchestration without spending API credits or depending on a provider.
- Every approved country/folk fixture passes through the complete mocked gate in tests.
- Batch summaries separate mechanical failures from invention-audit failures and cannot become ready for human review while any candidate fails.
- The next checkpoint is a real, version-pinned evaluation run followed by human lyric-quality scoring. Passing that review is required before any live-flow integration.

## Checkpoint 7 — real-model and human review

Status: completed with a blocked promotion decision.

- `tests/song-evaluation.live.test.ts` is an explicit opt-in OpenRouter run. Ordinary tests skip it, preventing accidental paid traffic.
- The run records the served model plus the complete `song-evaluation.v1` report for every approved country/folk fixture.
- `quality-review.v1` scores story fidelity, personal specificity, verse progression, chorus strength, natural language, singability, and production brief from 1–5.
- Human promotion requires every criterion at 3 or higher, story fidelity at 4 or higher, and an average of 4.0 or higher.
- A real run and recorded human scores decide whether the staged pipeline advances to live-flow integration or returns to prompt revision.
- The 2026-08-25 run used six fictional Story Maps with `anthropic/claude-sonnet-4.5`: 0 passed, 3 failed mechanically, and 3 failed the claims audit.
- The evidence and provisional human scores are recorded in `docs/evaluations/country-folk-live-evaluation-2026-08-25.md`.
- Decision: return to prompt revision. Do not wire the staged pipeline into the live flow yet.

## Checkpoint 8 — evidence-based prompt revision

Status: implemented in staging; production remains unchanged.

- `core.v2` requires a silent factuality ledger and treats every unmapped concrete detail as forbidden, even when it would be plausible scene enrichment.
- It specifically prohibits invented times, seasons, ages, dialogue topics, gestures, weather, props, travel details, and another person's behavior.
- `country_folk.v2` targets 90 STYLE words, prohibits curly-brace cues, repeats the exact label vocabulary, and explicitly prohibits `[Verse 3]`.
- `songwriter-assembly.v2` identifies the revised combination for a comparable second evaluation run.
- Next: rerun the same six fictional fixtures through validator, claims audit, and human review. Do not promote unless the complete gate passes.

## Checkpoint 9 — v2 comparison run

Status: completed; promotion remains blocked.

- The same six fictional fixtures were evaluated with `songwriter-assembly.v2`, `core.v2`, and `country_folk.v2` on `anthropic/claude-sonnet-4.5`.
- Complete automated passes improved from 0/6 to 1/6. Mechanical failures improved from 3 to 2; claims-audit failures remained at 3.
- The one automated survivor failed `quality-review.v1` with a 3.71 average and story fidelity of 3.
- Detailed evidence is recorded in `docs/evaluations/country-folk-live-evaluation-v2-2026-08-25.md`.
- Decision: revise again before integration. Production remains unchanged.

## Checkpoint 10 — strict-support prompt revision

Status: implemented in staging; production remains unchanged.

- `core.v3` replaces the visible-ledger instruction with an internal direct-support check and requires `TITLE:` to be the first output.
- Every concrete lyric statement must be directly quotable or paraphrasable from an approved Story Map field, followed by a silent deletion pass for unsupported specifics.
- `country_folk.v3` targets nine words per line and requires Verse 2 to advance through approved change-over-time or current-state wording rather than a new scene.
- `claims-audit.v2` prevents broad emotions and interpretations from being used as evidence for physical actions, objects, quotations, weather, ages, times, or locations.
- `songwriter-assembly.v3` identifies this revision for the next comparable run.
- Next: rerun the same six fictional fixtures. Production integration remains blocked until all automated and human gates pass.

## Checkpoint 11 — v3 comparison run

Status: completed; prompt-only iteration is exhausted.

- The v3 run produced 0/6 complete passes: one mechanical failure and five `claims-audit.v2` failures.
- Mechanical compliance improved, while the stricter auditor exposed unsupported specifics that previous audits mapped too generously.
- Detailed evidence is recorded in `docs/evaluations/country-folk-live-evaluation-v3-2026-08-25.md`.
- Decision: stop adding warning text. The next checkpoint is `source-packet.v1` plus machine-verifiable source references and one bounded repair pass.
- Production remains unchanged and blocked from the staged pipeline.

## Checkpoint 12 — source-grounded draft contracts

Status: implemented in staging; no production route uses it.

- `source-packet.v1` deterministically turns approved Story Map fields into stable `src_XX` atoms while keeping exclusions in non-lyrical controls.
- `grounded-draft.v1` requires every lyric line to cite one or more existing atoms and separates literal, paraphrase, metaphor, and refrain treatments.
- The machine-readable draft is validated before rendering `TITLE`, `STYLE`, and `LYRICS`; source references never reach the music provider.
- `grounded-repair.v1` permits one bounded repair using the full authorized packet, the current draft, flagged excerpts, and failed mechanical checks.
- Unknown source IDs are rejected, and source/repair contracts remain disconnected from `lib/generate.ts`.
- Next: add semantic claim-to-atom verification and orchestrate draft → validate → audit → one repair → final gate in staging.

## Checkpoint 13 — bounded grounded pipeline

Status: implemented in staging; production remains unchanged.

- `grounded-pipeline.v1` runs source packet → grounded draft → mechanical validation → claims audit.
- A failed mechanical check or invention audit receives exactly one `grounded-repair.v1` attempt; the repaired draft must pass both gates again.
- Mechanical failures skip the claims-audit call until repaired, avoiding unnecessary model cost.
- A second failure returns no final song and can never trigger another repair.
- Reports include every prompt/contract version, both attempts, model names, and the final promotion result.
- Source guards prove `lib/generate.ts` does not call the staging pipeline.
- Next: run the same six fictional fixtures through `grounded-pipeline.v1` and perform human quality review on complete survivors.

## Checkpoint 14 — grounded pipeline live evaluation

Status: completed; safety improved, human-quality promotion blocked.

- `grounded-pipeline.v1` passed 4/6 fictional fixtures, versus 0/6 for the strict prompt-only v3 run.
- Two passed on the first draft and two passed after the single repair. Failed repairs returned no song.
- All four automated survivors remained below the `quality-review.v1` 4.0 average requirement.
- Results are recorded in `docs/evaluations/grounded-pipeline-live-evaluation-2026-08-25.md`.
- Decision: keep the grounded architecture, improve atom granularity and natural songwriting quality, then rerun. Langfuse production and the live app remain unchanged.

## Checkpoint 15 — citation precision and naturalness

Status: implemented in staging; production remains unchanged.

- `source-packet.v2` assigns exact, direct-paraphrase, or interpretive citation policies and extracts usable verbatim text from approved named details.
- `grounded-draft.v2` deterministically rejects exact citations that omit their authorized text and literal lines that are not recognizable from any cited atom.
- Natural-grounding examples contrast good paraphrases with invented expansion and awkward field-copying; chorus and Verse 2 quality rules are explicit.
- `grounded-repair.v2` can correct supplied quality concerns while retaining the one-repair limit and source restrictions.
- `grounded-pipeline.v2` records the revised contracts for the next comparable run.
- Next: run the same six fictional fixtures through v2 and compare automated grounding plus human quality against checkpoint 14.

## Checkpoint 16 — grounded pipeline v2 live evaluation

Status: completed; promotion remains blocked.

- `grounded-pipeline.v2` passed 2/6 fictional fixtures; all six needed the one allowed repair.
- Exact-phrase enforcement behaved usefully, but the literal-recognizability check rejected faithful grammatical transformations and reduced the v1 pass rate of 4/6.
- Results are recorded in `docs/evaluations/grounded-pipeline-v2-live-evaluation-2026-08-25.md`.
- Decision: retain exact citations, replace brittle surface-overlap logic, and keep Langfuse production plus the live app unchanged.
- Next: make support validation independent of the model's self-selected treatment label, then rerun the fixed fixture set.

## Checkpoint 17 — treatment-independent support gate

Status: implemented in staging; production remains unchanged.

- `grounded-draft.v3` keeps exact-policy atoms deterministically verbatim and still rejects unknown source IDs.
- Literal, paraphrase, metaphor, and refrain labels no longer decide whether a cited line passes; harmless tense, grammar, and word-order changes proceed to the semantic claims audit.
- The prompt states that treatment labels describe a writing move and cannot authorize unsupported facts.
- `grounded-repair.v3` retains the one-repair ceiling and the same source restrictions.
- `grounded-pipeline.v3` records the revised contracts for the next fixed-fixture comparison.
- Next: verify locally, then rerun the same six fictional Story Maps before considering any production integration.

## Checkpoint 18 — grounded pipeline v3 live evaluation

Status: completed; automated recovery confirmed, promotion remains blocked.

- `grounded-pipeline.v3` passed 4/6 fictional fixtures, recovering from v2's 2/6 and matching v1's 4/6.
- All six drafts used the one repair. `sm_05_tomorrow_call` retained an invented action, while `sm_14_closed_diner` still missed an exact phrase.
- Empty optional Intro/Outro arrays discovered during the run are now safely omitted; required empty sections remain invalid.
- Results are recorded in `docs/evaluations/grounded-pipeline-v3-live-evaluation-2026-08-25.md`.
- Production and Langfuse remain unchanged.
- Next: perform the fixed human quality review on the four automated survivors.

## Checkpoint 19 — preserved-output quality and stability review

Status: completed; quality and stability both block promotion.

- A preserved-output repeat of the same v3 evaluation passed only 1/6, compared with 4/6 in checkpoint 18.
- The lone survivor scored 3.43/5 and failed fidelity plus progression requirements.
- Its strongest element was the concrete radio hook; its main defects were temporal overgeneralization, a repetitive Verse 2, generic chorus support, and a STYLE fade-out that contradicted the default exclusions.
- Results are recorded in `docs/evaluations/grounded-pipeline-v3-quality-review-2026-08-25.md`.
- Production and Langfuse remain unchanged.
- Next: implement temporal-scope guards, Verse 2 progression checks, and mechanical STYLE ending/exclusion checks before another repeated evaluation.

## Checkpoint 20 — quality-derived mechanical guards

Status: implemented in staging; production remains unchanged.

- `grounded-draft.v4` rejects unauthorized temporal and frequency broadening such as `always`, `every`, `now`, and `these days` when cited atoms do not contain that scope.
- Verse 2 must cite the approved present feeling or change-over-time atom.
- Every Chorus and Final Chorus must cite the approved chorus message or an exact hook.
- `validator.v2` requires an explicit final sound using `end on`/`ends with` language and rejects affirmative fade directions.
- `grounded-repair.v4` explicitly preserves temporal scope and the one-repair ceiling.
- `grounded-pipeline.v4` records the revised contracts; production and Langfuse remain disconnected.
- Next: run repeated preserved-output evaluations and require both grounding stability and human quality before promotion.

## Checkpoint 21 — v4 threshold evaluation

Status: completed; threshold rejected and corrected.

- The first v4 preserved-output run passed 0/6 because the deterministic temporal guard treated semantically supported `now`, `these days`, and `never disappears` language as automatic inventions.
- The guard now keeps strict frequency inflation checks for `always`, `every`, `each`, and `whenever`, while present-transition wording is allowed when current-state or change-over-time atoms authorize it.
- A corrected run still passed 0/6; most final failures came from the model auditor rejecting or misreading approved source details rather than from the mechanical gate.
- A second repeated run was intentionally skipped to avoid spending model calls on a known audit defect.

## Checkpoint 22 — Langfuse staging connection and citation-aware audit

Status: implemented; production remains unchanged.

- Created three independent Langfuse chat prompts: `unwritten-grounded-draft`, `unwritten-grounded-repair`, and `unwritten-claims-audit`.
- All carry only the `staging` label. The live app continues to fetch only `production`, so these versions cannot affect users.
- The live evaluation harness can opt into the Langfuse staging label and reports each fetched prompt version.
- `claims-audit.v3` receives the authorized Source Packet plus the grounded draft's per-line `source_ids`; it may validate a claim only against atoms cited by that line.
- Exact phrases and allowed details are explicitly recognized as authorized when their cited atom and text match.
- Langfuse staging v2 contains the tested citation-aware versions. Next: run a preserved-output evaluation directly from these Langfuse staging prompts.

## Checkpoint 23 — Langfuse staging v2 evaluation

Status: completed; staging v2 rejected.

- The evaluation confirmed all three Langfuse `staging` prompts served version 2.
- Pipeline v5 passed 0/6 fictional fixtures; all six used repair and none survived it.
- Four repairs failed precise mechanical feedback, one missed an exact phrase, and one retained several invented claims.
- Results are recorded in `docs/evaluations/grounded-pipeline-v5-langfuse-staging-2026-08-26.md`.
- No `production` labels were changed and the live app remains unaffected.
- Next: strengthen the bounded repair prompt with an explicit final exact/scope/invention checklist, upload a new staging version, and rerun.

## Checkpoint 24 — Langfuse staging v3 evaluation

Status: completed; measurable improvement, human promotion blocked.

- The repair checklist shipped in Langfuse staging v3 and pipeline v6 passed 2/6 fictional fixtures, improving over staging v2's 0/6.
- Both survivors used repair. Human scores were 3.57 and 3.71; neither reached the 4.0 gate or fidelity minimum.
- Remaining defects are unsupported continuing-presence language, absolute claims, inferred emotional effects, and generic metaphor replacement.
- Results are recorded in `docs/evaluations/grounded-pipeline-v6-langfuse-staging-v3-2026-08-26.md`.
- Production remains unchanged.
- Next: tighten citation-aware audit rules for absolutes, continuing effects, and inferred effects on people, then upload and test a new staging version.

## Checkpoint 25 — Langfuse staging v4 evaluation

Status: completed; audit improved, prompt-only mechanical repair rejected.

- Langfuse staging v4 and pipeline v7 passed 0/6 fictional fixtures.
- The stricter auditor correctly caught unsupported continuing claims and inferred effects.
- Five final failures were mechanical or precisely localizable; repeated repair instructions still did not reliably fix them.
- Results are recorded in `docs/evaluations/grounded-pipeline-v7-langfuse-staging-v4-2026-08-26.md`.
- Production remains unchanged.
- Next: add deterministic pre-repair normalization for exact text, unauthorized scope terms, and STYLE length; keep the single model repair for semantic and quality defects.

## Checkpoint 26 — deterministic mechanical normalization

Status: completed; mechanical reliability improved, semantic and quality gates remain blocked.

- `grounded-normalizer.v1` restores missing cited exact text, removes explicitly unauthorized frequency/transition terms, and constrains STYLE to 110 words while retaining tempo/key, ending, and exclusion sentences.
- Pipeline v8 reused Langfuse staging v4 and improved from 0/6 to 1/6.
- No final failure was mechanical; remaining failures came from semantic inventions or audit errors.
- The auditor falsely rejected two exact approved lines despite correct exact-policy citations.
- The lone survivor scored 3.43 and failed human quality.
- Results are recorded in `docs/evaluations/grounded-pipeline-v8-normalized-2026-08-26.md`.
- Production remains unchanged.
- Next: reconcile audit flags against exact-policy citations deterministically, without weakening semantic invention checks.

## Checkpoint 27 — deterministic audit reconciliation

Status: implemented in staging; production remains unchanged.

- `claims-reconciliation.v1` in `lib/song-validator.ts` deterministically re-examines each invention flag after `claims-audit.v4` parsing.
- A flag is cleared only when its `lyric_excerpt` matches exactly one distinct grounded line, that line cites an atom with `citationPolicy: "exact"`, the line contains the atom's `verbatim` text under the same case/punctuation normalization the mechanical gate uses, and the flagged excerpt lies entirely inside that verbatim text.
- An exact atom cited on a different line clears nothing; unrelated semantic additions on the same line stay blocking; approximate text never counts as verbatim; unknown or multi-line-ambiguous excerpts remain blocking.
- `grounded-pipeline.v9` records the raw audit and the reconciliation separately, decides passage from reconciliation, and hands the repair prompt only the flags reconciliation left blocking. The one-model-repair limit is unchanged.
- Unit tests cover the clearing case, the wrong-line case, the mixed-line case, approximate text, the unknown excerpt, the ambiguous excerpt, and refrain repetition; the pipeline test proves a provable false positive no longer spends the repair.
- Langfuse staging prompts are unchanged (reconciliation is code, not prompt text) and no `production` label was touched.
- Next: rerun the preserved-output evaluation with pipeline v9 once these deterministic gates are reviewed.

## Checkpoint 28 — pipeline v9 evaluation

Status: completed; reconciliation validated, pass count blocked by spent repairs.

- Pipeline v9 on Langfuse staging v4 passed 0/6; all six used the single repair.
- Reconciliation cleared exactly the defect it targeted: the auditor again rejected the cited exact phrase `you still tell me when to brake`, and the deterministic check overruled it. No other flag was cleared, so semantic strictness was preserved.
- Four of six first drafts failed mechanically on STYLE ending/fade rules and spent their one repair there; every second attempt was mechanically clean but then met the audit with no repair left.
- The drop from v8's 1/6 is within the documented preserved-output variance and does not measure reconciliation.
- Results are recorded in `docs/evaluations/grounded-pipeline-v9-reconciliation-2026-08-26.md`.
- Production and Langfuse `production` labels remain unchanged.
- Next: extend the deterministic normalizer to repair STYLE ending and fade defects before validation, keeping the model repair for semantic work only.

## Checkpoint 29 — STYLE ending normalization and model change

Status: implemented in staging; production remains unchanged.

- `grounded-normalizer.v2` deterministically removes STYLE sentences that direct a fade and appends a neutral explicit final sound (`End on a single held chord.`) when no `end on`/`ends with` sentence remains, using the same patterns as `validator.v2`. The single model repair is preserved for semantic work.
- `grounded-draft.v5` states the STYLE ending rule up front — name the exact final sound, never direct a fade — so first drafts stop producing the defect that burned four of six repairs in the v9 run. `grounded-repair.v7` targets the v5 contract.
- The evaluation model changed to `deepseek/deepseek-v4-pro`, pinned in the Langfuse staging prompt configs (`reasoning: false`, generous maxTokens per the DeepSeek house rule). The live harness now honors the staging config model with priority config → env and logs the served model per prompt.
- Langfuse staging now serves `unwritten-grounded-draft` v6 (grounded-draft.v5), `unwritten-grounded-repair` v6 (grounded-repair.v7), and `unwritten-claims-audit` v5 (claims-audit.v4, deepseek config). Only the `staging` label was written.
- `grounded-pipeline.v10` records the revised contracts. Unit tests cover fade removal, ending appending, the double defect, and the untouched compliant STYLE.
- Production, the live app, and all Langfuse `production` labels remain unchanged.
- Next: run the preserved-output evaluation on pipeline v10 — noting it changes two variables against v9 (model and STYLE normalization), so read results as a new baseline rather than a controlled comparison.

## Checkpoint 30 — v10 DeepSeek baseline

Status: completed; STYLE fix validated, new mechanical surface exposed.

- Pipeline v10 on DeepSeek v4 Pro passed 1/6; the survivor `sm_05_tomorrow_call` had never passed before and used its one repair.
- The v9 defect is gone: zero STYLE ending/fade failures across twelve attempts. Reconciliation correctly cleared nothing (no exact-phrase false positives occurred).
- DeepSeek introduced new mechanical omissions the normalizer does not cover: missing key on three first drafts and missing BPM on `sm_14_closed_diner` in both attempts — the model repair failed a precise BPM instruction twice, re-confirming that mechanical repair cannot be prompted into reliability.
- Remaining failures are semantic continuing-presence and scope flags, concentrated in `sm_11_blanket_fort` and `sm_17_driving_roles`.
- Results are recorded in `docs/evaluations/grounded-pipeline-v10-deepseek-2026-08-26.md`. Production remains unchanged.
- Next candidates: deterministic BPM/key defaulting in the normalizer, then an auditor-model A/B via the per-prompt staging configs.

## Checkpoint 31 — deterministic tempo/key defaulting

Status: implemented in staging; production remains unchanged.

- `grounded-normalizer.v3` appends the house reference values (`82 BPM`, `G major`) when STYLE omits a valid tempo or key, using the same patterns as `validator.v2`. An out-of-range BPM counts as missing and gets a valid default appended rather than rewritten.
- Tempo, key, ending, and fade defects — every STYLE omission the v9 and v10 runs burned repairs on — are now fixed deterministically before validation. The single model repair is reserved for structural and semantic failures.
- The pipeline test proving the repair path now uses a missing required section (unnormalizable); a new test locks in that STYLE omissions pass first-attempt without spending the repair.
- `grounded-pipeline.v11` records the revised contracts. No prompt text changed, so Langfuse staging is untouched (draft v6, repair v6, audit v5, all deepseek).
- Production, the live app, and all Langfuse `production` labels remain unchanged.
- Next: rerun the preserved-output evaluation on pipeline v11 — a controlled comparison against v10, since only the normalizer changed.

## Checkpoint 32 — malformed-draft resilience

Status: implemented in staging; production remains unchanged.

- The first v11 evaluation attempt crashed mid-run: DeepSeek returned a malformed draft JSON for `sm_14_closed_diner` and `parseForPipeline` only caught citation errors, so the raw `SyntaxError` killed the run after four fixtures with no artifact written.
- `grounded-pipeline.v12` treats a malformed completion as a failed attempt, never a crash: it becomes a failed `draft.parse` mechanical check, the raw text is validated (its envelope fails too), and the one repair receives the quoted raw output plus the parse failure so it can rebuild a valid object. A malformed second attempt fails cleanly with no song.
- The repair system text is unchanged (`grounded-repair.v7`), so Langfuse staging is untouched; only the deterministic user-prompt payload gained the malformed-text form.
- Tests cover the repaired malformed draft, the doubly-malformed clean failure, and that the audit is never called on an unparsed draft.
- Production, the live app, and all Langfuse `production` labels remain unchanged.
- Next: rerun the full six-fixture evaluation on pipeline v12 (normalizer v3 + resilience) against Langfuse staging.

## Checkpoint 33 — v12 evaluation: mechanical program complete

Status: completed; failure surface moved entirely to the auditor.

- Pipeline v12 passed 1/6 with `sm_05_tomorrow_call` surviving after repair — the same survivor as v10, now stable across two runs.
- Zero mechanical failures across all twelve attempts (v10 had five STYLE omissions burning repairs). Every attempt reached the claims audit; every failure is now semantic.
- Reconciliation cleared nothing: none of the 22 flags involved exact-policy text, which deterministic reconciliation is scoped to.
- Fixture sampling shows the DeepSeek auditor mixes genuine inventions with plausible direct paraphrases of cited atoms mapped to null — auditor judgment is now the binding constraint on the pass rate.
- Results are recorded in `docs/evaluations/grounded-pipeline-v12-mechanical-clean-2026-08-26.md`.
- Production, the live app, and all Langfuse `production` labels remain unchanged.
- Next: the auditor-model A/B — config-only staging push switching `unwritten-claims-audit`'s model while draft and repair stay on DeepSeek, then the same six fixtures.

## Checkpoint 34 — auditor A/B

Status: completed; Sonnet retained as auditor, draft side is the open variable.

- Sonnet auditing DeepSeek drafts passed 2/6 versus 1/6 for DeepSeek auditing itself; survivors `sm_02_silent_drive` and `sm_17_driving_roles`, both after repair.
- The Sonnet auditor was more accurate in both directions: it passed fixtures DeepSeek blocked and caught real inventions in `sm_05_tomorrow_call` that the DeepSeek auditor had let through — the v12 baseline's lone pass was partly an audit miss.
- Deterministic reconciliation converted `sm_17`'s final failure into a pass by clearing the auditor's lone false flag on the cited exact phrase — the contract's target scenario, observed live.
- DeepSeek's drafts are now the binding constraint: `sm_14` drew 9–10 flags per attempt for invented scene props.
- Results are recorded in `docs/evaluations/grounded-pipeline-v12-auditor-ab-2026-08-26.md`.
- Production and all Langfuse `production` labels remain unchanged.
- Next: config-only staging push returning draft and repair to `anthropic/claude-sonnet-4.5` (full-Sonnet on the modern deterministic stack — never yet evaluated), then the same six fixtures.

## Checkpoint 35 — full-Sonnet run and reconciliation v2

Status: implemented in staging; production remains unchanged.

- Full Sonnet on the modern stack passed 2/6, including the project's first first-attempt zero-flag pass (`sm_14_closed_diner`) plus `sm_05_tomorrow_call` after repair.
- The run exposed two compounding defects around required exact phrases:
  - `claims-reconciliation.v1` blocked `sm_17`'s provably authorized hook because it rendered in two textual variants — refrain variants read as ambiguity. `claims-reconciliation.v2` clears a flag when every matching line independently carries its own exact-citation proof; any unproven candidate still blocks, excerpts wider than the verbatim still block.
  - The repair deleted `sm_01`'s flagged line carrying the required `take your time` verbatim, which the validator then failed mechanically. `grounded-repair.v8` (Langfuse staging v8) forbids removing exact-phrase text — flagged lines with a verbatim are rewritten around it.
- `grounded-pipeline.v13` records both. Results in `docs/evaluations/grounded-pipeline-v12-full-sonnet-2026-08-26.md`.
- Production and all Langfuse `production` labels remain unchanged.
- Next: rerun the six fixtures on pipeline v13 with staging draft v7 / repair v8 / audit v6, all Sonnet.

## Checkpoint 36 — v13 evaluation and first quality-gate passes

Status: completed; two songs meet the full quality gate for the first time.

- Pipeline v13 passed 3/6 — the best automated result in the project (trajectory 0→1→1→2→2→3). Survivors `sm_01_birthday_kitchen`, `sm_02_silent_drive`, `sm_14_closed_diner`, each after one repair with zero remaining flags.
- Both checkpoint-35 fixes verified live: the repair preserved `sm_01`'s required `take your time`, and reconciliation v2 cleared the `sm_17` refrain-variant flag that v1 blocked.
- Provisional `quality-review.v1` scores: `sm_14` 4.14 and `sm_02` 4.00 pass the complete gate (all criteria ≥3, fidelity ≥4, average ≥4.0) — no generated song had ever reached it (previous best 3.71). `sm_01` fails at 3.14 on chorus and natural language.
- Results and full lyrics are in `docs/evaluations/grounded-pipeline-v13-2026-08-26.md`.
- Production, the live app, and all Langfuse `production` labels remain unchanged.
- Next: founder review of the two gate-passing songs and a decision on repeated-run stability testing before any live-flow integration.

## Checkpoint 37 — production integration behind a feature flag

Status: implemented; founder approved moving to production; flag defaults OFF.

- The grounded flow is wired into the live app end to end, gated by `GROUNDED_FLOW` (server) and `NEXT_PUBLIC_GROUNDED_FLOW` (client). Both unset by default: the classic guide/generator flow is byte-for-byte unchanged and the grounded routes answer 404.
- `story_maps` persistence: new table (migration `0010`) with the standard in-memory fallback; the server-generated `sm_<uuid>` id is the capability, matching the anonymous flow's trust model.
- Routes: `POST /api/story-map` extracts a draft map (`story-extractor.v1`, no deterministic fallback — same honesty rule as questions); `POST /api/story-map/approve` performs the approval server-side (draft precondition, contradiction gate, server-owned id and status — writer edits to their own story are accepted); `POST /api/grounded-lyrics` runs the bounded pipeline from an APPROVED map only, returns TITLE/STYLE/LYRICS in the classic shape so the Music step and paywall are untouched.
- CreateFlow renders `StoryMapReview` between Questions and Lyrics when the flag is on; retry and "another take" stay grounded once a story is approved. `lib/generate.ts` remains import-free of all grounded modules (guard tests updated and extended).
- Prompts fetch by `production` label with byte-identical in-repo fallbacks. With founder approval, `production` labels were applied to the validated versions via `scripts/promote-grounded-prompts.mjs` and verified resolving: draft v7 (`grounded-draft.v5`), repair v8 (`grounded-repair.v8`), audit v6 (`claims-audit.v4`), all pinned to `anthropic/claude-sonnet-4.5`.
- Tests: 345 passing, including flag-off 404s, server-side approval enforcement, approved-only generation, and the updated isolation guards.
- Next: apply the DB migration to Neon, then set `GROUNDED_FLOW=1` and `NEXT_PUBLIC_GROUNDED_FLOW=1` in the deployment when ready to expose the flow.
