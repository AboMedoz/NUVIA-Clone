# NUVIA product API

The approved interface adds [account settings/contact](account-settings.md),
[saved actions/evidence](actions.md), [survey extensions](approved-survey-contract.md),
[multiple workspaces](multi-workspace.md) and optional
[Google/Stripe integrations](../development/external-integrations.md).

Prefix `/api/v1`; UTF-8 JSON, UUID string IDs, UTC timestamps. GET `/auth/session` returns `{user,workspace,csrfToken,pendingInvitation}` with null identity when anonymous. Mutations require that cookie, `X-CSRF-Token` and exact Origin. No bearer token, credentials or MongoDB URI belongs in the frontend.

| Method   | Path                                 | Payload/result                                                          |
| -------- | ------------------------------------ | ----------------------------------------------------------------------- |
| GET      | `/auth/session`                      | Safe identity/workspace and CSRF context                                |
| POST     | `/auth/register`                     | `{name,email,password,terms:true,locale}`; 201 unverified owner         |
| POST     | `/auth/verify-email`                 | `{token}`; single-use confirmation                                      |
| POST     | `/auth/resend-verification`          | `{email}`; generic 202                                                  |
| POST     | `/auth/login`                        | `{email,password,remember?}`; rotated session and safe identity         |
| POST     | `/auth/logout`                       | `{}`; 204 after session revocation                                      |
| POST     | `/auth/forgot-password`              | `{email}`; identical 202 for known/unknown accounts                     |
| POST     | `/auth/reset-password`               | `{token,password}`; change password and revoke old sessions             |
| GET/PUT  | `/workspace`                         | Read/save `{businessName,industry,locale?,reportingTimezone?}`          |
| PUT      | `/workspace/setup`                   | `{branchType,branchName?}`; transactionally finish primary-branch setup |
| GET/POST | `/workspaces/:id/branches`           | Active branches or create `{name}`; GET supports `includeArchived=true` |
| PATCH    | `/workspaces/:id/branches/:branchId` | Nonempty `{name?,archived?,isPrimary?:true}`                            |
| GET      | `/health/live`, `/health/ready`      | Process health; database ping with 3000ms client deadline               |

Workspace DTO: `id`, `businessName`, `industry`, `locale`, `reportingTimezone`, `branchType`, `primaryBranchId`, `onboardingStep`, `branches`. Branch DTO: `id`, `name`, `archivedAt`, `isPrimary`. Information saving persists step `branches`; only a committed branch transaction marks `complete`.

Validation rejects unknown fields, operator-shaped inputs and invalid IDs. All branch access is owner/workspace-scoped; foreign resources return 404. Errors use `{error:{code,message,details},request_id}` without internal errors or secrets. Statuses: 400 invalid token/JSON, 401 authentication, 403 verification/CSRF, 404 unavailable/foreign resource, 409 uniqueness/state conflict, 413 body size, 422 validation, 429 rate limiting, 503 storage unavailable.

The public DTO declarations and prefix live in `packages/shared-types`. See [backend setup](../development/backend.md) for account configuration and invariants. Product contracts below extend these existing account routes.

`POST /auth/invitation-continuation` accepts `{token}` and returns `{pendingInvitation:true}`. `DELETE /auth/invitation-continuation` accepts `{}` (optional token tolerated) and returns `{pendingInvitation:false}`. Both require the ordinary anonymous/authenticated cookie, exact Origin and CSRF token. The server validates active, unused, unrevoked invitation expiry and stores only its SHA-256 digest in the private Session record, never the raw token. `GET /auth/session` exposes only a boolean and clears obsolete continuation digests. Registration/verification retain the anonymous cookie; login rotation carries the digest to the new protected session. This lets an invited user register, verify and log in before choosing any owned workspace, then accept the original invitation. Explicit cancellation clears the continuation.

## Collection and public pages

