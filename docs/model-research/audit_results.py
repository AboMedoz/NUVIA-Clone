"""Audit saved cloud artifacts without loading or downloading any model."""
import argparse
import json
import math
import pathlib


def audit(directory):
    directory = pathlib.Path(directory)
    report = []
    for path in sorted(directory.glob("*.json")):
        result = json.loads(path.read_text(encoding="utf8"))
        if not isinstance(result, dict) or "model" not in result:
            continue
        row = {"file": path.name, "model": result["model"], "status": result.get("status")}
        if "scores" in result:
            matrix = result["scores"]
            finite = all(math.isfinite(value) for values in matrix for value in values)
            row["scores_finite"] = finite
            row["retrieval_rankable"] = finite and len(matrix) == 12 and all(len(values) == 12 for values in matrix)
            if not finite:
                row["warning"] = "Nonfinite scores invalidate reported retrieval ranks and metrics. Rerun in float32."
        if "audits" in result:
            rows = result["audits"]
            row["analysis_count"] = len(rows)
            row["unique_ids"] = len({item["id"] for item in rows})
            row["truncations"] = sum(item["truncated"] for item in rows)
            row["generation_count"] = len(result.get("generation", []))
            row["sentence_count"] = len(result.get("sentence_raw", []))
            row["sentiment_source_coverage"] = result["public50"]["sentiment"]["coverage"]
        report.append(row)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    args = parser.parse_args()
    print(json.dumps(audit(args.directory), ensure_ascii=False, indent=2))
