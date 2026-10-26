import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from app.models import manifest


def test_checkout_model_paths_stay_repository_relative(tmp_path, monkeypatch):
    repository = Path(__file__).resolve().parents[3]
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("AI_MODEL_MANIFEST_DIR", raising=False)
    monkeypatch.delenv("AI_MODEL_ROOT", raising=False)
    assert manifest.directories() == (repository / ".local/models",) * 2

    monkeypatch.setenv("AI_MODEL_MANIFEST_DIR", "fixtures/manifests")
    monkeypatch.setenv("AI_MODEL_ROOT", str(tmp_path / "artifacts"))
    assert manifest.directories() == (
        repository / "fixtures/manifests",
        tmp_path / "artifacts",
    )


@pytest.mark.parametrize("configured", [False, True])
def test_app_only_container_layout_imports_and_resolves_model_paths(tmp_path, configured):
    service = tmp_path / "service"
    shutil.copytree(Path(__file__).resolve().parents[1] / "app", service / "app")
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    for name in ("AI_MODEL_MANIFEST_DIR", "AI_MODEL_ROOT"):
        environment.pop(name, None)
    if configured:
        environment["AI_MODEL_MANIFEST_DIR"] = "manifests"
        environment["AI_MODEL_ROOT"] = str(tmp_path / "mounted-models")

    # The virtual filename reproduces /service's shallow depth on Windows too.
    script = """
import json
import sys
import types
from pathlib import Path

module = types.ModuleType("app.models.manifest")
module.__file__ = str(Path("/service/app/models/manifest.py"))
sys.modules[module.__name__] = module
source = Path("app/models/manifest.py").read_text(encoding="utf-8")
exec(compile(source, module.__file__, "exec"), module.__dict__)
print(json.dumps([str(path) for path in module.directories()]))
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=service,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    root = Path(service.anchor) / "service"
    expected = (
        [root / "manifests", tmp_path / "mounted-models"]
        if configured
        else [root / ".local/models"] * 2
    )
    assert json.loads(result.stdout) == [str(path) for path in expected]