| Method    | Path                               | Payload/result                                                                                                          |
| --------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET/POST  | `/surveys`                         | `{surveys:[]}` / create `{title,description,locale,questions}` → 201 `{survey}`                                         |
| GET/PATCH | `/surveys/:id`                     | `{survey}` / partial editable fields and optional expected `revision`                                                   |
| POST      | `/surveys/:id/publish`             | `{branchIds:[]}` → `{survey}` with branch-specific token URLs                                                           |
| POST      | `/surveys/:id/close`               | `{}` disables every public link, preserving evidence                                                                    |
| GET       | `/survey-templates`                | `{templates:[]}`; editable restaurant, retail and service templates in EN/AR                                            |
| GET       | `/public/surveys/:token`           | Anonymous `{survey,branch:{id,name},business:{name}}`                                                                   |
| POST      | `/public/surveys/:token/responses` | `{answers:[{questionId,value}],locale,idempotencyKey,consent:true}` → 201 `{response:{id,status:'received',createdAt}}` |
| GET/PUT   | `/business-page`                   | Owner-only `{slug,enabled,description,logoUrl,contactUrl}`                                                              |
| GET       | `/public/business/:slug`           | Enabled safe branding and active branch-form links                                                                      |

Questions have immutable UUID `id`, `type`, `label`, `required`, optional unique string `options` and boolean `segment`. Types are `short_text`, `long_text`, `single_choice`, `multiple_choice`, `rating` (integer 1–5), and `nps` (integer 0–10). Text is bounded to 500/10,000 characters. Choice answers must exactly match configured options; required, duplicate and unknown question IDs are checked. Segment questions use bounded choices/numbers. Surveys contain 1–50 unique questions. Public links contain a 256-bit random token and choose their branch on the server. Public clients cannot submit workspace/branch identifiers.

Published revision records and response question/title snapshots preserve historical answers when the draft changes. PATCH increments `revision` and uses an internal compare-and-swap version; passing a stale expected revision returns 409 `SURVEY_CHANGED`. Republishing disables earlier links for selected branches and creates new tokens against the current immutable revision. Old links in other branches retain their published revision. Closing and branch archival disable distribution transactionally; restoring a branch requires explicit publication to obtain a working link.

Responses and analysis jobs commit in one transaction. `(linkId,idempotencyKey)` is unique; a concurrent same-payload retry returns the same response ID. Reusing the key with a different payload returns 409 `IDEMPOTENCY_CONFLICT`. Public routes are independently rate limited and need no owner cookie/CSRF token. Protected routes retain existing cookie/Origin/CSRF protection.

## Feedback, analytics and exports

