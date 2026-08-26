# Grounded pipeline v2 live evaluation — 2026-08-25

## Versions

- Pipeline: `grounded-pipeline.v2`
- Source packet: `source-packet.v2`
- Draft: `grounded-draft.v2`
- Validator: `validator.v1`
- Claims audit: `claims-audit.v2`
- Repair: `grounded-repair.v2`
- Genre/vocal modules: `country_folk.v3` + `solo.v1`
- Served model: `anthropic/claude-sonnet-4.5`

The run used the same six fictional Story Maps. No real user account data was sent.

## Automated comparison

| Run | Complete passes |
| --- | ---: |
| Grounded pipeline v1 | **4/6** |
| Grounded pipeline v2 | **2/6** |

All six v2 drafts required the single allowed repair. Two passed after repair; four returned no final song.

| Story Map | Result | Repair | Finding |
| --- | --- | --- | --- |
| `sm_01_birthday_kitchen` | Fail | Used | Exact wording was repaired, but the repaired draft still labeled a faithful variation as literal. |
| `sm_02_silent_drive` | Pass | Used | Repair restored the required exact wording and the song passed both gates. |
| `sm_05_tomorrow_call` | Fail | Used | The bounded repair did not clear the strict grounding gate. |
| `sm_11_blanket_fort` | Pass | Used | The repaired song passed the deterministic and model audits. |
| `sm_14_closed_diner` | Fail | Used | Exact wording was repaired, but a faithful storefront line was rejected as insufficiently recognizable. |
| `sm_17_driving_roles` | Fail | Used | Exact wording was repaired, but a faithful appointment line was rejected as insufficiently recognizable. |

## Finding

The exact-phrase rule is useful: it caught omitted approved wording and the repair model corrected it. The deterministic literal-recognizability rule is not ready. It relies on surface overlap, so it rejects ordinary grammatical transformations even when the cited claim is faithful. It also makes a model-selected treatment label determine whether an otherwise grounded line survives.

The lower pass rate is therefore not evidence that the songs became less faithful. It is evidence that the new pre-audit gate is too brittle. Human promotion review is not useful for the four blocked songs because the pipeline correctly returns no final song; neither automated survivor is sufficient to change the previous promotion decision.

## Decision

Do not promote v2 to Langfuse or connect it to the live app.

Keep exact citation enforcement. Replace literal surface-overlap rejection with deterministic normalization for harmless grammatical variants and a semantic support decision that does not trust the draft's self-selected treatment label. Then rerun the same six fixtures. The one-repair limit remains unchanged.
