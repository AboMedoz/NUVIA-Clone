# Shared offline Qwen

See the [recorded assessment and verification limits](../../../docs/development/shared-qwen-validation.md).

`AI_PROVIDER=qwen` reuses the existing Qwen2.5-1.5B-Instruct weights in **one
persistent serial child per AI service process**. Each service has its own compact
prompt/output interface. Run one Uvicorn worker on this laptop; multiple server
workers create multiple model instances. No downloads or cloud fallback occur.

## Assessed selection and limits

The October 26 synthetic assessment supports a limited **experimental** selection:

| Interface           | Selected locales | Limit                                                                    |
| ------------------- | ---------------- | ------------------------------------------------------------------------ |
| `report`            | English          | One short summary/section; also serves semantic cluster titles/summaries |
| `survey_generation` | English          | Five open-text draft questions requiring human review and publication    |
| `sentiment`         | Disabled         | Wrong mixed/neutral labels despite structurally valid results            |
| `aspects`           | Disabled         | Negative sentiment transferred to absent topics                          |
| `assistant`         | Disabled         | Invalid source references and inconsistent abstention                    |

Arabic drafts failed structure/relevance. Arabic reports were inconsistent across
inputs. Do not enable them based on a schema pass. Selected capabilities are not a
scientific acceptance claim; arbitrary domains, long reports, dialect coverage and
throughput under load remain unverified. All five interfaces exist for subsequent
evaluation; only explicit selections run. Normalization/language keep their
existing local/builtin selection. Embeddings, clustering and forecasting retain
their separate local-package readiness. Qwen alone cannot create numeric topics
or forecasts; cluster summaries need actual successful clustering and evidence.

## Prepare existing files

From the repository root, supply the actual existing weights folder and an
absolute target nested beneath `AI_MODEL_ROOT`:

```powershell
uv run --directory apps/ai-service python scripts/prepare_qwen.py --source "D:/path/to/qwen2.5-1.5b" --target "D:/path/to/NUVIA-Clone/.local/models/shared/qwen" --device cuda
```

This needs no Torch for preparation. The helper hashes existing single-file
safetensors/config/tokenizer artifacts, copies small files and hardlinks weights
when possible (otherwise copies them). It never modifies source files, downloads
or overwrites existing targets. Invalid candidates retain files without a
selectable manifest. Nested placement keeps the package outside default local
`*/manifest.json` discovery, preventing accidental local-provider activation.

Private AI process settings for the assessed selection:

```dotenv
AI_PROVIDER=qwen
QWEN_MODEL_PACKAGE=.local/models/shared/qwen
QWEN_CAPABILITIES=report,survey_generation
QWEN_REPORT_LOCALES=en
QWEN_SURVEY_LOCALES=en
```

Empty `QWEN_CAPABILITIES` disables all five interfaces. Locale settings must be
subsets of package languages; blank settings use package languages. Unsupported
task locales return 503 `model_unavailable` before inference. Unknown interfaces,
invalid subsets, unsafe/tampered packages and missing runtimes fail explicitly.

Use an existing Python environment with compatible Torch/Transformers/safetensors,
FastAPI and Uvicorn, optionally through private `AI_PYTHON_EXECUTABLE`. On the
assessed laptop, the existing CUDA environment was reused without reinstalling
packages. Other machines follow [runtime installation](model-packages.md).
CUDA cold readiness checks device availability and declared free memory; matching
resident weights do not need that memory twice. Obsolete idle instances are freed
before a changed package's cold-readiness check; active tasks are not interrupted.

`pnpm dev:full` / `pnpm dev:ai` pass `QWEN_*` only to Python. Restart the owned
development group after editing environment settings. Standalone Uvicorn reads
process environment, not root `.env`. Other providers require explicit selection;
no implicit fallback to Gemini or another local package occurs for these tasks.

## Contracts and recovery

Authenticated `/api/v1/tasks/{capability}` routes remain unchanged. Python supplies
application metadata such as survey question IDs/types around real model content.
`report` also accepts `parameters.purpose:cluster_summary`. The selected report
interface produces one concise section, not a full strategic multi-section report.

To reduce token cost, sources receive explicit one-based aliases in the model
input. Model-selected aliases map back to the original authorized IDs, and Python
attaches each selected source's entire exact text as its quotation. Unknown or
duplicate references, empty answered citations, quotations over 10,000 codepoints
and invalid output are rejected. Whole-source citations are distinct from
model-extracted phrase spans. Structural/source validation does not establish
claim entailment. Disabled aspect experiments use whole source-sentence spans
around model-predicted topic/polarity labels.

The assessed manifest allows 2048 input tokens and at most 1024 output tokens.
Oversized prompts and incomplete outputs fail; evidence is never silently trimmed.
The default 60-second deadline includes cold loading and every inference call in a
task. Busy requests return 429 immediately. Timeout, cancellation or child crash
terminates the owned child; the next task loads a fresh instance. A consumed
invalid-output reply keeps the loaded instance available for another task.
Shutdown releases the child and GPU memory. Weight/package/device/generation-option
changes replace the instance; interface or locale changes share it. The model
remains resident while idle.

Child and parent enforce normal result validation; Node retains independent
validation, authorization, retries and persistence. Provenance uses
`pipelineVersion:nuvia-qwen-shared-compact-1` and the package's SHA-derived
`modelVersion`. Readiness describes configuration/artifacts/runtime/device, not
scientific quality or guaranteed future successful output.

## Reproduce synthetic checks

Use the existing model runtime from the repository root and new ignored output paths:

```powershell
& 'YOUR_EXISTING_PYTHON.exe' apps/ai-service/scripts/smoke_qwen.py --package .local/models/shared/qwen --output .local/qa/qwen-smoke-new.json
& 'YOUR_EXISTING_PYTHON.exe' apps/ai-service/scripts/smoke_qwen.py --package .local/models/shared/qwen --suite followup --output .local/qa/qwen-followup-new.json
```

These checks use fixed synthetic examples and the production interfaces/validators.
They alter only their own process environment and write synthetic raw model
diagnostics alongside the chosen output. Existing evidence is preserved. The
different-input followup is a smoke check, not a held-out benchmark. No customer
data or MongoDB is accessed. Earlier failed trials are preserved under ignored
`.local/qa/`; the historical [survey trial](qwen-local-trial.md) remains evidence
about its older, rejected prompt profile.
