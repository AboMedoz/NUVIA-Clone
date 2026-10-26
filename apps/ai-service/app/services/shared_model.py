"""One persistent offline model child, serialized requests and hard timeout recovery."""

import asyncio
import atexit
import json
import multiprocessing
import threading
import time

from app.core.limits import MAX_INTERNAL_BODY_BYTES, MAX_MODEL_OUTPUT_BYTES
from app.models.manifest import ModelManifest, bounded_env, validate_package
from app.schemas.tasks import TaskRequest, validate_result
from app.services.runtime import ExecutionError


def model_worker(connection, manifest_data, package):
    try:
        from app.models.adapters import generate_text, load_transformers
        from app.providers.qwen_interfaces import run_interface

        base = ModelManifest.model_validate(manifest_data)
        validate_package(base, package)
        runtime = load_transformers(base, package)
        while True:
            raw = json.loads(connection.recv_bytes(MAX_INTERNAL_BODY_BYTES))
            manifest = ModelManifest.model_validate(raw["manifest"])
            request = TaskRequest.model_validate(raw["request"])
            try:
                result = run_interface(
                    manifest.capability,
                    request,
                    manifest.taxonomy,
                    lambda system, data, maximum: generate_text(
                        manifest, runtime, system, data, max_new_tokens=maximum
                    ),
                )
                result = validate_result(manifest.capability, result, request, manifest)
                encoded = json.dumps({"result": result}, allow_nan=False).encode()
                if len(encoded) > MAX_MODEL_OUTPUT_BYTES:
                    raise ValueError("Model output too large")
            except (ValueError, KeyError, TypeError, IndexError):
                encoded = b'{"error":"invalid_model_output"}'
            connection.send_bytes(encoded)
    except (EOFError, BrokenPipeError):
        pass
    except Exception:
        try:
            connection.send_bytes(b'{"error":"model_load_failed"}')
        except (OSError, EOFError):
            pass
    finally:
        connection.close()


class SharedModelWorker:
    def __init__(self, *, worker=model_worker):
        self.worker = worker
        self.process = None
        self.connection = None
        self.key = None
        self.lock = threading.Lock()

    @staticmethod
    def model_key(manifest, package):
        identity = manifest.model_dump(exclude={"capability", "taxonomy", "languages"})
        return str(package), json.dumps(identity, sort_keys=True)

    def is_resident(self, manifest, package):
        process, key = self.process, self.key
        try:
            return (
                key == self.model_key(manifest, package)
                and process is not None
                and process.is_alive()
            )
        except ValueError:
            # Shutdown may close a process while a readiness thread is reading it.
            return False

    def retire_if_changed(self, manifest, package):
        """Free an obsolete idle instance before cold-readiness checks need its VRAM."""
        if self.lock.acquire(blocking=False):
            try:
                if self.key is not None and self.key != self.model_key(manifest, package):
                    self.close()
            finally:
                self.lock.release()

    def close(self):
        """Only stop the child owned by this supervisor."""
        if self.process is not None:
            if self.process.is_alive():
                self.process.terminate()
            if self.process.pid is not None:
                self.process.join(2)
                if self.process.is_alive():
                    self.process.kill()
                    self.process.join(2)
            self.process.close()
        if self.connection is not None:
            self.connection.close()
        self.process = self.connection = self.key = None

    async def execute(self, manifest, package, request, *, timeout=None):
        if not self.lock.acquire(blocking=False):
            raise ExecutionError("model_busy")
        try:
            # Capability-specific instructions/taxonomy share the same weights and runtime.
            key = self.model_key(manifest, package)
            if self.key != key or self.process is None or not self.process.is_alive():
                self.close()
                context = multiprocessing.get_context("spawn")
                self.connection, child = context.Pipe(duplex=True)
                self.process = context.Process(
                    target=self.worker,
                    args=(child, manifest.model_dump(), package),
                    daemon=True,
                )
                try:
                    self.process.start()
                finally:
                    child.close()
                self.key = key
            message = json.dumps(
                {"manifest": manifest.model_dump(), "request": request.model_dump()},
                allow_nan=False,
            ).encode()
            if len(message) > MAX_INTERNAL_BODY_BYTES:
                raise ExecutionError("model_input_too_large")
            # A maximum-size request can exceed a pipe's capacity while CUDA is loading.
            # Offload the write so the deadline/cancellation can still terminate the child.
            sending = asyncio.create_task(asyncio.to_thread(self.connection.send_bytes, message))
            deadline = time.monotonic() + (
                timeout
                if timeout is not None
                else bounded_env("AI_TASK_TIMEOUT_SECONDS", 60, 1, 600)
            )
            try:
                while time.monotonic() < deadline:
                    if sending.done():
                        sending.result()
                        if self.connection.poll():
                            response = json.loads(
                                self.connection.recv_bytes(MAX_MODEL_OUTPUT_BYTES)
                            )
                            if "error" in response:
                                raise ExecutionError(response["error"])
                            return response["result"]
                    if not self.process.is_alive():
                        raise ExecutionError("model_load_failed")
                    await asyncio.sleep(0.02)
                raise ExecutionError("model_timeout")
            finally:
                if not sending.done():
                    self.close()
                # Consume pipe-write errors after terminating the owned receiver.
                try:
                    await sending
                except (OSError, EOFError):
                    pass
        except BaseException as exc:
            # A fully consumed invalid-output reply leaves the loaded model usable.
            if not isinstance(exc, ExecutionError) or str(exc) != "invalid_model_output":
                self.close()
            if isinstance(exc, (OSError, EOFError, ValueError, KeyError, TypeError)):
                raise ExecutionError("model_load_failed") from exc
            raise
        finally:
            self.lock.release()


shared_qwen = SharedModelWorker()
atexit.register(shared_qwen.close)
