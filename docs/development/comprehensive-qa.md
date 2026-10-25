# Comprehensive clone QA — 2026-10-25

This pass compares the current-release feature list, actual Figma frames,
connected storage/authorization, the selected online AI provider and real browser
workflows. It started from `33083e7` on `feat/complete-nuvia`. Six subscription
features and Google OAuth remain outside the approved release. The
[feature matrix](../product/implementation-matrix.md) records per-feature limits;
passing infrastructure tests does not establish every scientific acceptance goal.

## Repairs established by reproductions

- CSV export now authorizes and validates its cohort before starting a download.
  Invalid segment JSON returns 422; an unassigned branch returns 404. A database
  cursor failure after streaming begins aborts the incomplete download rather
  than leaving the request hanging or presenting truncated evidence as complete.
- Node independently checks complete source/sentence/vector/cluster/forecast
  coverage before accepting AI results. Python normalization rejects duplicate
  sentence IDs and results exceeding the downstream sentence limit. A separate
  review caught a new JavaScript/Python whitespace mismatch; the correction was
  checked against all 1,114,112 Unicode codepoints and actual service requests.
- Gemini sometimes returned correct literal aspect quotes with incorrect numeric
  offsets. The adapter now derives offsets only from a unique exact occurrence
  inside the declared source sentence. Existing valid spans remain valid;
  ambiguous, invented and foreign-sentence quotes still fail strict validation.
  These repairs introduced `nuvia-gemini-json-3`; the final prompt-scoping repair
  advances provenance to `nuvia-gemini-json-4` without retagging earlier outputs.
- Report instructions now require cited observations/problems and prioritized
  proposed actions, disclose small samples/unknown causes and distinguish the
  platform from the reviewed business. Earlier deficient reports are retained as
  evidence, not rewritten as if the original model had succeeded.
- Connected Overview, Reports, Surveys, Builder, Feedback and Branches received
  Figma-derived layout/type/control corrections while keeping real account data.
  Mixed/unknown language filters, QR share layout, corrected public validation
  errors, native-control ownership and localized chart dates were repaired.
- Invitation/resend email and public business settings now show localized field
  errors and focus instead of relying on host-browser validation bubbles. Invalid
  fields send no write request; failed saving retains drafts. Shared growing
  textareas keep long text editable. Visible scrolling replaces hidden RTL/page
  scrollbar rules. Browser titles now follow route/locale, and the unsupported
  fixed-zero unread badge is omitted from real accounts. Header search opens
  actual feedback results on Enter, supports Ctrl/Meta K, ignores composing Enter
  and provides an accessible clear action.

## Verified backend and AI checks

| Check                                      | Result and practical boundary                                                                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API suite                                  | 54 passed after the Unicode correction; disposable replica set only                                                                                                                                            |
| Web suite                                  | 82 component/interaction tests plus the private-file isolation test passed                                                                                                                                     |
| Product browser                            | 18 workflow checks, 72 EN/AR route/width/title states and 190 API responses passed with zero unexpected errors                                                                                                 |
| Python                                     | 131 passed including installed optional ONNX tests; Ruff check/format passed                                                                                                                                   |
| Node/Python integration                    | Actual authenticated FastAPI requests, source-preserving preparation, Unicode separators/BOM, long input and vector admission passed                                                                           |
| Independent code reviews                   | Backend/AI review closed its reproduced Unicode finding; Overview/Reports and form reviews found no remaining important defect in their scopes                                                                 |
| Account and invitation browser regressions | Registration/verification/login/setup/reset and new-tab invitation continuation passed in real Edge with isolated identities/file mail                                                                         |
| Live Gemini product pipeline               | Four purposeful synthetic responses, all 20 response jobs succeeded after repairs; persisted whole/sentence labels, literal aspect spans and finite normalized 768-dimensional vectors checked                 |
| Live generated tasks                       | Grounded Arabic assistant cited two sources; an unsupported financial question abstained; English survey draft produced six questions; final AR/EN reports contained three sections and four literal citations |
| 10,000-response API workload               | Analytics 1.193–1.238s, full CSV 530ms, report snapshot 1.066s; two 5,000-row branches and one identical eight-filter cohort verified                                                                          |

The live model workload comprised 25 cloud-capable attempts, including purposeful
diagnosis/retries; this is not a billing count or a statistical accuracy estimate.
The performance workload used explicit synthetic fixture analysis and zero model
calls. API timings include local HTTP/database/serialization, not browser paint,
4G networking, concurrent production load or cloud inference.

Subsequent UI validation made three additional cloud-capable attempts: one
Arabic assistant output was rejected, an explicit retry succeeded with two exact
citations, and Arabic survey generation returned five questions that were
reviewed, edited and saved as an unpublished draft. Both rejection and recovery
are retained; success is not a guarantee that every future generation will pass.
After the earlier disposable service ended, read-only report/render tests restored
its actual saved synthetic outputs into a fresh isolated database. Original
outputs/IDs/provenance were retained; authentication/storage metadata was newly
generated for QA. Restoration made zero inference calls and is not counted as a
new 20-job acceptance run. Actual AR/EN report direction, original-source links,
downloaded Arabic PDF glyphs/layout and localized titles were then checked.

