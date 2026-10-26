# NUVIA Clone

Bilingual customer-feedback intelligence for Arabic and English. The product goal is to collect survey responses, analyze sentiment/aspects and support evidence-backed business decisions.

## Current delivery

The active interface uses the supplied `Frontend.zip` design with real account adapters. See [approved interface integration](docs/development/approved-frontend.md) and [Google/Stripe setup](docs/development/external-integrations.md).

- **Connected product:** owner accounts, saved business/branches, versioned questionnaires, branch-specific public links and QR, anonymous validated submissions, feedback/filtering/CSV, real-data aggregates and report snapshots, public business page, and Owner/Manager/Viewer team permissions.
- **Model infrastructure:** authenticated Node-to-FastAPI tasks, deterministic bilingual text preparation, capability readiness, validated local model packages, persistent analysis jobs/retries and evidence-backed result contracts. Learned features display waiting/unavailable states until compatible models are installed.
- **Model handoff:** the user/team supplies trained artifacts later. No trained model or scientific accuracy claim is included. See the [model installation guide](apps/ai-service/README.md).
- **Preview only:** synthetic metrics, feedback and canned replies remain under `/preview/`; they never count as real account analytics.
- **External setup:** Google OAuth and Stripe hosted billing integrations require provider credentials and live acceptance. Plan limits and scientific model quality remain separately evaluated. See the [feature acceptance matrix](docs/product/implementation-matrix.md) for per-feature behavior and validation limits.

The JavaScript applications use React/Vite and Node.js/Express/Mongoose. JavaScript/JSX and `.mjs` are intentionally retained; this restructuring does not migrate the applications to TypeScript.

## Repository structure

```text
apps/
  web/                       React/Vite application and its tests
    src/
      app/                   Router, providers and state ownership
      features/              auth, workspaces, dashboard, feedback, landing,
                             surveys, users and ai-analysis
      components/ui/         Shared controls
      components/layout/     Shared workspace shell and layout CSS
      hooks/                 Shared responsive behavior
      lib/                   HTTP client, assets, i18n and formatting
      styles/                Global styles and tokens
  api/                       Express application, operational scripts and tests
    src/
      config/                Root-relative private configuration
      modules/               auth, workspaces, surveys, feedback, team, analysis,
                             analytics, reports, business-page and mail
      middleware/            Security, limits and safe HTTP errors
      integrations/          Mail transport and authenticated AI-service client
      shared/database/       Connection-scoped Mongoose models and transactions
  ai-service/                FastAPI tasks, model adapters/manifests, tests, uv.lock
packages/shared-types/       Public DTO declarations and shared API constants
infra/docker/                Development images and replica-set initialization
infra/nginx/                 Same-origin web/API routing for compose
scripts/                     Cross-platform development orchestration
tests/e2e/                   Cross-application browser account lifecycle
docs/architecture/           Current system/storage ownership and decisions
docs/api/                    Implemented public API contracts
docs/development/            Development, validation and extension guides
docs/product/                Requirements and full feature map
docs/ui/                     Approved screen galleries and screenshots
docs/archive/                Clearly marked earlier proposals
.github/workflows/           Workspace, Python scaffold and container checks
compose.yaml                 Optional local container stack
pnpm-workspace.yaml          JavaScript workspace membership
pnpm-lock.yaml               Shared reproducible JavaScript dependency graph
```

Each application owns its dependencies and unit/integration tests. Root tooling owns cross-app checks and browser tests. `@nuvia/shared-types` exports public constants and `.d.ts` declarations for editor/JSDoc use; Mongoose models and private server data never enter the browser package. Read the [architecture](docs/architecture/architecture.md) and [developer guide](docs/development/monorepo.md) before adding a module.

## Quick start: connected web and API

Prerequisites: Node.js >=22.13 and **pnpm 11.25.0**. If pnpm is missing, install it with `npm install --global pnpm@11.25.0`. Python and Docker are optional for this flow.

```sh
cd NUVIA-Clone
pnpm install --frozen-lockfile
pnpm setup:local
```

`setup:local` creates the root `.env` with a generated mail-encryption key and preserves an existing file. Add a private `MONGODB_URI` there, preserving that key. Use Atlas, or a local MongoDB **replica set**; a standalone instance cannot run the transactions. Atlas needs a database user and network access for your current public IP, but does not require MongoDB installed on your computer.

