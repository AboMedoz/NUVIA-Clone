# Current architecture

NUVIA is a JavaScript/Python monorepo. Node owns public authorization, MongoDB
persistence, survey collection, team/branch scope, analytics and analysis jobs.
React uses that API on one browser origin. Internal FastAPI owns deterministic
text preparation and validated local model adapters. Trained models are supplied
later by the user/team; model-driven features expose readiness and waiting states.

## Application boundaries

| Owner                      | Path                       | Implemented responsibility                                                                                                           |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Web                        | `apps/web`                 | React/Vite, hash routing, auth/setup UI, connected empty workspaces and explicit design previews                                     |
| API                        | `apps/api`                 | Express, protected sessions/CSRF, account recovery, owner-scoped workspace/branch persistence, Mongoose models and mail processing   |
| Internal AI                | `apps/ai-service`          | Authenticated capabilities/tasks, bounded supported local adapters, model manifests, bilingual preprocessing and evidence validation |
| Public contracts           | `packages/shared-types`    | Shared API prefix/locales and public DTO declarations; no database models or secrets                                                 |
| Development infrastructure | `infra` and `compose.yaml` | Optional local replica set, same-origin nginx routing, API/mail/web images and optional AI scaffold                                  |

JavaScript/JSX and `.mjs` remain in use. The source layout is ready for deliberate feature growth; there is no TypeScript, Redux, React Router or production deployment migration in this change.

## Web ownership

`src/app/App.jsx` chooses preview mode and composes providers. `app/router` owns route names/access decisions and route orchestration; `features/auth/AuthPage.jsx` owns account-screen markup. `app/providers` owns resolved account/workspace state and product shell state. Feature folders own their screen behavior, API clients and local drafts. `components/ui` and `components/layout` own shared controls, shell geometry and common CSS; `hooks`/`lib` own reusable behavior, transport, assets, localization and formatting.

Account product routes use saved identity/workspace data. `/preview/` is the only owner of synthetic metrics, sample feedback and canned assistant replies. Existing imported design variants are reference/preview code, not implemented product APIs. The shared scale hook preserves the reviewed desktop/mobile geometry.

## API ownership

`src/config` resolves the repository root and private configuration independently of package working directory. `modules/auth`, `modules/workspaces` and `modules/mail` implement existing business behavior. `middleware` contains request security, limits and safe errors. `integrations/mail` owns delivery adapters; `integrations/ai-service` is a documented future boundary. `shared/database` owns connection-scoped Mongoose models and explicit transaction handling.

Product modules implement surveys/revisions/distribution links, responses,
feedback/export, analytics, reports, analysis and team membership/invitations.
Some inherited `users`, `dashboard` and `ai` boundary READMEs describe older
extension guidance; use executable routes and current API docs as authority.
User remains internal to `shared/database/models`; authentication owns accounts.

## Connected request flow

1. Browser requests `/api/v1/auth/session` through Vite or nginx on the same origin.
2. Node resolves a protected cookie session and returns safe user/workspace DTOs plus CSRF context.
3. Mutations require matching Origin/CSRF and strict Zod validation.
4. Services use `deps.models`, owner predicates and explicit sessions for transactional changes.
5. Mail intent is encrypted in the outbox; a separate worker dispatches local development mail or configured SMTP.
6. The web resumes saved setup and renders honest empty/unavailable states.

No browser-to-MongoDB or browser-to-AI path exists. Node calls FastAPI using a
private service key and bounded, already-authorized evidence. Model tasks return
versioned results validated again by Node before persistence. Public links grant
submission access to one branch and immutable survey revision, not workspace reads.
Membership is resolved on each request; revoked access takes effect immediately.

## Model handoff and analysis state

Ignored model packages declare a capability, supported adapter/format, version,
language/taxonomy, device requirements and artifact hashes. No remote code or
implicit weights download is enabled. Builtin language/normalization work without
trained models; learned capabilities wait until compatible packages are ready.
Installing a package changes readiness without rebuilding the web/API. Persistent
jobs and explicit retry preserve provenance; unavailable/failed results never
become successful dashboards. Fixtures remain test-only. See the AI README for
exact supported package formats and model installation commands.

The API process pumps queued jobs; report evidence snapshots and derived datasets
retain their authorized scope. Reports and assistant quotations must map back to
stored original responses. Local testing of plumbing is separate from scientific
quality evaluation of models supplied later.

## Runtime and operational boundaries

- JavaScript packages use pinned pnpm workspaces and each app declares its own dependencies. The root owns shared tooling and cross-app browser tests.
- Python dependencies/lockfile are owned by `apps/ai-service`; Python is optional for existing web/API work.
- Root `.env`, `.local/config`, `.local/mail` and test binaries remain root-relative. Production reads process environment only.
- `pnpm dev` starts and stops its own API/mail/web process group. It does not start MongoDB, switch URIs or kill occupied unrelated ports.
- Optional compose uses a separate development MongoDB volume, localhost-bound HTTP web origin and internal database network. It is not production/CD and does not import Atlas data.
- Existing UUID/ObjectId formats, Mongoose index definitions, DTOs, hashing/encryption and transaction invariants are preserved.

See [public API](../api/README.md), [models](mongodb-models.md), [developer workflow](../development/monorepo.md), [module boundaries](../development/module-boundaries.md) and [validation evidence](../development/backend-validation.md). Earlier proposals are explicitly [archived](../archive/README.md).
