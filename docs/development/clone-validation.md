# NUVIA Clone delivery and validation

The subsequent [comprehensive QA pass](comprehensive-qa.md) records current
feature/Figma/browser checks, live Gemini product evidence and later repairs.
Counts below describe the earlier delivery checkpoints.

This record distinguishes connected product behavior, model-ready plumbing and
trained-model/scientific acceptance. The user approved the completion design and
requested parallel execution in this clone. Trained models are supplied later;
subsequent HF/Colab comparisons are a separate diagnostic, not product acceptance.

## Source and scope

- Independent repository at `D:/git_hub/NUVIA-Clone`, branch `feat/complete-nuvia`,
  based on local source commit `b7ae543f5a9c5073eee5fc7ce7649ba58e185066`.
- The original checkout was read for source/references and an existing local
  MongoDB executable; its private environment, mail, customer data and model
  artifacts were not imported as application data/configuration.
- Scope: 45 current-release features. Six SUB features remain deferred. Detailed
  behavior and model/acceptance limits are in [the matrix](../product/implementation-matrix.md).
- Node owns authorization, storage and background jobs; Python owns authenticated
  capability tasks. Existing JavaScript/JSX/.mjs and shared design components remain.

## Verified checks

| Check                       | Evidence/result                                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web tests                   | 60 Vitest tests / 8 files, plus dev-server private-file isolation test, passed                                                                                                                                                          |
| API tests                   | Final implementation suite 40 passed; isolated UUID test replica sets only                                                                                                                                                              |
| Python                      | 69 tests with ONNX optional extras passed; temporary synthetic graphs only                                                                                                                                                              |
| Python static checks        | Ruff check and format check passed, 32 files                                                                                                                                                                                            |
| Launcher/setup              | 7 tests passed, including preserved keys, secret separation and explicit local Python override                                                                                                                                          |
| JavaScript lint             | Root lint passed across web/API/shared/scripts/e2e                                                                                                                                                                                      |
| Production web build        | Passed; initial bundle retains a roughly517kB Vite advisory, not a measured performance pass                                                                                                                                            |
| Public product HTTP journey | Survey create/publish -> anonymous answer -> branch-bound saved feedback -> idempotent retry -> real counts/CSV -> waiting analysis -> close preserving evidence: passed                                                                |
| Account browser lifecycle   | Actual registration/verification/login, saved onboarding, failed-save recovery, reset/revocation, EN/AR/mobile and preview isolation: passed                                                                                            |
| Invitation browser          | Actual owner invite -> fresh context signup -> file-mail verification in NEW TAB -> login cookie rotation -> Arabic narrow acceptance -> shared Cairo-only Viewer, no owner workspace; 24 API calls and zero API/console/runtime errors |
| Connected rendered routes   | Real core survey/public/feedback/report journey plus60 route/language/width checks passed; EN/AR at360/768/1280                                                                                                                         |
| Current visual captures     | 18 bounded changed-screen captures passed after final layout corrections                                                                                                                                                                |
| Learned chart rendering     | 12 explicitly TEST-ONLY fixture checks; no fixture results persisted into product                                                                                                                                                       |
| Live Node/Python transport  | Authentication, registry, raw Unicode sentence spans, mixed-script preparation, no-model states, full12,001-character response and small-exponent vector payload: passed                                                                |
| Numeric budget proof        | Actual Python validated15 vector workloads plus21,267 deterministic finite scalar-size cases; no vector rounding or dimension alteration                                                                                                |
| PDF                         | Actual Arabic export rendered to PNG and inspected after full-font and mixed-direction fixes: no missing glyphs; Latin dates/status and Arabic evidence readable                                                                        |
| Containers                  | `docker compose --profile ai config --quiet` passed; Docker daemon unavailable locally, so image build/runtime not established                                                                                                          |

The final independent scoped review gates approved the repaired frontend,
internal AI and API/root integration. Original review defects were fixed with
focused regressions, including state-loss races, invitation continuation,
sparse calendar charts, error-state honesty, source spans, abstention, input
budgets, semantic cluster summaries and scheduler fairness. No unresolved
P0/P1 issue was established by these reviews; this is not an exhaustive security
audit or a guarantee that no defects exist.

## Evidence locations

- `test-results/clone-ui/`: preserved real UI screenshots and route results.
- `test-results/accounts/`: account lifecycle screenshots from the actual browser run.
- `test-results/invitations/`: portable invitation runner output; the original
  execution report/screenshots are also retained in the ignored execution evidence.
