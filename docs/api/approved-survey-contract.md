# Approved survey interface contracts

The supplied survey components use the ordinary session/Origin/CSRF protected
Node API. Public collection remains anonymous unless the owner explicitly allows
optional contact details. Python has no direct access to collection persistence.

## Draft and published settings

`POST /surveys` and `PATCH /surveys/:id` accept `anonymous` (boolean, default
`true`) and `enabledLanguages` (one or two unique `en`/`ar` values). These settings,
question order and wording are copied into immutable published revisions.
Editing a draft does not change an existing public link's privacy contract.
Old surveys without an explicit language selection retain bilingual collection.

Question DTOs may carry `labelTranslations`, `optionTranslations`, `lowLabel` and
`highLabel` with `en`/`ar` keys. Choice answers always submit canonical option
values; translated labels are display text. Rating questions may set `ratingMax`
from 2 through 10; omitted scales retain the original five-point contract.
Analytics normalize rating values onto the existing five-point average.
Reordering preserves question UUIDs; saving creates the next draft revision.

## Collection

`POST /public/surveys/:token/start` accepts `{startId,channel}` where `startId` is
a random UUID and `channel` is `qr` or `link`. The browser sends this only on the
first form interaction, never on a GET/render. The `(linkId,startId)` index makes
retries idempotent. The browser reuses the ID in session storage across a reload
of an unfinished form and resets it for an explicit subsequent response. The
record contains no name, email, IP address or browser fingerprint.

The response endpoint additionally accepts optional `startId`, `sourceChannel`
(`qr`/`link`) and `respondent:{name?,email?}`. Name is bounded to 120 characters;
email to 254. Contact fields are optional even when enabled. A published
anonymous revision rejects the entire respondent object, and a revision with
explicit enabled languages rejects a different submitted locale. Contact data
is stored only with the saved response and returned only through the ordinary
authorized feedback DTO. It is not included in AI text/evidence inputs.

An accepted response completes its matching start record in the same transaction
as response persistence and job creation. Replays do not create another start,
completion or notification. Post-commit notification failure does not roll back
an accepted response. Survey DTOs expose real `responseCount` and
`responsesByChannel:{qr,link}`; historical records without channel metadata are
not assigned to either channel. Generated QR URLs use `?channel=qr`.

`GET /analytics` additionally exposes `startedSessions`, `completedSessions`,
`completionRate` (fraction from 0 through 1), and
`completionMethod:'first-interaction-session-v1'`. The denominator is sessions
whose first interaction falls within the authorized workspace/branch/survey/date
scope, not page loads or unique people. No starts means a null rate. Language,
sentiment, aspect, search and segment filters cannot classify unfinished forms;
the completion fields are null for those views rather than using a mismatched
denominator. Analytics for periods before start tracking cannot reconstruct
historic completion.

## Survey lifecycle actions

Protected `POST /surveys/:id/{duplicate,pause,resume,archive,delete}` accept `{}`.
All preserve existing write and complete-distribution branch authorization.
Duplication creates a draft with new survey/question IDs. Pause disables public
links; resume republishes to the still-active authorized branches with new
tokens. Archive hides the survey from active management lists. Delete is a soft
deletion: public links close, management lookup returns 404, and earlier responses,
immutable revisions and report evidence remain intact. `close` retains its
existing closed-collection contract.

Branch create/update endpoints also persist optional `country`, `city` (120
characters each) and `address` (500), with real branch response counts in lists.
Primary-branch and owner-only structure rules remain enforced by Node.

## Focused browser verification

The editor validates its survey name before any starting-point transition,
including AI generation. A draft may temporarily have zero questions while it is
being edited; the save/publication contract still requires 1–50 valid questions.
Question inputs retain their React identity while typing. Selected branch counts
come from the current workspace selection. Correcting a field clears its transient
notice, which also expires after six seconds.

`node tests/e2e/run-approved-survey-browser.mjs` uses an isolated replica set,
synthetic saved identity/workspace, UI login, the supplied details/question/menu/
sharing/public screens, real publication and response APIs, and desktop English
plus narrow Arabic rendering. Set `MONGOMS_SYSTEM_BINARY` for a local binary.
It does not establish SMTP, Atlas, external provider or scientific model quality.
Set `NUVIA_QA_OUTPUT` to an absolute temporary directory to keep screenshots and
QA results outside the repository. The scenario also checks continuous typing,
empty-question recovery, AI unavailable states, unread badges, navigation caching
and scoped overview report generation.
The composed `run-product-browser.mjs` runner accepts the same output override.
Its report-library assertions target saved report IDs and verify both locales,
including the English report created by the earlier overview scenario.
