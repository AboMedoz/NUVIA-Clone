import re
import unicodedata


def validate_sentence_coverage(text, sentences):
    previous = 0
    for item in sentences:
        if (
            item.start < previous
            or item.end <= item.start
            or item.end > len(text)
            or text[item.start : item.end] != item.text
        ):
            raise ValueError("Sentence does not match ordered raw text")
        if text[previous : item.start].strip():
            raise ValueError("Sentence list omits source content")
        previous = item.end
    if text[previous:].strip():
        raise ValueError("Sentence list omits source content")


def prepare(text):
    sentences = []
    for match in re.finditer(r"[^.!?؟\n]+(?:[.!?؟]+|(?=\n)|$)|[.!?؟]+", text):
        raw = match.group()
        clean = raw.strip()
        if clean:
            start = match.start() + len(raw) - len(raw.lstrip())
            sentences.append(
                {
                    "id": f"s{len(sentences) + 1}",
                    "start": start,
                    "end": start + len(clean),
                    "text": clean,
                }
            )
    normalized = unicodedata.normalize("NFC", text).translate(
        str.maketrans(
            {
                "أ": "ا",
                "إ": "ا",
                "آ": "ا",
                "ٱ": "ا",
                "ى": "ي",
                "ی": "ي",
                "ـ": None,
            }
        )
    )
    normalized = "".join(
        char
        for char in normalized
        if not (unicodedata.combining(char) and "ARABIC" in unicodedata.name(char, ""))
    )
    return {
        "text": text,
        "normalizedText": normalized,
        "sentences": sentences,
        "method": "unicode-arabic-v2",
    }


def script_language(text):
    arabic = any("ARABIC" in unicodedata.name(char, "") and char.isalpha() for char in text)
    latin = any("LATIN" in unicodedata.name(char, "") and char.isalpha() for char in text)
    label = "mixed" if arabic and latin else "ar" if arabic else "en" if latin else "und"
    return label


def language(text, sentences=None):
    prepared = sentences if sentences is not None else prepare(text)["sentences"]
    return {
        "language": script_language(text),
        "method": "unicode-script-v1",
        "sentences": [
            {"sentenceId": item["id"], "language": script_language(item["text"])}
            for item in prepared
        ],
    }
