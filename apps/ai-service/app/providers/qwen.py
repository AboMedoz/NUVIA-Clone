"""Explicit single-package Qwen selection with separate, opt-in service interfaces."""

import importlib.util
import json
import os
from pathlib import Path

from app.models.manifest import (
    DEPENDENCIES,
    REPOSITORY_ROOT,
    ModelManifest,
    Taxonomy,
    directories,
    validate_package,
)

CAPABILITIES = ("sentiment", "aspects", "report", "assistant", "survey_generation")
PIPELINE_VERSION = "nuvia-qwen-shared-compact-1"
TAXONOMY = Taxonomy(
    version="nuvia-qwen-aspects-v1", labels=["staff", "timeliness", "quality", "value"]
)


def configure(registry):
    registry.qwen = {}
    registry.pipeline_version = PIPELINE_VERSION
    for capability in CAPABILITIES:
        registry.packages.pop(capability, None)
        registry.entries[capability] = {
            "capability": capability,
            "status": "unavailable",
            "available": False,
            "provider": "qwen",
            "reason": "qwen_not_configured",
        }
    try:
        location = os.environ.get("QWEN_MODEL_PACKAGE", "").strip()
        if not location:
            return registry
        package = Path(location)
        package = (package if package.is_absolute() else REPOSITORY_ROOT / package).resolve()
        if not package.is_relative_to(directories()[1]):
            raise ValueError("Package outside model root")
        path = package / "manifest.json"
        if path.stat().st_size > 131072:
            raise ValueError("Manifest too large")
        base = ModelManifest.model_validate_json(path.read_bytes())
        if base.adapter != "transformers_text" or base.options.get("systemPrompt"):
            raise ValueError("A clean shared text profile is required")
        validate_package(base, package, cache_hashes=True)
        config = json.loads((package / "config.json").read_bytes())
        if not isinstance(config, dict) or config.get("model_type") != "qwen2":
            raise ValueError("Expected the existing Qwen2 causal model")
        enabled = {
            name.strip()
            for name in os.environ.get("QWEN_CAPABILITIES", "").split(",")
            if name.strip()
        }
        if enabled - set(CAPABILITIES):
            raise ValueError("Unsupported Qwen interface")
        locales = {}
        for name in ("report", "survey_generation"):
            setting_name = "QWEN_REPORT_LOCALES" if name == "report" else "QWEN_SURVEY_LOCALES"
            setting = os.environ.get(setting_name, "").strip() or ",".join(base.languages)
            values = [value.strip() for value in setting.split(",")]
            if len(values) != len(set(values)) or not set(values).issubset(base.languages):
                raise ValueError("Unsupported interface locale profile")
            locales[name] = values
        missing = any(importlib.util.find_spec(name) is None for name in DEPENDENCIES[base.adapter])
        device_available = True
        if not missing and base.device == "cuda":
            from app.services.shared_model import shared_qwen

            try:
                shared_qwen.retire_if_changed(base, package)
                torch = importlib.import_module("torch")
                device_available = torch.cuda.is_available()
                if device_available and not shared_qwen.is_resident(base, package):
                    free, _ = torch.cuda.mem_get_info()
                    device_available = free >= base.memoryMB * 1024 * 1024
            except (ImportError, RuntimeError, OSError):
                device_available = False
        for capability in CAPABILITIES:
            entry = registry.entries[capability]
            entry.update(modelVersion=base.modelVersion, pipelineVersion=PIPELINE_VERSION)
            if capability not in enabled:
                entry["reason"] = "qwen_interface_disabled"
                continue
            if missing:
                entry["reason"] = "runtime_not_installed"
                continue
            if not device_available:
                entry["reason"] = "device_unavailable"
                continue
            manifest = ModelManifest.model_validate(
                {
                    **base.model_dump(),
                    "capability": capability,
                    "languages": locales.get(capability, base.languages),
                    "taxonomy": TAXONOMY.model_dump() if capability == "aspects" else None,
                }
            )
            registry.qwen[capability] = (manifest, package)
            entry.pop("reason", None)
            entry.update(
                status="ready",
                available=True,
                readiness="validated_artifacts_lazy_load",
                execution="single_shared_worker",
                quality="operator_selected_unverified",
                languages=manifest.languages,
            )
    except (ValueError, OSError, TypeError, KeyError):
        registry.qwen.clear()
        registry.errors.append({"code": "invalid_qwen_package"})
        for capability in CAPABILITIES:
            registry.entries[capability].update(
                status="unavailable", available=False, reason="invalid_qwen_package"
            )
    return registry
