# Trained model package handoff

The team supplies trained artifacts. This service does not train, download weights, contact
model hubs or invoke hosted inference. Arbitrary checkpoints, pickle/Python plugins, GGUF,
LoRA-only checkpoints and remote model identifiers are unsupported.

| Adapter             | Capabilities                                                            | Format                                                                          |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `portable_linear`   | sentiment, language                                                     | `nuvia-linear-v1`: learned JSON linear coefficients                             |
| `transformers_text` | normalization, sentiment, aspects, report, assistant, survey_generation | `hf-safetensors`: local causal LM and tokenizer, Qwen ChatML, tagged plain text |
| `onnx_text_encoder` | embeddings                                                              | `onnx-tokenizers`: self-contained ONNX plus Tokenizers JSON                     |
| `onnx_numeric`      | clustering, forecasting                                                 | `onnx`: one float32 input, capability-specific numeric output                   |

## Install isolated dependencies

Use Python >=3.11 and uv. From the repository root:

```powershell
uv sync --project apps/ai-service --locked
# Install only the extra required by supplied models:
uv sync --project apps/ai-service --locked --extra onnx
uv sync --project apps/ai-service --locked --extra transformers
# Both adapter stacks:
uv sync --project apps/ai-service --locked --all-extras
```

These install libraries, not model weights. The default stack runs deterministic preparation
and portable models. Optional versions are recorded in this app's `uv.lock`. The causal stack
pins Torch 2.11.0, Transformers 4.57.1 and safetensors 0.6.2. Install a Torch build matching
the actual CPU/CUDA machine in **this clone's interpreter**, never the original environment.
For example, when the machine supports the vendor's CUDA 12.8 wheel:

```powershell
uv pip install --python apps/ai-service/.venv/Scripts/python.exe --reinstall torch==2.11.0 --index-url https://download.pytorch.org/whl/cu128
apps/ai-service/.venv/Scripts/python.exe -c "import torch; print(torch.__version__); print(torch.cuda.is_available())"
```

Do not claim CUDA availability until that interpreter reports it. `device: "cuda"` fails
when CUDA is unavailable. The ONNX extra installs CPU `onnxruntime`; CUDA ONNX needs a matching
`onnxruntime-gpu` distribution instead, with the CPU distribution removed. Do not install both.
Verify `onnxruntime.get_available_providers()`. ONNX provider kernels can still dispatch some
operators to CPU; this service does not establish complete GPU operator placement.

The optional ONNX encoder and forecast adapters were executed against tiny temporary test-only
graphs. A later [existing-Qwen trial](qwen-local-trial.md) verified actual CUDA loading, but
did not establish an acceptable bilingual survey-draft profile and remains inactive. No weights
were downloaded. Other trained packages, device acceptance and scientific quality remain separate.

## Configure privately

Node and Python share a private key. Python reads process environment; a direct uvicorn command
does not automatically read root `.env`. The root full-development launcher forwards `AI_*`.

```dotenv
AI_SERVICE_KEY=YOUR_PRIVATE_RANDOM_SERVICE_KEY
AI_MODEL_MANIFEST_DIR=.local/models
AI_MODEL_ROOT=.local/models
AI_MAX_CONCURRENCY=1
AI_TASK_TIMEOUT_SECONDS=60
AI_MAX_MODEL_MEMORY_MB=16384
```

Relative paths resolve against the repository root, independently of the working directory.
In the app-only Docker image, relative paths resolve against the service root
(`/service`); the configured absolute `/models` mount remains unchanged.
Absolute paths are supported. Every package remains inside `AI_MODEL_ROOT`. The registry scans
`manifest.json` in `AI_MODEL_MANIFEST_DIR` and its immediate package subdirectories, up to 64.
Duplicate packages for one capability fail closed; they do not silently overwrite one another.

```text
.local/models/
  sentiment-team-v1/
    manifest.json
    config.json
    tokenizer.json
    tokenizer_config.json
    model.safetensors
  aspects-team-v2/
    manifest.json
    ...
```

`examples/manifests` provides templates for every capability. Placeholder hashes deliberately
prevent activation; no learned artifacts are included. Copy a template to the private package
and supply the immutable model version, languages, device/memory needs, exact artifact names
and taxonomy. Aspects require a configurable versioned taxonomy, including non-restaurant domains.

Every artifact needs a SHA256 entry. Generate the entries locally and copy the printed
`artifacts` object into `manifest.json`:

```powershell
uv run --directory apps/ai-service python -m app.models.smoke hashes ../../.local/models/sentiment-team-v1
```