| Method | Path               | Result                                                                                                                                                                 |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/feedback`        | `{responses,total,page,pageSize}`; page size 1–100, default 25                                                                                                         |
| GET    | `/feedback/:id`    | `{response}` including saved questions, answers, text, segments and real analysis or null                                                                              |
| GET    | `/feedback/export` | UTF-8 BOM CSV of the entire authorized filtered cohort; formula-leading fields escaped                                                                                 |
| GET    | `/analytics`       | Real counts, sentimentDistribution, aspectScores, trends, comparisons, segmentComparisons, topics, forecasts, alerts, atRiskAspects, capabilities and capabilityStates |

Shared filters are `branchId`, `surveyId`, `from`, `to` (offset-aware ISO timestamps), `language` (`ar/en/mixed/unknown`), `search` (literal case-insensitive text), `sentiment`, `aspect`, and `segment` (JSON object of question UUID to exact string/number). Date bounds are inclusive instants; day/week/month grouping uses the workspace reporting timezone. `interval` defaults to `day`; weeks begin Monday. The same filter parser/query builder serves lists, metrics, CSV, reports and assistant snapshots. Numeric pagination does not limit analytics/export cohorts. Foreign or unassigned resources do not appear in any cohort.

Counts do not imply scientific analysis. `analyzedResponses` counts only responses with successful sentiment and aspects; partial results remain pending and their individually validated available outputs can still contribute. Missing sentiment gives an empty distribution, never a made-up percentage. Aspect scoring version `sentence-aspect-mean-v1` averages positive=10, negative=0, neutral=5 and mixed=5 over unique sentence/aspect mentions. Each score includes mention count and `lowSample:true` below 10 mentions. No confidence is invented.

Trends and branch/segment comparisons use saved response data. Observed decline alerts require at least 10 mentions in both adjacent periods and an observed drop of at least two points; method `adjacent-period-drop-v1` is explicitly a deterministic observed-change rule. `atRiskAspects` identifies observed scores below four with at least 10 mentions; it is not a trained prediction. Topic/clustering jobs need at least five textual responses plus compatible embeddings. Forecasting needs at least 30 reliable observed periods with at least 10 aspect mentions per period; adapter requirements may be stricter. `capabilityStates` distinguishes insufficient evidence, pending/waiting jobs and successful output. Scientific accuracy, change-point detection calibration and predictive acceptance remain later model/evaluation work.

Dataset jobs retain an exact evidence/version cohort key, authorized branch IDs and provenance. Analytics only reuses a successful dataset result for the same authorized response set, interval/timezone and source model versions. Clustering is bounded to the newest 200 textual responses / 60,000 characters and a **120,000-byte upper bound covering both Node wire JSON and Python compact re-encoding**, below Python's 128,000-byte ceiling. Sampling accounts for each number's round-trip significand and Python exponent/fixed formatting, including `1e-7` becoming `1e-07`; it preserves evidence/vector ID order, values and dimensions. Sample counts depend on dimensions and number formatting. `sampleCount`, `totalResponses`, `totalTextResponses`, `sampled`, `truncatedText` and `vectorBudgetBytes` disclose coverage; analytics adds `evaluatedResponses`, `sampled` and waiting errors to capability state. Fewer than five vectors fitting the budget yields `insufficient_vector_budget` rather than retrying an impossible request. Forecast observations are weighted observed aspect means with explicit future dates. No model output is created by the JavaScript test fixtures in ordinary product operation.

`node apps/api/tests/vector-budget-cross-language.mjs [existing-python-executable]` optionally validates actual production samples against Python's real `TaskRequest` and compact JSON encoder. It covers positive/negative small exponents, long mantissas, extreme finite values and deterministic binary64 scalar cases, and writes only synthetic ignored QA evidence. It uses an existing AI-service environment without installing dependencies. The normal API test suite remains independent of Python.

Numeric cluster labels identify memberships; they are **not semantic summaries**. A successful cluster job queues a distinct `report` capability child job for each cluster, with `parameters.purpose:'cluster_summary'`, cluster ID and bounded authorized member evidence (up to 30 items / 30,000 characters). These jobs retain their own branch scope, source parent, status, provenance and exact quotations. Analytics topics expose `summaryStatus`, `summary`, `summaryTitle`, `summaryEvidence`, `summaryCoverage`, `summaryModelVersion` and `summaryPipelineVersion`. Missing report models leave the semantic fields null and the summary waiting. The normal report output contract supplies the executable semantic title/summary/sections/citations once a compatible generative adapter is configured; no numeric topic name is promoted to a fake summary.

## Teams and authorization

| Method | Path                                         | Payload/result                                                                                        |
| ------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/team`                                      | Owner-only `{members,invitations}`                                                                    |
| POST   | `/team/invitations`                          | Owner `{email,role,branchIds}` → 201 `{invitation}` and one-time `acceptUrl`                          |
| POST   | `/team/accept`                               | Verified invitee `{token?}` or `{}` using remembered continuation → `{status:'accepted',workspaceId}` |
| PATCH  | `/team/members/:id`                          | Owner `{role?,branchIds?}` → `{member}`                                                               |
| DELETE | `/team/members/:id`, `/team/invitations/:id` | Owner revokes access/invitation; 204                                                                  |

Roles are Owner, Manager and Viewer. The workspace owner has all branches and alone changes team/business branding and branch structure. Managers read assigned branches and can create/edit/publish their branch-scoped surveys, run authorized analysis and reports. Viewers read/export authorized data without mutations. A survey distributed to any unassigned branch cannot be edited by a restricted manager. Owner-created unpublished drafts remain owner-only until distribution defines their scope; manager drafts retain their initial assigned branch scope.

