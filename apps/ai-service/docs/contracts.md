# Internal task contracts, schema version 1

All capability/task routes require `X-AI-Service-Key`; no CORS access is enabled. Liveness
is public and exposes no package paths. Errors never echo input text, service keys or paths.

`GET /api/v1/capabilities` returns schemaVersion, pipelineVersion (`nuvia-ai-1` for local,
`nuvia-gemini-json-2` for explicit Gemini selection), a
`capabilities` array and sanitized `configurationErrors`. Each entry has capability, status
(`ready`, `unavailable`, `invalid`), available, optional modelVersion/reason/readiness.
Entries identify their own provider and pipelineVersion: local/builtin entries retain
`nuvia-ai-1` even while the registry's selected provider is Gemini. Gemini configured
readiness is `configured_unverified_remote`; no paid probe occurs during discovery.
The ten capability names are language, normalization, sentiment, aspects, embeddings,
clustering, forecasting, report, assistant and survey_generation.

`POST /api/v1/tasks/{capability}` accepts strict JSON:

```json
{
  "schemaVersion": 1,
  "taskId": "node-job-id",
  "locale": "en",
  "text": "Slow service.",
  "sentences": [{ "id": "s1", "start": 0, "end": 13, "text": "Slow service." }],
  "evidence": [],
  "parameters": {}
}
```

Locale is en/ar. Raw sentence offsets are Unicode codepoints, zero-based/end-exclusive.
Sentences must be unique, ordered, nonoverlapping, match exact source substrings and cover
all nonwhitespace raw content. A caller cannot omit a negative sentence. Omitted
sentences are prepared deterministically. Evidence is `[{id,text}]`, scoped by Node.

Success is `{schemaVersion:1,status:"succeeded",capability,modelVersion,pipelineVersion,result}`.
Default deterministic modelVersion is `builtin-1`; normalization method is `unicode-arabic-v2`
and script language method is `unicode-script-v1`. Learned output always names its model version.
Gemini success also has `provider:"gemini"`, pipeline `nuvia-gemini-json-2` and version
`gemini/<model>` (embedding versions append dimensions/normalization). Local manifests and
result contracts are unchanged; see [optional Gemini configuration](../README.md#optional-online-gemini-provider).

| Capability        | Result                                                                               |
| ----------------- | ------------------------------------------------------------------------------------ |
| language          | `{language,method,sentences:[{sentenceId,language}]}`                                |
| normalization     | `{text,normalizedText,sentences:[{id,start,end,text}],method}`                       |
| sentiment         | `{label,confidence?,sentences:[{sentenceId,label,confidence?}]}`                     |
| aspects           | `{taxonomyVersion,mentions:[{aspect,label,sentenceId,start,end,quote,confidence?}]}` |
| embeddings        | `{vectors:[{id,values:number[]}]}`                                                   |
| clustering        | `{clusters:[{id,label,memberIds,evidenceIds}],noiseIds}`                             |
| forecasting       | `{points:[{date,value,lower?,upper?}],sampleCount,uncertainty?}`                     |
| report            | `{title,summary,sections:[{title,text,evidenceIds}],evidence:[{id,quote}]}`          |
| assistant         | `{status,answer,evidence:[{id,quote}]}`                                              |
| survey_generation | `{title,description,questions:[{id,type,label,required,options?}]}`                  |

Sentiment labels are positive, negative, neutral and **mixed**. Sentence sentiment is
complete coverage, not optional response-only success. Confidence is optional, finite,
in [0,1] and never invented by a parser. Aspects are unique sentence/aspect pairs with
exact raw quotations, valid offsets and manifest taxonomy/version membership.

Embedding IDs exactly match input evidence IDs, or taskId for one text. Cluster membership
partitions sources; citations belong to members. Forecast sampleCount equals input observations;
dates/intervals are validated. Report/assistant citations reference exact authorized substrings;
every report section cites returned evidence. Node rechecks authorization, immutable snapshots
and versions before persisting/displaying results.

Question types are short_text, long_text, single_choice, multiple_choice, rating, nps.
Generated suggestions have exactly5..10 questions; titles<=120, labels<=500 and options<=200
characters match publishing validation. Non-UUID model question IDs map deterministically
to UUID5 using the task ID and original ID; duplicate model IDs fail. Choices have unique
nonempty options. Suggestions require human editing/publication.
Export exact schemas with `python -m app.models.smoke schemas` in the service directory.

Language labels are ar/en/mixed/und. Assistant `status:"answered"` requires an answer and
verified citations. An unsupported question can return `{status:"insufficient_evidence",
answer:null,evidence:[]}` even with nonempty supplied evidence. This is a valid succeeded
task envelope containing a typed abstention; Node preserves its product state.

TOP-02 summaries reuse the report capability with `parameters.purpose:"cluster_summary"`
and `clusterId`. Supply only that authorized cluster's members as evidence; the returned
ReportResult retains citations and model/pipeline provenance. Numeric cluster labels alone
are never semantic summaries. Node keeps the summary waiting when the report model is absent.

Missing capability: HTTP 503, without result:

```json
{
  "schemaVersion": 1,
  "status": "unavailable",
  "capability": "sentiment",
  "pipelineVersion": "nuvia-ai-1",
  "error": {
    "code": "model_unavailable",
    "message": "No compatible model is ready for this capability."
  }
}
```

Execution errors use status `failed`, configured modelVersion and stable codes:
invalid_model_output (502), model_load_failed (502), model_busy (429), model_timeout (504).
Request errors are validation_error (422), service_authentication_required (401),
service_not_configured (503), unknown_capability (404), request_too_large (413).
Report/assistant/clustering without authorized evidence return insufficient_evidence (422).
Node preserves waiting-for-model separately from failed inference and retries appropriate states.

`GET /api/v1/health/live` reports analysis_available only when both sentiment and aspects
are ready in the registry. Builtin preparation alone keeps it false. Readiness metadata
does not establish trained-model accuracy or successful inference; run an actual smoke task.
