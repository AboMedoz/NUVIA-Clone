# NUVIA internal AI service

Authenticated, versioned FastAPI model adapters. Node selects authorized evidence, owns jobs
and MongoDB, and calls Python with `X-AI-Service-Key`. Browsers never receive that key or
call Python directly. Models are supplied later by the team; no weights ship with the app.

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
Sentiment, aspects, embeddings, clustering, forecasting, reports, assistant and survey suggestions
return `model_unavailable`/503 until a compatible trained package is installed. Configured invalid
models fail explicitly. Test fixtures never serve product inference.

See [model installation, formats and smoke checks](docs/model-packages.md) and
[internal task contracts](docs/contracts.md). Installing compatible artifacts updates the
registry without rebuilding web/API. No training, hosted inference or MongoDB writes exist here.

The [existing local Qwen survey-draft trial](docs/qwen-local-trial.md) proved actual CUDA
placement but failed reliable bilingual draft acceptance, so no Qwen package is active.

```powershell
uv run --directory apps/ai-service pytest
uv run --directory apps/ai-service ruff check .
uv run --directory apps/ai-service ruff format --check .
# Optional ONNX execution tests use temporary synthetic graphs:
uv run --directory apps/ai-service --extra onnx pytest
```
