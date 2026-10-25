"""Offline postprocessing, never inference or prompt tuning."""
import json
import pathlib
import sys


LABELS = ('positive', 'negative', 'neutral', 'mixed')


def metrics(rows, labels=LABELS):
    accuracy = sum(r['gold'] == r['pred'] for r in rows) / len(rows)
    f1s = []
    for label in labels:
        tp = sum(r['gold'] == label and r['pred'] == label for r in rows)
        fp = sum(r['gold'] != label and r['pred'] == label for r in rows)
        fn = sum(r['gold'] == label and r['pred'] != label for r in rows)
        f1s.append(2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0)
    return dict(accuracy=accuracy, macro_f1=sum(f1s)/len(f1s), labels=labels,
                invalid_predictions=sum(r['pred'] not in LABELS for r in rows))


def summarize(directory):
    summaries = []
    for path in pathlib.Path(directory).glob('*.json'):
        result = json.loads(path.read_text(encoding='utf8'))
        if not isinstance(result, dict) or 'model' not in result:
            continue
        if 'sentence_raw' in result:
            sentences = []
            for row in result['sentence_raw']:
                raw = row['raw'].strip().splitlines()
                first = raw[0] if raw else ''
                value = first.split('|')[1].strip() if first.startswith('SENTIMENT|') and first.count('|') == 1 else 'invalid'
                sentences.append(dict(id=row['id'], gold=row['gold'], pred=value))
            # The original runner's missing-header fallback was neutral. Never
            # credit that fallback as a model prediction in the audited summary.
            result['audited_sentence32_four_class'] = metrics(sentences)
            result['audited_sentence32_three_class'] = metrics(sentences, LABELS[:3])
            result['sentence_metrics_note'] = 'Invalid/missing headers counted wrong; no default-neutral credit. Mixed has no gold sentence units.'
        if 'generation' in result:
            audited_generation = []
            for item in result['generation']:
                lines = [line.strip() for line in item['raw'].splitlines() if line.strip()]
                questions = [line.split('|', 2) for line in lines if line.startswith('QUESTION|')]
                valid_questions = [q for q in questions if len(q) == 3 and q[1] in ['short_text', 'rating'] and q[2].strip()]
                answers = [line for line in lines if line.startswith('ANSWER|') and line[7:].strip()]
                allowed = all(line.startswith('ANSWER|') or line.startswith('CITE|') for line in lines)
                audited_generation.append(dict(id=item['id'], truncated=item['truncated'],
                    exact_abstention=item['abstained'], literal_citation_checks=item['citation_contract_pass'],
                    assistant_report_record_format=len(answers) == 1 and allowed and item['citation_contract_pass'] and not item['truncated'],
                    valid_typed_survey=len(valid_questions) == len(lines) == 5 and not item['truncated'],
                    contains_arabic=any('\u0600' <= c <= '\u06ff' for c in ''.join(answers)),
                    note='Record shape, literal citations and Arabic presence only; no automatic entailment or usefulness certification.'))
            result['audited_generation'] = audited_generation
        compact = {k:v for k,v in result.items() if k not in ['raw','predictions','audits','sentence_raw','scores','generation','slices']}
        summaries.append(compact)
    return summaries


if __name__ == '__main__':
    print(json.dumps(summarize(sys.argv[1]), ensure_ascii=False, indent=2))
