"""Model emits tagged plain text. Python alone builds and serializes JSON."""
from v2_json import build_record


def parse_text(raw):
    """Parse unambiguous framing only; individual values are validated separately."""
    if not isinstance(raw,str):
        return None
    lines=raw.strip().splitlines()
    if len(lines)<2 or not lines[0].startswith('SENTIMENT|') or lines[-1]!='END':
        return None
    header=lines[0].split('|')
    if len(header)!=2:
        return None
    sentiment=header[1].strip()
    aspects=[]
    current=None
    for line in lines[1:-1]:
        if line.startswith('ASPECT|'):
            parts=line.split('|',3)
            if len(parts)!=4:
                return None
            current={'name':parts[1].strip(),'sentiment':parts[2].strip(),'quote':parts[3]}
            aspects.append(current)
        elif current is not None and line!='END' and not line.startswith('SENTIMENT|'):
            current['quote']+='\n'+line
        else:
            return None
    # No json.loads on raw model text. This dict originates entirely in Python.
    return {'sentiment':sentiment,'aspects':aspects}


def convert_text(cid, text, raw, *, truncated=False):
    obj=parse_text(raw)
    if obj is None:
        errors=['invalid_text_format']
        if truncated:
            errors.append('generation_truncated')
        return {'id':cid,'text':text,'status':'rejected','analysis':None,'errors':errors}
    return build_record(cid,text,obj,truncated=truncated)
