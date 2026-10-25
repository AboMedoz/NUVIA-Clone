"""Deterministic v2 output adapter. No model calls, repairs, aliases or gold labels."""
import json

LABELS = ('positive','negative','neutral','mixed')
ASPECTS = ('food','service','price','speed','cleanliness')


def _unique(pairs):
    obj = {}
    for key,value in pairs:
        if key in obj:
            raise ValueError('Duplicate JSON key')
        obj[key] = value
    return obj


def _nonfinite(value):
    raise ValueError('Nonfinite JSON constant')


def read_inputs(data):
    if not isinstance(data,list) or not data:
        raise ValueError('Input must be a nonempty array of {id, text}')
    seen = set()
    output = []
    for entry in data:
        if not isinstance(entry,dict) or set(entry) != {'id','text'}:
            raise ValueError('Each input needs exactly id and text')
        cid,text = entry['id'],entry['text']
        if not isinstance(cid,str) or not cid.strip() or cid in seen:
            raise ValueError('Input IDs must be unique nonempty strings')
        if not isinstance(text,str) or not text.strip():
            raise ValueError('Feedback text must be nonempty')
        seen.add(cid)
        output.append({'id':cid,'text':text})
    return output


def convert(cid, text, raw, *, truncated=False):
    try:
        obj = json.loads(raw,object_pairs_hook=_unique,parse_constant=_nonfinite)
    except (ValueError,TypeError,RecursionError):
        errors = ['generation_truncated'] if truncated else []
        return {'id':cid,'text':text,'status':'rejected','analysis':None,'errors':errors+['invalid_json']}
    return build_record(cid,text,obj,truncated=truncated)


def build_record(cid, text, obj, *, truncated=False):
    """Validate an object BUILT BY CODE, independently of model output format."""
    errors = ['generation_truncated'] if truncated else []
    result = {'id':cid,'text':text,'status':'rejected','analysis':None,'errors':errors}
    if not isinstance(obj,dict) or set(obj) != {'sentiment','aspects'}:
        errors.append('invalid_root_schema')
        return result
    sentiment = obj['sentiment']
    if not isinstance(sentiment,str) or sentiment not in LABELS:
        errors.append('invalid_sentiment')
    if not isinstance(obj['aspects'],list):
        errors.append('invalid_aspects_schema')
        return result
    seen = set()
    aspects = []
    for entry in obj['aspects']:
        if not isinstance(entry,dict) or set(entry) != {'name','sentiment','quote'}:
            errors.append('invalid_aspect_schema')
            continue
        name,polarity,quote = entry['name'],entry['sentiment'],entry['quote']
        if not isinstance(name,str) or name not in ASPECTS:
            errors.append('invalid_aspect_name')
        elif name in seen:
            errors.append('duplicate_aspect')
        else:
            seen.add(name)
        if not isinstance(polarity,str) or polarity not in LABELS:
            errors.append('invalid_aspect_sentiment')
        if not isinstance(quote,str) or not quote.strip() or quote not in text:
            errors.append('quote_not_in_source')
        # Rebuild fields explicitly; never pass through unknown model keys.
        aspects.append({'name':name,'sentiment':polarity,'quote':quote})
    if not errors:
        labels = {a['sentiment'] for a in aspects}
        combined = ('mixed' if 'mixed' in labels or {'positive','negative'} <= labels
                    else 'positive' if 'positive' in labels else 'negative' if 'negative' in labels else 'neutral')
        if sentiment != combined:
            errors.append('sentiment_aspect_conflict')
    if errors:
        result['errors'] = sorted(set(errors))
        return result
    aspects.sort(key=lambda a:ASPECTS.index(a['name']))
    result.update(status='accepted',analysis={'sentiment':sentiment,'aspects':aspects})
    return result
