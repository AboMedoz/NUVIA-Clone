import pytest

from app.models.manifest import ModelManifest
from app.models.tagged import parse_tagged
from app.schemas.tasks import TaskRequest, validate_result
from app.services.preparation import language, prepare
from tests.test_runtime import package


def test_arabic_variants_diacritics_tatweel_change_only_normalized_text():
    raw = "أَكْلٌ جَمِيلٌ! إِلَى المَقْهَى ـ آفاق."
    result = prepare(raw)
    assert result["normalizedText"] == "اكل جميل! الي المقهي  افاق."
    assert result["text"] == raw
    assert result["method"] == "unicode-arabic-v2"
    for sentence in result["sentences"]:
        assert raw[sentence["start"] : sentence["end"]] == sentence["text"]


def test_sentence_script_languages_preserve_ids_and_mixed_class():
    sentences = [
        {"id": "one", "start": 0, "end": 4, "text": "جيد!"},
        {"id": "two", "start": 5, "end": 9, "text": "Bad."},
    ]
    assert language("جيد! Bad.", sentences)["sentences"] == [
        {"sentenceId": "one", "language": "ar"},
        {"sentenceId": "two", "language": "en"},
    ]


def test_newline_boundaries_do_not_drop_unpunctuated_source_sentences():
    assert prepare("Good\nسيئ")["sentences"] == [
        {"id": "s1", "start": 0, "end": 4, "text": "Good"},
        {"id": "s2", "start": 5, "end": 8, "text": "سيئ"},
    ]


def test_trained_portable_classifier_covers_each_sentence_and_overall_mixed(tmp_path):
    from app.models.adapters import portable_linear

    manifest = ModelManifest.model_validate(package(tmp_path))
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="good. bad.")
    result = validate_result("sentiment", portable_linear(manifest, tmp_path, task), task, manifest)
    assert result["label"] == "mixed"
    assert result["sentences"] == [
        {"sentenceId": "s1", "label": "positive"},
        {"sentenceId": "s2", "label": "negative"},
    ]


def test_partial_sentence_predictions_are_invalid_instead_of_complete():
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="good. bad.")
    output = {"label": "mixed", "sentences": [{"sentenceId": "s1", "label": "positive"}]}
    with pytest.raises(ValueError):
        validate_result("sentiment", output, task)


def test_plain_text_sentence_protocol_retains_response_and_sentence_polarities():
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="good. bad.")
    output = parse_tagged(
        "sentiment", "SENTIMENT|mixed\nSENTENCE|s1|positive\nSENTENCE|s2|negative\nEND", task
    )
    assert validate_result("sentiment", output, task) == {
        "label": "mixed",
        "sentences": [
            {"sentenceId": "s1", "label": "positive"},
            {"sentenceId": "s2", "label": "negative"},
        ],
    }
