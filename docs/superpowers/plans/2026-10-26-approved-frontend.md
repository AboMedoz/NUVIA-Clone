# Approved Frontend Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent integration tasks and a final whole-branch review.

**Goal:** Replace the product interface with the supplied Frontend.zip design while keeping real accounts, product data and model integration.

**Architecture:** Supplied source lives under features/approved-ui. Existing auth provider, HTTP client and product services remain canonical. Feature adapters change state and actions without redesigning markup/styles.

**Tech Stack:** React/JSX, Vite, pnpm 11.25.0, Express/Mongoose, internal FastAPI.

**Spec:** docs/superpowers/specs/2026-10-26-approved-frontend-design.md

## Global constraints

- Preserve source ZIP and supplied visual assets/styles; no redesign or TypeScript migration.
- Node owns authorization and persistence; reuse CSRF/session and stale-request guards.
- Synthetic records only in explicit previews; unavailable learned features never fabricate output.
- Keep EN/AR, keyboard, narrow-screen and permission behavior.

## Review focus

- Unauthorized or expired sessions cannot retain another account's records.
- Empty/failed analytics do not fall back to synthetic metrics.
- Survey edits/publishing use immutable revisions and authorized branch links.
- Reports/assistant preserve grounded evidence and unavailable model states.
- Navigation and locale changes preserve correct drafts and public token handling.

## Tasks

- [x] Import source/assets and record provenance. Root owns approved App, router, main, ProductContext, shell/header/navigation and shared integration.
- [x] Adapt approved overview and five analytics screens using existing analytics API and truthful unavailable states. Add focused data-contract regressions.
- [x] Adapt approved surveys/editor/sharing/public feedback and business/branches using existing API. Retain other account/team capability access. Add regressions for real actions.
- [x] Adapt approved feedback/detail, reports/detail and assistant to authorized APIs and evidence; remove demo records in connected mode. Add focused regressions.
- [x] Integrate authentication/onboarding/routing and shared shell; preserve preview routes and existing protected/public behavior.
- [x] Run formatter/lint/web tests/build and isolated connected browser tests; compare supplied and integrated UI at desktop/narrow EN/AR. Fix regressions.
- [x] Review final diff, update current docs/design context, commit and publish PR if a remote exists. No main merge.

## Progress

Baseline: clean feat/complete-nuvia at 67436ea, no configured remotes. Created feat/approved-frontend in the current checkout. Original archive extracted to ignored .local/frontend-import; runtime source copied to features/approved-ui. User explicitly approved code adaptation with visual preservation.

User expanded the scope to missing account/settings/notification/action services,
multiple businesses and prepared Google/Stripe integrations. External credentials
remain operator supplied. Full package tests passed (118 web, 89 API), build and backend units passed.
Account/settings/canonical product browser runs and whole-branch integration review
completed. Canonical product: 19 checks, 725 requests, 72 screen/locale/size states.
Original archive and all 29 supplied CSS files were verified unchanged.
See docs/development/approved-frontend-qa.md for actual evidence and static limits.

No Git remote is configured; changes are retained on feat/approved-frontend. No PR
can be published from this checkout until a remote is provided. No merge performed.
