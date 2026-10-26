from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1.health import router as health_router
from app.api.v1.tasks import router as tasks_router
from app.core.limits import MAX_INTERNAL_BODY_BYTES


@asynccontextmanager
async def lifespan(_app):
    try:
        yield
    finally:
        from app.services.shared_model import shared_qwen

        shared_qwen.close()


app = FastAPI(title="NUVIA internal AI service", version="1.0.0", lifespan=lifespan)
app.include_router(health_router, prefix="/api/v1")
app.include_router(tasks_router, prefix="/api/v1")


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _error):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "The task request does not match its schema.",
            }
        },
    )


@app.exception_handler(HTTPException)
async def http_error(_request, error):
    code = (
        error.detail.get("code", "request_failed")
        if isinstance(error.detail, dict)
        else "request_failed"
    )
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": {
                "code": code,
                "message": "The internal service request could not be accepted.",
            }
        },
    )


@app.middleware("http")
async def bounded_body(request: Request, call_next):
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_INTERNAL_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={
                    "error": {
                        "code": "request_too_large",
                        "message": "Task body exceeds the two MB limit.",
                    }
                },
            )
        body.extend(chunk)
    request._body = bytes(body)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response
