# Existing Qwen2.5-1.5B local survey-draft trial

Date: 2026-10-25. Decision: **keep Qwen inactive in the product**. The existing model fits
on this laptop GPU, but the bounded survey-draft smoke trial did not establish a reliable
EN/AR profile. No `.env` runtime override or package under `.local/models` was enabled.
The code remains ready for a compatible model supplied later.

This was a prompt-tuned smoke trial, not a held-out quality benchmark or evidence about
sentiment/aspect accuracy. Qwen was never selected for automatic feedback analytics.

## Provenance and execution

- Source card identifies Qwen2.5-1.5B-Instruct, from existing local artifacts at
  `D:/git_hub/NUVIA/apps/ai-service/app/models/qwen2.5-1.5b`.
- Weight SHA256: `dd924a11b4c220f385b51ffa522daea7c9f3d850e31b162bb5661df483c6d3ee`.
- Runtime reused read-only: `D:/git_hub/NUVIA/.local/model-evaluation/.venv-cuda/Scripts/python.exe`;
  Torch2.11.0+cu128, Transformers4.57.1, Python3.13.6. No CUDA libraries or weights downloaded.
- Hardware: NVIDIA GeForce RTX3050 Laptop GPU, approximately4GiB VRAM. All loaded parameters
  were checked on `cuda:0`, dtype float16; actual generation input IDs were also on `cuda:0`.
  This is stronger evidence than checking only `torch.cuda.is_available()`.
- Only vetted config/tokenizer files were copied into the ignored candidate package
  `.local/model-trial/qwen-survey-candidate`; the3.087GB safetensors file is a hardlink.
  Source contents, original environment/configuration and original credentials were untouched.
- Each goal used a separate process, deterministic generation and the actual clone adapter,
  parser and result validator. HF/Transformers were offline; bytecode writes were disabled.

## Recorded outcomes

English goal: clothing-store staff helpfulness, fitting-room experience and checkout speed.
Arabic goal: hotel room cleanliness, registration speed and staff treatment.

| Profile and locale                 | Structural result                                                                                                          | Human review                                                                                             | Seconds | Peak allocated / reserved GPU bytes |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------: | ----------------------------------- |
| Initial general prompt, EN         | Rejected: numbered prose instead of tags                                                                                   | Topically useful but no machine-consumable survey                                                        |  29.714 | 3,128,752,640 /3,342,860,288        |
| Constrained rating/XML profile, EN | Original run rejected complete XML fence; replay with the tested fence compatibility parser validates5 questions and UUIDs | Topics covered; missing rating anchors, awkward/double-barrelled wording requires editing                |  18.974 | 3,161,461,760 /3,359,637,504        |
| Constrained rating/XML profile, AR | Rejected: unsupported rating option children                                                                               | Mixed Chinese text and an off-goal question                                                              |  31.891 | 3,162,222,080 /3,365,928,960        |
| Final open-text-only profile, EN   | Rejected: invented `<p>` children inside questions                                                                         | Drifted back to numeric-rating questions despite open-text instructions                                  |  19.760 | 3,165,010,432 /3,384,803,328        |
| Final open-text-only profile, AR   | Passed5-question schema, count and UUID mapping                                                                            | Failed locale/relevance review: Chinese fifth question; cleanliness/speed goals only partially addressed |  18.744 | 3,166,359,040 /3,384,803,328        |

The Arabic structural pass illustrates why schema checks alone do not prove model quality:
the last label was `有什么建议或改进意见吗？`, not Arabic. One earlier interpreter attempt
terminated before emitting a result; it is excluded from the recorded result rows above.
The existing runtime also emitted dependency/deprecation warnings; no packages were changed.

No more prompt cycles were performed after the final open-text profile. The earlier English
candidate can help a human brainstorm, but this evidence does not justify activating the
shared local survey-generation capability or promising reliable bilingual drafting.

## Reproduce the bounded local trial

Private synthetic requests, candidate manifests, raw model text, timings and parameter/input
device diagnostics are in `.local/model-trial`. These are ignored local artifacts, not
production/customer data or model-quality fixtures. Existing failed outputs remain preserved.

The original interpreter can execute the clone's ignored trial program without installation:

```powershell
$env:PYTHONDONTWRITEBYTECODE = '1'
& 'D:/git_hub/NUVIA/.local/model-evaluation/.venv-cuda/Scripts/python.exe' .local/model-trial/run_qwen_trial.py en
& 'D:/git_hub/NUVIA/.local/model-evaluation/.venv-cuda/Scripts/python.exe' .local/model-trial/run_qwen_trial.py ar
```

This uses the candidate directly and does not activate the product registry. Full service
throughput/device contention and arbitrary goals are unverified. The product's optional
`AI_PYTHON_EXECUTABLE` override remains available for a future accepted package; it is not set
by this trial. Do not point the default product at these rejected candidate profiles.

## Remaining model needs

| Feature                                                         | Current state                                                 | Needed later                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Unicode/Arabic normalization, source sentences, script language | Deterministic baseline runs                                   | Trained language/dialect/spelling/code-switch quality where required    |
| Whole/sentence sentiment and aspects                            | Model-ready, unavailable                                      | Accepted four-class sentiment and taxonomy/span models                  |
| Embeddings, numeric clustering, forecasting                     | Supported local adapters, unavailable                         | Compatible trained artifacts and sufficient calibrated observations     |
| Cluster summaries, grounded reports and assistant               | Evidence contracts run; learned output unavailable            | Accepted evidence-grounded generative model, including abstention       |
| Editable5..10-question survey drafts                            | Contract/parser ready; Qwen remains inactive after this trial | A reliable EN/AR generation profile/model plus human publication review |

No trial result was persisted as customer feedback, analytics, a report or a published survey.
