# Country / folk live evaluation — 2026-08-25

## Versions

- Story Map: `story_map.v1`
- Songwriter assembly: `songwriter-assembly.v1`
- Core: `core.v1`
- Genre: `country_folk.v1`
- Vocal: `solo.v1`
- Mechanical validator: `validator.v1`
- Claims audit: `claims-audit.v1`
- Human rubric: `quality-review.v1`
- Served songwriter and auditor model: `anthropic/claude-sonnet-4.5`

The run used six fictional approved Story Maps. No real user account data was sent.

## Gate result

Promotion decision: **blocked — revise prompts and rerun**.

| Story Map | Mechanical | Claims audit | Primary finding |
| --- | --- | --- | --- |
| `sm_01_birthday_kitchen` | Fail | Not run | STYLE exceeded 110 words |
| `sm_02_silent_drive` | Fail | Not run | Unsupported `{engine cuts}` cue |
| `sm_05_tomorrow_call` | Pass | Fail | Invented call time, conversation, clock, and aftermath details |
| `sm_11_blanket_fort` | Pass | Fail | Invented string, stories, flashlight, and shadow actions |
| `sm_14_closed_diner` | Fail | Not run | Unsupported `[Verse 3]` and several visibly invented timeline details |
| `sm_17_driving_roles` | Pass | Fail | Invented age, softened voice, mirror/truck exchange, and rain |

Batch summary: 0 passed; 3 mechanical failures; 3 claims-audit failures.

## Provisional human review

These scores diagnose writing quality; they do not override either automated gate. Songs stopped before claims audit remain provisional.

| Story Map | Fidelity | Specificity | Progression | Chorus | Natural | Singable | STYLE | Average |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `sm_01_birthday_kitchen` | 3 | 4 | 3 | 3 | 4 | 4 | 3 | 3.43 |
| `sm_02_silent_drive` | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4.00 |
| `sm_05_tomorrow_call` | 2 | 4 | 4 | 4 | 4 | 4 | 4 | 3.71 |
| `sm_11_blanket_fort` | 2 | 4 | 3 | 4 | 4 | 4 | 4 | 3.57 |
| `sm_14_closed_diner` | 2 | 5 | 4 | 4 | 4 | 4 | 4 | 3.86 |
| `sm_17_driving_roles` | 2 | 4 | 4 | 4 | 4 | 4 | 4 | 3.71 |

Only `sm_02_silent_drive` provisionally reaches the 4.0 average and fidelity threshold, but it cannot pass until its mechanical failure is corrected and its claims audit runs.

## Evidence-based revision targets

1. Target 90 STYLE words so normal model variance remains below the hard 110-word ceiling.
2. Emit no curly-brace events by default. If needed, use only the explicit approved cue vocabulary.
3. Reiterate the allowed section-label list immediately before output and explicitly prohibit `[Verse 3]`.
4. Add a factuality ledger instruction: before writing, silently map every concrete event, action, object, time, weather detail, age, conversation, and behavior to one Story Map field; omit anything unmapped.
5. State that vividness must come from authorized nouns plus non-factual sensory treatment—not newly invented scene facts.
6. Explicitly prohibit invented clock times, seasons, ages, dialogue topics, gestures, travel details, and claims about what another person said or did.
7. Preserve the strengths shown here: concise lines, clear hooks, verse progression, and actionable organic production briefs.

The next run must use the same six fixtures and gates so results remain comparable.
