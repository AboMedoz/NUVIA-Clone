# Separate forecasting diagnostic: actual Colab results

Both candidate models completed CUDA inference on Tesla T4, in a separate virtual environment after the nine NLP runs finished. No forecast weights or packages were downloaded/installed on the Windows machine. This is a tiny synthetic compatibility/behavior comparison, not NUVIA business forecast acceptance.

## Aggregate results

| Method                          |    MAE |    RMSE |   sMAPE | Empirical 80% interval coverage | Mean interval width |
| ------------------------------- | -----: | ------: | ------: | ------------------------------: | ------------------: |
| last_value                      | 7.6234 | 10.9367 | 14.106% |                    not supplied |        not supplied |
| seasonal_naive_7                | 1.9109 |  2.7039 |  3.504% |                    not supplied |        not supplied |
| amazon/chronos-2                | 1.3504 |  1.8947 |  2.641% |                          83.04% |              3.8769 |
| google/timesfm-2.5-200m-pytorch | 1.4069 |  2.0077 |  2.683% |                          85.71% |              5.6161 |

Chronos-2 has slightly lower aggregate error and about half the weight-download size in this fixture. Each model wins three of six nonconstant cases, with two constant-series ties. This does not establish a general/business forecasting winner. The empirical interval fractions are not calibration proof.

## Per-case MAE

| Case                   | Last value | Weekly naive | Chronos-2 | TimesFM2.5 |
| ---------------------- | ---------: | -----------: | --------: | ---------: |
| constant-origin196     |     0.0000 |       0.0000 |    0.0000 |     0.0000 |
| constant-origin210     |     0.0000 |       0.0000 |    0.0000 |     0.0000 |
| weekly-origin196       |    10.4104 |       2.1886 |    2.1549 |     1.8980 |
| weekly-origin210       |     8.0552 |       2.2714 |    2.0098 |     2.0565 |
| trend_weekly-origin196 |     9.5477 |       2.7974 |    1.7478 |     2.0088 |
| trend_weekly-origin210 |    12.3073 |       2.4891 |    1.4300 |     1.2965 |
| level_shift-origin196  |     9.5823 |       1.9571 |    2.0243 |     2.6244 |
| level_shift-origin210  |    11.0846 |       3.5838 |    1.4362 |     1.3708 |

## Exact downloads and observed memory

| Model                                                                                     | Exact checkpoint bytes | Precision in this run | Peak PyTorch allocated bytes | Load plus inference wall seconds |
| ----------------------------------------------------------------------------------------- | ---------------------: | --------------------- | ---------------------------: | -------------------------------: |
| [amazon/chronos-2](https://huggingface.co/amazon/chronos-2)                               |            477,930,472 | float32               |                  493,283,328 |                           18.303 |
| [google/timesfm-2.5-200m-pytorch](https://huggingface.co/google/timesfm-2.5-200m-pytorch) |            925,181,104 | float32               |                  937,892,352 |                           12.253 |

Both checkpoints are Apache-2.0. Timings include downloads/loading and are not controlled latency benchmarks. GPU parameter placement was asserted for each model; memory numbers exclude CUDA allocations outside PyTorch. Short standalone runs look plausible for 4 GiB, but Windows/local-device acceptance was not performed.

## Protocol and limits

- Four authored deterministic count-like series, 224 points each: constant, weekly with noise, trend plus weekly, and a historical level shift. Seed 20261025. These are synthetic data, not customer observations.
- Two fixed origins per series (history length 196/210), horizon 14, weekly seasonality 7: eight forecasts and 112 dependent target points. Training context and held-out targets are stored explicitly.
- Only historical context was passed to models. Chronos cross-learning was disabled so the later-origin context cannot leak into another forecast in the batch. TimesFM treats each univariate input independently. No tuning on these target values.
- Last value repeats the last observed value. Seasonal naive repeats the last seven observed values twice. Constant cases are deliberately easy for every method.
- Use each API's default returned point forecast: Chronos uses its median point result; TimesFM returns its point head. Both supply 0.1/0.9 bounds for the interval check. Forecast arrays, exact contexts, gold targets and intervals are preserved.
- Chronos: no fine-tuning or future covariates; TimesFM: torch_compile false, context 256/horizon 128 caps, input normalization/positive inference/flip invariance/quantile-crossing fix enabled. Full calls are in forecast_compare.py.
- The local notebook is reproducible source. The measured run used the existing Colab runtime and a separate subprocess/environment; notebook creation alone is not counted as evaluation.
- Colab lacks ensurepip for ordinary venv creation. The successful setup used --without-pip plus --system-site-packages, inherited CUDA Torch, and installed forecasting packages only into the new environment. The NLP base environment was not changed.

## Reproduction and evidence

[Runnable notebook](https://colab.research.google.com/drive/1hu1984M_DeKGSqL7Zxp-xx3i2Q8IP9ZZ), local NUVIA_Forecast_Diagnostic.ipynb, forecast-data.json, forecast-freeze.json, forecast-metadata.json and forecast_compare.py. The three frozen code/data/metadata hashes were checked inside Colab before exporting.

Ignored raw results: .local/model-comparison/forecast-results/ and cloud-forecast-results.zip. The complete run log and package metadata are included. audit_forecasts.py independently checks every context/target against the fixture, finite shapes/intervals and all reported metrics using the Python standard library. All four methods passed; output is forecast-audit.json.

Actual environment: {"torch": "2.11.0+cu130", "numpy": "2.1.3", "chronos-forecasting": "2.3.2", "timesfm": "2.0.2", "transformers": "5.20.2", "huggingface-hub": "1.33.0"}; Python 3.13.16; Tesla T4.

No actual NUVIA activity history exists for this assessment. Business acceptance requires sufficient history, temporal backtesting, appropriate seasonal/event baselines and prospective error/interval evaluation.