Paths are package-relative and cannot traverse or link outside it. Permitted data extensions
are JSON, safetensors, TXT, SentencePiece `.model` and ONNX. HF packages reject unlisted files,
pickle weights, `auto_map` and custom code. Keep README/training code outside the runtime
package. Sharded safetensors require a declared index and every referenced shard. ONNX external
data, nested external tensors and custom operators/functions are unsupported; supply a
self-contained model below the protobuf size limit.

Product inference rejects `testOnly: true`. Model version names are provenance identifiers;
substrings such as `test` or `fixture` do not decide package eligibility (`latest-1` is valid).
Temporary test coefficients/graphs must never be installed to simulate product analysis.

## Validate, execute and activate

```powershell
uv run --directory apps/ai-service python -m app.models.smoke schemas
uv run --directory apps/ai-service python -m app.models.smoke validate ../../.local/models/sentiment-team-v1/manifest.json
uv run --directory apps/ai-service python -m app.models.smoke validate ../../.local/models/sentiment-team-v1/manifest.json --request examples/requests/sentiment.json
```

`schemas` prints the versioned manifest, request and result JSON schemas. Validation without
`--request` checks integrity and dependency names; it does not claim model loading. A smoke
request lazily loads a child process, executes the adapter and validates output/evidence.
Exit status is 0 for success and 2 for unavailable/invalid/failed execution. Smoke results
containing customer text are private local output.

Install complete immutable directories atomically. The next request discovers them; no
frontend/backend rebuild is needed. Restart Python if interpreter/dependency/environment
configuration changes, then retry eligible waiting jobs through Node's analysis retry action.
Node retains older model/pipeline results and provenance.

Ready metadata (`readiness: "validated_artifacts_lazy_load"`) means manifest/artifact/dependency
checks passed; it is not successful model execution or scientific acceptance. A smoke task
proves execution for that exact package/device/input. Missing models, failed loading, malformed
output and timeouts remain explicit states.

## Exact adapter input/output formats

### Portable learned coefficients

The JSON has exactly `labels`, `vocabulary`, `weights`, `bias`, `lowercase`. `labels` contains
each canonical class once: positive/negative/neutral/mixed for sentiment, ar/en/mixed/und for
language. `vocabulary` is a unique ordered token array; `weights` is a labels-by-vocabulary
matrix; `bias` has one finite number per label; `lowercase` is boolean. Features are counts
from Unicode `\w+` tokenization, lowercased only when declared. Highest score wins; label
order breaks ties. Train with these exact preprocessing rules. Raw scores are not fabricated
confidence probabilities. The adapter classifies both whole text and each raw sentence.

### Local Qwen-compatible causal text

Only causal architectures already implemented in the installed Transformers build work.
Loading is local-only with `trust_remote_code=False` and `use_safetensors=True`; no custom
artifact Jinja template is executed. A fixed Qwen ChatML prompt wraps the task. Generation
is deterministic and token-bounded; source evidence is never silently truncated. Optional
`systemPrompt` is explicit team configuration, not a model-quality improvement claim.

The model emits plain tags; Python alone constructs JSON:

```text
SENTIMENT|mixed
SENTENCE|s1|positive
SENTENCE|s2|negative
END
```

Every source sentence needs one sentiment prediction. A legacy model returning only a
`SENTIMENT|label` header is called separately on each sentence by the adapter; it does not
receive invented sentence labels. Partial/duplicate/unknown coverage fails validation.

```text
ASPECT|service|negative|s1|0|16|Service was slow
END
```

Aspects use the manifest taxonomy. The explicit format is
`ASPECT|aspect|label|sentenceId|start|end|quote`, with absolute raw Unicode offsets. It can
distinguish repeated identical quotations in different sentences or source locations.
Legacy `ASPECT|aspect|label|quote` remains valid only for one unambiguous literal occurrence.
`END` alone explicitly represents zero mentions. Missing/ambiguous legacy quotes, invalid labels,
wrong sentence/span identity, unknown taxonomy entries
and duplicate sentence/aspect pairs fail. Confidence is never invented by the text parser.

Normalization uses `<normalized>...</normalized>` and preserves original raw text/offsets.
A manifest can declare `normalizationTasks`: spelling, arabic_dialect, code_switching. These
semantic operations need a trained model. Default deterministic normalization applies NFC,
Arabic alef/ya variant mapping and diacritic/tatweel removal only to `normalizedText`.

Assistant/report text uses escaped XML-like tags with no declarations/entities:

```xml
<answer>Grounded answer.</answer>
<evidence id="response-id">Exact source quotation</evidence>
```

