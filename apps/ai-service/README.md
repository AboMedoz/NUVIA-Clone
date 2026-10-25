# NUVIA internal AI service

Authenticated, versioned FastAPI model adapters. Node selects authorized evidence, owns jobs
and MongoDB, and calls Python with `X-AI-Service-Key`. Browsers never receive that key or
call Python directly. Local models are supplied later by the team; no weights ship with the app.
An explicit optional Gemini provider can perform supported online tasks while preserving the
entire local package/adapter path for later team models.

```powershell
uv sync --project apps/ai-service --locked
$env:AI_SERVICE_KEY = 'YOUR_PRIVATE_RANDOM_SERVICE_KEY'
uv run --directory apps/ai-service uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- Public `GET /api/v1/health/live`: liveness; `analysis_available` requires both core sentiment
  and aspect packages ready. This metadata is not scientific model acceptance.
- Authenticated `GET /api/v1/capabilities`: per-capability readiness and versions.
- Authenticated `POST /api/v1/tasks/{capability}`: bounded, validated execution and provenance.

Language/script and Arabic/Unicode normalization with raw sentence offsets work deterministically.
By default (`AI_PROVIDER=local`), sentiment, aspects, embeddings, clustering, forecasting,
reports, assistant and survey suggestions return `model_unavailable`/503 until a compatible
trained package is installed. Configured invalid models fail explicitly. Test fixtures never
serve product inference.

See [model installation, formats and smoke checks](docs/model-packages.md) and
[internal task contracts](docs/contracts.md). Installing compatible artifacts updates the
registry without rebuilding web/API. No training or MongoDB writes exist here. Hosted inference
only happens after explicitly selecting and configuring Gemini; there is no automatic fallback.

## Optional online Gemini provider

Set private environment variables **on the AI service process only**:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=YOUR_PRIVATE_GOOGLE_API_KEY
GEMINI_MODEL=gemini-3.8-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=768
GEMINI_TIMEOUT_SECONDS=45
```

Never use a `VITE_` prefix or put the key in source, browser configuration, logs or images.
The root development launcher loads private settings for its AI child; a standalone `uvicorn`
invocation reads process environment, not the root `.env` file itself. Selecting `local` restores
local model selection and never calls Gemini, even when a Gemini key remains configured.

Gemini replaces selection for sentiment, aspects, embeddings, reports/cluster summaries,
assistant and survey drafts only. Existing language/normalization and local clustering/forecasting
remain available according to their existing registry. Clustering/forecasting still wait for
compatible local packages if none is installed. No local adapter, manifest, artifact or Qwen
trial is removed, activated or downloaded. Invalid provider names disable learned execution;
missing cloud configuration does not activate an installed local model as a fallback.

Blank/unset model settings use the defaults above. Model names are configurable simple IDs,
not URLs. The default text model is the currently documented stable `gemini-3.8-flash`;
Google currently restricts 2.5 Flash access to prior users. Check availability for the project's
key before deployment. Registry `readiness:configured_unverified_remote` means configuration
is present, not that credentials, quota, billing, remote availability or scientific quality were
verified. Health `analysis_available` follows that configured readiness and never probes Google.

Generation uses the documented `generateContent` REST endpoint and JSON Schema, then the
existing strict output/source validation runs in both worker and parent. Aspect taxonomy is
`nuvia-gemini-aspects-v1`: `staff`, `timeliness`, `quality`, `value`; quotes and absolute Unicode
spans must match original text. Reports/assistant require exact retained quotations; assistant
can abstain. Survey output remains a draft requiring review and explicit publication.

Embeddings use synchronous `batchEmbedContents`, one ordered vector per source, with
`embedContentConfig.outputDimensionality`, `taskType:CLUSTERING` and `autoTruncate:false`.
Dimensions default to 768 (bounded 128–3072), and vectors must match configured dimensions
and input IDs exactly. Vectors are L2 normalized, including reduced-dimension Embedding 001
outputs as Google instructs. Over-limit input is rejected by Google, never silently truncated.
Model input limits vary; long saved responses can consequently fail embedding honestly.

Cloud provenance uses `pipelineVersion:nuvia-gemini-json-1` and `modelVersion:gemini/<model>`;
embedding versions also include dimensions/normalization. Local versions remain unchanged.
Provider errors are bounded codes, without remote bodies, content, paths or keys. Rate limits
return 429 `model_busy`, timeouts 504 `model_timeout`; bad credentials, unknown models,
network failure, rejected input and invalid output fail explicitly. There are no hidden retries
or alternate model/provider calls. Node continues to own persistent job retries.

Requests use the fixed Google HTTPS host with certificate verification and a header API key,
no redirects or URL keys. HTTP timeout is bounded 1–55 seconds (default45), response reads
are capped at 2 MB, and the existing process supervisor enforces `AI_TASK_TIMEOUT_SECONDS`
and shared `AI_MAX_CONCURRENCY`; timed-out workers are terminated. Keep Node's request
budget greater than the total Python task budget plus process overhead.

Official references checked for this implementation: [structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[generateContent REST](https://ai.google.dev/api/generate-content),
[embedding REST](https://ai.google.dev/api/embeddings),
[embedding dimensions/normalization](https://ai.google.dev/gemini-api/docs/embeddings),
[3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) and
[2.5 access limits](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash).
Tests mock the HTTP boundary with synthetic data. No paid/live Google call, real customer
submission or model quality acceptance was performed.

The [existing local Qwen survey-draft trial](docs/qwen-local-trial.md) proved actual CUDA
placement but failed reliable bilingual draft acceptance, so no Qwen package is active.

```powershell
uv run --directory apps/ai-service pytest
uv run --directory apps/ai-service ruff check .
uv run --directory apps/ai-service ruff format --check .
# Optional ONNX execution tests use temporary synthetic graphs:
uv run --directory apps/ai-service --extra onnx pytest
```
