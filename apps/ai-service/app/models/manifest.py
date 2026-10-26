"""Model packages are data, never Python plugins or remote model identifiers."""

import hashlib
import importlib.util
import json
import os
import re
import threading
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.tasks import CAPABILITIES, StrictModel

_service_root = Path(__file__).resolve().parents[2]
# Checkouts retain repository-relative settings; app-only images use /service.
REPOSITORY_ROOT = (
    _service_root.parent.parent
    if _service_root.name == "ai-service" and _service_root.parent.name == "apps"
    else _service_root
)
_hashes = {}
_hash_lock = threading.Lock()
ADAPTER_CAPABILITIES = {
    "portable_linear": {"sentiment", "language"},
    "transformers_text": {
        "normalization",
        "sentiment",
        "aspects",
        "report",
        "assistant",
        "survey_generation",
    },
    "onnx_numeric": {"clustering", "forecasting"},
    "onnx_text_encoder": {"embeddings"},
}
FORMATS = {
    "portable_linear": "nuvia-linear-v1",
    "transformers_text": "hf-safetensors",
    "onnx_numeric": "onnx",
    "onnx_text_encoder": "onnx-tokenizers",
}
DEPENDENCIES = {
    "portable_linear": (),
    "transformers_text": ("torch", "transformers", "safetensors"),
    "onnx_numeric": ("numpy", "onnxruntime", "onnx"),
    "onnx_text_encoder": ("numpy", "onnxruntime", "onnx", "tokenizers"),
}


class Taxonomy(StrictModel):
    version: str = Field(min_length=1, max_length=100)
    labels: list[str] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def unique(self):
        if len(set(self.labels)) != len(self.labels) or any(
            not label.strip() for label in self.labels
        ):
            raise ValueError("Invalid taxonomy")
        return self


class ModelManifest(StrictModel):
    manifestVersion: Literal[1]
    capability: str
    adapter: Literal["portable_linear", "transformers_text", "onnx_numeric", "onnx_text_encoder"]
    artifactFormat: str
    modelVersion: str = Field(min_length=1, max_length=100)
    inputSchemaVersion: Literal[1]
    outputSchemaVersion: Literal[1]
    languages: list[Literal["ar", "en", "mixed", "und"]] = Field(min_length=1, max_length=4)
    device: Literal["cpu", "cuda"] = "cpu"
    memoryMB: int = Field(default=1024, ge=1, le=1048576)
    artifacts: dict[str, str] = Field(min_length=1, max_length=256)
    taxonomy: Taxonomy | None = None
    normalizationTasks: list[Literal["spelling", "arabic_dialect", "code_switching"]] = Field(
        default_factory=list,
        max_length=3,
    )
    options: dict = Field(default_factory=dict)
    testOnly: bool = False

    @model_validator(mode="after")
    def compatible(self):
        if self.capability not in ADAPTER_CAPABILITIES[self.adapter]:
            raise ValueError("Adapter does not implement this capability")
        if self.artifactFormat != FORMATS[self.adapter]:
            raise ValueError("Unsupported artifact format")
        if self.capability == "aspects" and self.taxonomy is None:
            raise ValueError("Aspect model requires a versioned taxonomy")
        if self.adapter == "portable_linear" and self.device != "cpu":
            raise ValueError("Portable linear adapter only supports CPU")
        allowed = {
            "portable_linear": {"weights"},
            "transformers_text": {"systemPrompt", "maxInputTokens", "maxNewTokens", "dtype"},
            "onnx_numeric": {
                "model",
                "output",
                "minObservations",
                "horizon",
                "labelPrefix",
            },
            "onnx_text_encoder": {"model", "tokenizer", "output", "maxLength", "pooling"},
        }[self.adapter]
        if set(self.options) - allowed:
            raise ValueError("Unsupported adapter option")
        ranges = {
            "maxInputTokens": (64, 16384),
            "maxNewTokens": (8, 4096),
            "maxLength": (8, 4096),
            "minObservations": (3, 10000),
            "horizon": (1, 366),
        }
        for name, (low, high) in ranges.items():
            if name in self.options and (
                type(self.options[name]) is not int or not low <= self.options[name] <= high
            ):
                raise ValueError("Adapter integer option outside supported bounds")
        for name in set(self.options) - ranges.keys():
            if not isinstance(self.options[name], str) or not self.options[name].strip():
                raise ValueError("Adapter text option must be nonempty")
        if len(self.options.get("systemPrompt", "")) > 10000:
            raise ValueError("System prompt too large")
        if self.options.get("dtype", "float32") not in {"float32", "float16", "bfloat16"}:
            raise ValueError("Unsupported dtype")
        if self.options.get("pooling", "mean") not in {"mean", "cls"}:
            raise ValueError("Unsupported pooling")
        return self


def bounded_env(name, default, minimum, maximum):
    try:
        return min(max(int(os.environ.get(name, default)), minimum), maximum)
    except ValueError:
        return default


def directories():
    default = REPOSITORY_ROOT / ".local" / "models"

    def root_relative(name):
        path = Path(os.environ.get(name, default))
        return (path if path.is_absolute() else REPOSITORY_ROOT / path).resolve()

    return root_relative("AI_MODEL_MANIFEST_DIR"), root_relative("AI_MODEL_ROOT")


def safe_artifact(package, relative):
    if not relative or "\\" in relative or ":" in relative:
        raise ValueError("Invalid artifact path")
    parts = Path(relative).parts
    if Path(relative).is_absolute() or any(part in ("..", ".") for part in parts):
        raise ValueError("Artifact path escapes package")
    path = package.joinpath(relative).resolve()
    if not path.is_relative_to(package.resolve()):
        raise ValueError("Artifact path escapes package")
    if not path.is_file():
        raise ValueError("Artifact missing")
    return path


