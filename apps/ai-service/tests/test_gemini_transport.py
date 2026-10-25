"""Provider boundary regressions use synthetic data and never send external requests."""

import json

import pytest

from tests.test_gemini import configured as configured
from tests.test_gemini import generated, inline_http
from tests.test_tasks import request


def test_blank_model_settings_use_documented_defaults(configured, monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "  ")
    monkeypatch.setenv("GEMINI_EMBEDDING_MODEL", "")
    response = request("GET", "/api/v1/capabilities", headers=configured)
    entries = {item["capability"]: item for item in response.json()["capabilities"]}
    assert entries["sentiment"]["available"] is True
    assert entries["embeddings"]["available"] is True


@pytest.mark.parametrize(
    "capability,output",
    [
        (
            "aspects",
            {
                "taxonomyVersion": "nuvia-gemini-aspects-v1",
                "mentions": [
                    {
                        "sentenceId": "s1",
                        "aspect": "quality",
                        "label": "positive",
                        "start": 0,
                        "end": 4,
                        "quote": "Good",
                    }
                ],
            },
        ),
        (
            "report",
            {
                "title": "Quality",
                "summary": "Positive source feedback",
                "sections": [
                    {
                        "title": "Feedback",
                        "text": "The source was positive",
                        "evidenceIds": ["e1"],
                    }
                ],
                "evidence": [{"id": "e1", "quote": "Good"}],
            },
        ),
        (
            "assistant",
            {
                "status": "answered",
                "answer": "The source says Good.",
                "evidence": [{"id": "e1", "quote": "Good"}],
            },
        ),
        ("assistant", {"status": "insufficient_evidence", "answer": None, "evidence": []}),
        (
            "survey_generation",
            {
                "title": "Feedback",
                "description": "Draft for review",
                "questions": [
                    {
                        "id": f"q{index}",
                        "type": "long_text",
                        "label": f"Question {index}",
                        "required": False,
                    }
                    for index in range(1, 6)
                ],
            },
        ),
    ],
)
def test_supported_cloud_results_use_existing_contracts(
    configured, monkeypatch, capability, output
):
    inline_http(monkeypatch, generated(output))
    response = request(
        "POST",
        f"/api/v1/tasks/{capability}",
        headers=configured,
        json={
            "schemaVersion": 1,
            "taskId": "r1",
            "locale": "en",
            "text": "Good",
            "evidence": [{"id": "e1", "text": "Good"}],
        },
    )
    assert response.status_code == 200
    result = response.json()["result"]
    if capability == "survey_generation":
        from uuid import UUID

        assert len({UUID(q["id"]) for q in result["questions"]}) == 5
    elif capability == "assistant" and output["status"] == "insufficient_evidence":
        assert result == {"status": "insufficient_evidence", "answer": None, "evidence": []}


@pytest.mark.parametrize(
    "capability,output",
    [
        (
            "aspects",
            {
                "taxonomyVersion": "nuvia-gemini-aspects-v1",
                "mentions": [
                    {
                        "sentenceId": "s1",
                        "aspect": "quality",
                        "label": "positive",
                        "start": 0,
                        "end": 4,
                        "quote": "Fake",
                    }
                ],
            },
        ),
        ("aspects", {"taxonomyVersion": "other", "mentions": []}),
        ("assistant", {"status": "answered", "answer": "Invented", "evidence": []}),
        (
            "assistant",
            {
                "status": "answered",
                "answer": "Invented",
                "evidence": [{"id": "e1", "quote": "not supplied"}],
            },
        ),
        (
            "report",
            {
                "title": "Title",
                "summary": "Summary",
                "sections": [
                    {
                        "title": "Section",
                        "text": "Text",
                        "evidenceIds": ["foreign"],
                    }
                ],
                "evidence": [{"id": "e1", "quote": "Good"}],
            },
        ),
    ],
)
def test_cloud_grounding_cannot_bypass_source_validation(
    configured, monkeypatch, capability, output
):
    inline_http(monkeypatch, generated(output))
    response = request(
        "POST",
        f"/api/v1/tasks/{capability}",
        headers=configured,
        json={
            "schemaVersion": 1,
            "taskId": "r1",
            "locale": "en",
            "text": "Good",
            "evidence": [{"id": "e1", "text": "Good"}],
        },
    )
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_output"


