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
        return response

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
    assert response.json()["pipelineVersion"] == "nuvia-gemini-json-1"
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
    vector = [3.0, 4.0] + [0.0] * 766
    seen = inline_http(monkeypatch, {"embeddings": [{"values": vector}, {"values": vector}]})
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
    assert seen[0][1]["requests"][0]["embedContentConfig"] == {
        "outputDimensionality": 768,
        "autoTruncate": False,
        "taskType": "CLUSTERING",
    }


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
