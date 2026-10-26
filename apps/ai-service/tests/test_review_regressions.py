import json
from uuid import UUID

import pytest

from app.models.manifest import ModelManifest
from app.models.tagged import parse_tagged
from app.schemas.tasks import TaskRequest, validate_result
from tests.test_tasks import request


def aspect_manifest():
    return ModelManifest.model_validate(
        {
            "manifestVersion": 1,
            "capability": "aspects",
            "adapter": "transformers_text",
            "artifactFormat": "hf-safetensors",
            "modelVersion": "team-v1",
            "inputSchemaVersion": 1,
            "outputSchemaVersion": 1,
            "languages": ["en"],
            "artifacts": {"config.json": "0" * 64},
            "taxonomy": {"version": "retail-1", "labels": ["service"]},
        }
    )


def test_end_alone_is_legitimate_zero_aspect_output():
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="No comment.")
    model = aspect_manifest()
    result = parse_tagged("aspects", "END", task, model)
    assert validate_result("aspects", result, task, model) == {
        "taxonomyVersion": "retail-1",
        "mentions": [],
    }


def test_sentence_identity_and_absolute_offsets_disambiguate_repeated_aspects():
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="Service slow. Service slow.")
    model = aspect_manifest()
    result = parse_tagged(
        "aspects",
        "ASPECT|service|negative|s1|0|13|Service slow.\n"
        "ASPECT|service|negative|s2|14|27|Service slow.\nEND",
        task,
        model,
    )
    checked = validate_result("aspects", result, task, model)
    assert [(item["sentenceId"], item["start"], item["end"]) for item in checked["mentions"]] == [
        ("s1", 0, 13),
        ("s2", 14, 27),
    ]
    with pytest.raises(ValueError):
        parse_tagged("aspects", "ASPECT|service|negative|s2|0|13|Service slow.\nEND", task, model)


@pytest.mark.parametrize(
    "quote",
    [
        "Fast | friendly",
        "Fast | friendly | calm | clear",
        "s9|0|4|Fast",
        "s1|bad|offset|Fast",
        "s1|0|4|Fast",
    ],
)
def test_legacy_aspect_quote_preserves_literal_pipe_remainder(quote):
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text=quote)
    model = aspect_manifest()
    parsed = parse_tagged("aspects", f"ASPECT|service|positive|{quote}\nEND", task, model)
    result = validate_result("aspects", parsed, task, model)
    assert result["mentions"][0]["quote"] == quote
    assert result["mentions"][0]["start"] == 0
    assert result["mentions"][0]["end"] == len(quote)


def test_explicit_aspect_spans_preserve_pipes_and_disambiguate_repeated_quotes():
    task = TaskRequest(
        schemaVersion=1, taskId="1", locale="en", text="Fast | friendly. Fast | friendly."
    )
    model = aspect_manifest()
    parsed = parse_tagged(
        "aspects",
        "ASPECT|service|positive|s1|0|16|Fast | friendly.\n"
        "ASPECT|service|positive|s2|17|33|Fast | friendly.\nEND",
        task,
        model,
    )
    result = validate_result("aspects", parsed, task, model)
    assert [
        (item["sentenceId"], item["quote"], item["start"], item["end"])
        for item in result["mentions"]
    ] == [
        ("s1", "Fast | friendly.", 0, 16),
        ("s2", "Fast | friendly.", 17, 33),
    ]


def test_supplied_segmentation_cannot_omit_nonwhitespace_content():
    with pytest.raises(ValueError):
        TaskRequest(
            schemaVersion=1,
            taskId="1",
            locale="en",
            text="Good. Bad.",
            sentences=[{"id": "first", "start": 0, "end": 5, "text": "Good."}],
        )


def test_canonical_segmentation_preserves_standalone_punctuation():
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="!!! Good.")
    assert task.sentences[0].text == "!!!"


