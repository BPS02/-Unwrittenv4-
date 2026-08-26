# Grounded pipeline v12 — mechanically clean baseline — 2026-08-26

## Setup

Same six fixtures, Langfuse staging confirmed byte-identical to the repo and
serving `unwritten-grounded-draft` v6, `unwritten-grounded-repair` v6,
`unwritten-claims-audit` v5, all on `deepseek/deepseek-v4-pro`. Changes since
v10: `grounded-normalizer.v3` (tempo/key defaulting) and pipeline v12
malformed-draft resilience. A first v11 attempt crashed on malformed DeepSeek
JSON before the resilience fix; this run replaces it.

| Pipeline | Passes | Mechanical failures |
| --- | ---: | --- |
| v10 | 1/6 | 5 STYLE omissions across attempts, repairs burned |
| v12 | **1/6** | **zero** — all twelve attempts mechanically clean |

Survivor: `sm_05_tomorrow_call` after its one repair — the same fixture as
v10, now stable across two consecutive runs.

## The structural shift

The mechanical program is complete. Every first attempt reached the claims
audit; no repair was spent on STYLE, parsing, or citation mechanics. The
entire failure surface is now the DeepSeek claims auditor: 22 invention
flags across the five failures, none clearable by reconciliation (none
involved exact-policy text).

## Flag quality is now the open question

Sampling `sm_17_driving_roles` against its Story Map shows the flags are a
mix. Genuine inventions: `I used to think I'd outgrow the need` (invented
inner history), `that won't ever change` (unauthorized permanence). But
`inside this car, we're still a team` sits close to the approved
chorus_message (`care can change seats without disappearing`), and
`I watch the road, you watch for me` tracks the approved change-over-time
and exact-phrase atoms — plausible direct paraphrases the auditor mapped to
null. Paraphrase-policy atoms cannot be reconciled deterministically the way
exact atoms are, so auditor judgment is now the binding constraint.

## Decision

Keep normalizer v3 and the resilience fix — they did exactly what they were
built to do. The next controlled experiment is the auditor-model A/B from
checkpoint 30: keep DeepSeek for draft and repair, switch only
`unwritten-claims-audit`'s staging config model, and compare flag accuracy
on the same fixtures. That is a config-only staging push with no text change.

Production, the live app, and all Langfuse `production` labels remain
unchanged.
