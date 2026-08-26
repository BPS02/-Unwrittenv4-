# Grounded pipeline v9 — deterministic audit reconciliation — 2026-08-26

## Setup

Same six fictional country/folk fixtures, `anthropic/claude-sonnet-4.5` for
draft, repair, and audit, Langfuse `staging` prompts all confirmed serving v4.
The changed variable was `claims-reconciliation.v1`: invention flags proven
exact-authorized by the flagged line's own citations are cleared
deterministically before the pass/fail decision.

| Pipeline | Passes |
| --- | ---: |
| v8, normalization only | 1/6 |
| v9, normalization + reconciliation | **0/6** |

All six drafts used the single repair; none survived it.

## What reconciliation did

- On `sm_17_driving_roles`, the auditor again rejected the approved exact
  phrase `you still tell me when to brake` despite its correct citation — the
  precise v8 defect this checkpoint targeted. Reconciliation cleared it
  deterministically (`src_10`), and that fixture's final failure shifted to a
  genuinely disputable line (`Now the wheel's under my hands`).
- No other flag was cleared. Every remaining flag lacked exact-atom proof, so
  the conservative rules held: nothing semantic was weakened.

## Why the pass count fell anyway

1. **First drafts burned the repair on STYLE ending/fade defects.** Four of
   six first attempts failed mechanically on `end on`/`ends with` or an
   affirmative fade direction. The repair fixed the mechanical side every
   time (all six second attempts were mechanically clean), but the one
   allowed repair was then already spent when the semantic audit ran.
2. **Preserved-output variance remains high**, as checkpoint 19 documented
   (an identical configuration previously moved 4/6 → 1/6 between runs).
   This run's drafts differ from v8's, so 1/6 → 0/6 is within the observed
   spread and does not measure reconciliation itself.
3. Remaining flags are dominated by continuing-presence and absolute claims
   (`still holds`, `won't let go`, `doesn't fade`) plus unsupported inner
   states — the same semantic families the stricter audit was built to catch.

## Decision

Reconciliation behaved exactly as specified on the known false positive and
cleared nothing else; it is retained. The dominant lever is now mechanical:
STYLE ending/fade defects are deterministic and should be normalized before
validation, the same way exact text, scope terms, and STYLE length already
are — so the single model repair is preserved for semantic work.

Production and all Langfuse `production` labels remain unchanged.
