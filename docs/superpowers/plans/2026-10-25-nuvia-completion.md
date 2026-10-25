# NUVIA Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the 45 current-release NUVIA features with real collection/persistence/UI and model-ready integration, without trained-model dependencies or invented analytics.

**Architecture:** Extend the existing React/Vite, Express/Mongoose and FastAPI monorepo. Node owns authorization, jobs and storage; FastAPI provides authenticated capability adapters. Parallel frontend/API/AI ownership is coordinated through the contract below.

**Tech Stack:** JavaScript/JSX/.mjs, React/Vite, Node/Express/Mongoose/MongoDB replica set, Python/FastAPI, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-25-nuvia-completion-design.md` (user approved).

## Global Constraints

- Work only in `D:/git_hub/NUVIA-Clone`; original source remains untouched.
- User explicitly requested this clone and current chat, and parallel subagents; do not create a different execution destination or request another approval for the already-approved scope.
- Six SUB features are deferred; trained models are supplied by the user/team later.
- No implicit model downloads, external inference, private-file copying, shared database use or direct-main push.
- Preserve existing security, Node persistence ownership, EN/AR/RTL, components and hash routing. Owner/Manager/Viewer are the team roles.
- Use plain model text plus Python parsing for Qwen compatibility. Test adapters are never selected as product inference.

## Review Focus

1. Foreign tenant or unauthorized branch IDs never leak through list/export/report/job paths.
2. Duplicate public submissions and concurrent survey edits preserve immutable response history.
3. Missing models and malformed outputs never create false successful analyses or synthetic metrics.
4. Changing locale/routes while requests run cannot display a stale identity or another response.
5. Disabled public links, revoked memberships and archived branches fail safely while keeping old evidence.

## Shared HTTP contract (implementation baseline)

Prefix `/api/v1`. Existing cookie/session/Origin/CSRF behavior remains unchanged.
Lists return `{surveys:[]}`, `{responses:[],total,page,pageSize}`, `{reports:[]}`,
`{members:[],invitations:[]}` or `{jobs:[]}`. Resources use `{survey}`, `{response}`,
`{report}`, `{job}`; errors retain the existing safe error shape. IDs are UUIDs.
Agents may extend fields additively but must notify each other before changing names.

- `GET/POST /surveys`; `GET/PATCH /surveys/:id`; `POST /surveys/:id/publish`
  payload `{branchIds:[]}`; `POST /surveys/:id/close`; `GET /survey-templates`.
- Survey: `{id,title,description,locale,status,questions,revision,links,createdAt,updatedAt}`.
  Question: `{id,type,label,required,options?,segment?}`. Types: `short_text`,
  `long_text`, `single_choice`, `multiple_choice`, `rating`, `nps` (1..5, 0..10).
  Choice options are strings; immutable question IDs preserve evidence.
- Public share: hash route `#/s/:token`; `GET /public/surveys/:token` returns
  `{survey,branch:{id,name},business:{name}}` with only safe public fields.
  `POST /public/surveys/:token/responses` payload `{answers:[{questionId,value}],locale,idempotencyKey,consent:true}`.
- `GET /feedback` and `GET /feedback/:id`; list accepts `page,pageSize,search,
branchId,from,to,language,sentiment,aspect,surveyId` and segment filters.
  Response: `{id,surveyId,surveyTitle,revision,branchId,branchName,answers,text,
language,createdAt,analysisStatus,analysis?}`. Real output only; analysis may be null.
- `GET /analytics` returns `{totalResponses,analyzedResponses,pendingResponses,
sentimentDistribution,aspectScores,trends,topics,comparisons,alerts,capabilities}`.
  Respect shared filters. Scores/trends absent when no actual evidence; no placeholders.
- `GET /feedback/export` produces filtered CSV. `GET /workspaces/:id/branches`
  and POST/PATCH reuse existing endpoints.
- `GET/POST /reports`; `GET /reports/:id`; `GET /reports/:id/export` (PDF).
  POST `{locale,filters}`; result can wait for model and always links real evidence.
- `GET /ai/capabilities`; `GET /analysis/jobs`; `POST /analysis/retry` with optional
  `{responseId}`; `POST /assistant/messages` payload `{message,locale,filters}`,
  result `{answer,status,evidence:[],capability?}`; `POST /surveys/suggest` payload
  `{businessType,goal,locale}` returns suggestions or explicit model-unavailable.
  Public job/report waiting status is `waiting_for_model` (underscore), alongside
  `queued`, `running`, `succeeded` and `failed` where applicable.
- `GET /team`; `POST /team/invitations` `{email,role,branchIds}`;
  `PATCH/DELETE /team/members/:id`; `DELETE /team/invitations/:id`;
  `POST /team/accept` `{token}`. Role values `owner`, `manager`, `viewer`.
- `GET/PUT /business-page`; `GET /public/business/:slug` exposes only enabled,
  active safe public forms and branding. Public-page UI `#/b/:slug`.

Internal AI contract: authenticated `GET /api/v1/capabilities` and
`POST /api/v1/tasks/:capability` using `X-AI-Service-Key`. Request
`{schemaVersion:1,taskId,locale,text?,sentences?,evidence?,parameters?}`; result
`{schemaVersion:1,status,capability,modelVersion?,pipelineVersion,result?,error?}`.
Capabilities: `language`, `sentiment`, `aspects`, `embeddings`, `clustering`,
`forecasting`, `report`, `assistant`, `survey_generation`, `normalization`.
Missing capability returns HTTP 503 with a stable `model_unavailable` error.
Health remains honest. Provider config is private `AI_SERVICE_URL` and
`AI_SERVICE_KEY`; default service is loopback, no browser calls.

