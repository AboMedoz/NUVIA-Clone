# NUVIA models: measured Colab comparison

All nine NLP candidates completed actual inference on a Tesla T4 on 2026-10-25. All raw responses, rejected cases, revisions, package versions and results are preserved. No new model weights were downloaded to the Windows machine. Forecasting has a separate frozen synthetic diagnostic and environment.

This is a small scoped diagnostic, not general model accuracy or production acceptance. See [the detailed measured report](MEASURED.md) for every comparison and [the scoring rubric](generation-rubric.md) for assistant qualitative review.

## What the measurements support

| Task                         | Candidate/result in this diagnostic                                                                                                                   | Practical limit                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Four-label sentiment         | Qwen3.5-2B:42/50 raw correct, macro F1 0.7983; validated coverage39/50 and correct validated yield37/50                                               | Qwen3-4B41/50 and Qwen3.5-4B40/50; these small gaps do not establish a general winner                         |
| Quote-grounded aspects       | Qwen3.5-4B: strict pair F1 0.7947;27/50 structurally accepted with all reference labels; validated sentiment48/50                                     | Only 27/50 meet both checks and labels; literal source presence does not certify semantic quote support       |
| Multilingual dense retrieval | BGE-M3:MRR 0.9583,Recall@1=11/12,Recall@3=12/12                                                                                                       | 12 authored cross-language queries; clustering quality and real-corpus retrieval were not tested              |
| Grounded assistant           | Qwen3.5-4B gives the strongest supported-answer probe with valid source citations                                                                     | Its unsupported refusal is semantically clear but has an extra ANSWER prefix                                  |
| Arabic report                | Qwen3-4B gives a balanced useful Arabic account, but bad record/quote format and a Russian fragment; Qwen3.5-4B follows records but omits the summary | No complete report acceptance from this four-probe smoke test                                                 |
| Editable survey suggestions  | Qwen3.5-4B produces five useful clear Arabic question drafts                                                                                          | All four generators fail the requested typed-question record contract; content alone is not adapter readiness |

One generative model can cover several text tasks. Embeddings are a separate model family; forecasting consumes historical numeric series. There is no basis here for downloading one LLM for every feature.

## Exact download sizes

These are exact HF API byte totals for one selected root PyTorch/safetensors weight set at the pinned revision in `hf-model-metadata.json`. GB is decimal; GiB is binary. Tokenizer/config files, packages, CUDA runtime and cache duplication are extra. Repository-wide totals include alternative formats and are not the required weight download.

