# Module boundaries

| Owner                                                    | Allowed responsibility                                                                       | Avoid                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Web `app/router`                                         | Route names, access decisions and screen orchestration                                       | New persistence or duplicate feature UI                    |
| Web `app/providers`                                      | Session/workspace and shared shell state                                                     | Browser storage of passwords/tokens                        |
| Web `features/*`                                         | Feature screens, drafts, API usage and feature styles                                        | Importing server models or inventing unavailable responses |
| Web `components/ui`, `components/layout`, `hooks`, `lib` | Shared UI/geometry, reusable hooks, transport and formatting                                 | Feature-specific business decisions in generic controls    |
| API `modules/auth`                                       | Account lifecycle and protected sessions                                                     | User/team CRUD without a permission contract               |
| API `modules/workspaces`                                 | Owner-scoped activity/branch state and invariants                                            | Client-selected owner scope or destructive history loss    |
| API `modules/mail`                                       | Encrypted outbox and retries                                                                 | Logging private links or provider credentials              |
| API `middleware`                                         | Origin/CSRF, limits and safe errors                                                          | Persistence/business rules                                 |
| API `integrations`                                       | Provider/transport adapters                                                                  | Browser dependencies or implicit data access               |
| API `shared/database`                                    | Connection-scoped Mongoose models and transactions                                           | Index deletion, ID rewrites or global connection models    |
| `packages/shared-types`                                  | Public DTOs, API prefix and locale constants                                                 | Mongo schemas, secrets, Node-only dependencies             |
| FastAPI service                                          | Authenticated tasks, deterministic preparation, manifests and supported local model adapters | Browser calls, Mongo writes or fabricated model readiness  |

The schema location is `apps/api/src/shared/database/models`, with explicit names
for account and product collections. Services consume `deps.models`; public API
DTOs remain separate. Keep hashing/encryption/timestamps explicit in services.
References do not replace workspace/branch predicates or transaction sessions.

Optional Gemini HTTPS transport belongs exclusively to the internal AI service.
`AI_PROVIDER` selects it explicitly; local adapters remain the default and never
fall back to cloud implicitly. Root development launchers pass `GEMINI_*` only
to the AI child. Both providers use the same result and evidence validators.

The opt-in `qwen` provider owns one offline persistent model child inside FastAPI,
with separate task interfaces and explicit capability/locale selection. `QWEN_*`
settings belong only to the AI child. It never supplies embeddings or numeric
forecasts, writes MongoDB, or silently selects another model/provider. See
[shared Qwen](../../apps/ai-service/docs/shared-qwen.md).

The clone implements the user-approved completion design. Read its
[shared contracts](integration-contract.md), [feature acceptance matrix](../product/implementation-matrix.md)
and executable modules before extending workflows. Retain strict authorization,
error/empty/loading states and meaningful tests. Some inherited future-boundary
READMEs are historical; do not let them override current executable contracts.
