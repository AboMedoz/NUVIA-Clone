# NUVIA Clone completion design

Status: approved by the user on 2026-10-25; implementation authorized in this
chat with delegated parallel work. Trained models will be supplied later.

## Intent and destination

Complete NUVIA frontend, backend and model integration infrastructure in
`D:/git_hub/NUVIA-Clone`, coordinated in the current chat using multiple agents.
The user and their team will supply trained models later. Training, obtaining
new model weights and proving their scientific quality are not part of this
implementation. Model-dependent features must remain usable in their honest
waiting/error states until compatible models are supplied.

Read-only inspection found the destination empty. Reuse the existing source
at `D:/git_hub/NUVIA` without modifying that original checkout. Its current
tracked `.gitignore` change must be preserved in the original. Do not implicitly
copy private environments, credentials, mail, customer data, dependencies,
generated results, Git internals or model artifacts. Establish independent
configuration and an isolated development/test database for the clone.

## Scope and sources

The original `docs/product/feature-list.md` describes 51 features: 23 Must,
17 Should, 5 Could and 6 deferred subscription features. Proposed delivery
scope is all 45 non-subscription features, preserving the original feature IDs
and consulting their PDF acceptance stories when implementing each feature.
The six SUB features remain deferred by the source; no payments are added.
Google OAuth is not a numbered feature requirement and is excluded here.

| Group           | Delivery                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| COL, 7 features | Versioned six-type questionnaire builder, editable templates, branch-specific public links, downloadable QR PNG, optional business page, persisted responses, segment fields |
| PRE, 6 features | Language/normalization/sentence interfaces and deterministic processing where appropriate; adapter slots for dialect/spelling/code-switching models                          |
| SEN, 3 features | Four-class response/sentence sentiment contracts, jobs, storage and UI; trained inference supplied later                                                                     |
| ABS, 3 features | Aspect/polarity contracts, evidence and versioned /10 aggregation; extraction models supplied later                                                                          |
| TOP, 3 features | Clustering, summaries and emerging-issue data/UI contracts; dependent outputs wait for configured providers and sufficient observations                                      |
| BI, 6 features  | Time series, comparisons, change/anomaly handling, forecasting and risk surfaces with sample sufficiency and uncertainty; model-dependent outputs wait for providers         |
| LLM, 5 features | Evidence snapshots, bilingual report flow, authorized retrieval/Q&A, exact quotations and editable survey suggestions; generative models supplied later                      |
| DSH, 8 features | Connected overview, aspect/sentiment/topic/trend/comparison views, common filters and authorized CSV/PDF export                                                              |
| PLT, 4 features | Preserve accounts, finish branch management and EN/AR/RTL coverage, add Owner/Manager/Viewer membership and branch assignments                                               |

Feature infrastructure completion and trained-model acceptance are separate
outcomes. This project must not claim all scientific acceptance criteria pass
when model weights, evaluations or sufficient real observations are absent.

## Approach and alternatives

Recommended approach: extend the existing pnpm monorepo, shared controls,
route/provider patterns, account security and reviewed visual assets. This
preserves working behavior and avoids a second incompatible design system.
A clean rewrite would discard tested account/security behavior and is not
justified by the requested clone destination. Hosting-builder workflows would
not deliver the requested local repository.

Keep React/Vite with JavaScript/JSX, Express/Mongoose/MongoDB for product data,
and Python/FastAPI for internal inference. Node owns authorization, persistence
and analysis jobs. Browsers call Node; Python does not write directly to MongoDB.
Reuse actual Figma data when accessible and existing approved assets otherwise;
never claim live Figma inspection without successful retrieval. New Figma-based
screen implementation requires retrieving its source, not inventing it.

## Product contracts

- Public links resolve the branch and immutable published survey revision.
  Customers never choose an owner/branch identifier. Edits preserve old answers.
- Accept public responses with strict validation, idempotency and a confirmation;
  reject closed links and invalid answers. Captured consent and optional contact
  remain explicit, with no real customer data imported during development.
- Use Owner/Manager/Viewer semantics from the feature source. Managers see assigned
  branches; Viewers can read/export authorized data without mutations. Apply scope
  consistently to API reads, jobs, reports, retrieval and exports.
- Store raw text separately from normalization and retain sentence offsets and
  literal source evidence. Aspect mention units are sentence/aspect pairs.
- Aspect scores are out of 10 with counts, scoring version and low-sample warnings
  below 10 mentions. Missing analysis has no fabricated score or distribution.