### Task 1: Safe baseline, contracts and local validation setup — coordinator

**Files:** plan/spec, `docs/development/integration-contract.md`, ignored execution ledger, root setup docs.
**Interfaces:** shared contract above; baseline local source commit `b7ae543f5a9c5073eee5fc7ce7649ba58e185066`.

- [x] Initialize independent Git repository and fetch local source history without private files.
- [x] Check out `feat/complete-nuvia`; preserve approved spec.
- [ ] Publish contract and agent ownership; install existing JS dependencies from offline cache where possible.
- [ ] Run baseline web/API unit checks, document any pre-existing failures before integration.

### Task 2: Collection, persistence, permissions and analytics API — backend agent

**Files:** `apps/api/src/modules/{surveys,feedback,analytics,reports,team,analysis,business-page}/`, model registry, API integrations/config, `packages/shared-types/`, API tests/docs.
**Interfaces:** all public routes above, internal AI transport above; existing deps.models and transactions.

- [ ] First add failing regression coverage for publication/versioning, public validation/idempotency, isolation and missing-model jobs.
- [ ] Add connection-scoped models and API modules. Mount under existing security layers; public endpoints have bounded validation/rate limits.
- [ ] Implement survey revisions/templates/links, storage/feedback/export, tenant/branch roles, deterministic real-data analytics, reports and AI job orchestration; test each behavior as implemented.
- [ ] Preserve existing auth compatibility; test revoked/foreign scopes and unknown/malformed AI outputs.
- [ ] Run backend tests with isolated replica-set using original local mongod executable path explicitly; never original DB/config. Report files and exact tests/limits.

### Task 3: Connected bilingual product and public frontend — frontend agent

**Files:** `apps/web/src/features/{surveys,feedback,dashboard,analytics,reports,team,workspaces,ai-analysis}/`, router/providers, API clients/styles/tests. Existing design system reused.
**Interfaces:** shared public HTTP contract above and existing cookie/CSRF transport; no server-model imports.

- [ ] Add failing meaningful route/transport/state tests and preserve existing regression coverage.
- [ ] Implement reachable builder/templates/list/share/QR, public questionnaire/confirmation and optional business page.
- [ ] Connect real feedback, filters/detail/export, overview/analytics/topics/comparison, reports/evidence, assistant/suggestions, branches/team and settings.
- [ ] Preserve model-unavailable/waiting states, empty/error/loading, role-aware controls and EN/AR/RTL/mobile/keyboard usability.
- [ ] Run web tests/build and rendered desktop/narrow checks. Do not claim Figma inspection unless retrieved.

### Task 4: Model-ready FastAPI service and team handoff — AI agent

**Files:** `apps/ai-service/app/{config,schemas,services,models,api}/`, tests, manifests/examples and AI README; no Node/browser changes.
**Interfaces:** authenticated capability/task endpoints above; configurable versioned manifests and typed task schemas.

- [ ] Add failing tests for unavailable capability, auth, manifests and invalid output.
- [ ] Build lazy adapter registry, safe local artifact checks/readiness, bounded execution and documented adapters for supported model formats. No product fake adapters.
- [ ] Implement deterministic text preparation where appropriate, provenance/evidence validation, sentiment/aspect/task contracts and offline Qwen tagged-text compatibility without loading/downloading weights by default.
- [ ] Provide model package examples, installation/configuration/smoke-validation instructions and isolated contract fixtures.
- [ ] Run Python tests/Ruff; report exact compatible formats and limits so user/team can supply models later.

### Task 5: Integration and cross-app acceptance — coordinator plus scoped fixes

**Files:** `tests/e2e/`, launcher/config docs, feature acceptance matrix, integration fixes within assigned ownership.

- [ ] Review each agent's diff against spec and contracts; fix concrete defects before accepting its task.
- [ ] Exercise survey publication -> anonymous answer -> authenticated feedback -> analytics counts -> unavailable analysis -> retry, plus branch/role access and bilingual routes.
- [ ] Verify model manifest/task contracts between Node and Python and controlled fake transport only in isolated tests.
- [ ] Run format/lint/test/build/Python checks and rendered EN/AR at 360/768/1280 widths; document executable versus model/SMTP/deployment acceptance.
- [ ] Produce feature-by-feature matrix and source/setup/model handoff documentation; retain all unresolved gaps honestly.

### Task 6: Independent review and delivery

- [ ] Generate scoped review artifacts; obtain independent spec and quality review of final changes and repair material defects.
- [ ] Verify staged diff and commit approved work on task branch; no push/merge/deployment without user instruction.
- [ ] Deliver verified behavior and explicit trained-model/production limits. Do not mark goal complete until requested implementation and checks are actually complete.

## Rulings

- User's explicit 'start implementation' and request to delegate approves execution; no second plan-approval pause is added.
- User-selected clone is the isolated workspace; no separate worktree or chat is created.
- Concurrent implementers do not commit/stage while others write. Coordinator owns Git integration and reviews.