def test_cloud_missing_key_does_not_activate_installed_local_package(
    configured, monkeypatch, tmp_path
):
    from tests.test_runtime import package

    package(tmp_path)
    monkeypatch.delenv("GEMINI_API_KEY")
    response = request("GET", "/api/v1/capabilities", headers=configured)
    sentiment = next(x for x in response.json()["capabilities"] if x["capability"] == "sentiment")
    assert sentiment["available"] is False
    assert sentiment["provider"] == "gemini"
    monkeypatch.setenv("AI_PROVIDER", "local")
    response = request("GET", "/api/v1/capabilities", headers=configured)
    sentiment = next(x for x in response.json()["capabilities"] if x["capability"] == "sentiment")
    assert sentiment["available"] is True
    assert sentiment["modelVersion"] == "fixture-only-1"


class HttpResponse:
    status = 200
    body = b'{"ok":true}'

    def read(self, limit):
        return self.body[:limit]


def fake_connection(monkeypatch, response):
    from app.providers import gemini

    calls = []

    class Connection:
        def __init__(self, host, timeout):
            calls.append((host, timeout))

        def request(self, method, path, body, headers):
            calls.append((method, path, body, headers))

        def getresponse(self):
            if isinstance(response, Exception):
                raise response
            return response

        def close(self):
            calls.append("closed")

    monkeypatch.setattr(gemini.http.client, "HTTPSConnection", Connection)
    return calls


def test_http_transport_keeps_key_out_of_url_and_closes_connection(configured, monkeypatch):
    from app.providers.gemini import GeminiConfig, post_json

    calls = fake_connection(monkeypatch, HttpResponse())
    output = post_json(GeminiConfig.from_environment("sentiment"), "generateContent", {"x": "جيد"})
    assert output == {"ok": True}
    assert calls[0] == ("generativelanguage.googleapis.com", 45)
    assert calls[1][0] == "POST"
    assert calls[1][1] == "/v1beta/models/gemini-3.8-flash:generateContent"
    assert calls[1][3]["x-goog-api-key"] == "private-fixture-key"
    assert calls[-1] == "closed"


@pytest.mark.parametrize(
    "status,code",
    [
        (429, "model_busy"),
        (401, "provider_not_authorized"),
        (403, "provider_not_authorized"),
        (404, "provider_model_unavailable"),
        (400, "provider_request_rejected"),
        (503, "provider_unavailable"),
        (302, "provider_unavailable"),
    ],
)
def test_provider_http_errors_are_bounded_and_never_echo_response_body(
    configured, monkeypatch, status, code
):
    from app.providers.gemini import GeminiConfig, post_json
    from app.services.runtime import ExecutionError

    class ErrorResponse(HttpResponse):
        def read(self, _limit):
            pytest.fail("Provider error body must never be read")

    response = ErrorResponse()
    response.status = status
    calls = fake_connection(monkeypatch, response)
    with pytest.raises(ExecutionError, match=f"^{code}$"):
        post_json(GeminiConfig.from_environment("sentiment"), "generateContent", {})
    assert calls[-1] == "closed"


@pytest.mark.parametrize(
    "response,code",
    [
        (TimeoutError("private-fixture-key"), "model_timeout"),
        (OSError("private source content"), "provider_unavailable"),
    ],
)
def test_network_errors_never_echo_keys_or_source(configured, monkeypatch, response, code):
    from app.providers.gemini import GeminiConfig, post_json
    from app.services.runtime import ExecutionError

    calls = fake_connection(monkeypatch, response)
    with pytest.raises(ExecutionError, match=f"^{code}$"):
        post_json(GeminiConfig.from_environment("sentiment"), "generateContent", {})
    assert calls[-1] == "closed"


def test_transport_rejects_oversized_provider_response(configured, monkeypatch):
    from app.providers.gemini import GeminiConfig, post_json
    from app.services.runtime import ExecutionError

    response = HttpResponse()
    response.body = b"x" * 2_000_001
    fake_connection(monkeypatch, response)
    with pytest.raises(ExecutionError, match="invalid_model_output"):
        post_json(GeminiConfig.from_environment("sentiment"), "generateContent", {})


@pytest.mark.parametrize("failure_type", ["unexpected", "execution"])
def test_cloud_worker_sanitizes_unexpected_failure(configured, monkeypatch, failure_type):
    from app.providers import gemini
    from app.services.runtime import ExecutionError

    class Pipe:
        def send_bytes(self, data):
            self.output = data

        def close(self):
            pass

    def fail(*_):
        if failure_type == "execution":
            raise ExecutionError("private-fixture-key and customer source")
        raise RuntimeError("private-fixture-key and customer source")

    monkeypatch.setattr(gemini, "run_task", fail)
    pipe = Pipe()
    gemini.gemini_worker(
        pipe,
        gemini.GeminiConfig.from_environment("sentiment").model_dump(),
        None,
        {"schemaVersion": 1, "taskId": "r1", "locale": "en", "text": "Good"},
    )
    assert json.loads(pipe.output) == {"error": "provider_unavailable"}
