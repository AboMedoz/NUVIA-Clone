"""Explicit provider selection; local model manifests stay independent and intact."""

import os

from app.models.manifest import Registry


def selected_registry():
    from app.providers.gemini import CAPABILITIES, PIPELINE_VERSION, GeminiConfig

    registry = Registry()
    registry.provider = os.environ.get("AI_PROVIDER", "local").strip()
    registry.cloud = {}
    registry.qwen = {}
    registry.pipeline_version = "nuvia-ai-1"
    for entry in registry.entries.values():
        entry["provider"] = "local"
        entry["pipelineVersion"] = "nuvia-ai-1"
    if registry.provider == "local":
        return registry
    if registry.provider == "qwen":
        from app.providers.qwen import configure

        return configure(registry)
    if registry.provider == "gemini":
        registry.pipeline_version = PIPELINE_VERSION
        for capability in CAPABILITIES:
            registry.packages.pop(capability, None)
            try:
                config = GeminiConfig.from_environment(capability)
                registry.cloud[capability] = config
                registry.entries[capability] = {
                    "capability": capability,
                    "status": "ready",
                    "available": True,
                    "provider": "gemini",
                    "modelVersion": config.modelVersion,
                    "pipelineVersion": PIPELINE_VERSION,
                    "readiness": "configured_unverified_remote",
                }
            except ValueError as exc:
                registry.entries[capability] = {
                    "capability": capability,
                    "status": "unavailable",
                    "available": False,
                    "provider": "gemini",
                    "reason": (
                        "unsupported_embedding_model"
                        if str(exc) == "unsupported_embedding_model"
                        else "provider_not_configured"
                    ),
                }
        return registry
    registry.errors.append({"code": "invalid_ai_provider"})
    registry.packages.clear()
    for capability, entry in registry.entries.items():
        if entry.get("modelVersion") != "builtin-1":
            registry.entries[capability] = {
                "capability": capability,
                "status": "unavailable",
                "available": False,
                "reason": "invalid_ai_provider",
            }
    return registry
