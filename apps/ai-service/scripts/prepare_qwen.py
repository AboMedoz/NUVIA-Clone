"""Prepare a new ignored shared package from existing Qwen2.5-1.5B files, offline."""

import argparse
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.manifest import ModelManifest, directories, validate_package  # noqa: E402

FILES = (
    "config.json",
    "generation_config.json",
    "merges.txt",
    "model.safetensors",
    "tokenizer_config.json",
    "tokenizer.json",
    "vocab.json",
)


def prepare_package(source, target, *, device="cuda"):
    source, target = Path(source).resolve(), Path(target).resolve()
    root = directories()[1]
    if not target.is_relative_to(root) or len(target.relative_to(root).parts) < 2:
        raise ValueError("Target must be a package directory inside the configured model root")
    if target.exists() or source.is_relative_to(target) or target.is_relative_to(source):
        raise ValueError("Refusing to overwrite an existing package or source directory")
    config = json.loads((source / "config.json").read_bytes())
    if config.get("model_type") != "qwen2" or config.get("hidden_size") != 1536:
        raise ValueError("Expected existing Qwen2.5-1.5B-Instruct artifacts")
    if device not in {"cpu", "cuda"}:
        raise ValueError("Unsupported device")
    if any(not (source / name).is_file() for name in FILES):
        raise ValueError("Existing single-file safetensors package is incomplete")
    target.mkdir(parents=True)
    artifacts = {}
    for name in FILES:
        original, destination = source / name, target / name
        if name.endswith(".safetensors"):
            try:
                os.link(original, destination)
            except OSError:
                shutil.copyfile(original, destination)
        else:
            shutil.copyfile(original, destination)
        with destination.open("rb") as stream:
            artifacts[name] = hashlib.file_digest(stream, "sha256").hexdigest()
    manifest = ModelManifest.model_validate(
        {
            "manifestVersion": 1,
            "capability": "assistant",
            "adapter": "transformers_text",
            "artifactFormat": "hf-safetensors",
            "modelVersion": f"qwen2.5-1.5b-instruct-{artifacts['model.safetensors'][:12]}",
            "inputSchemaVersion": 1,
            "outputSchemaVersion": 1,
            "languages": ["en", "ar"],
            "device": device,
            "memoryMB": 3000 if device == "cuda" else 6500,
            "artifacts": artifacts,
            "options": {
                "dtype": "float16" if device == "cuda" else "float32",
                "maxInputTokens": 2048,
                "maxNewTokens": 1024,
            },
        }
    )
    # Metadata comes after all artifacts. Invalid candidates are left unselectable.
    manifest_path = target / "manifest.json"
    manifest_path.write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
    try:
        validate_package(manifest, target)
    except (ValueError, OSError):
        manifest_path.unlink()
        raise
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cuda")
    args = parser.parse_args()
    prepared = prepare_package(args.source, args.target, device=args.device)
    print(json.dumps({"modelVersion": prepared.modelVersion, "artifacts": len(prepared.artifacts)}))
