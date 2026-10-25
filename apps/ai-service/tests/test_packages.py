import json

import pytest

from tests.test_tasks import request


def test_invalid_package_is_not_ready_or_silently_selected(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", str(tmp_path))
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "manifestVersion": 999,
                "capability": "sentiment",
                "adapter": "arbitrary_remote_code",
            }
        )
    )
    response = request(
        "GET", "/api/v1/capabilities", headers={"X-AI-Service-Key": "test-only-service-key"}
    )
    entry = next(
        item for item in response.json()["capabilities"] if item["capability"] == "sentiment"
    )
    assert entry["available"] is False
    assert entry["status"] == "invalid"


def test_manifest_rejects_traversal_and_unverified_artifacts(tmp_path):
    from app.models.manifest import ModelManifest, validate_package

    manifest = {
        "manifestVersion": 1,
        "capability": "sentiment",
        "adapter": "portable_linear",
        "artifactFormat": "nuvia-linear-v1",
        "modelVersion": "test-1",
        "inputSchemaVersion": 1,
        "outputSchemaVersion": 1,
        "languages": ["en"],
        "device": "cpu",
        "artifacts": {"../outside.json": "0" * 64},
        "options": {"weights": "../outside.json"},
    }
    with pytest.raises(ValueError):
        validate_package(ModelManifest.model_validate(manifest), tmp_path)


def test_result_validation_rejects_invented_aspect_evidence():
    from app.models.manifest import ModelManifest
    from app.schemas.tasks import TaskRequest, validate_result

    manifest = ModelManifest.model_validate(
        {
            "manifestVersion": 1,
            "capability": "aspects",
            "adapter": "transformers_text",
            "artifactFormat": "hf-safetensors",
            "modelVersion": "test-1",
            "inputSchemaVersion": 1,
            "outputSchemaVersion": 1,
            "languages": ["en"],
            "device": "cpu",
            "artifacts": {"config.json": "0" * 64},
            "taxonomy": {"version": "retail-1", "labels": ["staff"]},
        }
    )
    source = TaskRequest(
        schemaVersion=1,
        taskId="1",
        locale="en",
        text="Bad staff.",
        sentences=[{"id": "s1", "start": 0, "end": 10, "text": "Bad staff."}],
    )
    with pytest.raises(ValueError):
        validate_result(
            "aspects",
            {
                "taxonomyVersion": "retail-1",
                "mentions": [
                    {
                        "aspect": "staff",
                        "label": "negative",
                        "sentenceId": "s1",
                        "start": 0,
                        "end": 3,
                        "quote": "Good",
                    }
                ],
            },
            source,
            manifest,
        )


def test_tagged_sentiment_keeps_mixed_and_never_invents_confidence():
    from app.models.tagged import parse_tagged

    assert parse_tagged("sentiment", "<sentiment>mixed</sentiment>") == {"label": "mixed"}
    assert parse_tagged("sentiment", "SENTIMENT|mixed\nEND") == {"label": "mixed"}
    with pytest.raises(ValueError):
        parse_tagged("sentiment", "<sentiment>neutral</sentiment><sentiment>negative</sentiment>")


def test_report_cannot_cite_another_response_or_change_quotation():
    from app.schemas.tasks import TaskRequest, validate_result

    source = TaskRequest(
        schemaVersion=1,
        taskId="1",
        locale="en",
        evidence=[{"id": "authorized-1", "text": "Slow service."}],
    )
    with pytest.raises(ValueError):
        validate_result(
            "assistant",
            {
                "answer": "Good",
                "evidence": [
                    {"id": "foreign-1", "quote": "Slow service."},
                ],
            },
            source,
        )
    with pytest.raises(ValueError):
        validate_result(
            "assistant",
            {
                "answer": "Good",
                "evidence": [
                    {"id": "authorized-1", "quote": "Fast service."},
                ],
            },
            source,
        )


def test_legacy_aspects_are_literal_sentence_evidence_with_configurable_taxonomy():
    from app.models.manifest import ModelManifest
    from app.models.tagged import parse_tagged
    from app.schemas.tasks import TaskRequest, validate_result

    manifest = ModelManifest.model_validate(
        {
            "manifestVersion": 1,
            "capability": "aspects",
            "adapter": "transformers_text",
            "artifactFormat": "hf-safetensors",
            "modelVersion": "team-model-v1",
            "inputSchemaVersion": 1,
            "outputSchemaVersion": 1,
            "languages": ["en"],
            "device": "cpu",
            "artifacts": {"config.json": "0" * 64},
            "taxonomy": {"version": "hotel-v2", "labels": ["room"]},
        }
    )
    source = TaskRequest(
        schemaVersion=1,
        taskId="1",
        locale="en",
        text="Room is clean.",
        sentences=[{"id": "s1", "text": "Room is clean.", "start": 0, "end": 14}],
    )
    output = parse_tagged("aspects", "ASPECT|room|positive|Room is clean\nEND", source, manifest)
    assert validate_result("aspects", output, source, manifest) == {
        "taxonomyVersion": "hotel-v2",
        "mentions": [
            {
                "sentenceId": "s1",
                "label": "positive",
                "aspect": "room",
                "start": 0,
                "end": 13,
                "quote": "Room is clean",
            }
        ],
    }


