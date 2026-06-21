from __future__ import annotations

import json
import time
import zipfile
from types import SimpleNamespace

import numpy as np
from PIL import Image

from app.compiler import compile_prompt
from app.exports import generate_exports
from app.models import RunManifest, SweepSpecification
from app.simulator import run_simulation
from app.store import store
from app.sweep_worker import execute_sweep
from app.sweeps import create_sweep
from app.vendors import create_preview
from app.vendors import create_reactor_token


def compact_scenario():
    scenario = compile_prompt(
        "Generate a slippery warehouse cup-carry task with a crossing worker."
    ).scenario
    scenario.task.termination.timeout_s = 1.0
    scenario.sensors.capture_rate_hz = 2.0
    scenario.sensors.rgb_camera.width = 96
    scenario.sensors.rgb_camera.height = 64
    scenario.sensors.depth_camera.width = 96
    scenario.sensors.depth_camera.height = 64
    scenario.sensors.lidar.num_rays = 64
    scenario.task.success.min_water_left_percent = 85.0
    return scenario


def completed_run(run_id: str = "run_test") -> RunManifest:
    manifest = RunManifest(
        run_id=run_id,
        status="queued",
        scenario=compact_scenario(),
    )
    store.runs[run_id] = manifest
    run_simulation(run_id)
    return store.runs[run_id]


def wait_for(predicate, timeout: float = 5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.03)
    raise AssertionError("Timed out waiting for asynchronous result")


def test_simulation_writes_synchronized_sensor_bundle():
    run = completed_run()
    root = store.run_dir(run.run_id)

    assert run.status == "completed"
    assert run.summary is not None
    assert run.summary.frame_count == 8
    assert run.summary.goal_reached
    assert not run.summary.success
    assert (
        run.summary.water_left_percent
        < run.scenario.task.success.min_water_left_percent
    )

    rgb_files = sorted((root / "sensor_data/rgb").glob("*.png"))
    depth_files = sorted((root / "sensor_data/depth").glob("*.npy"))
    seg_files = sorted((root / "sensor_data/seg").glob("*.npy"))
    lidar_files = sorted((root / "sensor_data/lidar").glob("*.npy"))
    label_files = sorted((root / "labels").glob("*.json"))
    depth_preview_files = sorted((root / "sensor_data/depth_preview").glob("*.png"))
    segmentation_preview_files = sorted(
        (root / "sensor_data/seg_preview").glob("*.png")
    )
    assert len(rgb_files) == len(depth_files) == len(seg_files) == len(lidar_files) == len(label_files) == 8
    assert len(depth_preview_files) == len(segmentation_preview_files) == 8

    assert Image.open(rgb_files[0]).size == (96, 64)
    depth = np.load(depth_files[0])
    segmentation = np.load(seg_files[0])
    lidar = np.load(lidar_files[0])
    assert depth.shape == segmentation.shape == (64, 96)
    assert depth.dtype == np.float32
    assert np.isfinite(depth).all()
    assert lidar.ndim == 2 and lidar.shape[1] == 6
    assert np.isfinite(lidar).all()

    labels = json.loads(label_files[-1].read_text())
    assert {item["instance_id"] for item in labels["objects"]} == {
        "robot_1",
        "cup_1",
        "box_1",
        "worker_1",
    }
    frame_manifest = json.loads((root / "frames.json").read_text())
    assert frame_manifest["frame_count"] == 8
    assert frame_manifest["frames"][0]["rgb_url"].endswith("000000.png")
    assert frame_manifest["frames"][-1]["telemetry"]["goal_reached"]
    assert frame_manifest["frames"][0]["lidar_points"] > 0


def test_simulation_supports_static_hazard_scenario_without_dynamic_actor():
    scenario = compact_scenario()
    scenario.dynamic_actors = []
    manifest = RunManifest(
        run_id="run_static",
        status="queued",
        scenario=scenario,
    )
    store.runs[manifest.run_id] = manifest

    run_simulation(manifest.run_id)

    run = store.runs[manifest.run_id]
    frames = json.loads((store.run_dir(manifest.run_id) / "frames.json").read_text())
    assert run.status == "completed"
    assert run.phase == "completed"
    assert frames["frame_count"] == 8