| Official checkpoint                                                                                                             |  Weight bytes |    GB |   GiB | License metadata                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------: | ----: | ----: | ---------------------------------- |
| [Qwen/Qwen3.5-0.8B](https://huggingface.co/Qwen/Qwen3.5-0.8B)                                                                   | 1,746,942,600 | 1.747 | 1.627 | apache-2.0                         |
| [Qwen/Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B)                                                                       | 4,548,221,488 | 4.548 | 4.236 | apache-2.0                         |
| [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B)                                                                       | 9,319,828,096 | 9.320 | 8.680 | apache-2.0                         |
| [Qwen/Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)                                               | 8,044,982,000 | 8.045 | 7.492 | apache-2.0                         |
| [CAMeL-Lab/bert-base-arabic-camelbert-mix-sentiment](https://huggingface.co/CAMeL-Lab/bert-base-arabic-camelbert-mix-sentiment) |   436,389,169 | 0.436 | 0.406 | apache-2.0                         |
| [cardiffnlp/twitter-xlm-roberta-base-sentiment](https://huggingface.co/cardiffnlp/twitter-xlm-roberta-base-sentiment)           | 1,112,271,561 | 1.112 | 1.036 | not specified in API card metadata |
| [intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)                                         |   470,641,600 | 0.471 | 0.438 | mit                                |
| [Qwen/Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)                                                   | 1,191,586,416 | 1.192 | 1.110 | apache-2.0                         |
| [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)                                                                               | 2,271,145,830 | 2.271 | 2.115 | mit                                |

Qwen3.5 checkpoints include a multimodal architecture/vision weights; all tests used text only. They need a compatible recent loader. Existing Qwen2.5 adapters cannot be assumed compatible. CAMeLBERT-mix means mixed Arabic varieties, not a mixed sentiment class. Both classifier checkpoints have only positive/negative/neutral labels.

## Optional quantized files: size verified, quality/runtime untested

Community conversions are different artifacts from the tested FP16 checkpoints. Their quality and Windows/4 GiB runtime fit were not measured. FP16 scores must not be transferred to Q4 files. The projector is a separate image-input component; text-only use normally does not need it.

| Community conversion                                                                                            | Q4_K_M text bytes | Extra vision projector bytes |
| --------------------------------------------------------------------------------------------------------------- | ----------------: | ---------------------------: |
| [lmstudio-community/Qwen3.5-0.8B-GGUF](https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF)             |       527,502,816 |                    207345952 |
| [lmstudio-community/Qwen3.5-2B-GGUF](https://huggingface.co/lmstudio-community/Qwen3.5-2B-GGUF)                 |     1,270,808,032 |                    671372416 |
| [lmstudio-community/Qwen3.5-4B-GGUF](https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF)                 |     2,707,513,696 |                    675568768 |
| [bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF](https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF) |     2,497,280,736 |           not a vision model |

For scale only, Qwen3.5-4B Q4_K_M plus BGE-M3 original weights total 4,978,659,526 bytes (4.979GB), before auxiliary files/packages. This is a download-size calculation, not a tested quantized deployment recommendation. No local download was started.

## Local 4 GiB interpretation

The target is RTX3050 Laptop4 GiB. Weight download size is not VRAM. Activations, caches, temporary workspaces and the CUDA context add memory; T4 allocator peaks exclude memory outside PyTorch and do not prove local Windows compatibility.

Observed generator peaks: Qwen3.5-0.8B: 1,892,338,176 bytes; 2B: 4,587,716,608; Qwen3-4B: 8,516,187,648; Qwen3.5-4B: 9,513,419,264. Only the 0.8B FP16 run is plausibly small enough as tested, but its public50 sentiment58%, checked pair F1 0.2703 and 1/50 accepted gold-label cases make it a poor quality choice. The2B/4B models require a different memory strategy for this laptop.

A compatible quantized text runtime/CPU offload must be tested separately. Multiple models resident together are not established. BGE stored weights are F32 but the measured model ran FP16; its 2.271GB download led to about 1.150GB PyTorch peak, while QwenEmbedding's1.192GB download led to 1.245GB peak. File size alone does not rank runtime memory.

## Gold provenance and frozen protocol

- Reuse the known 50-case diagnostic from public [AQTE](https://huggingface.co/datasets/bayandashnan/AQTE-Arabic-Quote-Triplet-Extraction). It is not a new blind holdout. The publisher describes its source test opinions as human-adjudicated; this is a publisher provenance claim, not a new independent team audit.
- Original source annotations are 29 aspect categories with positive/negative/neutral opinion labels. The NUVIA fixture maps supported categories to food/service/price/speed/cleanliness, combines conflicting polarity into mixed, and derives whole-review four-class sentiment from those mapped opinions. The overall four-class labels are derived, not direct original AQTE labels.
- The existing fixture includes two explicitly declared factual-neutral text adaptations by the assistant; see per-case notes in `real50-annotations.json`. Source selection/privacy/category screening was by the assistant, not independent human/team adjudication. Source annotations/compilation are CC BY 4.0; original review text remains subject to source-platform terms. `real50-source.json` and `real50-SOURCE-README.md` preserve provenance.
- Before this inference batch, freeze the same inputs, labels, taxonomy, prompt and code for all generators. Public50 labels:16 positive/16 negative/16 mixed/2 neutral. Add separately labeled synthetic16 (four each EN/EG/Gulf/code-switch, balanced four labels),32 fixed sentence units,12 cross-language retrieval queries and four generation probes per generator. No prompt tuning after gold/results.
- Seed 42; greedy decoding;512 analysis-token cap,700 generation-token cap. All raw model output is plain text; Python constructs records. Exact model revisions and actual environment are preserved. Truncated/rejected/partial cases remain in denominators.
- Four-class macroF1/confusions, validated coverage/correct yield and strict checked aspect/polarity pairs are primary. Sentence32 has no mixed gold units; the offline summary also gives three-class macroF1 and counts invalid headers wrong rather than crediting the runner's default-neutral fallback.
- Three-label classifiers are scored directly on all four classes to expose missing mixed support. A separate fixed-sentence aggregation protocol combines positive+negative into mixed. It does not solve same-sentence mixed sentiment and does not establish real-review pipeline superiority.
- Embeddings use publisher-specific prefixes/pooling: e5 query/passage+mean, Qwen query instruction+last token, BGE CLS/no prefix. All saved12x12 score matrices are finite; root review independently reproduced MRR/Recall. Clustering was not evaluated.
- Citation/format checks are not entailment or usefulness. The 16 generation outputs were qualitatively scored by the assistant against a rubric written before reading them. No human/team/user acceptance is claimed. Prompt-injection robustness and real-business distribution remain untested.

## Primary strict versus secondary quote replay

Qwen3-4B's strict public50 pairF1 is.2500, largely due to wrapping source quotes. A separately labeled retrospective parser replay applies the pre-existing2026-10-23 `outer_quotes_v1` implementation unchanged and equally to all four generators. Strict results stay canonical; no new inference, prompt edits or label changes.

| Model                  | Strict pairF1 | Secondary wrapper-normalized pairF1 | Strict / secondary accepted plus all gold labels |
| ---------------------- | ------------: | ----------------------------------: | ------------------------------------------------ |
| Qwen3.5-0.8B           |        0.2703 |                              0.2703 | 1/50 /1/50                                       |
| Qwen3.5-2B             |        0.6329 |                              0.6329 | 17/50 /17/50                                     |
| Qwen3-4B-Instruct-2507 |        0.2500 |                              0.7383 | 7/50 /22/50                                      |
| Qwen3.5-4B             |        0.7947 |                              0.7947 | 27/50 /27/50                                     |

Only one matching outer quote pair is removed if the nonempty interior already occurs literally in the source. Existing literal quotes remain unchanged. No spelling/whitespace/fuzzy repair, taxonomy aliases, sentiment rewrites or gold-dependent selection. This improves compatibility, not the model's underlying semantic accuracy.

## Dedicated Arabic ABSA alternatives investigated

[DeepX MarBERT](https://huggingface.co/Dohahemdann/deepx-arabic-absa-marbert) advertises Egyptian/Gulf/English restaurant coverage and publisher joint F1 0.7831. That published number was not measured here. Its nine-aspect taxonomy, three polarities, custom heads and lack of exact quote extraction prevent drop-in NUVIA compatibility.

[DeepX ensemble](https://huggingface.co/nsr51324/DeepX-AI-Hackathon-ABSA) combines four backbones with metadata/star inputs and 1971 labeled reviews. Publisher validationF1 is not comparable to this fixture; mixed polarity/literal quotes remain missing. [SemEval Arabic APC](https://huggingface.co/k-chirkunov/spc-apc-bilstm-2layer-sem-eval-2016-arabic) assumes a supplied aspect term, covers hotels and is gated by contact-sharing conditions; no gate was accepted.

## Separate numeric forecasting

| Official checkpoint                                                                       | Exact weight bytes | License    |
| ----------------------------------------------------------------------------------------- | -----------------: | ---------- |
| [amazon/chronos-2](https://huggingface.co/amazon/chronos-2)                               |        477,930,472 | apache-2.0 |
| [google/timesfm-2.5-200m-pytorch](https://huggingface.co/google/timesfm-2.5-200m-pytorch) |        925,181,104 | apache-2.0 |

Both forecasters completed actual CUDA inference. On this tiny fixture Chronos-2 MAE is 1.3504, TimesFM2.5 1.4069 and weekly naive 1.9109; each learned model wins three of the six nonconstant cases. See [forecast results and independent audit](FORECAST.md). This does not establish a business winner; no NUVIA business history is available for acceptance.

The separately frozen fixture has four 224-point synthetic series, two origins 196/210, horizon 14 and weekly seasonality: 8 forecasts/112 dependent target points. Compare last-value/weekly-seasonal naive baselines, MAE/RMSE/sMAPE and empirical 80% interval coverage. This cannot establish business forecast quality or uncertainty calibration. A separate cloud virtual environment inherits installed CUDA Torch and avoids changes to the NLP environment.

The [current official TimesFM repository](https://github.com/google-research/timesfm) lists 3.0 but its downloaded/self-hosted 3.0 weights restrict commercial/production use. 2.5 remains Apache 2.0 and is the selected freely self-hostable research checkpoint. Source-code and weight licenses differ.

## Reproduce and inspect

- [NLP Colab](https://colab.research.google.com/drive/1LZc0YsMeh4OoCqmW2A259ioOdCMpt9hZ); local `NUVIA_HF_Comparison.ipynb` embeds original frozen bytes/code.
- [Forecast notebook](https://colab.research.google.com/drive/1hu1984M_DeKGSqL7Zxp-xx3i2Q8IP9ZZ); local `NUVIA_Forecast_Diagnostic.ipynb` contains the separate fixture/runner.
- `comparison-freeze.json` and `forecast-freeze.json` fingerprint their respective evaluation inputs/code. Git line-ending conversion must not be mistaken for a new evaluated fixture; the embedded notebook bundles retain original bytes.
- Ignored `.local/model-comparison/` stores all raw outputs/metadata, final/stage archives, strict/normalized/audited summaries, assistant review and the Colab runtime screenshot. No weight files are included.
- Offline `audit_results.py`, `summarize_results.py`, `rescore_outer_quotes.py` and `build_measured_report.py` only read saved artifacts. `colab_compare.py` and `forecast_compare.py` are cloud inference harnesses, not production adapters.
- HF model cards linked in the tables support task/language/license descriptions; exact files/revisions/bytes were captured from `https://huggingface.co/api/models/{model-id}?blobs=true`. No parameter-count estimate is represented as an exact file size.

## Completion and evidence limits

All 9 NLP and 2 forecasting model runs completed, and both naive forecast baselines completed. The owned Colab GPU session was terminated after lossless local export; the UI confirmed **No active sessions**. Saved Drive notebooks remain available. No models were activated in NUVIA and no new Windows weight files were downloaded.

Colab output-frame/reconnection trouble left the saved notebook stdout snapshot with only the first five model summaries. Do not use that partial UI snapshot as the complete result record. The full, authoritative per-case outputs and metadata for all eleven models are preserved in the local final NLP/forecast archives and JSON result directories, independently audited. The source notebooks are runnable reproductions.

The final evidence bundle is `.local/model-comparison/NUVIA-model-evaluation-evidence.zip`; it includes reports, public/synthetic fixtures, source notebooks/harnesses, full raw/audited outputs and runtime/cleanup screenshots, without model weights or product/private configuration.
