"""Independent stdlib audit of preserved forecast outputs; no model dependencies."""
import hashlib
import json
import math
import pathlib
import sys


def audit(directory):
    root = pathlib.Path(__file__).resolve().parent
    data = json.loads((root/'forecast-data.json').read_text(encoding='utf8'))
    expected = {s['id']+f'-origin{n}': (s['values'][:n],s['values'][n:n+14])
                for s in data['series'] for n in data['context_lengths']}
    out = []
    for path in pathlib.Path(directory).glob('*.json'):
        result = json.loads(path.read_text(encoding='utf8'))
        if not isinstance(result,dict) or 'rows' not in result:
            continue
        rows = result['rows']
        assert len(rows) == 8 and {r['id'] for r in rows} == set(expected)
        errors, squared, smape, coverage, widths = [], [], [], [], []
        for row in rows:
            assert (row['context'],row['gold']) == expected[row['id']]
            assert len(row['point']) == len(row['gold']) == 14
            for i,(actual,point) in enumerate(zip(row['gold'],row['point'])):
                assert math.isfinite(point)
                errors.append(abs(actual-point))
                squared.append((actual-point)**2)
                smape.append(2*abs(actual-point)/max(abs(actual)+abs(point),1e-8))
                if 'lower' in row:
                    lower,upper = row['lower'][i],row['upper'][i]
                    assert math.isfinite(lower) and math.isfinite(upper) and lower <= upper
                    coverage.append(lower <= actual <= upper)
                    widths.append(upper-lower)
        derived = dict(mae=sum(errors)/112,rmse=math.sqrt(sum(squared)/112),smape=sum(smape)/112)
        if coverage:
            derived.update(empirical_80pct_coverage=sum(coverage)/112,mean_interval_width=sum(widths)/112)
        assert all(abs(result['metrics'][k]-v)<1e-9 for k,v in derived.items())
        out.append(dict(model=result['model'],status='audit_passed',forecasts=8,points=112,derived_metrics=derived))
    env = json.loads((pathlib.Path(directory)/'environment.json').read_text(encoding='utf8'))
    assert env['data_sha256'] == hashlib.sha256((root/'forecast-data.json').read_bytes()).hexdigest()
    assert len(out) == 4
    return out


if __name__ == '__main__':
    print(json.dumps(audit(sys.argv[1]),indent=2))
