# Approved frontend verification

Verification on October 26, 2026 uses isolated synthetic replica sets and test
identities. It does not establish production deployment, real SMTP delivery,
Google consent, actual Stripe payments or scientific model quality.

- Full package run: 118 web tests in 20 files and 89 API tests passed.
- Low-rating submission regression: one matching API scenario passed, including
  idempotent resubmission without duplicate low-rating notification.
- Production web build passed. Vite reports a large main bundle; performance on
  low-bandwidth devices has not been established.
- ESLint: zero errors, two existing supplied-preview SurveyPage dependency warnings.
- Existing account browser acceptance passed signup/local mailbox verification,
  failed-save retry/draft retention, setup persistence, logout/reset and EN/AR
  desktop/narrow navigation.
- Approved survey browser acceptance passed saved editing, publication, privacy,
  QR, collection, completion metrics and authorized header search (seven checks,
  65 observed requests, no JavaScript errors).
- Additional feedback/report/assistant/action and multi-business browser evidence
  covers eight flows, 197 observed requests and 17 desktop/narrow EN/AR captures.
  These use isolated synthetic evidence and controlled model fixtures.
- Original ZIP SHA-256 is recorded in the integration guide. All 29 supplied CSS
  files remain byte-identical to the extracted source. Side-by-side source and
  integrated editor/sharing/public-form screenshots were reviewed.

The strict static UI auditor is **not clean**: it reports 173 button-handler
heuristics (including ancestor-delegated handlers and explicit preview markup),
eight textarea-resize findings and one WebKit-scrollbar finding in preserved
source. Application integration CSS adds the standard Firefox scrollbar fallback.
These findings do not replace rendered interaction checks and are not a claim of
complete accessibility conformance. Original CSS was not rewritten to suppress
this report. Raw logs, reports and screenshots remain in ignored local QA folders.

See [integration ownership and limits](approved-frontend.md),
[external setup](external-integrations.md) and the explicit
[existing-database migration](../api/multi-workspace.md).

Final read-only integration review found no release-blocking issue in the inspected
auth, workspace routing, stale-scope guards, search and submission notification
paths. A remaining robustness limit is that already-queued generic digest email
is not re-filtered against later membership/type-preference changes at delivery;
its links still require current authorization.

Settings browser final rerun passed profile/failure retention, saved Arabic narrow
layout, actual TOTP/recovery download/disable, current-session marker, revoke-all
then same-tab Manager login, Manager/Viewer role labels and actual branch options.
The local clear-session regression also rejects an already-pending stale refresh.

The final canonical browser run exposed and corrected two integration issues:
branch edit draft hydration could overwrite entered text, and optional segment
controls were nested in the disabled desktop filter-toggle button. Segment
controls now remain siblings of the toggle; a failing-then-passing regression
asserts they have no containing button and still issue the authorized query.

The 72-state browser sweep also exposed shared read/write throttling: repeated
saved account/plan reads exhausted mutation budgets. Reads now have separate
bounded budgets; payment and sensitive credential mutation limits remain strict.
A regression performs repeated account/plan reads then saves a real profile.

Final canonical product browser run: **PASS**, 19 checks, 725 observed requests,
zero JavaScript errors and all 72 protected route/locale/viewport states. It
includes six question types, segments, failure retention, CSV/PDF, persisted branch
rename/archive/restore, public branding, closed links and Viewer isolation.
