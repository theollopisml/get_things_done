# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Delete Tasks, Projects, and Checkpoints into a private Trash, with restoration for 30 days, confirmed permanent purge, and short Undo feedback.
- Preserve Tasks while detaching them from deleted Projects or Checkpoints; keep Jev review links to deleted objects until permanent purge.
- Automatically remove expired Trash contents when the Trash is opened, including linked classified captures.
- Toggle Markdown checklist items from the Task, Project, and Checkpoint previews while preserving the source text and saving the change automatically.
- Find Tasks, Projects, and Checkpoints by title or description from any private page with a keyboard and touch accessible search palette.
- Open matching objects directly and use the palette for navigation or quick Task and Project creation.
- Prioritize title matches and limit results per type, with PostgreSQL coverage for closed and deleted objects and literal search characters.
- Manage daily, selected weekday, multiweek, and monthly Task recurrence in the Task editor, with a current occurrence and readable schedule.
- Complete recurring Tasks into their next matching date, postpone an occurrence without shifting its cadence, and cancel or reopen recurrence with short Undo feedback.
- Validate recurrence and scheduling constraints in PostgreSQL, with Temporal date tests for early and late completion, month ends, and leap years.
- Add `/today`, `/thisweek`, `/thismonth`, `/thisyear`, and `/date` shortcuts to the Collector and quick Task creation, with a removable due-date badge and native calendar picker.
- Save optional due dates when creating Tasks from the Tasks list or a Project.
- Preserve a Collector due date through Jev classification, retry, manual review, and Task or Project type correction.
- Show Late, In Progress, and Today Tasks beneath the Home Collector, with quick actions, Undo, and local time updates.
- Show Home counts for Jev classifications awaiting review and failed captures.
- Keep each Home Task in one section while honoring paused and closed Project exposure rules.
- Add a dark theme by default with a light mode switch on login and in the app, persisting the browser's choice.
- Add a guarded `pnpm db:reset:dev` command to recreate the local development database and reapply migrations.
- Manage Checkpoints within a Project with optional target dates, Markdown descriptions, manual order, and open, done, or cancelled status.
- Link each Project Task to at most one Checkpoint in the same Project, and clear an incompatible link when moving the Task.
- Create Projects from the overview and manage their details, dates, status, and linked Tasks from a dedicated page.
- Move Tasks between Projects or detach them with Undo, add Tasks within a Project, and reorder them locally.
- Show factual Task and Checkpoint counts and a calculated TO_BUILD indicator for empty open Projects.
- Add validated Project creation, editing, and lifecycle operations that preserve the first activation date and leave linked Tasks unchanged.
- Preview a Task's Markdown description from its current draft in the edit modal, with common formatting and safe links.
- Persist one-off Task status transitions, scheduling dates, optional times, and closure metadata with validation and PostgreSQL tests.
- Create a grouped Tasks backlog with open and history views, quick capture, simple filters, and Project exposure rules.
- Complete, start, cancel, and reopen Tasks from the list with a short-lived Undo action.
- Edit Task titles, Markdown descriptions, and scheduled or due dates with autosave, inline errors, and retry while keeping unsaved input available.
- Review Jev-classified captures in date order with their original text, type, parent, review state, and an unreviewed filter.
- Confirm Jev classifications and correct Task or Project parent links from the Review, with eligible parent checks.
- Correct a Jev classification's type transactionally while preserving its current title and description and refusing data-losing conversions.
- Classify new Collector captures with Jev after saving them, with request-key deduplication, a short type confirmation, and a retry action when classification fails.
- Bound Jev classification to Task and Project, with a Project link for Tasks only when the relation decision is confident.
- Add a server-only Jev Decisions API client with pinned model, response validation, timeout, and safe error codes.
- Capture ideas in a single multiline Collector field, with retry on failed saves.
- Review and edit unclassified captures with autosave, then process them oldest first with Task, Project, postpone, and delete actions.
- Persist classified captures transactionally with PostgreSQL models and validate Collector and Review actions with Zod.
- Verify capture, editing, classification, and deletion against PostgreSQL in the integration suite.
- Verify Review filtering, corrections, and manual processing of unclassified captures through PostgreSQL route tests.
- Add keyboard skip links to the main content and mobile navigation, and announce the login route with a page title.
- Make the app installable with a web manifest and app icons, while keeping it online-only.
- Self-host JetBrains Mono and use shared button and focus styles across the app.
- Add desktop and mobile navigation to Home, Review, Tasks, and Projects, with clear placeholders for upcoming sections.
- Add a responsive workspace frame for signed-in pages with an accessible sign-out control.
- Add GitHub sign-in, sign-out, and a renewable 30-day owner session.
- Protect private pages and actions on the server, while allowing OAuth and operational routes.
- Restrict GitHub sign-in to the configured owner's stable GitHub ID before account or session creation.
- Prepare GitHub OAuth with Better Auth and versioned PostgreSQL tables for accounts and sessions.
- Add an aggregated local check and GitHub Actions CI for code quality, builds, and PostgreSQL migrations.
- Establish domain, application, repository, and database module locations with a server-only Drizzle connection.
- Add versioned Drizzle migrations and the initial `entries` table for Collector captures.
- Provide a persistent local PostgreSQL service with a readiness check and setup instructions.
- Add lint, formatting, typecheck, and unit test commands for local development.
- Add Tailwind styling, Bits UI primitives, and Lucide icons to the app foundation.
- Initialize the SvelteKit application with TypeScript, pnpm, and the Node adapter.
- Initial product, architecture, and implementation planning documents.
- Repository configuration and environment variable template.

