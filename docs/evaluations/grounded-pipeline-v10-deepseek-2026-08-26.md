# Grounded pipeline v10 — DeepSeek + STYLE normalization — 2026-08-26

## Setup

Same six fictional fixtures. New baseline, two variables changed against v9:
model `deepseek/deepseek-v4-pro` for draft, repair, and audit (pinned in the
Langfuse staging configs and honored by the harness), and
`grounded-normalizer.v2` STYLE ending/fade repair plus the `grounded-draft.v5`
ending rule. Staging served `unwritten-grounded-draft` v6,
`unwritten-grounded-repair` v6, `unwritten-claims-audit` v5.

| Pipeline | Passes |
| --- | ---: |
| v9, sonnet-4.5, no STYLE ending normalization | 0/6 |
| v10, deepseek-v4-pro, STYLE ending normalization | **1/6** |

The survivor is `sm_05_tomorrow_call` (passed after its one repair) — a
fixture that had never passed any prior run.

## What the changes fixed

- **Zero STYLE ending/fade failures.** The defect that burned four of six
  repairs in v9 did not occur once across twelve attempts.
- Reconciliation cleared nothing this run: DeepSeek produced no exact-phrase
  false positives, so there was nothing provable to clear — the conservative
  design behaving correctly on both sides.

## What the model change broke

- DeepSeek omits **key** (3 first drafts) and **BPM** (`sm_14_closed_diner`,
  BOTH attempts — the model repair failed a precise, repeated BPM
  instruction, re-confirming checkpoint 25's lesson that mechanical repair
  cannot be prompted into reliability).
- Those omissions burned repairs exactly the way ending/fade defects did in
  v9; the normalizer does not yet default BPM/key presence.

## Remaining semantic failures

`sm_11_blanket_fort` and `sm_17_driving_roles` drew heavy continuing-presence
flags (`still wrap around`, `hasn't gone away`, `hand still hovers`);
`sm_01`/`sm_02` each fell to a single scope flag. Whether the DeepSeek
auditor reads approved current-state atoms correctly is untested — the
per-prompt staging configs now make a split possible (DeepSeek draft/repair,
different auditor model) as a controlled experiment.

## Decision

Keep the STYLE ending normalization (validated). Candidate next steps, in
order of determinism: extend the normalizer to default missing BPM/key (pure
production metadata, no story content), then optionally A/B the auditor model
via the per-prompt staging configs.

Production, the live app, and all Langfuse `production` labels remain
unchanged.
