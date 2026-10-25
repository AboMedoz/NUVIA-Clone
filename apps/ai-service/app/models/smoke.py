"""Offline package handoff: python -m app.models.smoke --help."""

import argparse
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path

from app.core.limits import MAX_INTERNAL_BODY_BYTES
from app.models.manifest import (
    DEPENDENCIES,
    ModelManifest,
    directories,
    safe_artifact,
    validate_package,
)
from app.schemas.tasks import (
    PIPELINE_VERSION,
    RESULT_MODELS,
    Sentence,
    TaskRequest,
    validate_result,
)
from app.services.preparation import prepare
from app.services.runtime import ExecutionError, execute_isolated


def run(arguments=None):
    parser = argparse.ArgumentParser(description="Offline NUVIA model-package validation")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("schemas", help="Print JSON schemas for manifests, requests and results")
    hashes = commands.add_parser(
        "hashes", help="Print SHA256 entries for a package; never execute it"
    )
    hashes.add_argument("package", type=Path)
    validate = commands.add_parser(
        "validate", help="Validate package; optionally execute a smoke task"
    )
    validate.add_argument("manifest", type=Path)
    validate.add_argument(
        "--request", type=Path, help="Private JSON task file; prints validated result"
    )
    args = parser.parse_args(arguments)
    try:
        if args.command == "schemas":
            output = {
                "schemaVersion": 1,
                "manifest": ModelManifest.model_json_schema(),
                "input": TaskRequest.model_json_schema(),
                "outputs": {
                    name: model.model_json_schema() for name, model in RESULT_MODELS.items()
                },
            }
        elif args.command == "hashes":
            package = args.package.resolve()
            entries = {}
            for path in sorted(package.rglob("*")):
                if not path.is_file() or path.name == "manifest.json":
                    continue
                relative = path.relative_to(package).as_posix()
                safe_artifact(package, relative)
                if path.suffix.lower() not in {".json", ".safetensors", ".txt", ".model", ".onnx"}:
                    raise ValueError("Unsupported artifact")
                with path.open("rb") as artifact:
                    entries[relative] = hashlib.file_digest(artifact, "sha256").hexdigest()
            if not entries or len(entries) > 256:
                raise ValueError("Empty or excessive package")
            output = {"artifacts": entries}
        else:
            path = args.manifest.resolve()
            package = path.parent
            _, root = directories()
            if not package.is_relative_to(root) or path.stat().st_size > 131072:
                raise ValueError("Package outside configured root or manifest too large")
            manifest = ModelManifest.model_validate_json(path.read_bytes())
            validate_package(manifest, package)
            missing = [
                name
                for name in DEPENDENCIES[manifest.adapter]
                if importlib.util.find_spec(name) is None
            ]
            output = {
                "schemaVersion": 1,
                "status": "validated",
                "capability": manifest.capability,
                "modelVersion": manifest.modelVersion,
                "pipelineVersion": PIPELINE_VERSION,
                "runtimeDependenciesMissing": missing,
                "inferenceExecuted": False,
            }
            if missing:
                output["status"] = "unavailable"
                print(json.dumps(output))
                return 2
            if args.request:
                if args.request.stat().st_size > MAX_INTERNAL_BODY_BYTES:
                    raise ValueError("Request too large")
                request = TaskRequest.model_validate_json(args.request.read_bytes())
                if request.locale not in manifest.languages:
                    raise ValueError("Unsupported locale")
                if request.text and not request.sentences:
                    request.sentences = [
                        Sentence.model_validate(item) for item in prepare(request.text)["sentences"]
                    ]
                raw = asyncio.run(execute_isolated(manifest, package, request))
                output.update(
                    status="succeeded",
                    inferenceExecuted=True,
                    result=validate_result(manifest.capability, raw, request, manifest),
                )
        print(json.dumps(output, ensure_ascii=True, allow_nan=False))
        return 0
    except (ValueError, OSError, ExecutionError):
        print(
            json.dumps(
                {
                    "status": "invalid",
                    "error": {
                        "code": "invalid_model_package",
                        "message": "Package or smoke task failed validation/execution.",
                    },
                }
            )
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(run())
