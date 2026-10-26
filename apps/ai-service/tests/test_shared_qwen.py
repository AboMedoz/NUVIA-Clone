"""Synthetic IPC and configuration regressions; no model download or inference."""

import asyncio
import hashlib
import json
import os
import time

import pytest

from app.models.manifest import ModelManifest
from app.schemas.tasks import TaskRequest
from app.services.runtime import ExecutionError
from tests.test_runtime import package


def echo_worker(connection, *_):
    while True:
        message = json.loads(connection.recv_bytes())
        if message["request"]["text"] == "sleep":
            time.sleep(30)
        if message["request"]["text"] == "crash":
            connection.close()
            return
        connection.send_bytes(json.dumps({"result": {"pid": os.getpid()}}).encode())


def task(text="good"):
    return TaskRequest(schemaVersion=1, taskId="shared-test", locale="en", text=text)


def test_one_worker_is_reused_across_interfaces(tmp_path):
    from app.services.shared_model import SharedModelWorker

    manifest = ModelManifest.model_validate(package(tmp_path))
    worker = SharedModelWorker(worker=echo_worker)

    async def run():
        first = await worker.execute(manifest, tmp_path, task(), timeout=10)
        other = manifest.model_copy(update={"capability": "assistant", "languages": ["en", "ar"]})
        second = await worker.execute(other, tmp_path, task(), timeout=10)
        assert first["pid"] == second["pid"]
        replacement = other.model_copy(update={"modelVersion": "replacement-1"})
        worker.retire_if_changed(replacement, tmp_path)
        assert worker.process is None
        third = await worker.execute(replacement, tmp_path, task(), timeout=10)
        assert third["pid"] != first["pid"]

    try:
        asyncio.run(run())
    finally:
        worker.close()
    assert worker.process is None


@pytest.mark.parametrize(
    "failure,code", [("sleep", "model_timeout"), ("crash", "model_load_failed")]
)
def test_failed_worker_is_discarded_and_next_task_recovers(tmp_path, failure, code):
    from app.services.shared_model import SharedModelWorker

    manifest = ModelManifest.model_validate(package(tmp_path))
    worker = SharedModelWorker(worker=echo_worker)

    async def run():
        with pytest.raises(ExecutionError, match=code):
            await worker.execute(manifest, tmp_path, task(failure), timeout=1)
        assert worker.process is None
        assert "pid" in await worker.execute(manifest, tmp_path, task(), timeout=10)

    try:
        asyncio.run(run())
    finally:
        worker.close()


def test_busy_and_cancel_do_not_leave_a_stale_reply(tmp_path):
    from app.services.shared_model import SharedModelWorker

    manifest = ModelManifest.model_validate(package(tmp_path))
    worker = SharedModelWorker(worker=echo_worker)

    async def run():
        first = asyncio.create_task(worker.execute(manifest, tmp_path, task("sleep"), timeout=10))
        await asyncio.sleep(0.05)
        worker.retire_if_changed(manifest.model_copy(update={"modelVersion": "other"}), tmp_path)
        assert worker.process is not None
        with pytest.raises(ExecutionError, match="model_busy"):
            await worker.execute(manifest, tmp_path, task(), timeout=10)
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        assert worker.process is None
        assert "pid" in await worker.execute(manifest, tmp_path, task(), timeout=10)

    try:
        asyncio.run(run())
    finally:
        worker.close()


def test_qwen_without_explicit_package_never_falls_back(monkeypatch, tmp_path):
    from app.providers import selected_registry

    monkeypatch.setenv("AI_PROVIDER", "qwen")
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", str(tmp_path))
    monkeypatch.delenv("QWEN_MODEL_PACKAGE", raising=False)
    registry = selected_registry()
    assert registry.entries["assistant"]["reason"] == "qwen_not_configured"
    assert registry.entries["normalization"]["available"]
    assert not registry.entries["sentiment"]["available"]


def test_lifespan_closes_owned_worker_even_when_the_application_exits_with_error(monkeypatch):
    from app.main import app, lifespan
    from app.services.shared_model import shared_qwen

    closed = []
    monkeypatch.setattr(shared_qwen, "close", lambda: closed.append(True))

    async def run():
        async with lifespan(app):
            raise RuntimeError("shutdown-test")

    with pytest.raises(RuntimeError, match="shutdown-test"):
        asyncio.run(run())
    assert closed == [True]


@pytest.fixture
def configured_qwen(monkeypatch, tmp_path):
    from app.providers import qwen

    raw = package(tmp_path)
    (tmp_path / "weights.json").unlink()
    files = {"config.json": b'{"model_type":"qwen2"}', "model.safetensors": b"synthetic"}
    raw.update(adapter="transformers_text", artifactFormat="hf-safetensors", options={})
    raw["artifacts"] = {}
    for name, data in files.items():
        (tmp_path / name).write_bytes(data)
        raw["artifacts"][name] = hashlib.sha256(data).hexdigest()
    (tmp_path / "manifest.json").write_text(json.dumps(raw))
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    monkeypatch.setenv("AI_PROVIDER", "qwen")
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", str(tmp_path))
    monkeypatch.setenv("QWEN_MODEL_PACKAGE", str(tmp_path))
    monkeypatch.setenv("QWEN_CAPABILITIES", "sentiment,assistant,report")
    original = qwen.importlib.util.find_spec
    monkeypatch.setattr(
        qwen.importlib.util,
        "find_spec",
        lambda name: (
            object() if name in {"torch", "transformers", "safetensors"} else original(name)
        ),
    )
    return tmp_path


