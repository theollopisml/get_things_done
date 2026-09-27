# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

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

- Start local PostgreSQL automatically before `pnpm dev`, with `pnpm dev:app` for an existing database.
- Track implementation progress for each task in the project plan.
- Require small, atomic commits and consistent changelog maintenance.

### Fixed

- Serve the browser's fallback favicon directly without invoking session lookup.
