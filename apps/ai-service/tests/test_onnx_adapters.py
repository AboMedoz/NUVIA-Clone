"""Synthetic graphs live in temporary test directories, never product model packages."""

import hashlib

import pytest

onnx = pytest.importorskip("onnx")
pytest.importorskip("onnxruntime")
np = pytest.importorskip("numpy")
from onnx import TensorProto, helper, numpy_helper  # noqa: E402

from app.models.adapters import onnx_numeric, onnx_session, onnx_text_encoder  # noqa: E402
from app.models.manifest import ModelManifest  # noqa: E402
from app.schemas.tasks import TaskRequest, validate_result  # noqa: E402


def manifest_for(path, capability, *, artifacts=None, options=None, adapter="onnx_numeric"):
    return ModelManifest.model_validate(
        {
            "manifestVersion": 1,
            "capability": capability,
            "adapter": adapter,
            "artifactFormat": "onnx-tokenizers" if adapter == "onnx_text_encoder" else "onnx",
            "modelVersion": "fixture-only-1",
            "inputSchemaVersion": 1,
            "outputSchemaVersion": 1,
            "languages": ["en"],
            "device": "cpu",
            "testOnly": True,
            "artifacts": artifacts or {"model.onnx": hashlib.sha256(path.read_bytes()).hexdigest()},
            "options": options or {},
        }
    )


def save_graph(path, graph):
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 9
    onnx.save(model, path)


def test_onnx_forecast_adapter_uses_real_intervals_and_observation_counts(tmp_path):
    path = tmp_path / "model.onnx"
    tensor = numpy_helper.from_array(np.asarray([[4, 3, 5], [5, 2, 8]], dtype=np.float32))
    graph = helper.make_graph(
        [helper.make_node("Constant", [], ["forecast"], value=tensor)],
        "test-only",
        [helper.make_tensor_value_info("series", TensorProto.FLOAT, [1, 3])],
        [helper.make_tensor_value_info("forecast", TensorProto.FLOAT, [2, 3])],
    )
    save_graph(path, graph)
    manifest = manifest_for(path, "forecasting", options={"minObservations": 3})
    source = TaskRequest(
        schemaVersion=1,
        taskId="1",
        locale="en",
        parameters={
            "observations": [
                {"date": "2026-01-01", "value": 3},
                {"date": "2026-01-02", "value": 4},
                {"date": "2026-01-03", "value": 3},
            ],
            "futureDates": ["2026-01-04", "2026-01-05"],
        },
    )
    result = validate_result("forecasting", onnx_numeric(manifest, tmp_path, source), source)
    assert result == {
        "sampleCount": 3,
        "points": [
            {"date": "2026-01-04", "value": 4.0, "lower": 3.0, "upper": 5.0},
            {"date": "2026-01-05", "value": 5.0, "lower": 2.0, "upper": 8.0},
        ],
    }


def test_encoder_pools_only_real_tokens_and_preserves_source_ids(tmp_path):
    tokenizers = pytest.importorskip("tokenizers")
    path = tmp_path / "model.onnx"
    tokenizer = tokenizers.Tokenizer(
        tokenizers.models.WordLevel(
            {"[PAD]": 0, "[UNK]": 1, "good": 2, "bad": 3}, unk_token="[UNK]"
        )
    )
    tokenizer.pre_tokenizer = tokenizers.pre_tokenizers.Whitespace()
    tokenizer.save(str(tmp_path / "tokenizer.json"))
    axes = numpy_helper.from_array(np.asarray([2], dtype=np.int64), "axes")
    graph = helper.make_graph(
        [
            helper.make_node("Cast", ["input_ids"], ["floats"], to=TensorProto.FLOAT),
            helper.make_node("Unsqueeze", ["floats", "axes"], ["hidden"]),
        ],
        "test-only",
        [helper.make_tensor_value_info("input_ids", TensorProto.INT64, [None, None])],
        [helper.make_tensor_value_info("hidden", TensorProto.FLOAT, [None, None, 1])],
        [axes],
    )
    save_graph(path, graph)
    artifacts = {
        name: hashlib.sha256((tmp_path / name).read_bytes()).hexdigest()
        for name in ("model.onnx", "tokenizer.json")
    }
    manifest = manifest_for(path, "embeddings", artifacts=artifacts, adapter="onnx_text_encoder")
    source = TaskRequest(
        schemaVersion=1,
        taskId="1",
        locale="en",
        evidence=[
            {"id": "a", "text": "good bad"},
            {"id": "b", "text": "good"},
        ],
    )
    result = validate_result("embeddings", onnx_text_encoder(manifest, tmp_path, source), source)
    assert result == {"vectors": [{"id": "a", "values": [2.5]}, {"id": "b", "values": [2.0]}]}


def test_nested_external_tensor_cannot_escape_onnx_package(tmp_path):
    path = tmp_path / "model.onnx"
    external = TensorProto()
    external.name = "external"
    external.data_type = TensorProto.FLOAT
    external.dims.extend([1])
    external.data_location = TensorProto.EXTERNAL
    item = external.external_data.add()
    item.key, item.value = "location", "../private.bin"
    graph = helper.make_graph(
        [helper.make_node("Constant", [], ["value"], value=external)],
        "test-only",
        [],
        [helper.make_tensor_value_info("value", TensorProto.FLOAT, [1])],
    )
    save_graph(path, graph)
    with pytest.raises(ValueError, match="External ONNX"):
        onnx_session(manifest_for(path, "forecasting"), tmp_path)


def test_cuda_package_is_unavailable_when_runtime_has_only_cpu(tmp_path, monkeypatch):
    import json

    import onnxruntime

    from app.models.manifest import Registry

    path = tmp_path / "model.onnx"
    path.write_bytes(b"metadata-check-only")
    raw = manifest_for(path, "forecasting").model_dump()
    raw.update(modelVersion="team-v1", testOnly=False, device="cuda")
    (tmp_path / "manifest.json").write_text(json.dumps(raw))
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", str(tmp_path))
    monkeypatch.setattr(onnxruntime, "get_available_providers", lambda: ["CPUExecutionProvider"])
    entry = Registry().entries["forecasting"]
    assert entry["available"] is False
    assert entry["reason"] == "device_unavailable"
