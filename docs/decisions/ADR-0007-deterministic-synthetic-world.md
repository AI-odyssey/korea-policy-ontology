# ADR-0007: Deterministic synthetic world with a fixed seed

Status: accepted

## Context
The demo needs a realistic world with varied bill stages, merged and discarded bills, noisy signals and three companies. Hand-written data is small and drifts. Random data that changes per run makes tests and documentation unstable.

## Decision
Generate the world from a seeded generator and commit the output (`world.json`). Scenarios used in the docs (such as the Aster Robotics week) are generated deliberately. Tests assert on the committed world and re-generate it to check it is identical.

## Consequences
- Tests, docs and screenshots are stable.
- A reviewer can change the seed and see the system handle a different world.
- The world is plausible but is not evidence of real-world performance; the noise is modeled rather than observed.
- Changing the generator changes the committed output, so both change together.
