import json

import pytest


def test_preparation_reuses_existing_weights_and_preserves_source(tmp_path, monkeypatch):
    from scripts.prepare_qwen import FILES, prepare_package

    source = tmp_path / "existing"
    source.mkdir()
    for name in FILES:
        (source / name).write_bytes(b"synthetic" if name.endswith(".safetensors") else b"{}")
    (source / "config.json").write_text(json.dumps({"model_type": "qwen2", "hidden_size": 1536}))
    before = {p.name: p.read_bytes() for p in source.iterdir()}
    model_root = tmp_path / "models"
    monkeypatch.setenv("AI_MODEL_ROOT", str(model_root))
    target = model_root / "shared" / "qwen"
    manifest = prepare_package(source, target, device="cpu")
    assert manifest.adapter == "transformers_text"
    assert not manifest.options.get("systemPrompt")
    assert {p.name: p.read_bytes() for p in source.iterdir()} == before
    with pytest.raises(ValueError, match="existing"):
        prepare_package(source, target, device="cpu")
    with pytest.raises(ValueError, match="model root"):
        prepare_package(source, tmp_path / "outside", device="cpu")
    with pytest.raises(ValueError, match="model root"):
        prepare_package(source, tmp_path / "new-root", device="cpu")
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path / "new-root"))
    with pytest.raises(ValueError, match="model root"):
        prepare_package(source, tmp_path / "new-root", device="cpu")
