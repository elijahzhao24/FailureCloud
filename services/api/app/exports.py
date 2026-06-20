from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

import numpy as np

from .models import RunManifest
from .store import store


def _reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def _openpcdet_export(run_dir: Path) -> None:
    target = run_dir / "exports" / "openpcdet"
    _reset_dir(target)
    points_dir = target / "points"
    labels_dir = target / "labels"
    imagesets_dir = target / "ImageSets"
    points_dir.mkdir()
    labels_dir.mkdir()
    imagesets_dir.mkdir()
    frame_ids: list[str] = []
    for lidar_file in sorted((run_dir / "sensor_data/lidar").glob("*.npy")):
        frame_id = lidar_file.stem
        points = np.load(lidar_file)[:, :4].astype(np.float32)
        np.save(points_dir / lidar_file.name, points)
        labels_payload = json.loads((run_dir / "labels" / f"{frame_id}.json").read_text())
        rows = []
        for obj in labels_payload["objects"]:
            if obj["class_name"] in {"goal", "mobile_base"}:
                continue
            x, y, z, dx, dy, dz, heading = obj["bbox_3d"]
            class_name = {
                "obstacle": "Obstacle",
                "cup": "Cup",
                "pedestrian": "Human",
            }.get(obj["class_name"], obj["class_name"].title())
            rows.append(
                f"{x:.4f} {y:.4f} {z:.4f} {dx:.4f} {dy:.4f} {dz:.4f} {heading:.4f} {class_name}"
            )
        (labels_dir / f"{frame_id}.txt").write_text("\n".join(rows) + "\n")
        frame_ids.append(frame_id)
    (imagesets_dir / "train.txt").write_text("\n".join(frame_ids) + "\n")
    (target / "README.md").write_text(
        "# OpenPCDet export\n\n"
        "Point rows are float32 `[x, y, z, intensity]`. Label rows are "
        "`x y z dx dy dz heading class_name`.\n"
    )


def _ros_export(run_dir: Path) -> None:
    target = run_dir / "exports" / "ros2_folder"
    _reset_dir(target)
    (target / "camera_frames").mkdir()
    (target / "depth_frames").mkdir()
    (target / "lidar").mkdir()
    manifest = {
        "format": "failurecloud_ros2_folder_v1",
        "note": "Flat-file replay contract; convert to rosbag2 in a ROS 2 environment.",
        "topics": {
            "/lidar/points": "sensor_msgs/msg/PointCloud2",
            "/camera/front/image_raw": "sensor_msgs/msg/Image",
            "/camera/front/depth": "sensor_msgs/msg/Image",
            "/camera/front/camera_info": "sensor_msgs/msg/CameraInfo",
            "/tf": "tf2_msgs/msg/TFMessage",
            "/task/status": "std_msgs/msg/String",
        },
        "point_fields": ["x", "y", "z", "intensity", "semantic_id", "instance_id"],
    }
    (target / "topic_manifest.json").write_text(json.dumps(manifest, indent=2))
    shutil.copy2(
        run_dir / "calib" / "camera_info_front.json",
        target / "camera_info_front.json",
    )
    for source in (run_dir / "sensor_data/rgb").glob("*.png"):
        shutil.copy2(source, target / "camera_frames" / source.name)
    for source in (run_dir / "sensor_data/depth").glob("*.npy"):
        shutil.copy2(source, target / "depth_frames" / source.name)
    for source in (run_dir / "sensor_data/lidar").glob("*.npy"):
        shutil.copy2(source, target / "lidar" / source.name)


def _pybullet_export(run_dir: Path) -> None:
    target = run_dir / "exports" / "pybullet"
    _reset_dir(target)
    shutil.copy2(run_dir / "scenario.json", target / "scenario.json")
    (target / "run_sim.py").write_text(
        '"""Replay entry point for a packaged FailureCloud scenario."""\n'
        "import json\n"
        "from pathlib import Path\n\n"
        "scenario = json.loads(Path(__file__).with_name('scenario.json').read_text())\n"
        "print(f\"FailureCloud replay: {scenario['name']}\")\n"
        "print('Install FailureCloud and submit this scenario to POST /v1/runs.')\n"
    )


def _manifest_exports(run_dir: Path, manifest: RunManifest) -> None:
    isaac = run_dir / "exports" / "isaac"
    _reset_dir(isaac)
    (isaac / "scene_config.json").write_text(
        json.dumps(
            {
                "format": "failurecloud_isaac_config_v1",
                "scenario_ref": "../../scenario.json",
                "stage_units_in_meters": 1.0,
                "sensors": manifest.scenario.sensors.model_dump(),
                "note": "Compile primitive assets to USD in the future Isaac adapter.",
            },
            indent=2,
        )
    )
    nebius = run_dir / "exports" / "nebius"
    _reset_dir(nebius)
    (nebius / "job_manifest.json").write_text(
        json.dumps(
            {
                "name": f"failurecloud-{manifest.run_id}",
                "image": "YOUR_REGISTRY/failurecloud-worker:latest",
                "command": ["python", "-m", "app.sweep_worker"],
                "inputs": {"scenario": "scenario.json", "sweep": "sweep.json"},
                "outputs": {"results": "results.json"},
                "resources": {"cpu": 4, "memory_gib": 8},
            },
            indent=2,
        )
    )


def generate_exports(run_id: str) -> Path:
    with store.lock:
        manifest = store.runs[run_id]
        if manifest.status != "completed":
            raise ValueError("Run must complete before export")
    run_dir = store.run_dir(run_id)
    exports_dir = run_dir / "exports"
    exports_dir.mkdir(exist_ok=True)
    _openpcdet_export(run_dir)
    _ros_export(run_dir)
    _pybullet_export(run_dir)
    _manifest_exports(run_dir, manifest)
    export_manifest = {
        "run_id": run_id,
        "formats": ["openpcdet", "ros2_folder", "pybullet", "isaac", "nebius"],
        "canonical_scenario": "scenario.json",
        "evaluation": "eval/summary.json",
    }
    (exports_dir / "manifest.json").write_text(json.dumps(export_manifest, indent=2))
    zip_path = run_dir / f"{run_id}.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in run_dir.rglob("*"):
            if path.is_file() and path != zip_path:
                archive.write(path, path.relative_to(run_dir))
    with store.lock:
        store.runs[run_id].artifacts["bundle"] = f"/v1/runs/{run_id}/bundle"
    return zip_path

