import asyncio
import hmac
import os

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse

from app.providers import selected_registry
from app.providers.gemini import PIPELINE_VERSION as GEMINI_PIPELINE_VERSION
from app.providers.gemini import execute as execute_gemini
from app.providers.gemini import safe_error_code
from app.schemas.tasks import CAPABILITIES, PIPELINE_VERSION, Sentence, TaskRequest, validate_result
from app.services.preparation import language, prepare
from app.services.runtime import ExecutionError, execute_isolated

router = APIRouter(tags=["internal-tasks"])


def authenticate(x_ai_service_key: str | None = Header(default=None)):
    expected = os.environ.get("AI_SERVICE_KEY", "")
    if not expected:
        raise HTTPException(503, detail={"code": "service_not_configured"})
    if not x_ai_service_key or not hmac.compare_digest(
        x_ai_service_key.encode(), expected.encode()
    ):
        raise HTTPException(401, detail={"code": "service_authentication_required"})


def envelope(capability, status, **fields):
    return {
        "schemaVersion": 1,
        "status": status,
        "capability": capability,
        "pipelineVersion": PIPELINE_VERSION,
        **fields,
    }


@router.get("/capabilities", dependencies=[Depends(authenticate)])
def capabilities():
    registry = selected_registry()
    return {
        "schemaVersion": 1,
        "pipelineVersion": registry.pipeline_version,
        "capabilities": list(registry.entries.values()),
        "configurationErrors": registry.errors,
    }


@router.post("/tasks/{capability}", dependencies=[Depends(authenticate)])
async def task(capability: str, request: TaskRequest):
    if capability not in CAPABILITIES:
        raise HTTPException(404, detail={"code": "unknown_capability"})
    registry = await asyncio.to_thread(selected_registry)
    qwen = registry.qwen.get(capability)
    if qwen is not None:
        from app.providers.qwen import PIPELINE_VERSION as QWEN_PIPELINE_VERSION
        from app.services.shared_model import shared_qwen

        manifest, path = qwen
        if request.locale not in manifest.languages:
            raise HTTPException(503, detail={"code": "model_unavailable"})
        if capability in ("sentiment", "aspects") and not (request.text or "").strip():
            raise HTTPException(422, detail={"code": "text_required"})
        if capability in ("assistant", "report") and not request.evidence:
            raise HTTPException(422, detail={"code": "insufficient_evidence"})
        try:
            output = await shared_qwen.execute(manifest, path, request)
            result = validate_result(capability, output, request, manifest)
            return envelope(
                capability,
                "succeeded",
                provider="qwen",
                modelVersion=manifest.modelVersion,
                pipelineVersion=QWEN_PIPELINE_VERSION,
                result=result,
            )
        except (ExecutionError, ValueError) as exc:
            code = str(exc) if isinstance(exc, ExecutionError) else "invalid_model_output"
            if code not in {
                "model_busy",
                "model_timeout",
                "model_load_failed",
                "invalid_model_output",
                "model_input_too_large",
            }:
                code = "model_load_failed"
            status = (
                429
                if code == "model_busy"
                else 504
                if code == "model_timeout"
                else 422
                if code == "model_input_too_large"
                else 502
            )
            return JSONResponse(
                status_code=status,
                content=envelope(
                    capability,
                    "failed",
                    provider="qwen",
                    modelVersion=manifest.modelVersion,
                    pipelineVersion=QWEN_PIPELINE_VERSION,
                    error={
                        "code": code,
                        "message": "The shared model could not produce a validated result.",
                    },
                ),
            )
    cloud = registry.cloud.get(capability)
    if cloud is not None:
        if capability in ("sentiment", "aspects") and not (request.text or "").strip():
            raise HTTPException(422, detail={"code": "text_required"})
        if capability in ("assistant", "report") and not request.evidence:
            raise HTTPException(422, detail={"code": "insufficient_evidence"})
        try:
            result = await execute_gemini(cloud, request)
            # Validate again in the parent; neither child nor remote output is trusted.
            result = validate_result(capability, result, request, cloud)
            return envelope(
                capability,
                "succeeded",
                modelVersion=cloud.modelVersion,
                pipelineVersion=GEMINI_PIPELINE_VERSION,
                provider="gemini",
                result=result,
            )
        except (ExecutionError, ValueError, KeyError, TypeError, AttributeError) as exc:
            code = (
                safe_error_code(exc) if isinstance(exc, ExecutionError) else "invalid_model_output"
            )
            status = (
                429
                if code == "model_busy"
                else 504
                if code == "model_timeout"
                else 422
                if code == "provider_input_too_large"
                else 502
            )
            return JSONResponse(
                status_code=status,
                content=envelope(
                    capability,
                    "failed",
                    modelVersion=cloud.modelVersion,
                    pipelineVersion=GEMINI_PIPELINE_VERSION,
                    provider="gemini",
                    error={
                        "code": code,
                        "message": "The provider task could not produce a validated result.",
                    },
                ),
            )
    package = registry.packages.get(capability)
    if capability in ("normalization", "language") and (
        registry.entries[capability].get("modelVersion") == "builtin-1"
    ):
        if request.text is None:
            raise HTTPException(422, detail={"code": "text_required"})
        result = (
            language(request.text, [item.model_dump() for item in request.sentences])
            if capability == "language"
            else prepare(request.text)
        )
        return envelope(capability, "succeeded", modelVersion="builtin-1", result=result)
    if package is not None:
        manifest, path = package
        if request.locale not in manifest.languages:
            return JSONResponse(
                status_code=503,
                content=envelope(
                    capability,
                    "unavailable",
                    error={
                        "code": "model_unavailable",
                        "message": "Model does not support this locale.",
                    },
                ),
            )
        if capability in ("language", "normalization", "sentiment", "aspects"):
            if not request.text or not request.text.strip():
                raise HTTPException(422, detail={"code": "text_required"})
            if not request.sentences:
                request.sentences = [
                    Sentence.model_validate(value) for value in prepare(request.text)["sentences"]
                ]
        if capability in ("report", "assistant", "clustering") and not request.evidence:
            return JSONResponse(
                status_code=422,
                content=envelope(
                    capability,
                    "failed",
                    error={
                        "code": "insufficient_evidence",
                        "message": "Authorized source evidence is required.",
                    },
                ),
            )
        try:
            output = await execute_isolated(manifest, path, request)
            result = validate_result(capability, output, request, manifest)
            return envelope(
                capability, "succeeded", modelVersion=manifest.modelVersion, result=result
            )
        except (ExecutionError, ValueError) as exc:
            code = str(exc) if isinstance(exc, ExecutionError) else "invalid_model_output"
            status = 429 if code == "model_busy" else 504 if code == "model_timeout" else 502
            return JSONResponse(
                status_code=status,
                content=envelope(
                    capability,
                    "failed",
                    modelVersion=manifest.modelVersion,
                    error={
                        "code": code,
                        "message": "The model task could not produce a validated result.",
                    },
                ),
            )
    return JSONResponse(
        status_code=503,
        content=envelope(
            capability,
            "unavailable",
            error={
                "code": "model_unavailable",
                "message": "No compatible model is ready for this capability.",
            },
        ),
    )