The final three-step wizard introduced a further live check with six appropriate
Arabic questions, but its title copied the generic report-title example. That
sample remains preserved. The confirmed cause was report-specific wording in the
common task instructions. Pipeline 4 scopes it to reports and gives surveys
goal-appropriate title instructions; four regressions failed before the repair.
One fresh browser request with English UI, explicitly Arabic survey locale and
an English goal then returned six Arabic questions and the appropriate title
`استبيان تجربة العملاء في المقاهي`. Review, manual editing, RTL mobile preview
and actual saving to an unpublished draft passed; no publication call occurred.
See `live-wizard-title-fixed-results.json`. Generation follows the selected
survey language and discards stale results after locale/template changes.

The route handoff and newly saved wizard were also tested through the actual
AppRouter. Searches survive the protected route remount via an explicit fragment
query; clearing removes it. Silent URL replacement when saving does not remount
and erase a later unsaved edit on locale change. Actual navigation and changes
to account/workspace/role/branch access still reset the private workspace state.

## Figma evidence and intentional differences

Actual design contexts/screenshots were retrieved from file
`ugEDZY82qMAPHkxRjwsoze`: login `159:1342`, surveys `258:1329`, builder `259:4272`,
feedback `267:15016`, reports `299:763`, overview `325:5862`, branches `569:328`.
The builder pass additionally retrieved question editing `262:10407` and sharing
`262:11716`, rather than inferring those steps from the details frame.
Reference images are retained as `test-results/comprehensive-qa/figma-*.png`.
The shared sidebar/header geometry and Figma typography, cards, table hierarchy,
compact controls and chart/report grids guide the connected screens.

The real product deliberately retains four sentiment classes, aspect scores out
of ten, sample counts, full authorized filters and truthful missing-model states.
Reference completion-rate, subscription, upload, fictional daily insight and
illustrative recommendation controls are not promoted into unsupported account
features. The builder uses real details/questions/sharing steps and a read-only
current-draft mobile preview. Entering sharing validates and saves the current
revision; publication remains a separate explicit action. Existing immutable
links keep their original questions until the selected branches are republished.
Per-question bilingual translations are not claimed. Mobile/RTL extensions without matching source frames are verified
for behavior and layout, not claimed to be exact pixel copies.

## Reproduction and evidence

Use an existing MongoDB executable for local tests, with downloads disabled:

```powershell
$env:MONGOMS_SYSTEM_BINARY = 'D:\git_hub\NUVIA\.local\tools\mongod.exe'
$env:MONGOMS_RUNTIME_DOWNLOAD = 'false'
pnpm test:backend
pnpm test:e2e:product
pnpm test:e2e:models
pnpm test:e2e:accounts
pnpm test:e2e:invitations
pnpm test:e2e:product:browser
```

The product browser runner is reproducible and has no configured AI provider or
paid calls by default. Its single deliberate 503 checks public-form recovery;
other requests use the real isolated API. Separate live cloud evidence is under
`test-results/comprehensive-qa/`: `backend.md`, `ai.md`, `ai-verified.json`,
`independent-review.md`, `ui-independent-review.md`, `forms.md`, benchmark JSON,
screenshots and original failed/recovered outputs. Evidence is ignored because it
includes synthetic runtime/session artifacts; no key or private configuration is
part of delivery. Frozen model-research inputs and approved reference PNGs were
not rewritten.

The premium static audit resolved the native-control ownership, form and
scrollbar findings. Its remaining `form.textarea-resize-missing` flag is a parser
false positive on shared `AutoGrowTextarea`: the element explicitly applies
`style={{ ...style, resize: 'none' }}`, and component/browser tests verify computed
`resize:none` and content growth. The nonzero static exit is retained in
`premium-audit-final.json`; it is not reported as a clean static-audit pass.

## Remaining acceptance limits

- Local trained dialect/spelling, clustering and forecasting packages are not
  installed. Clustering/forecasting remain unavailable; their runtime contracts
  and future team model paths are preserved. The cloud aspect taxonomy currently
  covers staff/timeliness/quality/value only.
- Assistant retrieval is bounded authorized lexical ranking. Semantic RAG,
  calibrated anomaly/change-point detection, future deterioration prediction,
  scientific F1/dialect/entailment quality and universal useful recommendations
  are not established by this small functional pass.
- The normal development configuration still needs its own usable MongoDB URI.
  QA used isolated disposable databases and did not select a customer database.
- Quiet compose configuration passed; the local Docker daemon was unavailable.
  Container runtime, real SMTP/Atlas, production HTTPS/deployment, backup restore,
  Safari/physical mobile devices, 4G and production load remain unverified.
- No remote is configured for this independent clone. Local validation is not a
  remote CI result, push, PR, merge or deployment claim.
