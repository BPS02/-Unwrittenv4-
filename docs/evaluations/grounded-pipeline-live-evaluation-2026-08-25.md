# Grounded pipeline live evaluation — 2026-08-25

## Versions

- Pipeline: `grounded-pipeline.v1`
- Source packet: `source-packet.v1`
- Draft: `grounded-draft.v1`
- Validator: `validator.v1`
- Claims audit: `claims-audit.v2`
- Repair: `grounded-repair.v1`
- Genre/vocal modules: `country_folk.v3` + `solo.v1`
- Served model: `anthropic/claude-sonnet-4.5`

The run used the same six fictional Story Maps. No real user account data was sent.

## Automated comparison

| Run | Complete passes |
| --- | ---: |
| Unconstrained v1 | 0/6 |
| Prompt-only v2 | 1/6 |
| Prompt-only v3 + strict audit | 0/6 |
| Grounded pipeline v1 | **4/6** |

Grounded result: four passed, four used a repair attempt, and two passed after repair. Two songs passed on their first draft. The two remaining failures returned no final song.

| Story Map | Result | Repair | Finding |
| --- | --- | --- | --- |
| `sm_01_birthday_kitchen` | Fail | Used | “Weekend cooking” remained expanded into unsupported “weekend morning” |
| `sm_02_silent_drive` | Pass | No | First-pass automated success |
| `sm_05_tomorrow_call` | Fail | Used | Repair preserved unsupported evening, dialogue, desk-history, and certainty details |
| `sm_11_blanket_fort` | Pass | No | First-pass automated success |
| `sm_14_closed_diner` | Pass | Used | Repair removed four unsupported claims |
| `sm_17_driving_roles` | Pass | Used | Repair removed unsupported hand-position and silence claims |

## Human review of automated survivors

| Story Map | Fidelity | Specificity | Progression | Chorus | Natural | Singable | STYLE | Average |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `sm_02_silent_drive` | 4 | 4 | 4 | 4 | 3 | 4 | 4 | 3.86 |
| `sm_11_blanket_fort` | 3 | 4 | 4 | 3 | 3 | 4 | 4 | 3.57 |
| `sm_14_closed_diner` | 3 | 4 | 4 | 4 | 3 | 4 | 4 | 3.71 |
| `sm_17_driving_roles` | 4 | 4 | 4 | 3 | 3 | 4 | 4 | 3.71 |

No survivor reaches the required 4.0 average with every criterion at least 3 and fidelity at least 4. Typical quality issues are awkward phrases (“turned into this still”), generic chorus language, and metaphors that technically pass grounding but feel broader than the writer's detail.

## Decision

The architecture is validated as materially safer, but promotion remains blocked by human quality.

Next revision targets:

1. Atomize broad source sentences into smaller authorized facts so citations cannot hide unsupported additions.
2. Add deterministic citation-text checks for literal and exact-phrase treatments before the model audit.
3. Improve the grounded draft prompt with examples of natural paraphrase versus awkward source copying.
4. Require each chorus to center one exact approved message while avoiding generic filler.
5. Require Verse 2 to advance the approved change without repeating Verse 1 nouns.
6. Repair quality defects as well as factual flags, still within one bounded repair attempt.

Do not publish these prompts to Langfuse production or connect the live app yet.