For an unsupported question return only `<abstain>insufficient_evidence</abstain>`.
Python validates the typed `{status:"insufficient_evidence",answer:null,evidence:[]}` result,
including when authorized evidence is nonempty but irrelevant. Answered results require citations.

```xml
<title>Report</title><summary>Grounded summary</summary>
<section title="Service" evidenceIds="response-id">Grounded section.</section>
<evidence id="response-id">Exact source quotation</evidence>
```

Every report section cites returned evidence, and each quotation must be a literal substring
of the authorized Node snapshot. These checks prove identity/literal provenance, not logical
entailment of every generated assertion. Grounding/prompt-injection evaluation remains part
of trained-model acceptance.

Survey suggestions use `<title>`, `<description>` and repeated
`<question id="q1" type="long_text" required="false"><label>...</label></question>`.
Choices add `<option>` children. The emitted schemas list the six types. Suggestions never publish.
The contract requires5..10 questions. Model-local IDs such as q1 are mapped to deterministic
publish-compatible UUID5 IDs. A complete isolated `xml` Markdown fence around survey tags is
accepted as formatting; surrounding prose, invalid types/counts or malformed questions still fail.

### ONNX encoder

Inputs use any needed subset of `input_ids`, `attention_mask`, `token_type_ids`, int64
`[batch,tokens]`. The supplied Tokenizers tokenizer pads; inputs exceeding `maxLength`
(default 512, max 4096) fail without truncation. Output is float `[batch,dimensions]` or
`[batch,tokens,dimensions]`. Token output uses masked mean pooling or explicit `pooling:"cls"`.
Vectors retain input source IDs, equal dimensions and finite values. No implicit L2 normalization.

### ONNX clustering

Supply `evidence:[{id,text}]` and matching ordered `parameters.vectors:[{id,values}]` from
embeddings. The graph input is float32 `[N,D]`, output integer `[N]` labels; -1 means noise.
The adapter requires at least three observations; Node/model acceptance may require more.
Sources partition into one cluster/noise set each. `Topic 0` is a numeric group identifier,
not an invented semantic summary.

Semantic TOP-02 summaries run separately through the `report` capability with
`parameters.purpose:"cluster_summary"` and `clusterId`. Its prompt requests an evidence-grounded
semantic title/summary for only those members, and ReportResult citation validation is unchanged.
Installing a report model enables this path; numeric clustering alone leaves summaries waiting.
Node selects vectors with a120,000-byte UTF-8 parameter budget before queuing; sampling metadata
and selected IDs remain visible. A32x384 cohort of ordinary full-precision vectors must be sampled,
not sent as an impossible128k request repeatedly.

### ONNX forecasting

Supply ordered unique `parameters.observations:[{date,value}]` and ordered `futureDates`
after the last observation. Input is float32 `[1,T]`; output float `[H,3]` contains value,
lower, upper. Model-provided intervals must contain the prediction. `minObservations`
defaults to 30, minimum 3; `horizon` defaults to 30, maximum 366. These are mechanical guards,
not proof of statistical sufficiency/calibration. Node owns bucket/metric/scope selection.

## Runtime limits and evidence

Bodies and worker output are bounded at two MB; text at50,000 Unicode codepoints; evidence at
200 items with32,768 characters each; parameters at128,000 compact JSON UTF-8 bytes. Sentence
lists are bounded at16,384 so a valid32k response containing many tiny sentences is preserved.
Supplied sentence spans must cover every nonwhitespace source character. Offsets are Unicode
codepoints, zero-based/end-exclusive, not JS UTF-16 indices. Sentence evidence always refers
to raw text, including after normalization.

Inference uses a fresh spawned process per task. It loads lazily, releases memory afterward
and is terminated on timeout/cancellation. Excess work gets `model_busy`/429; no unbounded
queue exists. Defaults are one worker/60 seconds, configurable to 1..8 workers/1..600 seconds.
Process-per-task loading trades warm throughput for isolation; large models may need longer
timeouts. Declared memory and CUDA free-memory checks are admission checks, not OS quotas.

Sentence splitting uses punctuation/newlines, and language uses an explicitly labelled
Unicode-script heuristic, including per-sentence IDs. Latin script is reported as the supported
English lane; this is not trained language/dialect accuracy. Spelling correction, dialect
semantics and code-switch translation remain model-dependent.

Primary references: [Transformers offline loading](https://huggingface.co/docs/transformers/main/installation),
[ONNX Runtime Python API](https://onnxruntime.ai/docs/api/python/api_summary.html).
