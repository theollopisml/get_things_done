# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Classify new Collector captures with Jev after saving them, with request-key deduplication, a short type confirmation, and a retry action when classification fails.
- Bound Jev classification to Task, Project, and Vision, with optional links to eligible existing parents only when the relation decision is confident.
- Add a server-only Jev Decisions API client with pinned model, response validation, timeout, and safe error codes.
- Capture ideas in a single multiline Collector field, with optional direct Task, Project, or Vision classification and retry on failed saves.
- Review and edit Inbox captures with autosave, then process them oldest first with Task, Project, Vision, Later, and Delete actions.
- Persist classified captures transactionally with PostgreSQL models and validate Collector and Inbox actions with Zod.
- Verify capture, editing, classification, and deletion against PostgreSQL in the integration suite.
- Add keyboard skip links to the main content and mobile navigation, and announce the login route with a page title.
- Make the app installable with a web manifest and app icons, while keeping it online-only.
- Self-host JetBrains Mono and use shared button and focus styles across the app.
- Add desktop and mobile navigation to Home, Inbox, Tasks, Projects, and Visions, with clear placeholders for upcoming sections.
- Add a responsive workspace frame for signed-in pages with an accessible sign-out control.
- Add GitHub sign-in, sign-out, and a renewable 30-day owner session.
- Protect private pages and actions on the server, while allowing OAuth and operational routes.
- Restrict GitHub sign-in to the configured owner's stable GitHub ID before account or session creation.
- Prepare GitHub OAuth with Better Auth and versioned PostgreSQL tables for accounts and sessions.
- Add an aggregated local check and GitHub Actions CI for code quality, builds, and PostgreSQL migrations.
- Establish domain, application, repository, and database module locations with a server-only Drizzle connection.
- Add versioned Drizzle migrations and the initial `entries` table for Inbox captures.
- Provide a persistent local PostgreSQL service with a readiness check and setup instructions.
- Add lint, formatting, typecheck, and unit test commands for local development.
- Add Tailwind styling, Bits UI primitives, and Lucide icons to the app foundation.
- Initialize the SvelteKit application with TypeScript, pnpm, and the Node adapter.
- Initial product, architecture, and implementation planning documents.
- Repository configuration and environment variable template.

### Changed

- Acknowledge Collector captures as soon as they are saved, classify them in the server process, and show the type and optional Project or Vision link in a visible notification.
- Preserve the original Entry and its Task, Project, or Vision link after manual classification, while showing only unclassified captures in the Inbox.
- Add database constraints for Entry classification state, target, review metadata, probabilities, and unique capture request IDs.
- Start local PostgreSQL automatically before `pnpm dev`, with `pnpm dev:app` for an existing database.
- Track implementation progress for each task in the project plan.
- Require small, atomic commits and consistent changelog maintenance.

### Fixed

- Serve the browser's fallback favicon directly without invoking session lookup.
