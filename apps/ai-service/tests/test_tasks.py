import asyncio

from httpx import ASGITransport, AsyncClient

from app.main import app


def request(method, path, **kwargs):
    async def run():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(run())


def test_internal_capabilities_require_service_auth(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    assert request("GET", "/api/v1/capabilities").status_code == 401


def test_missing_model_returns_stable_unavailable_not_fake_analysis(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    response = request(
        "POST",
        "/api/v1/tasks/sentiment",
        headers={"X-AI-Service-Key": "test-only-service-key"},
        json={"schemaVersion": 1, "taskId": "test-1", "locale": "en", "text": "Good"},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "model_unavailable"
    assert "result" not in response.json()


def test_normalization_preserves_raw_sentence_offsets(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    response = request(
        "POST",
        "/api/v1/tasks/normalization",
        headers={"X-AI-Service-Key": "test-only-service-key"},
        json={
            "schemaVersion": 1,
            "taskId": "test-2",
            "locale": "ar",
            "text": "  جيد! Service slow.  ",
        },
    )
    assert response.status_code == 200
    result = response.json()["result"]
    assert result["text"] == "  جيد! Service slow.  "
    assert result["sentences"] == [
        {"id": "s1", "start": 2, "end": 6, "text": "جيد!"},
        {"id": "s2", "start": 7, "end": 20, "text": "Service slow."},
    ]


def test_language_distinguishes_code_switching_without_claiming_confidence(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    response = request(
        "POST",
        "/api/v1/tasks/language",
        headers={"X-AI-Service-Key": "test-only-service-key"},
        json={"schemaVersion": 1, "taskId": "test-3", "locale": "en", "text": "جيد service"},
    )
    assert response.status_code == 200
    assert response.json()["result"] == {
        "language": "mixed",
        "method": "unicode-script-v1",
        "sentences": [{"sentenceId": "s1", "language": "mixed"}],
    }


def test_unconfigured_service_never_accepts_an_empty_key(monkeypatch):
    monkeypatch.delenv("AI_SERVICE_KEY", raising=False)
    assert request("GET", "/api/v1/capabilities").status_code == 503


def test_invalid_offsets_and_unknown_request_fields_are_rejected(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    response = request(
        "POST",
        "/api/v1/tasks/normalization",
        headers={"X-AI-Service-Key": "test-only-service-key"},
        json={
            "schemaVersion": 1,
            "taskId": "1",
            "locale": "en",
            "text": "Hi",
            "sentences": [{"id": "s1", "text": "Other", "start": 0, "end": 2}],
        },
    )
    assert response.status_code == 422
    assert "input" not in response.json().get("error", {})


def test_oversized_stream_is_rejected_before_json_validation(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    response = request(
        "POST",
        "/api/v1/tasks/normalization",
        content=b"x" * 2100000,
        headers={"X-AI-Service-Key": "test-only-service-key", "Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_configured_invalid_normalizer_does_not_silently_fallback(tmp_path, monkeypatch):
    import json

    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", str(tmp_path))
    (tmp_path / "manifest.json").write_text(json.dumps({"capability": "normalization"}))
    response = request(
        "POST",
        "/api/v1/tasks/normalization",
        headers={"X-AI-Service-Key": "test-only-service-key"},
        json={"schemaVersion": 1, "taskId": "1", "locale": "en", "text": "Good"},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "model_unavailable"
