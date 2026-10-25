"""Source-label mapping and coverage-aware scoring, with no model dependency."""
import collections
import math
import statistics

MAPPING={'الطعام':'food','المشروبات':'food','الخدمة':'service','طاقم العمل':'service',
         'التعامل':'service','السعر':'price','السرعة':'speed','النظافة':'cleanliness'}
SOURCE_POLARITIES={0.0:'negative',0.5:'neutral',1.0:'positive'}
LABELS=('positive','negative','neutral','mixed')


def combine(labels):
    labels=set(labels)
    return ('mixed' if 'mixed' in labels or {'positive','negative'}<=labels
            else 'positive' if 'positive' in labels else 'negative' if 'negative' in labels else 'neutral')


def map_review(review):
    evidence=collections.defaultdict(list)
    opinions=review['opinions']
    if not opinions:
        raise ValueError('No source opinions')
    for opinion in opinions:
        if opinion['aspect'] not in MAPPING or opinion['avg_sentiment'] not in SOURCE_POLARITIES:
            raise ValueError('Unsupported source annotation')
        quote=opinion['quotes']
        if not isinstance(quote,str) or not quote.strip() or quote not in review['review_text']:
            raise ValueError('Source quote must be literal')
        label=SOURCE_POLARITIES[opinion['avg_sentiment']]
        evidence[MAPPING[opinion['aspect']]].append({'sentiment':label,'quote':quote,'source_aspect':opinion['aspect']})
    aspects={name:combine(item['sentiment'] for item in items) for name,items in evidence.items()}
    return {'sentiment':combine(aspects.values()),'aspects':aspects,'evidence':dict(evidence)}


def _index(rows):
    indexed={r['id']:r for r in rows}
    if len(indexed)!=len(rows):
        raise ValueError('Duplicate IDs')
    return indexed


def _prf(tp,fp,fn):
    return {'tp':tp,'fp':fp,'fn':fn,'precision':tp/(tp+fp) if tp+fp else 0,
            'recall':tp/(tp+fn) if tp+fn else 0,'f1':2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0}


def score_batch(gold, predictions, audits):
    expected,predicted,raw=_index(gold),_index(predictions),_index(audits)
    if not expected or expected.keys()!=predicted.keys() or expected.keys()!=raw.keys():
        raise ValueError('All gold, prediction and audit IDs must match exactly')
    n=len(gold)
    count=collections.Counter()
    statuses=collections.Counter()
    confusion={label:collections.Counter() for label in LABELS}
    aspect_counts=collections.Counter()
    for cid,case in expected.items():
        row,audit=predicted[cid],raw[cid]
        if row['text']!=case['text']:
            raise ValueError('Feedback text mismatch')
        statuses[row['status']]+=1
        header=audit['raw'].strip().splitlines()[0] if audit['raw'].strip() else ''
        label=header.split('|')[1].strip() if header.startswith('SENTIMENT|') and header.count('|')==1 else None
        confusion[case['sentiment']][label if label in LABELS else 'invalid']+=1
        count['raw_sentiment_correct']+=label==case['sentiment']
        checked=row['sentiment']['status']=='checks_passed'
        available=row['sentiment']['value'] if checked else None
        count['sentiment_available']+=checked
        count['sentiment_available_correct']+=checked and available==case['sentiment']
        expected_pairs=set(case['aspects'].items())
        actual_pairs=set()
        for aspect in row['aspects']:
            evidence=aspect['evidence']
            count['quote_candidates']+=1
            count['literal_quotes']+=bool(evidence['candidate'] and evidence['candidate'] in case['text'])
            if aspect['status']=='checks_passed':
                value=aspect['classification']['value']
                actual_pairs.add((value['name'],value['sentiment']))
        for prefix,truth,actual in [('aspect_polarity',expected_pairs,actual_pairs),
                                   ('aspect_presence',{a for a,p in expected_pairs},{a for a,p in actual_pairs})]:
            count[prefix+'_tp']+=len(truth&actual)
            count[prefix+'_fp']+=len(actual-truth)
            count[prefix+'_fn']+=len(truth-actual)
        for name in MAPPING.values():
            aspect_counts[name]+=0
        for name in case['aspects']:
            aspect_counts[name]+=1
        count['correct_cases']+=row['status']=='complete' and available==case['sentiment'] and actual_pairs==expected_pairs
        count['truncated']+=audit['truncated']
    raw_accuracy=count['raw_sentiment_correct']/n
    f1s=[]
    for label in LABELS:
        tp=confusion[label][label]
        fp=sum(confusion[other][label] for other in LABELS if other!=label)
        fn=sum(confusion[label].values())-tp
        f1s.append(_prf(tp,fp,fn)['f1'])
    seconds=[r['seconds'] for r in audits]
    return {'count':n,'sentiment':{'raw_correct':count['raw_sentiment_correct'],'raw_accuracy':raw_accuracy,
            'raw_macro_f1':sum(f1s)/len(f1s),'available':count['sentiment_available'],
            'coverage':count['sentiment_available']/n,'available_correct':count['sentiment_available_correct'],
            'available_accuracy':count['sentiment_available_correct']/count['sentiment_available'] if count['sentiment_available'] else None,
            'correct_yield':count['sentiment_available_correct']/n,'confusion':{k:dict(v) for k,v in confusion.items()}},
            'aspect_presence':_prf(*(count['aspect_presence_'+s] for s in ['tp','fp','fn'])),
            'aspect_polarity':_prf(*(count['aspect_polarity_'+s] for s in ['tp','fp','fn'])),
            'full_analysis':{'statuses':dict(statuses),'correct_cases':count['correct_cases'],
                             'correct_yield':count['correct_cases']/n,'review_fraction':1-statuses['complete']/n},
            'evidence':{'candidates':count['quote_candidates'],'literal':count['literal_quotes'],
                        'literal_fraction':count['literal_quotes']/count['quote_candidates'] if count['quote_candidates'] else None,
                        'note':'Literal source presence only; semantic support is not automatically certified.'},
            'time':{'median_seconds':statistics.median(seconds),'p95_seconds':sorted(seconds)[math.ceil(.95*n)-1],
                    'total_seconds':sum(seconds),'truncated':count['truncated']},'gold_aspect_counts':dict(aspect_counts)}