@pytest.mark.parametrize("test_only", [False, True])
def test_latest_version_readiness_uses_explicit_test_only_flag(tmp_path, monkeypatch, test_only):
    from app.models.manifest import Registry
    from tests.test_runtime import package

    manifest = package(tmp_path, test_only=test_only)
    manifest["modelVersion"] = "latest-1"
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", str(tmp_path))
    assert Registry().entries["sentiment"]["available"] is not test_only


def test_trained_normalization_adapter_preserves_source_offsets():
    from app.models.manifest import ModelManifest
    from app.models.tagged import parse_tagged
    from app.schemas.tasks import TaskRequest, validate_result

    manifest = ModelManifest.model_validate(
        {
            "manifestVersion": 1,
            "capability": "normalization",
            "adapter": "transformers_text",
            "artifactFormat": "hf-safetensors",
            "modelVersion": "team-model-v1",
            "inputSchemaVersion": 1,
            "outputSchemaVersion": 1,
            "languages": ["ar"],
            "device": "cpu",
            "artifacts": {"config.json": "0" * 64},
            "normalizationTasks": ["spelling", "arabic_dialect"],
        }
    )
    source = TaskRequest(schemaVersion=1, taskId="1", locale="ar", text="حلو اوى!")
    output = parse_tagged("normalization", "<normalized>جيد جدًا!</normalized>", source, manifest)
    result = validate_result("normalization", output, source, manifest)
    assert result["text"] == "حلو اوى!"
    assert result["normalizedText"] == "جيد جدًا!"
    assert result["sentences"] == [{"id": "s1", "start": 0, "end": 8, "text": "حلو اوى!"}]


def test_model_paths_resolve_against_repository_not_process_cwd(tmp_path, monkeypatch):
    from app.models.manifest import REPOSITORY_ROOT, directories

    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("AI_MODEL_ROOT", ".local/models")
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", ".local/models")
    assert directories() == ((REPOSITORY_ROOT / ".local/models").resolve(),) * 2


def test_malformed_manifest_is_safe_configuration_error(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-only-service-key")
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", str(tmp_path))
    (tmp_path / "manifest.json").write_text("[]")
    response = request(
        "GET", "/api/v1/capabilities", headers={"X-AI-Service-Key": "test-only-service-key"}
    )
    assert response.status_code == 200
    assert response.json()["configurationErrors"] == [{"code": "invalid_model_package"}]


def test_sharded_hf_index_cannot_reference_outside_declared_artifacts(tmp_path):
    import hashlib

    from app.models.manifest import ModelManifest, validate_package

    files = {
        "config.json": "{}",
        "model.safetensors": "stub",
        "model.safetensors.index.json": json.dumps(
            {
                "weight_map": {
                    "weight": "../outside.safetensors",
                }
            }
        ),
    }
    for name, text in files.items():
        (tmp_path / name).write_text(text)
    raw = {
        "manifestVersion": 1,
        "capability": "sentiment",
        "adapter": "transformers_text",
        "artifactFormat": "hf-safetensors",
        "modelVersion": "team-v1",
        "inputSchemaVersion": 1,
        "outputSchemaVersion": 1,
        "languages": ["en"],
        "artifacts": {
            name: hashlib.sha256((tmp_path / name).read_bytes()).hexdigest() for name in files
        },
    }
    (tmp_path / "manifest.json").write_text(json.dumps(raw))
    with pytest.raises(ValueError, match="reference"):
        validate_package(ModelManifest.model_validate(raw), tmp_path)


def test_invalid_adapter_options_fail_at_manifest_validation():
    from app.models.manifest import ModelManifest

    raw = {
        "manifestVersion": 1,
        "capability": "sentiment",
        "adapter": "transformers_text",
        "artifactFormat": "hf-safetensors",
        "modelVersion": "team-v1",
        "inputSchemaVersion": 1,
        "outputSchemaVersion": 1,
        "languages": ["en"],
        "artifacts": {"model.safetensors": "0" * 64},
        "options": {"maxNewTokens": "many"},
    }
    with pytest.raises(ValueError):
        ModelManifest.model_validate(raw)


def test_duplicate_valid_capabilities_fail_closed(tmp_path, monkeypatch):
    from app.models.manifest import Registry
    from tests.test_runtime import package

    for name in ("one", "two"):
        folder = tmp_path / name
        folder.mkdir()
        raw = package(folder)
        raw["modelVersion"] = "team-v1"
        (folder / "manifest.json").write_text(json.dumps(raw))
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", str(tmp_path))
    registry = Registry()
    assert registry.entries["sentiment"]["status"] == "invalid"
    assert "sentiment" not in registry.packages