def test_survey_title_and_labels_match_publication_limits():
    task = TaskRequest(schemaVersion=1, taskId="survey-job", locale="en")
    value = {
        "title": "x" * 121,
        "description": "Draft",
        "questions": [
            {"id": f"q{i}", "type": "long_text", "label": f"Question {i}?", "required": False}
            for i in range(5)
        ],
    }
    with pytest.raises(ValueError):
        validate_result("survey_generation", value, task)


def test_normalization_output_cannot_drop_a_source_sentence():
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="Good. Bad.")
    with pytest.raises(ValueError):
        validate_result(
            "normalization",
            {
                "text": task.text,
                "normalizedText": task.text,
                "method": "invalid",
                "sentences": [task.sentences[0].model_dump()],
            },
            task,
        )


def test_normalization_output_rejects_duplicate_ids_before_downstream_tasks():
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="Good. Bad.")
    sentences = [item.model_dump() for item in task.sentences]
    sentences[1]["id"] = sentences[0]["id"]
    with pytest.raises(ValueError, match="Duplicate normalization sentence IDs"):
        validate_result(
            "normalization",
            {
                "text": task.text,
                "normalizedText": task.text,
                "method": "learned-normalizer",
                "sentences": sentences,
            },
            task,
        )


def test_normalization_output_cannot_exceed_downstream_sentence_limit():
    from app.core.limits import MAX_SENTENCES

    text = "a" * (MAX_SENTENCES + 1)
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text=text)
    with pytest.raises(ValueError):
        validate_result(
            "normalization",
            {
                "text": text,
                "normalizedText": text,
                "method": "learned-normalizer",
                "sentences": [
                    {"id": f"s{i}", "start": i, "end": i + 1, "text": "a"} for i in range(len(text))
                ],
            },
            task,
        )


@pytest.mark.parametrize("count", [1, 4, 11, 50])
def test_survey_generation_rejects_counts_outside_five_to_ten(count):
    task = TaskRequest(schemaVersion=1, taskId="survey-job", locale="en")
    value = {
        "title": "Service survey",
        "description": "Draft",
        "questions": [
            {"id": f"q{i}", "type": "long_text", "label": f"Question {i}?", "required": False}
            for i in range(count)
        ],
    }
    with pytest.raises(ValueError):
        validate_result("survey_generation", value, task)


def test_five_questions_get_publishable_stable_uuid_ids():
    task = TaskRequest(schemaVersion=1, taskId="survey-job", locale="en")
    value = {
        "title": "Service survey",
        "description": "Draft",
        "questions": [
            {"id": f"q{i}", "type": "long_text", "label": f"Question {i}?", "required": False}
            for i in range(5)
        ],
    }
    result = validate_result("survey_generation", value, task)
    ids = [item["id"] for item in result["questions"]]
    assert all(str(UUID(identifier)) == identifier for identifier in ids)
    assert len(set(ids)) == 5
    assert validate_result("survey_generation", value, task) == result


def test_qwen_survey_fence_is_only_accepted_as_one_complete_xml_block():
    task = TaskRequest(schemaVersion=1, taskId="survey-job", locale="en")
    xml = "<title>Service</title><description>Draft</description>" + "".join(
        f'<question id="q{i}" type="long_text" required="false">'
        f"<label>Question {i}?</label></question>"
        for i in range(5)
    )
    result = parse_tagged("survey_generation", f"```xml\n{xml}\n```", task)
    assert len(validate_result("survey_generation", result, task)["questions"]) == 5
    with pytest.raises(ValueError):
        parse_tagged("survey_generation", f"Unrequested prose\n```xml\n{xml}\n```", task)


def test_uuid_shaped_non_rfc_question_id_is_mapped_to_publishable_uuid():
    task = TaskRequest(schemaVersion=1, taskId="survey-job", locale="en")
    value = {
        "title": "Service",
        "description": "Draft",
        "questions": [
            {
                "id": "00000000-0000-0000-0000-000000000001" if i == 0 else f"q{i}",
                "type": "long_text",
                "label": f"Question {i}?",
                "required": False,
            }
            for i in range(5)
        ],
    }
    result = validate_result("survey_generation", value, task)
    assert UUID(result["questions"][0]["id"]).version == 5


