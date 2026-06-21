from __future__ import annotations

import os
import threading
from pathlib import Path
from uuid import uuid4

from .models import RunManifest, SweepSummary, VisualPreviewStatus


class Store:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.runs: dict[str, RunManifest] = {}
        self.previews: dict[str, VisualPreviewStatus] = {}
        self.sweeps: dict[str, SweepSummary] = {}
        self.artifact_root = Path(os.getenv("ARTIFACT_ROOT", "./artifacts")).resolve()
        self.artifact_root.mkdir(parents=True, exist_ok=True)

    def new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex[:12]}"

    def run_dir(self, run_id: str) -> Path:
        path = self.artifact_root / "runs" / run_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def preview_dir(self, preview_id: str) -> Path:
        path = self.artifact_root / "previews" / preview_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def robot_asset_dir(self, asset_id: str) -> Path:
        path = self.artifact_root / "robot_assets" / asset_id
        path.mkdir(parents=True, exist_ok=True)
        return path


store = Store()
