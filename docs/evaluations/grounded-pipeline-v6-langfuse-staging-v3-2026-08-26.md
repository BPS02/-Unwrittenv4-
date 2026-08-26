# Grounded pipeline v6 — Langfuse staging v3 — 2026-08-26

## Served prompts

- `unwritten-grounded-draft` v3, label `staging`
- `unwritten-grounded-repair` v3, label `staging`
- `unwritten-claims-audit` v3, label `staging`

## Automated result

| Metric | Result |
| --- | ---: |
| Complete passes | **2/6** |
| Repair attempts used | 6/6 |
| Passed after repair | 2/6 |

Survivors: `sm_11_blanket_fort` and `sm_17_driving_roles`.

## Human quality review

Passing requires every score at least 3, fidelity at least 4, and a 4.0 average.

| Story Map | Fidelity | Specificity | Progression | Chorus | Natural | Singable | STYLE | Average | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `sm_11_blanket_fort` | 3 | 4 | 4 | 4 | 3 | 3 | 4 | 3.57 | Fail |
| `sm_17_driving_roles` | 3 | 4 | 4 | 4 | 3 | 4 | 4 | 3.71 | Fail |

### Findings

- `Blankets Could Save Us` has a memorable exact hook and clear object-level detail, but `I still feel you in this room` implies an unsupported continuing presence and `never had to say it` broadens the approved unsaid detail.
- `When to Brake` advances the role reversal clearly, but `Your voice kept me steady` invents an effect on the child and the seat-changing lines read more like a generalized writing device than this person's speech.
- The citation-aware audit reduced false rejection of approved details, but it still mapped some inferred effects and absolutes too generously.

## Decision

Staging v3 is an improvement over staging v2's 0/6, but no survivor passes human review. Do not add the `production` label.

Next: require the audit to treat continuing-presence claims, absolutes, and claimed emotional effects on another person as unsupported unless the cited atom states them directly. Add repair examples that remove those claims without replacing them with generic metaphors.