Session workspace DTO adds `role` and `allowedBranchIds` (`null` for owner; assigned IDs for others); `branches` is restricted and an unassigned primary branch ID is returned as null. Every request resolves current membership, so revocation or scope reduction applies immediately to responses, jobs, saved report snapshots, exports and assistant retrieval. Reports spanning any now-unassigned branch are hidden entirely. The session stores its selected workspace. Explicit switching and invitation acceptance select an authorized business; stale workspace requests return 409 without replaying mutations. See the multi-workspace contract.

Invitations are email-bound, seven-day, hashed, single-use tokens. A new invitation revokes previous unused invitations for the same email/workspace. Raw tokens are encrypted in the private mail outbox until delivery and never stored in invitation records or browser-continuation Session records. Acceptance binds the verified account email and transactionally creates membership, consumes the invitation and clears the current session continuation. The mail worker supports file-mode invitations and configured SMTP; only the issuing owner receives the new link directly for sharing/review. Actual SMTP acceptance remains deployment-specific.

## Reports, assistant and AI orchestration

Optional `AI_PROVIDER=qwen` keeps these public contracts unchanged. One persistent
model instance serves explicitly selected internal interfaces. The experimental
local selection is short report/topic summaries and survey drafts in English;
Arabic and other Qwen interfaces remain unavailable. Report citations contain
whole selected source quotations and one concise summary section. Oversized
prompts/invalid output fail rather than silently truncate evidence. See
[selection and limitations](../../apps/ai-service/docs/shared-qwen.md).

| Method   | Path                  | Payload/result                                                                                                |
| -------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET/POST | `/reports`            | `{reports:[]}` / `{locale,filters}` → 201 `{report}`                                                          |
| GET      | `/reports/:id`        | `{report}` with immutable authorized evidence snapshot, complete-cohort metrics and snapshot coverage         |
| GET      | `/reports/:id/export` | PDF with embedded licensed Noto Arabic/Latin fonts; waiting reports explicitly state model availability       |
| POST     | `/assistant/messages` | `{message,locale,filters}` → `{answer,status,evidence,...}`                                                   |
| POST     | `/surveys/suggest`    | `{businessType,goal,locale}` → suggestions requiring manual review/publication, or explicit unavailable state |
| GET      | `/ai/capabilities`    | Internal service's safe readiness registry; no secrets or model filesystem paths                              |
| GET      | `/analysis/jobs`      | `{jobs:[]}` with only authorized branch/report jobs                                                           |
| POST     | `/analysis/retry`     | `{responseId?,filters?}` retries authorized unfinished jobs and queues eligible filtered dataset jobs         |

Report statuses include `waiting_for_model`, `failed`, `succeeded`, and `insufficient_evidence`; no synthetic prose fills a missing model. Report metrics describe the full filtered cohort. Model evidence is bounded to 200 textual responses, 10,000 characters per item and 60,000 characters total, with `{totalMatched,totalTextResponses,evidenceCount,truncated,maxItems,maxCharacters}` coverage. Assistant uses at most 30 locally ranked documents from that authorized snapshot and discloses coverage. Quotes must exactly match retained source text; every report section cites an included literal quotation. This is bounded lexical retrieval infrastructure, not a claim of evaluated production RAG quality.

Assistant models may return `{status:'insufficient_evidence',answer:null,evidence:[]}` even for a nonempty authorized cohort. That typed abstention is preserved through the successful internal task envelope and public assistant response. Grounded answers retain mandatory literal citations; an answered result with empty citations remains invalid. Zero lexical term overlap alone does not force abstention on general questions.

Public JSON requests remain bounded to 32 KiB. Raw multi-answer response text is preserved without task truncation: Python text inputs support 50,000 characters and evidence items 32,768 codepoints, sufficient for every accepted public body, including two 6,000-character long answers plus their separator. Normalization, sentence offsets and embeddings receive the full saved response and stable response ID. The smaller 10,000-character generative/cluster snippet budget is a separate disclosed snapshot choice, not silent preprocessing truncation.

