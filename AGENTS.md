# AGENTS.md

## Source of truth

Before coding, read:

1.  `PRD.md` --- what to build
2.  `ARCHITECTURE.md` --- how to build it
3.  `plan.yaml` --- implementation progress/order

Do not silently change product or architecture decisions.

## Workflow

Work on **one slice at a time**, using three modes:

### PLAN

-   Inspect the existing code first.
-   Do not modify files.
-   Split the slice into small ordered steps.
-   List affected files and expected tests.
-   Recommend an answer for every non-trivial decision.

### IMPLEMENT

-   Implement only the approved step.
-   Prefer the simplest solution compatible with PRD/architecture.
-   Keep changes small and focused.
-   Do not add dependencies, tables, services, or major abstractions
    without approval.
-   Explore the codebase instead of asking questions it can answer.
-   Never use browser alert, confirm, or prompt dialogs to validate an operation.
    Use an accessible in-app modal consistent with the existing UI instead.

### REVIEW

-   Inspect the complete diff critically.
-   Run relevant lint, typecheck, tests and build.
-   Fix issues before declaring the step complete.
-   Briefly explain the 2--4 important concepts introduced so the
    developer understands the code.

## Decision authority

You may decide minor implementation details autonomously.

Ask before: - changing `PRD.md` or `ARCHITECTURE.md`; - adding a
dependency or external service; - changing the database/domain model; -
introducing a major abstraction; - weakening or changing an invariant.

## Completion

Code written is not code finished.

A step is complete only when relevant checks pass.

Before a commit: - summarize the diff; - report checks executed and
their result.

Set a slice's `done: true` in `plan.yaml` only when the entire slice is
functional and tested.

Update each task's `done` state in `plan.yaml` as work is completed. A slice
may be marked done only when all of its tasks are done.

Keep `CHANGELOG.md` current for every notable user-facing or operational
change. Follow Keep a Changelog categories under `Unreleased`, use Semantic
Versioning for releases, and describe outcomes rather than commit history.

Prefer small, atomic commits that each represent one coherent change and are
easy to review independently.
