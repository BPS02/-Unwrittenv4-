# Unwritten Music plan

## Decision log

- First validated genre family: country / folk / acoustic.
- Narrative control: one past-to-present weight plus a separate song intent.
- Names and places: disabled by default and enabled per song in a later approval-screen step.

## Checkpoint 1 — contracts

Status: ready for founder review.

- `story_map.v1` is defined in `lib/story-map.ts`. It is not persisted or used by the live flow yet.
- Twenty approved fictional fixtures live under `tests/fixtures/story-maps/`; the immediate-danger fixture is isolated under `safety/`.
- `core.v1` is defined in `lib/songwriting-core.ts`. It is not published to Langfuse or used by production generation yet.
- No database migration, approval screen, composition-plan provider, or live-flow change belongs to this checkpoint.

## Next checkpoint after approval

1. Story extraction into a draft Story Map.
2. A human-readable “What I heard” approval screen.
3. A country / folk / acoustic genre module and solo vocal module.
4. A validator before generated lyrics are displayed.
