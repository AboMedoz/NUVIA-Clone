"""Build the detailed measured report from preserved result artifacts only."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
RUN = ROOT.parents[1] / '.local/model-comparison'


def read(path):
    return json.loads(path.read_text(encoding='utf8'))


def percent(value):
    return f'{100*value:.2f}%'


def run():
    results = [read(p) for p in (RUN/'results').glob('*.json')]
    records = {r['model']: r for r in results if isinstance(r,dict) and 'model' in r}
    results = {name:r for name,r in records.items() if r.get('status') == 'completed'}
    if not results:
        raise RuntimeError('Actual result artifacts are required; no placeholder report')
    normalized = {r['model']:r for r in read(RUN/'results-normalized/summary.json')}
    lines = ['# Measured Colab diagnostic results', '',
             'These are scoped diagnostic results from actual inference, not general accuracy, independent human validation or production acceptance.', '',
             'Frozen public50: 16 positive, 16 negative, 16 mixed and only 2 neutral. Synthetic16 has four balanced labels and four cases each for EN, Egyptian, Gulf and code-switch. Retrieval12 has twelve authored cross-language queries.', '',
             '## Generative sentiment and checked aspects', '',
             '| Model | Public50 raw sentiment | MacroF1 | Mixed recall | Validated sentiment coverage | Strict aspect/polarity F1 | Strict accepted plus all gold labels | Complete/partial/rejected |',
             '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
    generators = [r for r in results.values() if 'public50' in r]
    for r in sorted(generators,key=lambda r:r['model']):
        s = r['public50']
        c = s['full_analysis']['statuses']
        mixed = s['sentiment']['confusion']['mixed'].get('mixed',0)
        lines.append(f"| {r['model']} | {s['sentiment']['raw_correct']}/50 ({percent(s['sentiment']['raw_accuracy'])}) | {s['sentiment']['raw_macro_f1']:.4f} | {mixed}/16 | {s['sentiment']['available']}/50 | {s['aspect_polarity']['f1']:.4f} | {s['full_analysis']['correct_cases']}/50 | {c.get('complete',0)}/{c.get('partial',0)}/{c.get('rejected',0)} |")
    lines += ['', 'Accepted plus all gold labels means structural/literal-source checks and matching label sets. It does not certify semantic quote support or completeness beyond the reference annotations. Conditional accuracy among accepted records must not replace whole-set accuracy/coverage.', '',
              '## Secondary outer-quote parser replay', '',
              'Retrospective offline replay of exactly the same raw answers, using the pre-existing 2026-10-23 outer_quotes_v1 code equally for every model. Strict results above remain canonical. No model/prompt/label changes or new inference.', '',
              '| Model | Normalized public50 aspect/polarity F1 | Accepted plus all gold labels | Repaired quote wrappers across66 cases |', '| --- | ---: | ---: | ---: |']
    for r in sorted(generators,key=lambda r:r['model']):
        n = normalized[r['model']]
        lines.append(f"| {r['model']} | {n['public50']['aspect_polarity']['f1']:.4f} | {n['public50']['full_analysis']['correct_cases']}/50 | {n['normalized_quote_count']} |")
    lines += ['', 'Only one matching outer quote pair is removed when the interior already occurs exactly in the source. No spelling/whitespace/fuzzy repair, sentiment rewrite or gold-dependent correction. A quote already literal is kept unchanged.', '',
              '## Synthetic16 generative slices', '',
              '| Model | Raw sentiment | Strict accepted plus gold labels | EN/EG/Gulf/code-switch raw accuracy |', '| --- | ---: | ---: | --- |']
    for r in sorted(generators,key=lambda r:r['model']):
        s=r['synthetic16']
        slices='/'.join(percent(r['slices'][k]['sentiment']['raw_accuracy']) for k in ['en','eg','gulf','code-switch'])
        lines.append(f"| {r['model']} | {s['sentiment']['raw_correct']}/16 | {s['full_analysis']['correct_cases']}/16 | {slices} |")
    lines += ['', 'Each language slice has only4 cases. High scores on these short, easy authored inputs do not establish dialect or multilingual acceptance.', '',
              '## Three-label classifiers', '',
              '| Model | Public50 direct accuracy / four-class macroF1 | Synthetic16 direct accuracy | Synthetic16 fixed-sentence aggregate accuracy / macroF1 |', '| --- | --- | ---: | --- |']
    classifiers = [r for r in results.values() if 'public50_direct_3label' in r]
    for r in classifiers:
        p=r['public50_direct_3label'];s=r['synthetic16_sentence_aggregation']
        lines.append(f"| {r['model']} | {percent(p['accuracy'])} / {p['macro_f1']:.4f} | {percent(r['synthetic16_direct_3label']['accuracy'])} | {percent(s['accuracy'])} / {s['macro_f1']:.4f} |")
    lines += ['', 'Direct classifiers cannot emit mixed. Sentence aggregation uses supplied boundaries: any positive plus negative becomes mixed. It cannot discover mixed sentiment within one sentence. No classifier ABSA score is implied.', '',
              '## Dense retrieval12', '',
              '| Model | MRR | Recall@1 | Recall@3 | Gold-document ranks |', '| --- | ---: | ---: | ---: | --- |']
    for r in results.values():
        if 'mrr' in r:
            lines.append(f"| {r['model']} | {r['mrr']:.4f} | {percent(r['recall_at_1'])} | {percent(r['recall_at_3'])} | {r['ranks']} |")
    lines += ['', 'All three12x12 score matrices were independently checked for finite values. These are dense cross-language retrieval probes, not measured clustering or real-corpus search acceptance.', '',
              '## Generation probe review', '',
              'Scores follow generation-rubric.md and are assistant-rated, not independent human review. Scores are ordered dimensions, not a universal model score; no aggregate ranking across tasks.', '',
              '| Model | Supported assistant fidelity/citation/usefulness/format (each0..2) | Unsupported abstention/no-invention (each0..2) | Arabic report fidelity/citation/usefulness/format (each0..2) | Survey shape/relevance/wording/editability (each0..2) |', '| --- | --- | --- | --- | --- |']
    reviews=read(RUN/'generation-review.json')['reviews']
    for r in sorted(generators,key=lambda r:r['model']):
        v=reviews[r['model']]
        cells=['/'.join(map(str,v[k]['scores'])) for k in ['assistant-supported','assistant-unsupported','report','survey']]
        lines.append('| '+r['model']+' | '+' | '.join(cells)+' |')
    for r in sorted(generators,key=lambda r:r['model']):
        lines += ['', '### '+r['model']]
        for key,value in reviews[r['model']].items():
            lines.append(f"- {key}: {value['note']}")
    lines += ['', '## Measured cloud memory and generation timing', '',
              '| Model | Precision | Peak PyTorch allocated bytes | Public50 median seconds |', '| --- | --- | ---: | ---: |']
    for r in results.values():
        if 'peak_allocated_vram_bytes' in r:
            median = r['public50']['time']['median_seconds'] if 'public50' in r else None
            lines.append(f"| {r['model']} | {r['precision']} | {r['peak_allocated_vram_bytes']:,} | {median:.3f} |" if median is not None else f"| {r['model']} | {r['precision']} | {r['peak_allocated_vram_bytes']:,} | not generation |")
    lines += ['', 'T4 allocator measurements exclude CUDA/context memory outside PyTorch. Total model wall time includes downloads/loading and one checkpoint was prefetched; it is not a fair latency ranking. No local Windows quantized-runtime compatibility or VRAM fit is established by this cloud test.', '',
              '## Reproduction and artifacts', '',
              '- NLP notebook: https://colab.research.google.com/drive/1LZc0YsMeh4OoCqmW2A259ioOdCMpt9hZ',
              '- Runnable local notebook embeds the original frozen bytes; comparison-freeze.json fingerprints the inputs/code used at inference.',
              '- Ignored raw artifacts: .local/model-comparison/results, results-normalized, generation-review.json and the stage/final result archives.',
              '- Offline tools audit_results.py, summarize_results.py and rescore_outer_quotes.py load saved JSON only; they never download/load any model.',
              '- Exact candidate/file revisions, weights and license metadata are in hf-model-metadata.json, quantized-metadata.json and forecast-metadata.json.']
    failed = [r for r in records.values() if r.get('status') != 'completed']
    if failed:
        lines += ['', '## Failed attempted runs', '']
        lines += [f"- {r['model']}: {r.get('status')}: {r.get('error','See saved artifact')}" for r in failed]
    (ROOT/'MEASURED.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print('Built measured report from',len(results),'actual completed model records')


if __name__ == '__main__':
    run()
