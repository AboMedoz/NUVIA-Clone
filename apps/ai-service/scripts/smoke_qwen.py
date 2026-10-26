"""Offline synthetic smoke assessment, not a scientific quality benchmark.

Run with an existing Transformers/CUDA interpreter. No configuration is changed.
The single child uses production prompts/parsers/validators. Output contains only
the synthetic requests below; it never reads a customer database.
"""

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.manifest import REPOSITORY_ROOT  # noqa: E402
from app.providers import selected_registry  # noqa: E402
from app.providers.qwen import CAPABILITIES  # noqa: E402
from app.schemas.tasks import TaskRequest, validate_result  # noqa: E402
from app.services.shared_model import SharedModelWorker, model_worker  # noqa: E402


def instrumented_worker(connection, manifest_data, package):
    import torch

    import app.models.adapters as adapters

    original_load = adapters.load_transformers
    original_generate = adapters.generate_text

    def record(value):
        with Path(os.environ["QWEN_SMOKE_DIAGNOSTICS"]).open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(value, ensure_ascii=False) + "\n")

    def load(manifest, location):
        runtime = original_load(manifest, location)
        record(
            {
                "event": "load",
                "pid": os.getpid(),
                "parameterDevices": sorted({str(p.device) for p in runtime[1].parameters()}),
                "parameterDtypes": sorted({str(p.dtype) for p in runtime[1].parameters()}),
                "allocatedBytes": torch.cuda.memory_allocated()
                if torch.cuda.is_available()
                else None,
            }
        )
        return runtime

    def generate(manifest, runtime, system, data, **kwargs):
        text = original_generate(manifest, runtime, system, data, **kwargs)
        record({"event": "generation", "capability": manifest.capability, "raw": text})
        return text

    adapters.load_transformers = load
    adapters.generate_text = generate
    model_worker(connection, manifest_data, package)


def cases(suite="smoke"):
    if suite == "followup":
        for locale, evidence in {
            "en": [
                {"id": "review-a", "text": "Staff were helpful and welcoming."},
                {"id": "review-b", "text": "We waited thirty minutes for checkout."},
            ],
            "ar": [
                {"id": "review-a", "text": "الموظفين كانوا متعاونين وتعاملهم محترم."},
                {"id": "review-b", "text": "استنينا نص ساعة عشان ندفع الحساب."},
            ],
        }.items():
            yield "report", locale, {"evidence": evidence}, {}
            yield (
                "report",
                locale,
                {"evidence": evidence, "parameters": {"purpose": "cluster_summary"}},
                {},
            )
        for business, goal in [
            ("clothing store", "Understand fitting room cleanliness and checkout waiting time"),
            ("hotel", "Understand room cleanliness and staff helpfulness"),
        ]:
            yield (
                "survey_generation",
                "en",
                {
                    "parameters": {
                        "businessType": business,
                        "goal": goal,
                    }
                },
                {},
            )
        return
    for locale, examples in {
        "en": [
            ("The service was excellent.", "positive"),
            ("The service was terrible.", "negative"),
            ("The shop opens at nine.", "neutral"),
            ("The food was delicious but the service was slow.", "mixed"),
        ],
        "ar": [
            ("الخدمة ممتازة والموظفين محترمين.", "positive"),
            ("الخدمة سيئة جدًا والأكل بارد.", "negative"),
            ("المحل بيفتح الساعة تسعة.", "neutral"),
            ("الأكل لذيذ بس الخدمة بطيئة.", "mixed"),
        ],
    }.items():
        for text, expected in examples:
            yield "sentiment", locale, {"text": text}, {"label": expected}
    for locale in ("en", "ar"):
        source = "The service was slow." if locale == "en" else "الخدمة كانت بطيئة."
        evidence = [{"id": "r1", "text": source}]
        yield "aspects", locale, {"text": source}, {"aspect": "timeliness", "label": "negative"}
        yield (
            "assistant",
            locale,
            {
                "text": "What should improve?" if locale == "en" else "إيه اللي محتاج يتحسن؟",
                "evidence": evidence,
            },
            {"status": "answered"},
        )
        yield (
            "assistant",
            locale,
            {
                "text": "What is the owner's phone number?"
                if locale == "en"
                else "ما رقم هاتف المالك؟",
                "evidence": evidence,
            },
            {"status": "insufficient_evidence"},
        )
        yield "report", locale, {"evidence": evidence}, {}
        yield (
            "report",
            locale,
            {"evidence": evidence, "parameters": {"purpose": "cluster_summary"}},
            {},
        )
        yield (
            "survey_generation",
            locale,
            {
                "parameters": {
                    "businessType": "restaurant" if locale == "en" else "مطعم",
                    "goal": "Improve service speed" if locale == "en" else "تحسين سرعة الخدمة",
                }
            },
            {},
        )


async def assess(args):
    os.environ.update(
        AI_PROVIDER="qwen",
        QWEN_MODEL_PACKAGE=str(args.package.resolve()),
        QWEN_CAPABILITIES=",".join(CAPABILITIES),
        HF_HUB_OFFLINE="1",
        TRANSFORMERS_OFFLINE="1",
        HF_HUB_DISABLE_TELEMETRY="1",
        USE_TF="0",
        USE_FLAX="0",
    )
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    diagnostics = output.with_suffix(".diagnostics.jsonl")
    if diagnostics.exists() or output.exists():
        raise ValueError("Use a new output path to preserve prior evidence")
    os.environ["QWEN_SMOKE_DIAGNOSTICS"] = str(diagnostics)
    registry = selected_registry()
    if set(registry.qwen) != set(CAPABILITIES):
        raise ValueError("Shared Qwen package/runtime is not ready; check private configuration")
    worker = SharedModelWorker(worker=instrumented_worker)
    results = []
    try:
        for index, (capability, locale, data, expected) in enumerate(cases(args.suite)):
            task = TaskRequest(schemaVersion=1, taskId=f"smoke-{index}", locale=locale, **data)
            manifest, package = registry.qwen[capability]
            started = time.monotonic()
            record = {
                "capability": capability,
                "locale": locale,
                "request": task.model_dump(),
                "expected": expected,
                "modelVersion": manifest.modelVersion,
            }
            try:
                result = await worker.execute(manifest, package, task, timeout=args.timeout)
                result = validate_result(capability, result, task, manifest)
                record.update(status="succeeded", result=result)
                if capability == "sentiment":
                    record["expectedMatched"] = result["label"] == expected["label"]
                elif capability == "assistant":
                    record["expectedMatched"] = result["status"] == expected["status"]
                elif capability == "aspects":
                    record["expectedMatched"] = any(
                        item["aspect"] == expected["aspect"] and item["label"] == expected["label"]
                        for item in result["mentions"]
                    )
            except Exception as error:
                record.update(status="failed", error=str(error))
            record["seconds"] = round(time.monotonic() - started, 3)
            record["workerPid"] = worker.process.pid if worker.process is not None else None
            results.append(record)
            output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
            print(
                json.dumps(
                    {
                        key: record[key]
                        for key in ("capability", "locale", "status", "seconds", "workerPid")
                    }
                ),
                flush=True,
            )
    finally:
        worker.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument(
        "--output", type=Path, default=REPOSITORY_ROOT / ".local/qa/qwen-smoke.json"
    )
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--suite", choices=("smoke", "followup"), default="smoke")
    asyncio.run(assess(parser.parse_args()))