def validate_package(manifest, package, *, allow_test=False, cache_hashes=False):
    if manifest.testOnly and not allow_test:
        raise ValueError("Test packages cannot serve product inference")
    if manifest.memoryMB > bounded_env("AI_MAX_MODEL_MEMORY_MB", 16384, 128, 1048576):
        raise ValueError("Declared memory exceeds configured budget")
    permitted = {".json", ".safetensors", ".txt", ".model", ".onnx"}
    for name, expected in manifest.artifacts.items():
        path = safe_artifact(package, name)
        if path.suffix.lower() not in permitted or not re.fullmatch(r"[a-f0-9]{64}", expected):
            raise ValueError("Unsafe artifact format or missing SHA256")
        stat = path.stat()
        key = (str(path), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns, expected)
        with _hash_lock:
            digest = _hashes.get(key) if cache_hashes else None
            if digest is None:
                with path.open("rb") as artifact:
                    digest = hashlib.file_digest(artifact, "sha256").hexdigest()
                if cache_hashes:
                    if len(_hashes) > 4096:
                        _hashes.clear()
                    _hashes[key] = digest
        if digest != expected:
            raise ValueError("Artifact hash mismatch")
    if manifest.adapter == "transformers_text":
        if "config.json" not in manifest.artifacts or not any(
            name.endswith(".safetensors") for name in manifest.artifacts
        ):
            raise ValueError("Local config and safetensors weights required")
        # Transformers can discover adjacent files; reject all unmanifested files.
        files = {p.relative_to(package).as_posix() for p in package.rglob("*") if p.is_file()}
        if files != set(manifest.artifacts) | {"manifest.json"}:
            raise ValueError("Unmanifested model package file")
        for name in manifest.artifacts:
            if name.endswith(".json"):
                path = safe_artifact(package, name)
                if path.stat().st_size > 20000000:
                    raise ValueError("Model JSON too large")
                config = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(config, dict) and config.get("auto_map"):
                    raise ValueError("Custom model code is not supported")
                if name.endswith(".index.json") and isinstance(config, dict):
                    references = config.get("weight_map", {})
                    if not isinstance(references, dict) or any(
                        value not in manifest.artifacts for value in references.values()
                    ):
                        raise ValueError("Sharded index reference outside declared artifacts")
    return manifest


class Registry:
    """Read package metadata on each call; installing data needs no application rebuild."""

    def __init__(self):
        self.packages = {}
        self.errors = []
        self.entries = {
            name: {
                "capability": name,
                "status": "unavailable",
                "available": False,
                "reason": "model_not_configured",
            }
            for name in CAPABILITIES
        }
        for name in ("language", "normalization"):
            self.entries[name] = {
                "capability": name,
                "status": "ready",
                "available": True,
                "modelVersion": "builtin-1",
                "method": "deterministic",
            }
        manifest_dir, artifact_root = directories()
        if not manifest_dir.is_dir():
            return
        candidates = sorted(manifest_dir.glob("*/manifest.json"))
        if (manifest_dir / "manifest.json").is_file():
            candidates.append(manifest_dir / "manifest.json")
        seen = set()
        for path in candidates[:64]:
            capability = None
            try:
                if path.stat().st_size > 131072:
                    raise ValueError("Manifest too large")
                raw = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(raw, dict):
                    raise ValueError("Manifest must be an object")
                capability = raw.get("capability")
                if capability not in CAPABILITIES:
                    raise ValueError("Unknown capability")
                if capability in seen:
                    raise ValueError("Duplicate capability packages")
                seen.add(capability)
                manifest = ModelManifest.model_validate(raw)
                package = path.parent.resolve()
                if not package.is_relative_to(artifact_root):
                    raise ValueError("Package outside model root")
                validate_package(manifest, package, cache_hashes=True)
                missing = [
                    name
                    for name in DEPENDENCIES[manifest.adapter]
                    if importlib.util.find_spec(name) is None
                ]
                if missing:
                    self.entries[capability] = {
                        "capability": capability,
                        "status": "unavailable",
                        "available": False,
                        "reason": "runtime_not_installed",
                        "modelVersion": manifest.modelVersion,
                    }
                    continue
                if manifest.device == "cuda":
                    try:
                        if manifest.adapter == "transformers_text":
                            torch = importlib.import_module("torch")
                            available = torch.cuda.is_available()
                            if available:
                                free, _ = torch.cuda.mem_get_info()
                                available = free >= manifest.memoryMB * 1024 * 1024
                        else:
                            ort = importlib.import_module("onnxruntime")
                            available = "CUDAExecutionProvider" in ort.get_available_providers()
                    except (ImportError, RuntimeError, OSError):
                        available = False
                    if not available:
                        self.entries[capability] = {
                            "capability": capability,
                            "status": "unavailable",
                            "available": False,
                            "reason": "device_unavailable",
                            "modelVersion": manifest.modelVersion,
                        }
                        continue
                self.packages[capability] = (manifest, package)
                self.entries[capability] = {
                    "capability": capability,
                    "status": "ready",
                    "available": True,
                    "modelVersion": manifest.modelVersion,
                    "readiness": "validated_artifacts_lazy_load",
                }
            except (ValueError, OSError, TypeError):
                self.errors.append({"code": "invalid_model_package"})
                if capability in CAPABILITIES:
                    self.packages.pop(capability, None)
                    self.entries[capability] = {
                        "capability": capability,
                        "status": "invalid",
                        "available": False,
                        "reason": "invalid_model_package",
                    }