- Filters share date, workspace timezone, branch, language, aspect, sentiment and
  segment semantics across views, reports and exports.
- Reports/Q&A use fixed authorized evidence snapshots. Quotations must match saved
  responses and open their originals. Unsupported questions receive an honest
  insufficient-evidence state. Suggested surveys require human publication.
- Preserve EN/AR/RTL, keyboard/focus behavior, narrow layouts, loading, errors and
  empty states. Synthetic examples remain on explicit preview routes.

## Model integration design

Provide a versioned internal capability registry for language/preprocessing,
sentiment, aspects, embeddings/clustering, forecasting and generative tasks.
Each installed model has a manifest declaring its capability, adapter, supported
artifact format, local path, tokenizer/preprocessing requirements, languages,
taxonomy, model version, device/memory needs and input/output schema versions.
Only implemented and documented adapters are supported; arbitrary weights do not
become runnable merely by being copied into a folder.

Define canonical request/result contracts before agents implement consumers.
Requests include task/version, authorized input IDs/text and bounded parameters;
results include model/pipeline versions, status, validated labels, source spans
and evidence. Confidence is optional and never invented. Sentiment has positive,
negative, neutral and mixed labels. Taxonomies are configurable and versioned,
not permanently limited to restaurant aspects.

FastAPI authenticates Node calls, validates manifests/artifacts, checks readiness,
loads supported adapters lazily, bounds concurrency/timeouts and exposes per-task
availability. Artifact validation happens before deserialization; adapters use
safe supported formats and never automatically execute arbitrary model code.
Default operation is local/offline. Do not download or contact inference providers
implicitly. A future external provider requires an explicit configuration and
decision about permitted data.

Node persists queued/running/succeeded/failed/waiting-for-model states, retries
transient failures without duplicate outputs and records result provenance.
Installing compatible artifacts and enabling configuration makes that capability
ready; a documented command retries eligible waiting jobs. No deletion or silent
overwriting of old model-version results.

Preserve compatibility for the existing Qwen tagged-text output: model text is
parsed and validated in Python before serialization. Qwen is optional and is not
required for delivery. The existing runtime/weights stay outside the clone unless
explicitly configured. No training or new weights are required now.

Contract fixtures and tiny deterministic test adapters verify jobs/integration;
they must never populate product dashboards as if their outputs were real AI.
Provide example manifests, adapter documentation and a smoke-validation command
so the team can deliver compatible model packages later.

## Execution ownership and sequencing

First establish the safe source baseline and freeze shared DTOs, permissions,
survey revisions, job/result schemas and model manifests. Then run three agents
with separate file ownership: frontend, Node backend and FastAPI/model integration.
The coordinator owns shared-contract changes, integration and cross-app review.
Dependencies are sequenced even when independent implementation runs in parallel.

Implement the real public collection journey first, then connected feedback and
analytics, then reports/assistant/model-dependent surfaces and team/expanded flows.
These are execution dependencies within this request, not separate product
deliveries that silently reduce the requested overall scope.

## Verification and delivery

Maintain a feature acceptance matrix with implemented behavior, test evidence,
model dependency and unresolved acceptance limits for every feature ID.
Verify registration/setup, survey publication, public response submission,
persistence after refresh, authorized feedback/dashboard/export, and analysis-job
waiting/retry behavior. Cover tenant/branch isolation, role revocation, immutable
survey history, duplicate submissions and unavailable/invalid model output.

Run relevant app suites, Python lint/tests, build, formatting and rendered
desktop/mobile EN/AR checks. Use isolated replica sets, reusing local MongoDB
binaries only if explicitly configured. Check requested 360/768/1280 widths.
Measure source performance targets where executable; distinguish local evidence
from unverified production HTTPS, SMTP, deployment and later model quality.

Deliver editable source, setup/run/model-install documentation and an honest
completion report. Do not claim training/evaluation, deployment, real email
delivery or model-dependent accuracy without actual evidence. No source-repo
modifications, direct-main push, merge or deployment are authorized by this design.

## Decisions proposed by the coordinator

Reuse the current local source rather than refetching an unknown branch; preserve
the original checkout. Follow the feature source's Manager role rather than the
older draft's analyst role. Keep all 45 current-release features in scope and
the six subscription features deferred. Trained models and their scientific
acceptance will be supplied/performed by the user and team later. Retention
defaults must be documented and configurable; production policy is not inferred.
