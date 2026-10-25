# Measured Colab diagnostic results

These are scoped diagnostic results from actual inference, not general accuracy, independent human validation or production acceptance.

Frozen public50: 16 positive, 16 negative, 16 mixed and only 2 neutral. Synthetic16 has four balanced labels and four cases each for EN, Egyptian, Gulf and code-switch. Retrieval12 has twelve authored cross-language queries.

## Generative sentiment and checked aspects

| Model                       | Public50 raw sentiment | MacroF1 | Mixed recall | Validated sentiment coverage | Strict aspect/polarity F1 | Strict accepted plus all gold labels | Complete/partial/rejected |
| --------------------------- | ---------------------: | ------: | -----------: | ---------------------------: | ------------------------: | -----------------------------------: | ------------------------- |
| Qwen/Qwen3-4B-Instruct-2507 |         41/50 (82.00%) |  0.7894 |        13/16 |                        45/50 |                    0.2500 |                                 7/50 | 11/39/0                   |
| Qwen/Qwen3.5-0.8B           |         29/50 (58.00%) |  0.3671 |         0/16 |                        18/50 |                    0.2703 |                                 1/50 | 8/12/30                   |
| Qwen/Qwen3.5-2B             |         42/50 (84.00%) |  0.7983 |        11/16 |                        39/50 |                    0.6329 |                                17/50 | 28/13/9                   |
| Qwen/Qwen3.5-4B             |         40/50 (80.00%) |  0.7734 |        15/16 |                        48/50 |                    0.7947 |                                27/50 | 40/10/0                   |

Accepted plus all gold labels means structural/literal-source checks and matching label sets. It does not certify semantic quote support or completeness beyond the reference annotations. Conditional accuracy among accepted records must not replace whole-set accuracy/coverage.

## Secondary outer-quote parser replay

Retrospective offline replay of exactly the same raw answers, using the pre-existing 2026-10-23 outer_quotes_v1 code equally for every model. Strict results above remain canonical. No model/prompt/label changes or new inference.

| Model                       | Normalized public50 aspect/polarity F1 | Accepted plus all gold labels | Repaired quote wrappers across 66 cases |
| --------------------------- | -------------------------------------: | ----------------------------: | --------------------------------------: |
| Qwen/Qwen3-4B-Instruct-2507 |                                 0.7383 |                         22/50 |                                      88 |
| Qwen/Qwen3.5-0.8B           |                                 0.2703 |                          1/50 |                                       0 |
| Qwen/Qwen3.5-2B             |                                 0.6329 |                         17/50 |                                       0 |
| Qwen/Qwen3.5-4B             |                                 0.7947 |                         27/50 |                                       0 |

Only one matching outer quote pair is removed when the interior already occurs exactly in the source. No spelling/whitespace/fuzzy repair, sentiment rewrite or gold-dependent correction. A quote already literal is kept unchanged.

## Synthetic16 generative slices

| Model                       | Raw sentiment | Strict accepted plus gold labels | EN/EG/Gulf/code-switch raw accuracy |
| --------------------------- | ------------: | -------------------------------: | ----------------------------------- |
| Qwen/Qwen3-4B-Instruct-2507 |         15/16 |                             6/16 | 100.00%/100.00%/75.00%/100.00%      |
| Qwen/Qwen3.5-0.8B           |         12/16 |                             5/16 | 75.00%/75.00%/75.00%/75.00%         |
| Qwen/Qwen3.5-2B             |         16/16 |                            15/16 | 100.00%/100.00%/100.00%/100.00%     |
| Qwen/Qwen3.5-4B             |         16/16 |                            15/16 | 100.00%/100.00%/100.00%/100.00%     |

Each language slice has only 4 cases. High scores on these short, easy authored inputs do not establish dialect or multilingual acceptance.

## Three-label classifiers

| Model                                              | Public50 direct accuracy / four-class macroF1 | Synthetic16 direct accuracy | Synthetic16 fixed-sentence aggregate accuracy / macroF1 |
| -------------------------------------------------- | --------------------------------------------- | --------------------------: | ------------------------------------------------------- |
| CAMeL-Lab/bert-base-arabic-camelbert-mix-sentiment | 64.00% / 0.5054                               |                      56.25% | 62.50% / 0.5970                                         |
| cardiffnlp/twitter-xlm-roberta-base-sentiment      | 60.00% / 0.5253                               |                      75.00% | 93.75% / 0.9365                                         |

Direct classifiers cannot emit mixed. Sentence aggregation uses supplied boundaries: any positive plus negative becomes mixed. It cannot discover mixed sentiment within one sentence. No classifier ABSA score is implied.

## Dense retrieval12

| Model                          |    MRR | Recall@1 | Recall@3 | Gold-document ranks                  |
| ------------------------------ | -----: | -------: | -------: | ------------------------------------ |
| BAAI/bge-m3                    | 0.9583 |   91.67% |  100.00% | [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1] |
| intfloat/multilingual-e5-small | 0.5486 |   41.67% |   58.33% | [8, 2, 1, 1, 1, 3, 8, 1, 8, 1, 4, 8] |
| Qwen/Qwen3-Embedding-0.6B      | 0.7480 |   58.33% |   91.67% | [1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 7, 1] |

All three 12x12 score matrices were independently checked for finite values. These are dense cross-language retrieval probes, not measured clustering or real-corpus search acceptance.

## Generation probe review

