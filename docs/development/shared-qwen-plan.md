# Shared local Qwen implementation

Use the existing Qwen2.5-1.5B-Instruct weights offline, with one persistent,
serial worker per AI service process. Keep Node authorization, persistence,
task contracts and double result validation unchanged.

One validated package supplies separate sentiment, aspects, assistant, report
(including cluster summaries) and survey-generation interfaces. Each interface
retains its prompt, parser and output contract. Enable only explicitly selected
capabilities after a synthetic EN/AR smoke assessment; this is not scientific
acceptance. Keep deterministic preparation and language detection. Do not route
embeddings, numeric clustering or forecasting to the causal language model.

Considered alternatives: per-task loading wastes model load time and cannot meet
the requested shared-instance behavior; an external model server adds another
installation and deployment boundary. A supervised persistent Python child
reuses the existing offline adapter and preserves hard termination on timeout.

Implementation and checks:

- [x] Test shared-process reuse, busy rejection, timeout/crash/cancellation recovery,
      safe configuration and capability selection before implementation.
- [x] Split model loading from text execution; add persistent worker and explicit
      Qwen provider with one package and per-service profiles.
- [x] Connect authenticated task routing and shutdown; preserve provenance,
      strict evidence validation, bounded input/output and no automatic fallback.
- [x] Reuse existing local weights/runtime for synthetic EN/AR assessment;
      document exact successes, failures, loading reuse and device placement.
- [x] Document configuration, run Python and affected launcher checks, review,
      commit and open a PR. Keep actual model artifacts and private settings ignored.

The existing survey profile failed bilingual quality. Do not inherit its extra
prompt or claim that structural success establishes useful or correct output.

Final selection: English report/topic summaries and English survey drafts only.
Additional Arabic inputs exposed content and structural failures after initial
single-source success, so Arabic stays unavailable. Source-ID aliases and
application-generated survey metadata reduce protocol cost without inventing
content. See [validation evidence](shared-qwen-validation.md).
