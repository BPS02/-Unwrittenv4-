# Grounded pipeline v5 — Langfuse staging evaluation — 2026-08-26

## Served prompts

- `unwritten-grounded-draft` v2, label `staging`
- `unwritten-grounded-repair` v2, label `staging`
- `unwritten-claims-audit` v2, label `staging`

The evaluation used the same six fictional country/folk Story Maps. No real user data was sent. The live app remained on prompts labeled `production`.

## Result

| Metric | Result |
| --- | ---: |
| Complete passes | **0/6** |
| Repair attempts used | 6/6 |
| Passed after repair | 0/6 |

| Story Map | Final blocker |
| --- | --- |
| `sm_01_birthday_kitchen` | Repair retained unauthorized `always` scope. |
| `sm_02_silent_drive` | Repair retained unauthorized `every` scope. |
| `sm_05_tomorrow_call` | Audit found invented dialogue, actions, sleeplessness, changed priorities, and a trade-everything claim. |
| `sm_11_blanket_fort` | Repair retained unauthorized `each` scope. |
| `sm_14_closed_diner` | Repair still omitted the cited exact phrase `Friday booth`. |
| `sm_17_driving_roles` | Repair retained unsupported `now` wording on a line whose citations did not authorize a present transition. |

## Decision

Langfuse staging is connected correctly, but staging v2 is rejected. Do not add the `production` label.

The next repair version must perform a final deterministic-minded checklist before returning JSON: restore every cited exact-policy value verbatim; remove each term named by a failed temporal-scope check unless its cited atom authorizes it; and delete unsupported flagged claims without replacing them with new facts. The repair remains bounded to one attempt.
