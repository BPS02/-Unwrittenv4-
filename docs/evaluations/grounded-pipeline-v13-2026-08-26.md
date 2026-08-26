# Grounded pipeline v13 — reconciliation v2 + repair v8 — 2026-08-26

## Setup

Same six fixtures, all-Sonnet staging (draft v7, repair v8, audit v6).
Changes against the full-Sonnet v12 run: `claims-reconciliation.v2`
(every-candidate-proven rule for refrain variants) and `grounded-repair.v8`
(required verbatim text may never be deleted).

| Run | Passes |
| --- | ---: |
| v12 full Sonnet | 2/6 |
| v13 | **3/6** — best in project history |

Survivors: `sm_01_birthday_kitchen`, `sm_02_silent_drive`,
`sm_14_closed_diner`, each after one repair, each with zero remaining flags.
Project trajectory: 0/6 → 1/6 → 1/6 → 2/6 → 2/6 → 3/6.

## Fix verification

- `sm_01` no longer dies in the repair cascade: the repair preserved
  `take your time` (it appears in Verse 2) and the fixture passed.
- Reconciliation v2 cleared the `sm_17` hook variant flag live
  (`You still tell me when to brake` → `src_10`) — the v1 ambiguity block is
  gone. The fixture still failed on four separate flags (`Your voice kept me
  steady`, invented shaking hands, `quiet most days`) that look like genuine
  draft inventions correctly caught.
- `sm_05` and `sm_11` failed on single residual semantic flags after repair
  (`What felt like slips away` — a garbled repair line; an invented
  loyalty/storm metaphor).

## Provisional quality-review.v1 scores

Provisional scores by the evaluating agent; founder review decides promotion.

| Song | Fidelity | Specificity | Progression | Chorus | Natural | Singable | STYLE | Avg | Gate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `sm_01` Take Your Time | 4 | 4 | 3 | 2 | 2 | 3 | 4 | 3.14 | Fail — chorus copies the message atom as prose; several stilted lines |
| `sm_02` We Left the Radio Off | 4 | 4 | 4 | 4 | 3 | 4 | 5 | 4.00 | **Pass (borderline)** — refrain hook works; one confusing bridge line |
| `sm_14` Friday Booth | 4 | 5 | 4 | 4 | 3 | 4 | 5 | 4.14 | **Pass** — "lose the place, lose the proof" is a real hook; one fragment line |

Two songs meet the full quality gate — the first time any generated song has
reached it (previous best: 3.71).

## Decision

The automated pipeline and the quality gate now produce passing songs.
Promotion, live-flow integration, and any `production` label remain founder
decisions and are NOT taken here. Production stays unchanged.