Node privately calls `GET /api/v1/capabilities` and `POST /api/v1/tasks/:capability` with `X-AI-Service-Key`; browsers never receive the key. Configure `AI_SERVICE_URL` (default loopback `http://127.0.0.1:8000`), `AI_SERVICE_KEY`, and optional `AI_SERVICE_TIMEOUT_MS` (default 75,000; 100–120,000). The default exceeds Python's 60-second task budget; a custom Node request budget must exceed the Python task budget plus overhead and remain below the 150-second job lease. Canonical envelopes use `schemaVersion:1`, task IDs, locale, authorized raw text/sentence offsets/evidence and bounded parameters. Outputs require matching capability, model/pipeline provenance, valid four-class labels, complete response/sentence sentiment coverage, Unicode codepoint spans, known evidence IDs and exact quotes. Explicit `testOnly:true` results are refused. Arbitrary version strings such as `latest-1` are valid. Missing capabilities produce persisted `waiting_for_model`; malformed output never succeeds. No downloads, training or implicit external provider calls occur. Explicit `AI_PROVIDER=gemini` enables the optional online provider inside FastAPI for six supported capabilities; see [provider setup](../development/gemini-ar.md). Local remains default, with no automatic cloud fallback. Existing validated model/pipeline provenance distinguishes saved outputs. Clustering selects one compatible embedding model/pipeline/dimension cohort; different spaces are never combined.

The API runs a non-overlapping five-second job pump with leased atomic claims. Normalization/language run before sentiment/aspects; missing prerequisites remain waiting. Results, provenance history and response/report state commit transactionally. Service transport failures retry exponentially up to five attempts; malformed outputs require explicit retry after correction. Waiting tasks are checked at most once per 30 seconds and compatible artifacts can be installed later. `node apps/api/scripts/retry-analysis.mjs` retries up to 1,000 existing eligible jobs; the scoped endpoint is intended for the product UI. Queued/running/succeeded/failed/waiting_for_model use underscores throughout the wire contract.

The pump selects queued work, due transient retries and expired leases **before** applying its batch limit to waiting-model jobs. Remaining capacity scans waiting jobs by last-attempt time, so old unavailable learned tasks cannot starve newer builtin processing. Capability prerequisites are ordered inside the selected runnable batch.

`POST /analysis/retry` schedules authorized jobs as queued and returns without waiting for inference. Report creation also saves a queued report/job and returns immediately when the internal service is configured. The automatic pump owns execution, so installed models with long inference times do not keep a retry/report HTTP request open across a batch of jobs. The operational CLI is intentionally a foreground administrative command.

`DATA_RETENTION_DAYS` is a private bounded integer setting from 0 through 3650; default 0 disables retention expiry and preserves response/report evidence indefinitely. It records the operator's configured retention horizon; **no automatic deletion or destructive purge is enabled**, including when a positive value is configured. Session/auth/mail token expiry retains its existing TTL behavior. A future reviewed deletion operation must coordinate responses, derived jobs, report snapshots and literal evidence; never delete raw responses independently of saved reports. No production retention policy is inferred from the safe default or the validation bound.

## Authorized header search

`GET /account/notifications` returns the latest 100 authorized in-app
`notifications` plus `unreadCount` and `feedbackUnreadCount` across the whole
authorized unread set. Feedback counts include `kind:'feedback'` only, excluding
separate low-rating alerts for the same response. Counts use the same current
workspace/branch and global-security visibility as the notification list, and
decrease after `POST /account/notifications/read`. They are notification counts,
not a separate per-response read-tracking model.

`GET /search?q=...&branchId=...` returns up to four saved feedback, survey and
report matches per category as `{results:[{id,title,section,description,path}]}`.
The query is bounded to 200 characters; empty queries return no records. Current
workspace and branch permissions apply, including report snapshot scope.