def test_exports_are_consistent_and_bundle_is_downloadable():
    run = completed_run("run_exports")
    root = store.run_dir(run.run_id)

    zip_path = generate_exports(run.run_id)

    frame_ids = [
        path.stem
        for path in sorted((root / "exports/openpcdet/points").glob("*.npy"))
    ]
    split_ids = (
        root / "exports/openpcdet/ImageSets/train.txt"
    ).read_text().splitlines()
    label_ids = [
        path.stem
        for path in sorted((root / "exports/openpcdet/labels").glob("*.txt"))
    ]
    assert frame_ids == split_ids == label_ids
    assert all(
        np.load(root / "exports/openpcdet/points" / f"{frame_id}.npy").shape[1] == 4
        for frame_id in frame_ids
    )
    assert (root / "exports/ros2_folder/topic_manifest.json").is_file()
    assert (root / "exports/pybullet/run_sim.py").is_file()
    assert (root / "exports/isaac/scene_config.json").is_file()
    assert (root / "exports/nebius/job_manifest.json").is_file()
    assert zip_path.is_file()
    with zipfile.ZipFile(zip_path) as archive:
        names = set(archive.namelist())
    assert "scenario.json" in names
    assert "eval/summary.json" in names
    assert "exports/openpcdet/ImageSets/train.txt" in names


def test_vendor_integrations_complete_with_local_fallbacks():
    run = completed_run("run_integrations")

    preview = create_preview(run.scenario)
    final_preview = wait_for(
        lambda: store.previews[preview.preview_id]
        if store.previews[preview.preview_id].status == "completed"
        else None
    )
    assert final_preview.provider == "local_fallback"
    assert final_preview.media_url
    assert (
        store.artifact_root
        / final_preview.media_url.removeprefix("/artifacts/")
    ).is_file()

    sweep = create_sweep(run.run_id, SweepSpecification())
    final_sweep = wait_for(
        lambda: store.sweeps[sweep.sweep_id]
        if store.sweeps[sweep.sweep_id].status == "completed"
        else None
    )
    assert final_sweep.provider == "local_fallback"
    assert len(final_sweep.results) == 16
    assert 0.0 <= final_sweep.success_rate <= 1.0
    assert any(not result.success for result in final_sweep.results)


def test_reactor_token_exchange_uses_server_side_api_key(monkeypatch):
    monkeypatch.setenv("REACTOR_API_KEY", "rk_test")
    monkeypatch.setenv("REACTOR_API_URL", "https://api.reactor.inc")
    captured = {}

    def fake_post(url, *, headers, json, timeout):
        captured.update(
            {"url": url, "headers": headers, "json": json, "timeout": timeout}
        )
        return SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"jwt": "short-lived-token", "expires_at": 2_000_000_000},
        )

    monkeypatch.setattr("app.vendors.httpx.post", fake_post)

    token = create_reactor_token(expires_after=300)

    assert token.jwt == "short-lived-token"
    assert captured["url"] == "https://api.reactor.inc/tokens"
    assert captured["headers"]["Reactor-API-Key"] == "rk_test"
    assert "Authorization" not in captured["headers"]
    assert captured["json"] == {"expires_after": 300}


def test_cloud_sweep_worker_writes_normalized_results(tmp_path):
    scenario_path = tmp_path / "scenario.json"
    specification_path = tmp_path / "sweep.json"
    output_path = tmp_path / "results.json"
    scenario_path.write_text(compact_scenario().model_dump_json(by_alias=True))
    specification_path.write_text(SweepSpecification().model_dump_json())

    execute_sweep(scenario_path, specification_path, output_path)

    payload = json.loads(output_path.read_text())
    assert payload["status"] == "completed"
    assert len(payload["results"]) == 16
    assert all(
        {"variant_id", "parameters", "success", "water_left_percent"}
        <= result.keys()
        for result in payload["results"]
    )
