from __future__ import annotations

import sys
from pathlib import Path

import pytest


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    from app.store import store

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("REACTOR_API_URL", raising=False)
    monkeypatch.delenv("REACTOR_API_KEY", raising=False)
    monkeypatch.delenv("NEBIUS_JOB_IMAGE", raising=False)
    with store.lock:
        store.runs.clear()
        store.previews.clear()
        store.sweeps.clear()
        store.artifact_root = tmp_path / "artifacts"
        store.artifact_root.mkdir(parents=True, exist_ok=True)
    yield store

