# Shared Qwen validation

Final assessment: October 27, 2026. Existing Qwen2.5-1.5B-Instruct artifacts,
SHA256 `dd924a11b4c220f385b51ffa522daea7c9f3d850e31b162bb5661df483c6d3ee`,
were reused offline on the laptop RTX 3050. No weights/runtime were downloaded.

The final private selection is **report/topic summaries and survey drafts in
English only**. Builtin/local preparation remains separate. Sentiment, aspects,
assistant, Arabic reports and Arabic drafts are not selected for Qwen.

## Evidence and limitations

- Real model diagnostics recorded all parameter devices as `cuda:0`, dtype
  `torch.float16`, allocated model memory 3,088,346,624 bytes. One load event and
  the same worker PID covered all interfaces in each assessment run.
- Initial shared tagged-protocol output mostly failed structure. Compact
  interfaces improved structure but not all quality: sentiment matched only five
  of eight simple labels, with mixed/neutral errors. Aspect classification emitted
  negative labels for absent topics. Assistant reference/abstention behavior was
  inconsistent. These paths remain disabled despite executable interfaces.
- The final different-input followup used helpful staff plus a checkout delay in
  two sources, and clothing-store/hotel survey goals. Both English report modes
  and both English drafts passed source/schema validation and manual content
  inspection. Drafts covered the requested topics but included some broader
  experience questions; human editing remains required.
- Arabic general-report output failed structure on that different-input check;
  a structural cluster-summary pass also omitted the waiting-time problem and
  overstated staff coverage. Earlier Arabic runs mixed languages. Arabic drafts
  also failed structure/relevance. English-only selection preserves these failures.
- The final source protocol uses explicit one-based aliases to reduce reference
  errors with arbitrary UUID-like IDs. Aliases map only to supplied original IDs
  and complete exact source quotations. Unknown/duplicate aliases fail.
- A dedicated temporary Python HTTP server exercised the real Node
  `capabilities()` and `executeTask()` integration, including Node result validation.
  English report, cluster-summary and five-question survey succeeded. Arabic
  report/survey returned unavailable; an unauthenticated request returned 401.
  Post-inference readiness stayed available with resident GPU weights.
- On those tiny HTTP examples, cold report latency was 14.71s, warm summary
  1.76s, and a five-question survey 4.49s. These are observations, not throughput
  guarantees. The dedicated test owned and stopped its server process tree;
  GPU memory returned to 0 MiB afterward. Existing development services were
  not interrupted.

Synthetic diagnostics remain ignored in `.local/qa/qwen-shared-*.json`,
`qwen-shared-*.diagnostics.jsonl`, `qwen-http-results.json` and
`qwen-http-server.log`. Failed iterations were preserved. The Node transport
check did not access MongoDB or create customer reports/surveys.

The reused Python runtime emitted existing dependency/deprecation warnings; no
packages were changed. Scientific accuracy, entailment, arbitrary input/domain
coverage, large cohorts, real browser workflows and sustained throughput are
not established. Oversized prompts fail without silent evidence truncation.
Root private settings are prepared for the next owned development-group restart;
the already running group was not reconfigured in place.

## Automated checks

The full Python suite passed (152 passed, one optional ONNX skip), as did Ruff
checks/format, launcher tests (10), Node AI-contract tests (11), backend unit tests
(6), and repository formatting. ESLint passed with two existing React-hook warnings
in the unchanged survey page; there were no lint errors.
IPC regressions cover cross-interface/locale reuse, idle replacement, busy refusal,
timeout/crash/cancellation recovery and shutdown errors. Configuration tests cover
tampering, unsafe placement, malformed config, CUDA/memory readiness and locale
restrictions. An independent read-only review found no unresolved important issue
after fixes. See [setup and reproduction](../../apps/ai-service/docs/shared-qwen.md).

## Review corrections before merge

Question labels are now stripped with the same string constraints as their final
public contract before duplicate detection. EN/AR regressions reject duplicates
that differ only by surrounding spaces, tabs/newlines or nonbreaking spaces;
distinct labels remain intact.

Two pre-existing CI blockers were also addressed: model path resolution now
supports the app-only Docker `/service` layout while retaining checkout-relative
configuration, and the invitation browser scenario uses the active approved
verification/dashboard text. Invitation token/session/membership and reload
assertions remain unchanged. Local invitation and product browser checks passed
with synthetic accounts and isolated replica sets. Local Docker execution was
unavailable because its daemon was not running; the copied-app import regression
covers the path failure, with the actual image check left to CI.

CI subsequently exposed the fast 72-state visual matrix reaching the existing
300-requests-per-user / 15-minute product limit after the functional checks.
Only that isolated test runner now advances its injected API clock by one actual
limiter window per independent locale/viewport batch. Production limits and the
unexpected-429 assertion remain unchanged. The eight advances are recorded in
test evidence and occur after functional authentication, token and permission
checks. A direct limiter regression verifies request 301 remains blocked until
the exact expiry boundary and that the renewed window still permits only 300.
