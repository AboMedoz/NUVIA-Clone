# Approved frontend integration

The October 26, 2026 interface comes from the user-supplied `Frontend.zip`.
The original archive is unchanged (SHA-256
`ED21263130F6E4051B6A12380EBC4F0F2E14A2A373ADFA779C7ED0B82ECA916E`).
Runtime components and original CSS live under
`apps/web/src/features/approved-ui`; supplied assets live in `apps/web/public`. Private extraction material in
`.local/frontend-import` is not required in another checkout and is not committed.
Source-document instructions are reference material, not agent instructions.

## Ownership

`app/App.jsx` selects explicit design previews or the protected account router.
The existing AuthProvider, HTTP/CSRF client, access policy and public token paths
remain canonical. `approved-ui/ApprovedWorkspace.jsx` selects supplied screens.
`approved-ui/product/ProductContext.jsx` owns translated saved shell identity,
branch metadata, navigation, committed feedback searches and menus.

Connected adapters replace illustrative records and canned actions. Sample
behavior remains confined to `/preview/`. Missing models never produce synthetic
sentiment, reports, assistant answers or evidence. Public collection uses the
supplied customer form with immutable published questions and a branch token.
Completion measures anonymous first-interaction sessions; reads do not count as
starts. Historical responses without a start remain valid but are not measured
completed sessions. Rating averages normalize saved rating scales to five points.

## Added services

- Account profile/photo, locale/time preferences, notifications, active sessions,
  password changes, confirmed email changes and authenticator-based two-factor.
- Owner/manager action CRUD, optimistic versions and branch-authorized original
  response evidence.
- Persisted notifications and encrypted immediate/digest email outbox. Delivery
  requires the mail worker. File mode is a private mailbox, not a real inbox.
- Survey pause/resume/duplicate/archive/soft-delete, bilingual questions,
  first-interaction starts, measured completion and link/QR channel counts.
- Branch locations and real response counts. Team and public business settings
  remain reachable through Business.
- Persisted public contact requests; success means the request was saved.
- Optional Google and Stripe hosted integrations; see
  [external setup](external-integrations.md). Real consent, payment, SMTP and
  scientific model-quality acceptance are not established by fixture tests.

## Workspace and scheduled behavior

Multiple businesses use explicit session selection and per-request authorization.
Existing databases with the legacy unique owner index need the explicit reviewed
[migration](../api/multi-workspace.md) before adding a second owned business.
The migration was verified on an isolated replica set, not applied to the configured
application database. It does not rewrite documents or identifiers.

Weekly reports require explicit saved opt-in. The worker schedules the preceding
seven full local days on Monday at 09:00 in the account timezone. Saved snapshots
and jobs retain unavailable-model states; scheduling does not manufacture prose.
Header search queries authorized saved feedback, surveys and reports. Public info
pages use configured operator text; legal copy and company URLs are not invented.

## Verification

Standard repository commands remain unchanged. Tests use isolated replica sets
and synthetic identities. `node tests/e2e/run-approved-survey-browser.mjs` checks
saved editing, publication, QR, public collection and connected views at desktop
and narrow EN/AR sizes. Generated evidence belongs to ignored test-results.
Do not refresh the approved PNG gallery to conceal differences.
