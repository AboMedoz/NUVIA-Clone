# Optional Gemini provider

The user approved Gemini online integration to avoid model downloads, with an
explicit requirement to retain the local model implementation for future team
models. This extends the existing AI service rather than replacing it.

FastAPI selects `AI_PROVIDER=local` (default) or `gemini`. No local failure may
trigger a cloud call. Node authorization, persistence, job processing and public
DTOs remain unchanged. Builtin preprocessing stays local. Gemini handles supported
text tasks and embeddings through bounded HTTPS requests with private credentials,
structured responses and the existing semantic/evidence validators. Forecasting
and supported local model packages remain available through the local path.

Provider/model provenance distinguishes cloud results from local results. Missing
credentials, rate limits, timeouts and invalid outputs must be honest failures.
No secrets, private text or raw provider errors are returned or logged. Gemini
credentials are passed only to the AI development child, never the browser child.
Existing model files, manifests, weights, runtime extras and configuration are
preserved. No new model downloads or automatic provider activation.

Acceptance: local regressions continue passing; mocked provider transport verifies
all supported contracts and error/security boundaries; root launch/setup tests
verify preservation and credential isolation. Real API quality/quotas require a
user-supplied key and separate synthetic evaluation. No live acceptance claim
without actual calls. No UI redesign or production deployment is included.