Scores follow generation-rubric.md and are assistant-rated, not independent human review. Scores are ordered dimensions, not a universal model score; no aggregate ranking across tasks.

| Model                       | Supported assistant fidelity/citation/usefulness/format (each 0..2) | Unsupported abstention/no-invention (each 0..2) | Arabic report fidelity/citation/usefulness/format (each 0..2) | Survey shape/relevance/wording/editability (each 0..2) |
| --------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| Qwen/Qwen3-4B-Instruct-2507 | 2/1/2/0                                                             | 2/2                                             | 2/1/2/0                                                       | 0/2/1/2                                                |
| Qwen/Qwen3.5-0.8B           | 1/0/1/0                                                             | 2/2                                             | 1/1/0/0                                                       | 0/1/0/0                                                |
| Qwen/Qwen3.5-2B             | 2/2/1/0                                                             | 2/2                                             | 2/2/1/1                                                       | 0/2/1/1                                                |
| Qwen/Qwen3.5-4B             | 2/2/2/2                                                             | 1/2                                             | 2/2/1/2                                                       | 0/2/2/2                                                |

### Qwen/Qwen3-4B-Instruct-2507

- assistant-supported: Direct correct delivery-delay/cold-arrival answer, source IDs and supporting interior quotes. Missing ANSWER record; wrapping quotes fail strict literal citation contract.
- assistant-unsupported: Exact requested abstention; no unsupported facts.
- report: Balanced Arabic account and relevant faster/hot-delivery recommendation. Wrapped quotations, missing ANSWER record and an unnatural Russian fragment in an Arabic heading.
- survey: Five distinct useful Arabic draft topics but invalid rate enum, extra citation records and awkward wording about staff docility. Requires editing and adapter repair.

### Qwen/Qwen3.5-0.8B

- assistant-supported: Repeats survey questions and answer records; no CITE records; incorrect evidence assignments in extra fields. One answer does mention90-minute delay.
- assistant-unsupported: Exact requested abstention; no unsupported facts.
- report: Arabic text claims best experience, adds unsolicited survey questions and an unrelated recommendation about ticket speed. Literal CITE strings exist but do not establish these claims.
- survey: Invalid record shape; questions repeat until token cap, including unsupported price topic; no usable five-question draft.

### Qwen/Qwen3.5-2B

- assistant-supported: Correctly describes90-minute delay and cold food with literal supporting citations, but prepends five irrelevant survey-question records.
- assistant-unsupported: Exact requested abstention; no unsupported facts.
- report: Statements about food, delivery delay, staff and clean tables have source support; faster-delivery recommendation is clear. Ignores Arabic locale and omits cold arrival.
- survey: Five relevant Arabic questions but no short_text/rating enum, duplicated food topic and leading wording. Content could be edited; current record contract fails.

### Qwen/Qwen3.5-4B

- assistant-supported: Direct concise delivery-delay/cold-arrival answer, correct literal evidence citations, valid plain records.
- assistant-unsupported: Clearly refuses unsupported salary/revenue and invents nothing, but adds ANSWER before the exact required ABSTAIN record.
- report: Arabic recommendation is appropriate and source-grounded with valid records, but omits the requested balanced feedback summary.
- survey: Five distinct relevant understandable Arabic questions; all omit short_text/rating type fields and add unsolicited citation records. Useful content but strict contract fails.

## Measured cloud memory and generation timing

| Model                                              | Precision | Peak PyTorch allocated bytes | Public50 median seconds |
| -------------------------------------------------- | --------- | ---------------------------: | ----------------------: |
| CAMeL-Lab/bert-base-arabic-camelbert-mix-sentiment | float32   |                  451,669,504 |          not generation |
| BAAI/bge-m3                                        | float16   |                1,149,937,664 |          not generation |
| intfloat/multilingual-e5-small                     | float16   |                  248,004,096 |          not generation |
| Qwen/Qwen3-4B-Instruct-2507                        | float16   |                8,516,187,648 |                   3.737 |
| Qwen/Qwen3-Embedding-0.6B                          | float16   |                1,244,581,888 |          not generation |
| Qwen/Qwen3.5-0.8B                                  | float16   |                1,892,338,176 |                   2.774 |
| Qwen/Qwen3.5-2B                                    | float16   |                4,587,716,608 |                   3.145 |
| Qwen/Qwen3.5-4B                                    | float16   |                9,513,419,264 |                   3.906 |
| cardiffnlp/twitter-xlm-roberta-base-sentiment      | float32   |                1,127,955,968 |          not generation |

T4 allocator measurements exclude CUDA/context memory outside PyTorch. Total model wall time includes downloads/loading and one checkpoint was prefetched; it is not a fair latency ranking. No local Windows quantized-runtime compatibility or VRAM fit is established by this cloud test.

## Reproduction and artifacts

- NLP notebook: https://colab.research.google.com/drive/1LZc0YsMeh4OoCqmW2A259ioOdCMpt9hZ
- Runnable local notebook embeds the original frozen bytes; comparison-freeze.json fingerprints the inputs/code used at inference.
- Ignored raw artifacts: .local/model-comparison/results, results-normalized, generation-review.json and the stage/final result archives.
- Offline tools audit_results.py, summarize_results.py and rescore_outer_quotes.py load saved JSON only; they never download/load any model.
- Exact candidate/file revisions, weights and license metadata are in hf-model-metadata.json, quantized-metadata.json and forecast-metadata.json.
