# Gemini live validation — 2026-10-25

The user supplied a private Google key after the initial mocked integration.
Small synthetic requests exercised the actual authenticated FastAPI route,
spawned provider worker, Google HTTPS inference and parent result validation.
No MongoDB/customer data was accessed and no model weights were downloaded.

## Verified synthetic cases

| Task         | Locale  | Result   | Seconds | Contract evidence                          |
| ------------ | ------- | -------- | ------: | ------------------------------------------ |
| Sentiment    | Arabic  | HTTP 200 |   1.366 | Sentence coverage and valid labels         |
| Aspects      | English | HTTP 200 |   1.280 | One exact source quotation/span            |
| Embeddings   | Arabic  | HTTP 200 |   0.918 | Two ordered vectors, 768 finite dimensions |
| Report       | Arabic  | HTTP 200 |   1.493 | Exact retained quotation and cited section |
| Assistant    | English | HTTP 200 |   1.145 | Exact retained quotation                   |
| Survey draft | Arabic  | HTTP 200 |   5.049 | Five questions accepted by existing schema |

These are smoke checks, not dialect, factual-entailment, performance or scientific
acceptance. Timings are individual observations, not a latency benchmark. Survey
drafts still require review before publication. Clustering and forecasting remain
on their existing local package path and are unavailable without those packages.

## Compatibility repairs established by live evidence

- Embedding 001 ignored nested embedding configuration and returned 3072 values.
  The same synthetic source with top-level `outputDimensionality:768` and
  `taskType:CLUSTERING` returned the requested 768 values. Production uses the
  verified fields and existing finite/dimension/source validators.
- No effective remote truncation switch was established. The embedding path
  therefore supports only `gemini-embedding-001` and rejects any source exceeding
  1024 UTF-8 bytes before sending the entire batch. It never crops or splits the
  saved source. This conservative byte policy is not a tokenizer equivalence proof.
- A production sentiment schema returned HTTP 400 on Flash Lite. The identical
  request with only remote `maxItems` constraints removed returned HTTP 200 and
  passed local validation. Production omits that remote keyword while retaining
  all local array limits, strict result types and citation/span validation.
- Listing a model is not inference permission: 2.5 Flash was listed but returned
  404 for this key. 3.8 Flash timed out on several short requests. An explicit
  3.5 Flash Lite comparison succeeded; no automatic fallback was introduced.

## Activation and provenance

Private root `.env` now selects `AI_PROVIDER=gemini` and
`GEMINI_MODEL=gemini-3.5-flash-lite`. The key and all other parsed settings were
verified unchanged. Restart the owned development group to load these settings;
no existing unrelated service was stopped or restarted.

Cloud pipeline metadata is `nuvia-gemini-json-2`. Embedding model provenance adds
`/d768/norm1/b1024-v2`. The functional smoke results above preceded only the
pipeline tag update from 1 to 2; their original artifacts were retained unchanged.
A fresh local registry check verified the final metadata for all six cloud tasks.
Builtin language/normalization retain `nuvia-ai-1` and all local adapters remain.

Ignored evidence is under `test-results/gemini-live/`: original failures,
model-list metadata, controlled diagnostics, `flash-lite/summary.json`,
`flash-lite/generation-fixed/summary.json`, `activation.json` and
`final-metadata.json`. Artifacts contain synthetic statuses/outputs and safe
metadata, never keys or private configuration lines. All owned smoke services
and workers were stopped.

Fresh regression verification after the repairs: 115 Python tests passed,
including optional ONNX tests, 43 API tests using an isolated replica set with
downloads disabled, root lint/format and Ruff lint/format. The permanent
`provider_input_too_large` code is preserved by Node instead of scheduling
transient retries. Independent scoped reviews passed. An exact-key scan of
all 20 smoke artifact files found no key bytes; private configuration/evidence
are ignored by Git.
