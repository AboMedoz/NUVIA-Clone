"""Secondary retrospective parser analysis; raw strict results stay canonical.

Uses the pre-existing 2026-10-23 outer_quotes_v1 implementation unchanged,
applied equally to every saved model response. Never invokes any model.
"""
import json
import pathlib
import sys

from real_review_eval import score_batch
from secondary_quote_profile import convert_components


def run(input_directory, output_directory):
    root = pathlib.Path(__file__).resolve().parent
    public = json.loads((root/'real50-annotations.json').read_text(encoding='utf8'))
    synthetic = json.loads((root/'synthetic16.json').read_text(encoding='utf8'))
    all_gold = public + synthetic
    out = pathlib.Path(output_directory)
    out.mkdir(parents=True, exist_ok=True)
    summary = []
    for path in pathlib.Path(input_directory).glob('*.json'):
        result = json.loads(path.read_text(encoding='utf8'))
        if not isinstance(result, dict) or 'model' not in result or 'audits' not in result:
            continue
        audits = result['audits']
        assert [r['id'] for r in audits] == [r['id'] for r in all_gold]
        predictions = [convert_components(g['id'],g['text'],r['raw'],truncated=r['truncated'],
                                           normalize_outer_quotes=True) for g,r in zip(all_gold,audits)]
        rescored = dict(model=result['model'], revision=result['revision'],
                        policy='secondary retrospective parser analysis, pre-existing outer_quotes_v1, no new inference',
                        normalized_quote_count=sum('normalization' in a['evidence'] for p in predictions for a in p['aspects']),
                        public50=score_batch(public,predictions[:50],audits[:50]),
                        synthetic16=score_batch(synthetic,predictions[50:],audits[50:]), predictions=predictions)
        (out/path.name).write_text(json.dumps(rescored,ensure_ascii=False,indent=2),encoding='utf8')
        summary.append({k:v for k,v in rescored.items() if k != 'predictions'})
    (out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps([dict(model=r['model'],normalized=r['normalized_quote_count'],
                          public_aspect_f1=r['public50']['aspect_polarity']['f1'],
                          public_complete_gold=r['public50']['full_analysis']['correct_cases']) for r in summary],indent=2))


if __name__ == '__main__':
    run(sys.argv[1],sys.argv[2])