- `test-results/product/report-ar.pdf` and `.png`: synthetic saved-response PDF QA.
- `.local/qa/vector-exponent-{cases,report}.json`: exact Node/Python numeric-size proof.
- `tests/e2e/{product-api,model-service,run-invitations}.mjs`: reproducible integration checks.
- [Local Qwen trial](../../apps/ai-service/docs/qwen-local-trial.md) and
  [HF/Colab model comparison](../model-research/README.md): separate model evidence.

## Model status and practical limits

Builtin Unicode-script detection, Arabic normalization and source-preserving
sentence preparation work without learned weights. These are deterministic
baselines; script classification is not calibrated language/dialect accuracy.
Sentiment, aspects, embeddings, clustering, forecasts, report/summary generation,
assistant and survey suggestions require compatible supplied packages.

The existing local Qwen2.5-1.5B was actually run on CUDA with all parameters and
inputs on the GPU. Bounded survey-draft trials had format, language or relevance
failures; it remains **inactive**. Successful CUDA loading was not treated as
model quality. No new model weights were downloaded to this computer.

Model outputs are validated mechanically against source/shape/contracts. Literal
citations do not prove factual entailment or the usefulness of recommendations.
Scientific acceptance, language/dialect accuracy, clustering/forecast quality and
the source F1/throughput/latency goals remain separate evaluations.

The background worker is sequential per API process. Learned adapters use bounded
isolated processes; cold model loading trades warm throughput for termination.
Cluster vector-aware sampling and report evidence snapshots disclose their
coverage; they do not imply complete-corpus scientific analysis.

`DATA_RETENTION_DAYS` is a bounded policy setting, default0 (disabled). No automatic
purge or destructive retention workflow is enabled; production policy/deletion
and invalidation of all derived evidence require deliberate design/acceptance.
Observed decline/risk indicators are documented baselines, not calibrated
change-point/anomaly/forecasting claims.

## Running this checkout

JavaScript dependencies and the minimal/optional test Python environment were
installed. A private ignored `.env` has independent database name `nuvia_clone`
and generated mail/AI keys. No original MongoDB URI was copied: configure a
private local replica-set/Atlas URI before ordinary `pnpm dev` or `pnpm dev:full`.
The isolated tests above already exercise MongoDB persistence without touching
application/customer databases.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
# Configure your private MongoDB replica-set URI, preserving existing keys.
pnpm db:check
pnpm db:setup
pnpm dev
# Optional internal AI service:
uv sync --project apps/ai-service --locked
pnpm setup:models
pnpm dev:full
```

`pnpm dev` and `pnpm dev:full` are alternatives, not concurrent groups.
`AI_PYTHON_EXECUTABLE` optionally selects an existing compatible local runtime;
otherwise the launcher uses locked offline uv. Supported model package formats,
hashing and smoke checks are documented in the AI service guide. No arbitrary
checkpoint is promised to run solely by being copied into a folder.

No remote push, merge, hosted deployment, production HTTPS, real SMTP acceptance,
Atlas acceptance or backup/restore drill is claimed by this local delivery.

## Completed model comparison

All 11 shortlisted models completed actual Colab inference. See the
[Arabic results and download-size table](../model-research/RESULTS-AR.md),
[detailed NLP measurements](../model-research/MEASURED.md), and
[separate synthetic forecasting diagnostic](../model-research/FORECAST.md).
Frozen inputs remain byte-exact; saved-output audits verified all nine NLP
records and both forecasters against the fixtures. No new model weights were
downloaded locally. These small diagnostic results are not production model
acceptance; all tested generators failed the complete survey-output contract.
Qwen2.5 remains inactive and Qwen3.5/GGUF runtime integration is separate work.

## Optional Gemini addition

See [online setup and local switching](gemini-ar.md). The explicit optional
provider preserves all local adapters/manifests and defaults to local. Fresh
validation: 108 Python tests including 39 Gemini cases and optional ONNX; 42 API
tests with an isolated replica set; 9 launcher/setup tests; live local
Node-to-FastAPI contracts; Ruff check/format, root lint/format and quiet compose
configuration. Independent review passed. Tests use synthetic provider replies.
At the initial integration checkpoint no private Gemini key or live Google
inference was available; scientific quality acceptance remains unestablished. No cloud call or model-weight download was made. A MongoDB test
runner initially started a binary download; it was stopped and tests then used
the existing original-checkout executable read-only with downloads disabled.

The subsequent user-authorized [live Gemini check](gemini-live-validation.md)
verified six synthetic task contracts and selected Flash Lite in private settings.
Its compatibility repairs have 115 passing Python tests. The initial no-live-call
statement above describes the earlier integration checkpoint only.
