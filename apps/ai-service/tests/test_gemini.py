"""Synthetic HTTP responses only; these tests never contact a paid provider."""

import json

import pytest

from tests.test_tasks import request


@pytest.fixture
def configured(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", str(tmp_path))
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "private-fixture-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.8-flash")
    monkeypatch.setenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
    monkeypatch.setenv("GEMINI_EMBEDDING_DIMENSIONS", "768")
    return {"X-AI-Service-Key": "test-only-service-key"}


def test_explicit_cloud_selection_exposes_safe_readiness(configured):
    response = request("GET", "/api/v1/capabilities", headers=configured)
    entries = {item["capability"]: item for item in response.json()["capabilities"]}
    assert entries["sentiment"]["available"] is True
    assert entries["sentiment"]["provider"] == "gemini"
    assert entries["sentiment"]["modelVersion"].startswith("gemini/")
    assert entries["normalization"]["modelVersion"] == "builtin-1"
    assert entries["normalization"]["pipelineVersion"] == "nuvia-ai-1"
    assert entries["normalization"]["provider"] == "local"
    assert entries["forecasting"]["available"] is False
    assert entries["clustering"]["available"] is False
    assert "private-fixture-key" not in response.text


def test_local_default_never_uses_key_without_explicit_selection(configured, monkeypatch):
    monkeypatch.delenv("AI_PROVIDER")
    response = request("GET", "/api/v1/capabilities", headers=configured)
    entry = next(x for x in response.json()["capabilities"] if x["capability"] == "sentiment")
    assert entry["available"] is False


