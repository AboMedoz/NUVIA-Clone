"""Strict plain-text protocol. The model never needs to produce JSON."""

import re
import xml.etree.ElementTree as ET

from app.services.preparation import prepare

LABELS = {"positive", "negative", "neutral", "mixed"}


def parse_tagged(capability, text, request=None, manifest=None):
    if not isinstance(text, str) or len(text) > 200000:
        raise ValueError("Invalid model text")
    raw = text.strip()
    if capability == "survey_generation" and raw.startswith("```xml\n") and raw.endswith("\n```"):
        raw = raw[len("```xml\n") : -len("\n```")].strip()
    if capability in ("sentiment", "aspects") and (
        raw.startswith(("SENTIMENT|", "ASPECT|")) or capability == "aspects" and raw == "END"
    ):
        lines = raw.splitlines()
        if lines[-1] == "END":
            lines.pop()
        label = None
        mentions = []
        predictions = []
        if lines and lines[0].startswith("SENTIMENT|"):
            parts = lines.pop(0).split("|")
            if len(parts) != 2 or parts[1] not in LABELS:
                raise ValueError("Invalid sentiment tag")
            label = parts[1]
        for line in lines:
            if line.startswith("SENTENCE|") and capability == "sentiment":
                parts = line.split("|")
                if len(parts) != 3 or parts[2] not in LABELS:
                    raise ValueError("Invalid sentence sentiment tag")
                predictions.append({"sentenceId": parts[1], "label": parts[2]})
                continue
            parts = line.split("|", 3)
            if len(parts) != 4 or parts[0] != "ASPECT" or parts[2] not in LABELS:
                raise ValueError("Invalid aspect tag")
            if request is None:
                raise ValueError("Source text required")
            span = line.split("|", 6)
            sentence = (
                next((item for item in request.sentences if item.id == span[3]), None)
                if len(span) == 7
                else None
            )
            if (
                sentence is not None
                and re.fullmatch(r"[0-9]+", span[4])
                and re.fullmatch(r"[0-9]+", span[5])
            ):
                start, end = int(span[4]), int(span[5])
                quote = span[6]
            else:
                start, end, quote = -1, -1, ""
            if (
                sentence is not None
                and sentence.start <= start < end <= sentence.end
                and request.text[start:end] == quote
            ):
                mentions.append(
                    {
                        "aspect": parts[1],
                        "label": parts[2],
                        "sentenceId": sentence.id,
                        "start": start,
                        "end": end,
                        "quote": quote,
                    }
                )
                continue
            quote = parts[3]
            # Quoted evidence must have one unambiguous literal match in a sentence.
            matches = [
                (sentence, match.start())
                for sentence in request.sentences
                for match in re.finditer(re.escape(quote), sentence.text)
            ]
            if not quote or len(matches) != 1:
                raise ValueError("Ambiguous or absent aspect evidence")
            sentence, position = matches[0]
            start = sentence.start + position
            mentions.append(
                {
                    "aspect": parts[1],
                    "label": parts[2],
                    "sentenceId": sentence.id,
                    "start": start,
                    "end": start + len(quote),
                    "quote": quote,
                }
            )
        if capability == "sentiment":
            if label is None:
                raise ValueError("Missing sentiment")
            return {"label": label, **({"sentences": predictions} if predictions else {})}
        if manifest is None or manifest.taxonomy is None:
            raise ValueError("Taxonomy required")
        return {"taxonomyVersion": manifest.taxonomy.version, "mentions": mentions}
    if "<!" in raw or "<?" in raw:
        raise ValueError("XML declarations and entities prohibited")
    try:
        root = ET.fromstring("<output>" + raw + "</output>")
    except ET.ParseError as exc:
        raise ValueError("Malformed tagged text") from exc
    if root.text and root.text.strip():
        raise ValueError("Unexpected prose")
    if any(child.tail and child.tail.strip() for child in root):
        raise ValueError("Unexpected prose")

    def singleton(name):
        values = root.findall(name)
        if len(values) != 1 or list(values[0]) or values[0].attrib:
            raise ValueError(f"Expected exactly one {name}")
        return values[0].text or ""

    if capability == "normalization":
        if [child.tag for child in root] != ["normalized"] or request is None:
            raise ValueError("Invalid normalization tags")
        return {
            **prepare(request.text),
            "normalizedText": singleton("normalized"),
            "method": "model-normalization-v1",
        }
    if capability == "sentiment":
        if [child.tag for child in root] != ["sentiment"]:
            raise ValueError("Unexpected sentiment tags")
        label = singleton("sentiment")
        if label not in LABELS:
            raise ValueError("Invalid sentiment label")
        return {"label": label}
    if capability in ("assistant", "report"):
        if capability == "assistant" and [child.tag for child in root] == ["abstain"]:
            if singleton("abstain") != "insufficient_evidence":
                raise ValueError("Unknown abstention state")
            return {"status": "insufficient_evidence", "answer": None, "evidence": []}
        allowed = (
            {"answer", "evidence"}
            if capability == "assistant"
            else {"title", "summary", "section", "evidence"}
        )
        if any(child.tag not in allowed for child in root):
            raise ValueError("Unexpected generation tags")
        evidence = []
        for element in root.findall("evidence"):
            if set(element.attrib) != {"id"} or list(element):
                raise ValueError("Invalid evidence tag")
            evidence.append({"id": element.attrib["id"], "quote": element.text or ""})
        if capability == "assistant":
            return {"answer": singleton("answer"), "evidence": evidence}
        sections = []
        for element in root.findall("section"):
            if set(element.attrib) != {"title", "evidenceIds"} or list(element):
                raise ValueError("Invalid section tag")
            sections.append(
                {
                    "title": element.attrib["title"],
                    "text": element.text or "",
                    "evidenceIds": element.attrib["evidenceIds"].split(","),
                }
            )
        return {
            "title": singleton("title"),
            "summary": singleton("summary"),
            "sections": sections,
            "evidence": evidence,
        }
    if capability == "survey_generation":
        if any(child.tag not in {"title", "description", "question"} for child in root):
            raise ValueError("Unexpected survey tags")
        questions = []
        for element in root.findall("question"):
            if set(element.attrib) != {"id", "type", "required"}:
                raise ValueError("Invalid question attributes")
            if element.attrib["required"] not in {"true", "false"}:
                raise ValueError("Invalid required flag")
            labels = element.findall("label")
            if len(labels) != 1 or any(child.tag not in {"label", "option"} for child in element):
                raise ValueError("Invalid question label")
            item = {
                "id": element.attrib["id"],
                "type": element.attrib["type"],
                "required": element.attrib["required"] == "true",
                "label": labels[0].text or "",
            }
            options = [child.text or "" for child in element.findall("option")]
            if options:
                item["options"] = options
            questions.append(item)
        return {
            "title": singleton("title"),
            "description": singleton("description"),
            "questions": questions,
        }
    raise ValueError("Unsupported tagged capability")