def test_selected_interfaces_share_one_package_and_keep_others_unavailable(configured_qwen):
    from app.providers import selected_registry

    registry = selected_registry()
    assert set(registry.qwen) == {"sentiment", "assistant", "report"}
    assert len({str(path) for _, path in registry.qwen.values()}) == 1
    assert len({m.modelVersion for m, _ in registry.qwen.values()}) == 1
    for name in ("aspects", "survey_generation", "embeddings", "forecasting"):
        assert not registry.entries[name]["available"]
    assert registry.entries["normalization"]["modelVersion"] == "builtin-1"
    assert not registry.cloud


def test_survey_locale_profile_cannot_silently_enable_arabic(configured_qwen, monkeypatch):
    from app.providers import selected_registry

    path = configured_qwen / "manifest.json"
    raw = json.loads(path.read_bytes())
    raw["languages"] = ["en", "ar"]
    path.write_text(json.dumps(raw))
    monkeypatch.setenv("QWEN_CAPABILITIES", "survey_generation")
    monkeypatch.setenv("QWEN_SURVEY_LOCALES", "en")
    registry = selected_registry()
    assert registry.qwen["survey_generation"][0].languages == ["en"]
    monkeypatch.setenv("QWEN_SURVEY_LOCALES", "unknown")
    assert not selected_registry().qwen


@pytest.mark.parametrize(
    "setting,value",
    [
        ("QWEN_MODEL_PACKAGE", ".."),
        ("QWEN_CAPABILITIES", "assistant,embeddings"),
    ],
)
def test_bad_shared_selection_cannot_partially_activate(
    configured_qwen, monkeypatch, setting, value
):
    from app.providers import selected_registry

    monkeypatch.setenv(setting, value)
    registry = selected_registry()
    assert not registry.qwen
    assert not registry.entries["assistant"]["available"]


def test_weight_tampering_invalidates_cached_shared_package(configured_qwen):
    from app.providers import selected_registry

    assert selected_registry().qwen
    (configured_qwen / "model.safetensors").write_bytes(b"changed")
    assert not selected_registry().qwen


def test_non_object_model_config_is_unavailable_not_an_http_500(configured_qwen):
    from app.providers import selected_registry

    (configured_qwen / "config.json").write_bytes(b"[]")
    manifest_path = configured_qwen / "manifest.json"
    raw = json.loads(manifest_path.read_bytes())
    raw["artifacts"]["config.json"] = hashlib.sha256(b"[]").hexdigest()
    manifest_path.write_text(json.dumps(raw))
    assert not selected_registry().qwen


@pytest.mark.parametrize(
    "available,resident,expected", [(False, False, False), (True, False, False), (True, True, True)]
)
def test_cuda_readiness_requires_device_and_memory_or_resident_weights(
    configured_qwen, monkeypatch, available, resident, expected
):
    from types import SimpleNamespace

    from app.providers import qwen, selected_registry
    from app.services.shared_model import shared_qwen

    path = configured_qwen / "manifest.json"
    raw = json.loads(path.read_bytes())
    raw["device"] = "cuda"
    path.write_text(json.dumps(raw))
    fake_torch = SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: available, mem_get_info=lambda: (128, 10000))
    )
    monkeypatch.setattr(qwen.importlib, "import_module", lambda _: fake_torch)
    monkeypatch.setattr(shared_qwen, "is_resident", lambda *_: resident, raising=False)
    assert selected_registry().entries["assistant"]["available"] is expected


def test_qwen_transport_rejects_fake_quotes_and_preserves_abstention(configured_qwen, monkeypatch):
    from app.services.shared_model import shared_qwen
    from tests.test_tasks import request

    result = {"answer": "Invented claim", "evidence": [{"id": "r1", "quote": "invented quote"}]}

    async def execute(*_):
        return result

    monkeypatch.setattr(shared_qwen, "execute", execute)
    payload = {
        "schemaVersion": 1,
        "taskId": "1",
        "locale": "en",
        "text": "Question?",
        "evidence": [{"id": "r1", "text": "The service was slow."}],
    }
    headers = {"X-AI-Service-Key": "test-only-service-key"}
    response = request("POST", "/api/v1/tasks/assistant", headers=headers, json=payload)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_output"
    result = {"status": "insufficient_evidence", "answer": None, "evidence": []}
    response = request("POST", "/api/v1/tasks/assistant", headers=headers, json=payload)
    assert response.status_code == 200
    assert response.json()["result"]["answer"] is None
    assert response.json()["provider"] == "qwen"
    assert response.json()["pipelineVersion"].startswith("nuvia-qwen-shared-")
    assert str(configured_qwen) not in response.text


def test_shared_transport_requires_auth_and_evidence_before_inference(configured_qwen, monkeypatch):
    from app.services.shared_model import shared_qwen
    from tests.test_tasks import request

    async def unexpected(*_):
        pytest.fail("Input/auth rejection must precede inference")

    monkeypatch.setattr(shared_qwen, "execute", unexpected)
    payload = {"schemaVersion": 1, "taskId": "1", "locale": "en", "text": "Question?"}
    assert request("POST", "/api/v1/tasks/assistant", json=payload).status_code == 401
    assert (
        request(
            "POST",
            "/api/v1/tasks/assistant",
            json=payload,
            headers={"X-AI-Service-Key": "test-only-service-key"},
        ).status_code
        == 422
    )
