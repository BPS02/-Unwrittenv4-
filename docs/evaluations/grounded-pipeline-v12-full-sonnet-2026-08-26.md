# Grounded pipeline v12 — full Sonnet on the modern stack — 2026-08-26

## Setup

Draft and repair returned to `anthropic/claude-sonnet-4.5` (staging v7/v7,
config-only), audit already Sonnet (v6). First-ever measurement of the
all-Sonnet configuration on the complete deterministic stack.

| Configuration | Passes |
| --- | ---: |
| Sonnet audits DeepSeek drafts | 2/6 |
| Full Sonnet | **2/6** |

Survivors: `sm_14_closed_diner` — the first first-attempt, zero-flag pass in
the project's history, from a fixture that had never passed anything — and
`sm_05_tomorrow_call` after repair. Only five of six drafts needed a repair.

## Two defects exposed, both now fixed

1. **Reconciliation v1 read refrain variants as ambiguity.** `sm_17`'s hook
   appeared as `you still tell me when to brake` and `But you still tell me
   when to brake` — both citing the exact atom, both containing the verbatim.
   The multiple-distinct-lines rule blocked a provably authorized phrase and
   cost the fixture its pass. `claims-reconciliation.v2` clears a flag when
   EVERY matching line carries its own exact-citation proof; any unproven
   candidate still blocks.
2. **The repair deleted required verbatim text.** On `sm_01` the auditor
   flagged `you take your time` (excerpt one word wider than the verbatim, so
   correctly not reconciled); the repair then deleted the line entirely and
   the validator failed the song for the missing required phrase.
   `grounded-repair.v8` (staging v8) forbids removing exact-phrase text —
   flagged lines carrying a verbatim must be rewritten around it.

## Decision

The Sonnet auditor's excerpt habits differ from DeepSeek's (wider excerpts,
refrain variants), which is precisely why reconciliation needed v2. Pipeline
v13 records both fixes. Next: rerun the same six fixtures on v13 — the sm_17
class of failure should convert to passes, and the sm_01 cascade should stop
at the audit rather than compounding mechanically.

Production, the live app, and all Langfuse `production` labels remain
unchanged.
