"""Separate cloud-only synthetic forecast diagnostic; never business acceptance."""
import gc
import hashlib
import importlib.metadata
import json
import pathlib
import random
import sys
import time
import traceback

if not pathlib.Path('/content').is_dir():
    raise RuntimeError('This weight-downloading harness must run in Google Colab')

import numpy as np
import torch
from huggingface_hub import snapshot_download

assert torch.cuda.is_available(), 'GPU required, no silent CPU fallback'
ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'results'
OUT.mkdir(exist_ok=True)
DATA = json.loads((ROOT / 'forecast-data.json').read_text())
META = json.loads((ROOT / 'forecast-metadata.json').read_text())
random.seed(DATA['seed'])
np.random.seed(DATA['seed'])
torch.manual_seed(DATA['seed'])
torch.set_float32_matmul_precision('high')
H = DATA['horizon']
CASES = [dict(id=s['id']+f'-origin{n}', context=s['values'][:n], gold=s['values'][n:n+H])
         for s in DATA['series'] for n in DATA['context_lengths']]


def score(rows):
    actual = np.array([r['gold'] for r in rows], dtype=float)
    point = np.array([r['point'] for r in rows], dtype=float)
    assert actual.shape == point.shape == (8, H) and np.isfinite(point).all()
    result = dict(mae=float(np.abs(actual-point).mean()), rmse=float(np.sqrt(((actual-point)**2).mean())),
                  smape=float((2*np.abs(actual-point)/np.maximum(np.abs(actual)+np.abs(point), 1e-8)).mean()),
                  per_case=[dict(id=r['id'], mae=float(np.abs(a-p).mean())) for r, a, p in zip(rows, actual, point)])
    if all('lower' in r for r in rows):
        lower, upper = np.array([r['lower'] for r in rows]), np.array([r['upper'] for r in rows])
        assert np.isfinite(lower).all() and np.isfinite(upper).all() and (lower <= upper).all()
        result.update(empirical_80pct_coverage=float(((lower <= actual) & (actual <= upper)).mean()),
                      mean_interval_width=float((upper-lower).mean()))
    return result


def save(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2))


def run():
    save('environment.json', dict(seed=DATA['seed'], device=torch.cuda.get_device_name(0),
                                 python=sys.version, data_sha256=hashlib.sha256((ROOT/'forecast-data.json').read_bytes()).hexdigest(),
                                 versions={p: importlib.metadata.version(p) for p in ['torch','numpy','chronos-forecasting','timesfm','transformers','huggingface-hub']}))
    summary = []
    for name in ['last_value', 'seasonal_naive_7']:
        rows = [{**r, 'point': [r['context'][-1]]*H if name == 'last_value' else (r['context'][-7:]*2)} for r in CASES]
        result = dict(model=name, status='completed', metrics=score(rows), rows=rows)
        save(name+'.json', result)
        summary.append({k:v for k,v in result.items() if k != 'rows'})
    for meta in META:
        repo = meta['id']
        started = time.monotonic()
        try:
            gc.collect()
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()
            path = snapshot_download(repo, revision=meta['revision'], allow_patterns=['*.json','*.safetensors'])
            if 'chronos' in repo:
                from chronos import Chronos2Pipeline
                model = Chronos2Pipeline.from_pretrained(path, device_map='cuda', dtype=torch.float32)
                assert all(p.device.type == 'cuda' for p in model.model.parameters())
                quantiles, points = model.predict_quantiles([np.array(r['context'],dtype=np.float32) for r in CASES],
                                                           prediction_length=H, quantile_levels=[0.1,0.5,0.9], cross_learning=False)
                rows = [{**r, 'point': p[0].detach().cpu().tolist(), 'lower': q[0,:,0].detach().cpu().tolist(),
                         'upper': q[0,:,2].detach().cpu().tolist()} for r,p,q in zip(CASES,points,quantiles)]
            else:
                import timesfm
                model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(path, torch_compile=False)
                assert all(p.device.type == 'cuda' for p in model.model.parameters())
                model.compile(timesfm.ForecastConfig(max_context=256, max_horizon=128, normalize_inputs=True,
                              use_continuous_quantile_head=True, force_flip_invariance=True,
                              infer_is_positive=True, fix_quantile_crossing=True))
                points, quantiles = model.forecast(horizon=H, inputs=[np.array(r['context'],dtype=np.float32) for r in CASES])
                rows = [{**r, 'point': p.tolist(), 'lower': q[:,1].tolist(), 'upper': q[:,9].tolist()} for r,p,q in zip(CASES,points,quantiles)]
            torch.cuda.synchronize()
            result = dict(model=repo, revision=meta['revision'], status='completed', precision='float32',
                          metrics=score(rows), rows=rows, peak_allocated_vram_bytes=torch.cuda.max_memory_allocated(),
                          total_seconds=time.monotonic()-started)
            del model
        except Exception as exc:
            result = dict(model=repo, revision=meta['revision'], status='failed', error=str(exc), traceback=traceback.format_exc())
        save(repo.split('/')[-1]+'.json', result)
        compact = {k:v for k,v in result.items() if k != 'rows'}
        summary.append(compact)
        save('summary.json', summary)
        print('FORECAST_RESULT', json.dumps(compact), flush=True)
    print('FORECAST_COMPLETE', flush=True)


if __name__ == '__main__':
    run()