### Changed

- Replace native Task editor date and time inputs with a French calendar and segmented time fields, while preserving date, time, and autosave behavior.
- Explain scheduled date and time dependencies in Task editing, clarify recurrence intervals, and show selected weekdays as accessible toggle pills.
- Run PostgreSQL integration test files sequentially so shared database assertions are deterministic.
- Hide completed or cancelled Tasks and Projects from Review and its Home attention count; simplify the classification editor to object type and Task project choices.
- Let users remove a quick due-date badge with Backspace at the start of the Collector or Task field, and choose slash suggestions with arrow keys and Enter.
- Replace native Task and Project dropdowns with consistent accessible menus and aligned chevrons.
- Center the Collector text vertically in its compact field and use a subtle slate focus treatment.
- Keep classification, Review corrections, and Project pages focused on Tasks and Projects; a Project has no parent category.
- Replace the development migration history with a fresh baseline and reset the local database, including accounts and sessions.
- Make the Task title field as wide as its description in the edit dialog.
- Align the Review correction sections and replace native dropdowns with clear choices and searchable parent selection.
- Edit Jev classifications from a centered Review dialog while keeping type and parent corrections available.
- Edit Checkpoints in a centered dialog with autosave and retry, matching the Task editor.
- Confirm Project cancellation and closure with open Tasks in a centered in-app dialog that explains what happens to the Tasks.
- Open Task editing in a focused modal while preserving autosave, retry, and unsaved input on save errors.
- Put Review in the desktop and mobile navigation and show unclassified captures in a discreet Review filter.
- Remove the standalone Inbox page while keeping retry, editing, manual classification, and deletion available in Review.
- Keep Review actions quiet until hover or keyboard focus, with a clear type-first editing panel that remains available on touch screens.
- Open the Review on unreviewed classifications and offer one action to confirm every visible unreviewed capture.
- Show the Collector as a compact input with one Capture action; keep manual classification in Review.
- Acknowledge Collector captures as soon as they are saved, classify them in the server process, and show the type and optional Project link in a visible notification.
- Preserve the original Entry and its Task or Project link after manual classification, while showing only unclassified captures in the Review filter.
- Add database constraints for Entry classification state, target, review metadata, probabilities, and unique capture request IDs.
- Start local PostgreSQL automatically before `pnpm dev`, with `pnpm dev:app` for an existing database.
- Track implementation progress for each task in the project plan.
- Require small, atomic commits and consistent changelog maintenance.

### Fixed

- Find the same Tasks, Projects, and Checkpoints whether search text uses French accents or not, including common ligatures.
- Make recurrence choices readable in the dark theme by using the shared Task select menu.
- Keep the Collector text full width below an optional due-date badge when a capture spans several lines.
- Explain why Review parent search is unavailable when no eligible Project exists.
- Serve the browser's fallback favicon directly without invoking session lookup.
