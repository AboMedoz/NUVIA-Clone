---
license: cc-by-4.0
task_categories:
- token-classification
- text-classification
language:
- ar
tags:
- sentiment-analysis
- aspect-based-sentiment-analysis
- opinion-mining
- opinion-quote-extraction
- span-extraction
- arabic
- dialectal-arabic
- absa
pretty_name: 'AQTE: Arabic Quote & Triplet Extraction Dataset'
size_categories:
- 10K<n<100K
configs:
  - config_name: default
    data_files:
      - split: train
        path: train_split.json
      - split: test
        path: test_split.json
---


# AQTE: Arabic Quote & Triplet Extraction Dataset

A large-scale, multi-dialectal Arabic dataset of restaurant reviews annotated
with complete opinion triplets (aspect category, sentiment polarity, and
verbatim opinion quote). AQTE supports both **opinion quote (span) extraction**
and **full triplet aspect-based sentiment analysis (ABSA)**.

## Overview

AQTE contains 14,783 real customer reviews of 774 restaurants
across Saudi Arabia, collected from Google Maps and written in multiple Arabic
dialects. It provides
63,620 annotated opinion triplets spanning 29 aspect categories and
three sentiment polarities. Each triplet pairs an aspect category and a sentiment
label with a complete, self-contained opinion quote drawn from the review text,
enabling both quote extraction and full triplet extraction.


## Files

| File | Description |
|------|-------------|
| `train_split.json` | 12,875 reviews, 55,617 silver-standard triplets |
| `test_split.json`  | 1,908 reviews, 8,003 gold-standard triplets |
| `aspect_distribution.csv` | 29 aspect categories with train/test/total counts |
| `sentiment_distribution.csv` | sentiment counts and percentages per split |
| `dataset_statistics.csv` | overall dataset statistics |
| `README.md` | this file |

## Data format

Each split is a JSON list of review objects:

    {
      "place_id": "ChIJ...",
      "review_id": "R00001",
      "rate": "5",
      "review_text": "the full review text in Arabic",
      "opinions": [
        {
          "aspect": "الطعام",
          "avg_sentiment": 1.0,
          "quotes": "the opinion quote, a substring of review_text"
        }
      ]
    }

Field definitions:
- `place_id` — Place identifier for the restaurant.
- `review_id` — unique review identifier.
- `rate` — star rating given by the reviewer (1–5).
- `review_text` — the full, original review text.
- `opinions` — list of opinion triplets:
  - `aspect` — one of 29 predefined aspect categories (Arabic label).
  - `avg_sentiment` — 1.0 (positive), 0.5 (neutral), 0.0 (negative).
  - `quotes` — the opinion quote span.

## Annotation

**Test split (gold standard):** fully human-adjudicated. Two independent
annotators with Arabic NLP experience annotated the test set following detailed
guidelines, with a calibration round and expert adjudication of disputed cases.
Inter-annotator agreement reached Cohen's kappa = 0.8752. Every test quote is an
exact substring of its source review.

**Training split (silver standard):** produced using GPT-4 extraction followed by
systematic human quality control. As is typical of silver-standard resources, a
small fraction of training quotes are not exact substrings of their source review
(a known behavior of generative models); these are excluded from supervision when
training on exact-match objectives.

## Intended use

AQTE supports Arabic aspect-based sentiment analysis, opinion quote (span)
extraction, opinion mining, and explainable sentiment analysis. The full triplet
annotations support both quote-only extraction and full triplet extraction.

## Collection and ethics

All reviews are authentic, publicly-posted customer content collected from a
public platform. GPT-4 was used solely as an annotation tool to label spans within
existing human-written reviews and generated no review content. 

## Citation

If you use AQTE, please cite the accompanying paper:

> B. Aldashnan, A. Alothaim, and A. Alsanad, "Beyond Opinion Terms: A Hybrid
> Token-Span Architecture for Atomic Opinion Quote Extraction in Arabic,"
> *IEEE Access*, 2026, doi: 10.1109/ACCESS.2026.3703127.

```bibtex
@article{aldashnan2026aqte,
  author  = {Aldashnan, Bayan and Alothaim, Abdulrahman and Alsanad, Ahmad},
  title   = {Beyond Opinion Terms: A Hybrid Token-Span Architecture for Atomic Opinion Quote Extraction in Arabic},
  journal = {IEEE Access},
  year    = {2026},
  doi     = {10.1109/ACCESS.2026.3703127}
}
```

## License
The AQTE annotations and dataset compilation are released under CC BY 4.0. You are free to use, share, 
and adapt the dataset with appropriate attribution. The original review text was authored by users on a public platform and remains subject
to that platform's terms; the CC BY 4.0 license applies to the annotation and compilation work provided here.