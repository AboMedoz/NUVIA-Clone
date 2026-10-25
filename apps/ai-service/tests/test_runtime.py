import asyncio
import hashlib
import json
import time

import pytest

from tests.test_tasks import request


def package(tmp_path, *, test_only=False, weights=None):
    # Deliberately tiny test-only coefficients; never bundled/selected in product config.
    data = weights or {
        "labels": ["positive", "negative", "neutral", "mixed"],
        "vocabulary": ["good", "bad"],
        "weights": [[2, 0], [0, 2], [0, 0], [1.5, 1.5]],
        "bias": [0, 0, 0.1, 0],
        "lowercase": True,
    }
    path = tmp_path / "weights.json"
    path.write_text(json.dumps(data))
    manifest = {
        "manifestVersion": 1,
        "capability": "sentiment",
        "adapter": "portable_linear",
        "artifactFormat": "nuvia-linear-v1",
        "modelVersion": "fixture-only-1",
        "inputSchemaVersion": 1,
        "outputSchemaVersion": 1,
        "languages": ["en"],
        "device": "cpu",
        "artifacts": {"weights.json": hashlib.sha256(path.read_bytes()).hexdigest()},
        "options": {"weights": "weights.json"},
        "testOnly": test_only,
    }
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    return manifest


def test_portable_trained_coefficients_execute_in_child_and_validate_output(tmp_path):
    from app.models.manifest import ModelManifest
    from app.schemas.tasks import TaskRequest, validate_result
    from app.services.runtime import execute_isolated

    manifest = ModelManifest.model_validate(package(tmp_path))
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="good but bad")
    output = asyncio.run(execute_isolated(manifest, tmp_path, task, timeout=10))
    assert validate_result("sentiment", output, task, manifest)["label"] == "mixed"
    assert "confidence" not in output


def test_product_registry_rejects_explicit_test_packages(tmp_path, monkeypatch):
    package(tmp_path, test_only=True)
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", str(tmp_path))
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    response = request(
        "POST",
        "/api/v1/tasks/sentiment",
        headers={"X-AI-Service-Key": "test-only-service-key"},
        json={"schemaVersion": 1, "taskId": "1", "locale": "en", "text": "good"},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "model_unavailable"


def _sleeping_child(connection, *_):
    time.sleep(30)


def test_timeout_terminates_worker_and_releases_capacity(tmp_path):
    from app.models.manifest import ModelManifest
    from app.schemas.tasks import TaskRequest
    from app.services.runtime import ExecutionError, execute_isolated

    manifest = ModelManifest.model_validate(package(tmp_path))
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="good")
    started = time.monotonic()
    with pytest.raises(ExecutionError, match="model_timeout"):
        asyncio.run(execute_isolated(manifest, tmp_path, task, timeout=0.2, worker=_sleeping_child))
    assert time.monotonic() - started < 5
    output = asyncio.run(execute_isolated(manifest, tmp_path, task, timeout=10))
    assert output["label"] == "positive"


def test_unsafe_pickle_is_rejected_before_adapter_import(tmp_path):
    from app.models.manifest import ModelManifest, validate_package

    raw = package(tmp_path)
    path = tmp_path / "weights.pkl"
    path.write_bytes(b"untrusted-pickle")
    raw["artifacts"] = {"weights.pkl": hashlib.sha256(path.read_bytes()).hexdigest()}
    with pytest.raises(ValueError, match="Unsafe"):
        validate_package(ModelManifest.model_validate(raw), tmp_path)


def test_modified_weight_hash_invalidates_package(tmp_path):
    from app.models.manifest import ModelManifest, validate_package

    raw = package(tmp_path)
    (tmp_path / "weights.json").write_text("{}")
    with pytest.raises(ValueError, match="hash mismatch"):
        validate_package(ModelManifest.model_validate(raw), tmp_path)


def test_concurrency_rejects_extra_inference_without_unbounded_queue(tmp_path, monkeypatch):
    from app.models.manifest import ModelManifest
    from app.schemas.tasks import TaskRequest
    from app.services.runtime import ExecutionError, execute_isolated

    monkeypatch.setenv("AI_MAX_CONCURRENCY", "1")
    manifest = ModelManifest.model_validate(package(tmp_path))
    task = TaskRequest(schemaVersion=1, taskId="1", locale="en", text="good")

    async def run():
        first = asyncio.create_task(
            execute_isolated(manifest, tmp_path, task, timeout=0.3, worker=_sleeping_child)
        )
        await asyncio.sleep(0.05)
        with pytest.raises(ExecutionError, match="model_busy"):
            await execute_isolated(manifest, tmp_path, task)
        with pytest.raises(ExecutionError, match="model_timeout"):
            await first

    asyncio.run(run())