def test_assistant_can_abstain_against_nonempty_irrelevant_evidence():
    task = TaskRequest(
        schemaVersion=1,
        taskId="1",
        locale="en",
        text="What is the car plate?",
        evidence=[{"id": "r1", "text": "Food was good."}],
    )
    value = parse_tagged("assistant", "<abstain>insufficient_evidence</abstain>", task)
    assert validate_result("assistant", value, task) == {
        "status": "insufficient_evidence",
        "answer": None,
        "evidence": [],
    }
    with pytest.raises(ValueError):
        validate_result("assistant", {"status": "answered", "answer": "ABC", "evidence": []}, task)


def test_abstention_survives_internal_transport_without_becoming_failed(tmp_path, monkeypatch):
    import importlib
    from types import SimpleNamespace

    tasks = importlib.import_module("app.api.v1.tasks")
    model = aspect_manifest().model_copy(update={"capability": "assistant"})
    monkeypatch.setattr(
        tasks,
        "selected_registry",
        lambda: SimpleNamespace(
            cloud={},
            qwen={},
            packages={
                "assistant": (model, tmp_path),
            },
        ),
    )

    async def abstain(*args):
        return {"status": "insufficient_evidence", "answer": None, "evidence": []}

    monkeypatch.setattr(tasks, "execute_isolated", abstain)
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    response = request(
        "POST",
        "/api/v1/tasks/assistant",
        headers={"X-AI-Service-Key": "test-only-service-key"},
        json={
            "schemaVersion": 1,
            "taskId": "1",
            "locale": "en",
            "text": "What is the car plate?",
            "evidence": [{"id": "r1", "text": "Food was good."}],
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "succeeded"
    assert response.json()["result"] == {
        "status": "insufficient_evidence",
        "answer": None,
        "evidence": [],
    }


def test_valid_twelve_thousand_character_response_reaches_builtin_preparation(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    raw = "a" * 6000 + "\n" + "b" * 6000
    response = request(
        "POST",
        "/api/v1/tasks/normalization",
        headers={"X-AI-Service-Key": "test-only-service-key"},
        json={
            "schemaVersion": 1,
            "taskId": "1",
            "locale": "en",
            "text": raw,
            "evidence": [{"id": "response", "text": raw}],
        },
    )
    assert response.status_code == 200
    assert response.json()["result"]["text"] == raw
    assert response.json()["result"]["sentences"][1]["start"] == 6001


def test_accepted_dense_response_preserves_all_sixteen_thousand_sentences(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    raw = "A." * 16000
    payload = {
        "schemaVersion": 1,
        "taskId": "1",
        "locale": "en",
        "text": raw,
        "evidence": [{"id": "response", "text": raw}],
    }
    normalized = request(
        "POST",
        "/api/v1/tasks/normalization",
        headers={"X-AI-Service-Key": "test-only-service-key"},
        json=payload,
    )
    assert normalized.status_code == 200
    sentences = normalized.json()["result"]["sentences"]
    assert len(sentences) == 16000
    payload["sentences"] = sentences
    classified = request(
        "POST",
        "/api/v1/tasks/language",
        headers={"X-AI-Service-Key": "test-only-service-key"},
        json=payload,
    )
    assert classified.status_code == 200
    assert len(classified.json()["result"]["sentences"]) == 16000


def test_realistic_vector_batch_has_explicit_finite_transport_budget():
    vectors = [{"id": f"r{i}", "values": [0.1234567890123456] * 384} for i in range(32)]
    with pytest.raises(ValueError):
        TaskRequest(schemaVersion=1, taskId="1", locale="en", parameters={"vectors": vectors})
    # Node selects its vector-aware sample under120k bytes; 15 real-sized rows fit.
    parameters = {"vectors": vectors[:15], "sampleCount": 15, "totalResponses": 32, "sampled": True}
    assert len(json.dumps(parameters, ensure_ascii=False, separators=(",", ":")).encode()) < 120000
    TaskRequest(schemaVersion=1, taskId="1", locale="en", parameters=parameters)
