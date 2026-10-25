import json
import subprocess
import sys
from pathlib import Path

import pytest


def command(*args):
    return subprocess.run(
        [sys.executable, "-m", "app.models.smoke", *args],
        cwd=Path(__file__).resolve().parents[1],
        capture_output=True,
        text=True,
    )


def test_smoke_cli_exports_contracts_for_team_model_packages():
    result = command("schemas")
    assert result.returncode == 0
    schemas = json.loads(result.stdout)
    assert schemas["schemaVersion"] == 1
    assert set(schemas["outputs"]) >= {"sentiment", "aspects", "assistant", "forecasting"}


def test_smoke_cli_hashes_only_safe_artifacts(tmp_path):
    (tmp_path / "weights.json").write_text("{}")
    result = command("hashes", str(tmp_path))
    assert result.returncode == 0
    assert json.loads(result.stdout)["artifacts"] == {
        "weights.json": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    }
    (tmp_path / "load.py").write_text("raise Exception('must never run')")
    result = command("hashes", str(tmp_path))
    assert result.returncode == 2
    assert json.loads(result.stdout)["error"]["code"] == "invalid_model_package"


@pytest.mark.parametrize("test_only", [False, True])
def test_smoke_cli_latest_version_uses_explicit_test_only_flag(tmp_path, monkeypatch, test_only):
    from tests.test_runtime import package

    manifest = package(tmp_path, test_only=test_only)
    manifest["modelVersion"] = "latest-1"
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest))
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path))
    result = command("validate", str(path))
    assert result.returncode == (2 if test_only else 0)
    assert json.loads(result.stdout)["status"] == ("invalid" if test_only else "validated")
