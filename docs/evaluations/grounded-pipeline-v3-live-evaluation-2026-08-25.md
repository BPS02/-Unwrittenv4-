# Grounded pipeline v3 live evaluation — 2026-08-25

## Versions

- Pipeline: `grounded-pipeline.v3`
- Source packet: `source-packet.v2`
- Draft: `grounded-draft.v3`
- Validator: `validator.v1`
- Claims audit: `claims-audit.v2`
- Repair: `grounded-repair.v3`
- Genre/vocal modules: `country_folk.v3` + `solo.v1`
- Served model: `anthropic/claude-sonnet-4.5`

The run used the same six fictional Story Maps. No real user account data was sent.

## Automated comparison

| Run | Complete passes |
| --- | ---: |
| Grounded pipeline v1 | 4/6 |
| Grounded pipeline v2 | 2/6 |
| Grounded pipeline v3 | **4/6** |

All six v3 drafts required the single allowed repair. Four passed after repair; two returned no final song.

| Story Map | Result | Repair | Finding |
| --- | --- | --- | --- |
| `sm_01_birthday_kitchen` | Pass | Used | Exact approved details were restored and the repaired claims audit passed. |
| `sm_02_silent_drive` | Pass | Used | Repaired lyrics passed exact checks and the claims audit. |
| `sm_05_tomorrow_call` | Fail | Used | Repair retained an invented action: reaching for the door. |
| `sm_11_blanket_fort` | Pass | Used | Repaired lyrics passed both gates. |
| `sm_14_closed_diner` | Fail | Used | Repair still omitted the exact phrase `Friday booth` from a cited line. |
| `sm_17_driving_roles` | Pass | Used | Repaired lyrics passed both gates. |

## Parser finding

The first run attempt exposed empty optional `Intro` and `Outro` arrays from the model. These contain no provider-facing content, so `grounded-draft.v3` now removes only empty optional bookends before schema validation. Empty required sections remain invalid. A regression test covers this normalization.

## Decision

Treatment-independent support restored the v1 automated pass rate without restoring the brittle v2 surface-overlap rule. Promotion remains blocked: every case still needed repair, two cases still failed, and the four survivors still require the fixed human quality review before any Langfuse or live-flow integration.

Next, score the four survivors for fidelity, specificity, progression, chorus strength, natural language, singability, and production brief quality. Do not publish to production.
