# Country / folk v3 comparison — 2026-08-25

## Versions

- Story Map: `story_map.v1`
- Songwriter assembly: `songwriter-assembly.v3`
- Core: `core.v3`
- Genre: `country_folk.v3`
- Vocal: `solo.v1`
- Mechanical validator: `validator.v1`
- Claims audit: `claims-audit.v2`
- Served songwriter and auditor model: `anthropic/claude-sonnet-4.5`

The run used the same six fictional Story Maps. No real user account data was sent.

## Comparison

| Result | v1 | v2 | v3 |
| --- | ---: | ---: | ---: |
| Complete automated passes | 0 | 1 | 0 |
| Mechanical failures | 3 | 2 | 1 |
| Claims-audit failures | 3 | 3 | 5 |

The reduced mechanical failure rate shows better output formatting. The stricter `claims-audit.v2` correctly exposed unsupported details that the earlier auditor mapped too generously.

## v3 findings

| Story Map | Result | Representative unsupported details |
| --- | --- | --- |
| `sm_01_birthday_kitchen` | Claims fail | Saturday, food color, chair, bowl, spoken dialogue, recipe |
| `sm_02_silent_drive` | Claims fail | habitual radio gesture, reaching, head turn, exits |
| `sm_05_tomorrow_call` | Claims fail | midday, conversation topic, neighbor's dog, cursor, repeated phone action |
| `sm_11_blanket_fort` | Mechanical fail | STYLE exceeded 110 words |
| `sm_14_closed_diner` | Claims fail | cracked corner seat, neon sign, locked/papered door, bare windows |
| `sm_17_driving_roles` | Claims fail | age, hand position, weekday, door assistance, softer instructions |

Batch summary: 0 passed; 1 mechanical failure; 5 claims-audit failures. No candidate advanced to human review.

## Decision

Do not add another layer of warning text to the songwriter prompt. Three controlled runs show that a single unconstrained completion repeatedly adds plausible scene facts despite explicit prohibitions.

The next checkpoint should change the architecture:

1. Build a compact, deterministic `source-packet.v1` from approved Story Map fields.
2. Separate literal fact atoms from permitted non-factual transformations such as metaphor, rhyme, repetition, and sensory tone.
3. Require the songwriter to reference source atom IDs internally or in a machine-readable draft representation.
4. Validate atom references before rendering the final lyric text.
5. If unsupported claims remain, run one bounded repair pass that receives only the flagged excerpts and authorized replacements; never silently accept the first draft.
6. Add prompt-version metadata to every evaluation report so the report itself, not surrounding documentation, proves which assembly was tested.

Production integration remains blocked.
