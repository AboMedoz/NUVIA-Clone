"""Independent contract checks, not semantic certification. Plain text in, code records out."""
from collections import Counter
from text_output import parse_text
from v2_json import ASPECTS, LABELS


def component(candidate, errors):
    return {'candidate':candidate,'value':None if errors else candidate,
            'status':'needs_review' if errors else 'checks_passed','errors':sorted(set(errors))}


def convert_components(cid, text, raw, *, truncated=False):
    obj=parse_text(raw)
    document_errors=[]
    if obj is None:
        document_errors.append('invalid_text_format')
    if truncated:
        document_errors.append('generation_truncated')
    if document_errors:
        return {'id':cid,'text':text,'status':'rejected',
                'sentiment':component(None,document_errors),'aspects':[],
                'consistency':{'status':'not_checked','errors':document_errors},'errors':document_errors}

    overall=obj['sentiment']
    sentiment=component(overall,[] if overall in LABELS else ['invalid_sentiment'])
    counts=Counter(a['name'] for a in obj['aspects'])
    aspects=[]
    for index,entry in enumerate(obj['aspects']):
        name,polarity,quote=entry['name'],entry['sentiment'],entry['quote']
        errors=[]
        if name not in ASPECTS:
            errors.append('invalid_aspect_name')
        if polarity not in LABELS:
            errors.append('invalid_aspect_sentiment')
        if counts[name]>1:
            errors.append('duplicate_aspect')
        classification=component({'name':name,'sentiment':polarity},errors)
        evidence=component(quote,[] if quote.strip() and quote in text else ['quote_not_in_source'])
        status='checks_passed' if classification['status']==evidence['status']=='checks_passed' else 'needs_review'
        aspects.append({'index':index,'status':status,'classification':classification,'evidence':evidence})

    all_classes_checked=all(a['classification']['status']=='checks_passed' for a in aspects)
    consistency={'status':'not_checked','errors':['incomplete_classification']}
    if sentiment['status']=='checks_passed' and all_classes_checked:
        labels={a['classification']['value']['sentiment'] for a in aspects}
        implied=('mixed' if 'mixed' in labels or {'positive','negative'}<=labels
                 else 'positive' if 'positive' in labels else 'negative' if 'negative' in labels else 'neutral')
        if overall==implied:
            consistency={'status':'checks_passed','errors':[]}
        else:
            consistency={'status':'needs_review','errors':['sentiment_aspect_conflict']}
            # Preserve the candidate; never silently select one side of a contradiction.
            sentiment=component(overall,['sentiment_aspect_conflict'])

    parts=[sentiment]+[part for a in aspects for part in [a['classification'],a['evidence']]]
    all_checked=all(part['status']=='checks_passed' for part in parts) and consistency['status']=='checks_passed'
    any_checked=any(part['status']=='checks_passed' for part in parts)
    status='complete' if all_checked else 'partial' if any_checked else 'needs_review'
    errors=sorted({error for part in [*parts,consistency] for error in part['errors']})
    return {'id':cid,'text':text,'status':status,'sentiment':sentiment,'aspects':aspects,
            'consistency':consistency,'errors':errors}
