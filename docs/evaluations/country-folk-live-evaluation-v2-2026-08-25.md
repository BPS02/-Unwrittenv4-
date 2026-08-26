# Country / folk v2 comparison — 2026-08-25

## Versions

- Story Map: `story_map.v1`
- Songwriter assembly: `songwriter-assembly.v2`
- Core: `core.v2`
- Genre: `country_folk.v2`
- Vocal: `solo.v1`
- Mechanical validator: `validator.v1`
- Claims audit: `claims-audit.v1`
- Human rubric: `quality-review.v1`
- Served songwriter and auditor model: `anthropic/claude-sonnet-4.5`

The run used the same six fictional Story Maps as the v1 baseline. No real user account data was sent.

## Comparison

| Result | v1 | v2 |
| --- | ---: | ---: |
| Complete gate passes | 0 | 1 |
| Mechanical failures | 3 | 2 |
| Claims-audit failures | 3 | 3 |
| Ready for human review | No | No |

The factuality and structure revision produced a measurable improvement, but it is not reliable enough for live integration.

## v2 findings

| Story Map | Mechanical | Claims audit | Primary finding |
| --- | --- | --- | --- |
| `sm_01_birthday_kitchen` | Fail | Not run | Printed the internal factuality ledger before `TITLE`; then used details the ledger marked unconfirmed |
| `sm_02_silent_drive` | Pass | Fail | Invented mileage, highway, exit, breathing difficulty, and countdown details |
| `sm_05_tomorrow_call` | Pass | Fail | Invented time, dialogue, clock, conversation, and elapsed-month details |
| `sm_11_blanket_fort` | Pass | Pass | First complete automated-gate pass |
| `sm_14_closed_diner` | Fail | Not run | A lyric line exceeded 12 words; visible inventions included waitress, studio, and timeline details |
| `sm_17_driving_roles` | Pass | Fail | Invented age, parking lot, route knowledge, and other driving specifics |

Batch summary: 1 passed; 2 mechanical failures; 3 claims-audit failures.

## Human review of the automated survivor

`sm_11_blanket_fort` — “Blankets Could Save Us”

| Criterion | Score |
| --- | ---: |
| Story fidelity | 3 |
| Personal specificity | 4 |
| Verse progression | 3 |
| Chorus strength | 4 |
| Natural language | 4 |
| Singability | 4 |
| Production brief | 4 |
| Average | 3.71 |

Human decision: **fail**. The song is coherent and singable, but Verse 2 mostly restates the storm scene instead of advancing it. Details such as a shoulder pressing against an arm and staying inside after the storm are more specific than the approved Story Map supports. The independent auditor mapped these generously, so the human fidelity check correctly remains a separate gate.

## Decision

Promotion remains blocked. The next revision should:

1. Replace “make a factuality ledger” with a terse internal verification instruction that explicitly says never print analysis or planning.
2. Require lyrics to use only text that can be quoted or directly paraphrased from approved fields; permit metaphor but no new scene facts.
3. Add a final silent deletion pass for numbers, times, ages, weather, dialogue, gestures, businesses, roads, and objects absent from the map.
4. Require Verse 2 to advance time, consequence, or present understanding using an approved `change_over_time` or `current_state` field.
5. Target lyric lines at 9 words to preserve margin below the 12-word hard limit.
6. Strengthen the claims auditor so broad emotional fields cannot support unrelated physical actions.

Do not connect the staged pipeline to production until the same six fixtures pass all gates.