```dotenv
MONGODB_URI=mongodb+srv://YOUR_DB_USER:YOUR_URL_ENCODED_PASSWORD@YOUR_CLUSTER_HOST/
MONGODB_DATABASE=nuvia_clone
APP_ORIGIN=http://127.0.0.1:5173
MAIL_MODE=file
```

Replace the URI placeholders. Never commit credentials. Private Atlas settings may also live in `.local/config/atlas-credentials.env`; root `.env` overrides them and process environment overrides both. Production reads process environment only. Package-local commands use the same repository-root configuration; they do not create a second `.env` or mailbox inside `apps/api`.

```sh
pnpm db:check
pnpm db:setup
pnpm dev
```

`db:check` authenticates and pings without writes. `db:setup` creates declared indexes/schema metadata without dropping existing indexes; API startup also performs setup. `pnpm dev` starts API, mail worker and web together, checks default ports first, and stops its own process group on Ctrl+C or a service failure. It does not change the database URI or stop unrelated processes.

Open [the app](http://127.0.0.1:5173/). API traffic is proxied to port 3001. Use `127.0.0.1`, not `localhost`, unless `APP_ORIGIN` is updated to match. The frontend/API/mail commands remain available separately:

```sh
pnpm dev:web
pnpm dev:api
pnpm mail:work
```

Run those in separate terminals if you choose that mode. Windows users can double-click `START-LAPTOP.cmd` to start the connected development group after configuration. `pnpm dev:network` exposes only the frontend for LAN previews; connected LAN access also requires correct backend host/origin/mail-link settings.

## Try what is implemented

1. Open [Create account](http://127.0.0.1:5173/#/signup) and register. No shared/default account is shipped.
2. Keep the mail worker running. With `MAIL_MODE=file`, open the newest corresponding JSON message in the root `.local/mail/` and follow the complete URL in its `text` field on the same computer.
3. After verification, log in, save business information and configure the primary branch.
4. Enter Overview, refresh or sign out/in, and check that saved setup persists.
5. Open Surveys, create a questionnaire or copy a template, choose a branch and publish. Open the public share link in a separate browser context and submit a response. Each link binds its branch and immutable published revision.
6. Revisit Feedback and Overview: the saved response and real counts appear. Sentiment/aspect results stay unavailable until a compatible model produces validated output. Export filtered CSV, manage branches/team, or create a saved report evidence snapshot.
7. For recovery, use [Forgot password](http://127.0.0.1:5173/#/forgot) and follow the reset link in its corresponding local message. Reset links expire, are single-use and revoke existing sessions when consumed.

Local mailbox files are **not Gmail delivery**. Real email requires SMTP provider configuration and acceptance testing. Messages contain private verification/reset URLs; do not share them. Data belongs to the selected database; accounts do not automatically transfer between local MongoDB, compose and Atlas.

## Review UI without the backend

Run `pnpm dev:web`, then open [Landing](http://127.0.0.1:5173/preview/#/landing), [Overview](http://127.0.0.1:5173/preview/#/dashboard), [empty Overview](http://127.0.0.1:5173/preview/#/dashboard-empty), [Feedback](http://127.0.0.1:5173/preview/#/feedbacks), [empty Feedback](http://127.0.0.1:5173/preview/#/feedbacks-empty) or [response details](http://127.0.0.1:5173/preview/#/feedback-details).

Previews use illustrative data and do not create a real session or demonstrate completed AI services. `pnpm build` builds `apps/web/dist`; `pnpm preview` serves it locally without starting backend services. `pnpm previews` creates standalone review HTML in the root ignored `previews/` after building. See the [reviewed gallery](docs/ui/frontend/README.md).

## Model-ready Python service

Optional online Gemini support can be selected explicitly while preserving all
local model packages and adapters. The default remains local; no cloud fallback
occurs. See [Gemini setup and switching](docs/development/gemini-ar.md).

Use Python >=3.11 and uv 0.12.15:

```sh
uv sync --project apps/ai-service --locked
pnpm setup:models
pnpm dev:full
```

`setup:models` preserves existing private settings and adds a shared service key
and ignored `.local/models` package directory. `dev:full` starts the web/API/mail
and loopback AI service together, using the already installed Python environment
offline. Ordinary `pnpm dev` remains available without Python. Do not run both
development groups at the same time.

The service exposes authenticated capability/task endpoints. Language detection,
Arabic normalization and sentence spans work without trained models. Learned
sentiment/aspects, clusters, forecasts, reports and assistant generation wait for
compatible packages. A raw weights file alone is insufficient: the package needs
the documented manifest, hashes, supported adapter and task contract. Model
installation, optional runtime extras and smoke commands are in [the AI guide](apps/ai-service/README.md).
Node retains authorization and persistence; Python never writes to MongoDB.

An optional `AI_PYTHON_EXECUTABLE` points to an existing compatible local Python
environment. The launcher uses it directly without installing into or modifying
that environment. Leave it empty for the clone's locked uv environment. Reusing
an existing local CUDA environment is machine-specific; it is not a portable
model package or evidence of model quality.

See [the Arabic model handoff table](docs/ai-model-handoff-ar.md) for which
capabilities need supplied models and which can share weights.

```sh
pnpm test:launcher
pnpm test:e2e:models
# Local Mongo acceptance: set MONGOMS_SYSTEM_BINARY to your installed mongod path.
pnpm test:e2e:product
```

## Optional local containers

Docker Desktop/the Docker daemon must be running. Run `pnpm setup:local` first to create the private mail key, then:

```sh
docker compose up --build -d
```

Open `http://127.0.0.1:5173/`. This builds the web/API, starts a **separate local MongoDB replica set** and mail worker, and routes API calls through nginx on the same browser origin. MongoDB is internal to the compose network; the root `.env` Atlas URI is not used by this stack. Messages appear in `.local/mail/`; database data persists in the `mongo-data` volume.

Add the model-ready AI service with `docker compose --profile ai up --build -d`. Stop services with `docker compose --profile ai down`; do not add `--volumes` unless you intend to delete the compose database. This is a loopback-bound HTTP development setup, not a production deployment or CD pipeline. It does not copy credentials into images. See [infrastructure details](infra/README.md).

## Validation and CI

```sh
pnpm format:check
pnpm lint
pnpm test                 # Web and API package suites
pnpm build
pnpm test:backend:unit
pnpm test:e2e:accounts
pnpm test:e2e:product:browser # Connected survey/response/export UI with isolated data
pnpm test:ai              # Optional Python/uv environment required
```

The existing suite covers account security, owner isolation, persisted setup, failure recovery, Mongoose/legacy-data compatibility and EN/AR/mobile behavior. Package-local tests are under `apps/web/tests` and `apps/api/tests`; cross-app browser evidence is generated in root `test-results/accounts/`. Tests use synthetic identities and isolated replica sets, not configured application/customer databases.

API integration/browser tests can download MongoDB on first run; Windows reuses an existing ignored `.local/tools/mongod.exe`. Browser tests use Edge, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or installed Playwright Chromium (`pnpm exec playwright install chromium`). Dependencies are pinned by `pnpm-lock.yaml` and the Python `uv.lock`; do not create application npm lockfiles.

GitHub Actions is configured for web formatting/lint/tests/build, API/browser and
product collection checks, Python service and Node-to-Python contracts, and the
optional container stack. This describes configured checks, not evidence of a
remote CI run for this clone. Local results and remaining limits are recorded in
[the comprehensive QA report](docs/development/comprehensive-qa.md) and
[the earlier delivery report](docs/development/clone-validation.md). SMTP, Atlas,
production deployment and trained-model quality require separate acceptance.

## Documentation

- [Documentation index](docs/README.md) and [Arabic getting started](docs/getting-started-ar.md).
- [Architecture](docs/architecture/architecture.md), [current MongoDB models](docs/architecture/mongodb-models.md), [API](docs/api/README.md) and [backend operations](docs/development/backend.md).
- [Developer guide](docs/development/monorepo.md), [workspace boundaries](docs/development/module-boundaries.md), [decisions](docs/decisions/) and [repository guidelines](AGENTS.md).
- [Full 51-feature product map](docs/product/feature-list.md), [requirements](docs/product/requirements.md) and [future AI pipeline](docs/architecture/ai-pipeline.md). Feature scope is broader than current delivery.
- [Earlier architecture/API/database proposals](docs/archive/README.md) remain historical, separate from implemented contracts.

No open-source license has been selected. Keep focused PRs, report actual validation and limitations, preserve private data, and use branch names without `codex/`.
