"""Bounded process-per-task execution: a timed-out native inference is terminated."""

import asyncio
import json
import multiprocessing
import threading
import time

from app.core.limits import MAX_MODEL_OUTPUT_BYTES
from app.models.manifest import ModelManifest, bounded_env, validate_package
from app.schemas.tasks import TaskRequest

_lock = threading.Lock()
_active = 0


class ExecutionError(Exception):
    pass


def inference_worker(connection, manifest_data, package, request_data):
    try:
        from app.models.adapters import ADAPTERS

        manifest = ModelManifest.model_validate(manifest_data)
        request = TaskRequest.model_validate(request_data)
        validate_package(manifest, package)
        result = ADAPTERS[manifest.adapter](manifest, package, request)
        message = {"result": result}
        encoded = json.dumps(message, allow_nan=False).encode()
        if len(encoded) > MAX_MODEL_OUTPUT_BYTES:
            raise ValueError("Model output too large")
        connection.send_bytes(encoded)
    except (ValueError, KeyError, TypeError, IndexError):
        connection.send_bytes(b'{"error":"invalid_model_output"}')
    except Exception:
        # Do not return model paths, request contents, traceback or provider secrets.
        connection.send_bytes(b'{"error":"model_load_failed"}')
    finally:
        connection.close()


async def execute_isolated(manifest, package, request, *, timeout=None, worker=inference_worker):
    global _active
    maximum = bounded_env("AI_MAX_CONCURRENCY", 1, 1, 8)
    with _lock:
        if _active >= maximum:
            raise ExecutionError("model_busy")
        _active += 1
    context = multiprocessing.get_context("spawn")
    receiving, sending = context.Pipe(duplex=False)
    process = context.Process(
        target=worker,
        args=(sending, manifest.model_dump(), package, request.model_dump()),
        daemon=True,
    )
    try:
        process.start()
        sending.close()
        deadline = time.monotonic() + (
            timeout if timeout is not None else bounded_env("AI_TASK_TIMEOUT_SECONDS", 60, 1, 600)
        )
        while time.monotonic() < deadline:
            if receiving.poll():
                try:
                    message = json.loads(receiving.recv_bytes(maxlength=MAX_MODEL_OUTPUT_BYTES))
                except (EOFError, OSError, ValueError) as exc:
                    raise ExecutionError("model_load_failed") from exc
                if "error" in message:
                    raise ExecutionError(message["error"])
                return message["result"]
            if not process.is_alive():
                raise ExecutionError("model_load_failed")
            await asyncio.sleep(0.02)
        raise ExecutionError("model_timeout")
    finally:
        if process.is_alive():
            process.terminate()
        if process.pid is not None:
            await asyncio.to_thread(process.join, 2)
            if process.is_alive():
                process.kill()
                await asyncio.to_thread(process.join, 2)
        receiving.close()
        sending.close()
        with _lock:
            _active -= 1