@pytest.mark.parametrize("provider,key", [("gemini", ""), ("typo", "private-fixture-key")])
def test_bad_provider_configuration_never_falls_back(configured, monkeypatch, provider, key):
    monkeypatch.setenv("AI_PROVIDER", provider)
    monkeypatch.setenv("GEMINI_API_KEY", key)
    response = request(
        "POST",
        "/api/v1/tasks/sentiment",
        headers=configured,
        json={"schemaVersion": 1, "taskId": "r1", "locale": "en", "text": "Good"},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "model_unavailable"
    assert "result" not in response.json()


def generated(value, *, finish="STOP"):
    return {
        "candidates": [
            {"finishReason": finish, "content": {"parts": [{"text": json.dumps(value)}]}}
        ]
    }


def inline_http(monkeypatch, response):
    from app.providers import gemini

    seen = []

    def post(config, method, payload):
        seen.append((method, payload))
        return response(payload) if callable(response) else response

    async def execute(config, path, task, **kwargs):
        return gemini.run_task(config, task)

    monkeypatch.setattr(gemini, "post_json", post)
    monkeypatch.setattr(gemini, "execute_isolated", execute)
    return seen


def test_structured_sentiment_passes_real_contract_validation(configured, monkeypatch):
    seen = inline_http(
        monkeypatch,
        generated({"label": "positive", "sentences": [{"sentenceId": "s1", "label": "positive"}]}),
    )
    response = request(
        "POST",
        "/api/v1/tasks/sentiment",
        headers=configured,
        json={"schemaVersion": 1, "taskId": "r1", "locale": "ar", "text": "جيد"},
    )
    assert response.status_code == 200
    assert response.json()["pipelineVersion"] == "nuvia-gemini-json-3"
    assert response.json()["result"]["sentences"][0]["sentenceId"] == "s1"
    assert seen[0][0] == "generateContent"
    assert seen[0][1]["generationConfig"]["responseJsonSchema"]["type"] == "object"
    assert "جيد" in seen[0][1]["contents"][0]["parts"][0]["text"]


@pytest.mark.parametrize(
    "output",
    [
        generated({"label": "positive", "sentences": []}),
        generated({"label": "invented", "sentences": [{"sentenceId": "s1", "label": "positive"}]}),
        generated(
            {"label": "positive", "sentences": [{"sentenceId": "other", "label": "positive"}]}
        ),
        generated({}, finish="MAX_TOKENS"),
        {"promptFeedback": {"blockReason": "SAFETY"}},
    ],
)
def test_invalid_or_incomplete_generation_never_succeeds(configured, monkeypatch, output):
    inline_http(monkeypatch, output)
    response = request(
        "POST",
        "/api/v1/tasks/sentiment",
        headers=configured,
        json={"schemaVersion": 1, "taskId": "r1", "locale": "en", "text": "Good"},
    )
    assert response.status_code == 502
    assert response.json()["status"] == "failed"
    assert "result" not in response.json()


def test_cloud_embeddings_preserve_ids_dimensions_and_normalize(configured, monkeypatch):
    # Characterize the observed Embedding 001 REST behavior: nested configuration is
    # ignored and produces the default 3072 dimensions; top-level fields select 768.
    def embedding_response(payload):
        return {
            "embeddings": [
                {"values": [3.0, 4.0] + [0.0] * (item.get("outputDimensionality", 3072) - 2)}
                for item in payload["requests"]
            ]
        }

    seen = inline_http(monkeypatch, embedding_response)
    response = request(
        "POST",
        "/api/v1/tasks/embeddings",
        headers=configured,
        json={
            "schemaVersion": 1,
            "taskId": "t1",
            "locale": "en",
            "evidence": [{"id": "b", "text": "First"}, {"id": "a", "text": "Second"}],
        },
    )
    assert response.status_code == 200
    vectors = response.json()["result"]["vectors"]
    assert [v["id"] for v in vectors] == ["b", "a"]
    assert vectors[0]["values"][:2] == [0.6, 0.8]
    assert seen[0][0] == "batchEmbedContents"
    item = seen[0][1]["requests"][0]
    assert item["outputDimensionality"] == 768
    assert item["taskType"] == "CLUSTERING"
    assert "embedContentConfig" not in item


@pytest.mark.parametrize("vectors", [[], [{"values": [1.0]}], [{"values": [0.0] * 768}]])
def test_bad_embedding_cardinality_dimension_or_zero_norm_rejected(
    configured, monkeypatch, vectors
):
    inline_http(monkeypatch, {"embeddings": vectors})
    response = request(
        "POST",
        "/api/v1/tasks/embeddings",
        headers=configured,
        json={"schemaVersion": 1, "taskId": "r1", "locale": "en", "text": "Good"},
    )
    assert response.status_code == 502
    assert "result" not in response.json()


@pytest.mark.parametrize("text", ["a" * 1025, "ج" * 513], ids=["ascii", "arabic"])
def test_cloud_embedding_long_source_is_rejected_before_remote_request(
    configured, monkeypatch, text
):
    def unexpected_remote(_payload):
        pytest.fail("Oversized source must never be sent to the provider")

    seen = inline_http(monkeypatch, unexpected_remote)
    response = request(
        "POST",
        "/api/v1/tasks/embeddings",
        headers=configured,
        json={"schemaVersion": 1, "taskId": "r1", "locale": "en", "text": text},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "provider_input_too_large"
    assert seen == []


def test_cloud_embedding_rejects_entire_batch_if_one_source_is_oversized(configured, monkeypatch):
    def unexpected_remote(_payload):
        pytest.fail("No subset of an invalid batch may be sent to the provider")

    seen = inline_http(monkeypatch, unexpected_remote)
    response = request(
        "POST",
        "/api/v1/tasks/embeddings",
        headers=configured,
        json={
            "schemaVersion": 1,
            "taskId": "r1",
            "locale": "en",
            "evidence": [{"id": "small", "text": "Good"}, {"id": "large", "text": "a" * 1025}],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "provider_input_too_large"
    assert seen == []


def test_cloud_embedding_boundary_sends_complete_arabic_source(configured, monkeypatch):
    text = "ج" * 512

    def embedding_response(payload):
        assert payload["requests"][0]["content"]["parts"][0]["text"] == text
        return {"embeddings": [{"values": [1.0] + [0.0] * 767}]}

    inline_http(monkeypatch, embedding_response)
    response = request(
        "POST",
        "/api/v1/tasks/embeddings",
        headers=configured,
        json={"schemaVersion": 1, "taskId": "r1", "locale": "ar", "text": text},
    )
    assert response.status_code == 200
    assert response.json()["modelVersion"].endswith("/d768/norm1/b1024-v2")


def test_unverified_embedding_model_is_unavailable_without_disabling_text_tasks(
    configured, monkeypatch
):
    monkeypatch.setenv("GEMINI_EMBEDDING_MODEL", "some-unverified-model")
    response = request("GET", "/api/v1/capabilities", headers=configured)
    entries = {item["capability"]: item for item in response.json()["capabilities"]}
    assert entries["embeddings"]["available"] is False
    assert entries["embeddings"]["reason"] == "unsupported_embedding_model"
    assert entries["sentiment"]["available"] is True


def test_remote_schema_does_not_trigger_observed_maxitems_argument_rejection(
    configured, monkeypatch
):
    from app.services.runtime import ExecutionError

    def contains_array_maximum(value):
        if isinstance(value, dict):
            return "maxItems" in value or any(contains_array_maximum(v) for v in value.values())
        if isinstance(value, list):
            return any(contains_array_maximum(v) for v in value)
        return False

    def production_characterization(payload):
        # Controlled live comparison: identical model/prompt/minItems/schema with
        # maxItems present -> HTTP400 INVALID_ARGUMENT; removed -> HTTP200 STOP.
        schema = payload["generationConfig"]["responseJsonSchema"]
        if contains_array_maximum(schema):
            raise ExecutionError("provider_request_rejected")
        return generated(
            {"label": "positive", "sentences": [{"sentenceId": "s1", "label": "positive"}]}
        )

    inline_http(monkeypatch, production_characterization)
    response = request(
        "POST",
        "/api/v1/tasks/sentiment",
        headers=configured,
        json={"schemaVersion": 1, "taskId": "r1", "locale": "ar", "text": "جيد"},
    )
    assert response.status_code == 200


def test_relaxed_remote_schema_retains_local_array_bounds(configured, monkeypatch):
    sections = [{"title": "Section", "text": "Good", "evidenceIds": ["e1"]}] * 31
    inline_http(
        monkeypatch,
        generated(
            {
                "title": "Report",
                "summary": "Good",
                "sections": sections,
                "evidence": [{"id": "e1", "quote": "Good"}],
            }
        ),
    )
    response = request(
        "POST",
        "/api/v1/tasks/report",
        headers=configured,
        json={
            "schemaVersion": 1,
            "taskId": "r1",
            "locale": "en",
            "evidence": [{"id": "e1", "text": "Good"}],
        },
    )
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_output"


@pytest.mark.parametrize(
    "text,quote,start,end,expected_start,expected_end",
    [
        ("Delivery was quick and food was excellent.", "Delivery was quick", 0, 21, 0, 18),
        ("😀 الخدمة ممتازة.", "الخدمة ممتازة", 3, 16, 2, 15),
        ("Good service, good service.", "service", 19, 26, 19, 26),
    ],
)
def test_cloud_aspect_spans_derive_only_from_exact_unambiguous_sentence_quotes(
    configured, monkeypatch, text, quote, start, end, expected_start, expected_end
):
    inline_http(
        monkeypatch,
        generated(
            {
                "taxonomyVersion": "nuvia-gemini-aspects-v1",
                "mentions": [
                    {
                        "sentenceId": "s1",
                        "aspect": "staff",
                        "label": "positive",
                        "start": start,
                        "end": end,
                        "quote": quote,
                    }
                ],
            }
        ),
    )
    response = request(
        "POST",
        "/api/v1/tasks/aspects",
        headers=configured,
        json={"schemaVersion": 1, "taskId": "r1", "locale": "ar", "text": text},
    )
    assert response.status_code == 200
    mention = response.json()["result"]["mentions"][0]
    assert (mention["start"], mention["end"]) == (expected_start, expected_end)
    assert text[mention["start"] : mention["end"]] == quote


@pytest.mark.parametrize(
    "quote,sentence_id",
    [("service", "s1"), ("invented", "s1"), ("Other", "s1"), ("Other", "foreign")],
)
def test_cloud_aspect_span_repair_rejects_ambiguity_and_nonliteral_or_foreign_quotes(
    configured, monkeypatch, quote, sentence_id
):
    inline_http(
        monkeypatch,
        generated(
            {
                "taxonomyVersion": "nuvia-gemini-aspects-v1",
                "mentions": [
                    {
                        "sentenceId": sentence_id,
                        "aspect": "staff",
                        "label": "positive",
                        "start": 0,
                        "end": 1,
                        "quote": quote,
                    }
                ],
            }
        ),
    )
    response = request(
        "POST",
        "/api/v1/tasks/aspects",
        headers=configured,
        json={
            "schemaVersion": 1,
            "taskId": "r1",
            "locale": "en",
            "text": "Good service, good service. Other.",
        },
    )
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_output"


def test_aspect_alignment_is_idempotent_and_limited_to_declared_sentence():
    from app.providers.gemini import GeminiConfig, align_aspect_spans
    from app.schemas.tasks import TaskRequest, validate_result

    task = TaskRequest(
        schemaVersion=1, taskId="r1", locale="en", text="Good service. Good service."
    )
    output = {
        "taxonomyVersion": "nuvia-gemini-aspects-v1",
        "mentions": [
            {
                "sentenceId": "s2",
                "aspect": "staff",
                "label": "positive",
                "start": 0,
                "end": 1,
                "quote": "service",
            }
        ],
    }
    aligned = align_aspect_spans(output, task)
    assert aligned["mentions"][0]["start"] == 19
    assert aligned["mentions"][0]["end"] == 26
    assert align_aspect_spans(aligned, task) == aligned
    manifest = GeminiConfig(capability="aspects", key="fixture", model="fixture")
    assert validate_result("aspects", aligned, task, manifest) == aligned


def test_report_prompt_requests_prioritized_evidence_backed_actions_without_cluster_drift():
    from app.providers.gemini import GeminiConfig, instructions
    from app.schemas.tasks import TaskRequest

    config = GeminiConfig(capability="report", key="fixture", model="fixture")
    task = TaskRequest(schemaVersion=1, taskId="r1", locale="ar")
    prompt = instructions(config, task)
    assert "prioritized recommendations" in prompt
    assert "observations" in prompt and "hypotheses" in prompt
    assert "small sample" in prompt and "unknown causes" in prompt
    task.parameters = {"purpose": "cluster_summary"}
    cluster_prompt = instructions(config, task)
    assert "ONLY included cluster members" in cluster_prompt
    assert "prioritized recommendations" not in cluster_prompt


def test_provider_prompt_never_treats_platform_name_as_customer_business_identity():
    from app.providers.gemini import GeminiConfig, instructions
    from app.schemas.tasks import TaskRequest

    config = GeminiConfig(capability="report", key="fixture", model="fixture")
    for locale in ("ar", "en"):
        task = TaskRequest(schemaVersion=1, taskId="r1", locale=locale)
        prompt = instructions(config, task)
        assert "NUVIA is the software platform, not the reviewed business" in prompt
        assert "Never invent a business name" in prompt
        assert "Customer feedback report" in prompt
        assert "تقرير آراء العملاء" in prompt
