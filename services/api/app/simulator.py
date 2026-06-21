from __future__ import annotations

import json
import math
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pybullet as p
from PIL import Image, ImageDraw

from .models import EpisodeSummary, FrameManifest, FrameRecord, ScenarioV01
from .robot_assets import resolve_robot_asset
from .store import store


CLASS_IDS = {"floor": 1, "mobile_base": 2, "cup": 3, "obstacle": 4, "pedestrian": 5}


def _create_box(
    half_extents: list[float],
    position: list[float],
    color: list[float],
    mass: float = 0.0,
) -> int:
    collision = p.createCollisionShape(p.GEOM_BOX, halfExtents=half_extents)
    visual = p.createVisualShape(
        p.GEOM_BOX, halfExtents=half_extents, rgbaColor=color
    )
    return p.createMultiBody(
        baseMass=mass,
        baseCollisionShapeIndex=collision,
        baseVisualShapeIndex=visual,
        basePosition=position,
    )


def _create_robot(scenario: ScenarioV01, run_dir: Path) -> tuple[int, float]:
    position = scenario.robot.start_pose.position.list()
    orientation = p.getQuaternionFromEuler([0, 0, scenario.robot.start_pose.yaw])
    if scenario.robot.type == "custom_urdf":
        source = resolve_robot_asset(scenario.robot.asset_ref)
        package_root = next(
            parent for parent in source.parents if parent.name == "package"
        )
        packaged_asset = run_dir / "assets" / "robot"
        if packaged_asset.exists():
            shutil.rmtree(packaged_asset)
        shutil.copytree(package_root, packaged_asset)
        entrypoint = packaged_asset / source.relative_to(package_root)
        p.setAdditionalSearchPath(str(entrypoint.parent))
        robot_id = p.loadURDF(
            str(entrypoint),
            basePosition=position,
            baseOrientation=orientation,
            useFixedBase=False,
            flags=p.URDF_USE_INERTIA_FROM_FILE,
        )
        aabb = p.getAABB(robot_id)
        cup_height = max(0.44, aabb[1][2] - position[2] + 0.12)
        return robot_id, cup_height
    if scenario.robot.type == "delivery_cart":
        return _create_box([0.42, 0.3, 0.22], position, [0.12, 0.35, 0.92, 1]), 0.56
    return _create_box([0.32, 0.26, 0.18], position, [0.1, 0.95, 0.88, 1]), 0.44


def _set_run_state(
    run_id: str,
    *,
    phase: str,
    progress: float | None = None,
    telemetry: dict[str, float | int | bool] | None = None,
) -> None:
    with store.lock:
        current = store.runs[run_id]
        current.phase = phase
        if progress is not None:
            current.progress = progress
        if telemetry is not None:
            current.latest_telemetry = telemetry
        current.updated_at = datetime.now(timezone.utc)


def _route_position(
    progress: float,
    start: np.ndarray,
    goal: np.ndarray,
    obstacle: np.ndarray | None,
) -> tuple[np.ndarray, float, float]:
    if obstacle is None:
        waypoints = np.asarray([start, goal], dtype=np.float64)
    else:
        direction = -1.0 if obstacle[1] >= 0 else 1.0
        detour_y = obstacle[1] + direction * 0.85
        waypoints = np.asarray(
            [
                start,
                [max(start[0] + 0.5, obstacle[0] - 0.9), start[1]],
                [obstacle[0] - 0.5, detour_y],
                [obstacle[0] + 0.7, detour_y],
                [min(goal[0] - 0.4, obstacle[0] + 1.2), goal[1]],
                goal,
            ],
            dtype=np.float64,
        )
    segment_lengths = np.linalg.norm(np.diff(waypoints, axis=0), axis=1)
    total = float(segment_lengths.sum())
    distance = np.clip(progress, 0.0, 1.0) * total
    traversed = 0.0
    for index, length in enumerate(segment_lengths):
        if distance <= traversed + length or index == len(segment_lengths) - 1:
            local = (distance - traversed) / max(float(length), 1e-6)
            pos = waypoints[index] * (1 - local) + waypoints[index + 1] * local
            direction = waypoints[index + 1] - waypoints[index]
            yaw = math.atan2(float(direction[1]), float(direction[0]))
            turn = abs(yaw) / (math.pi / 2)
            return pos, yaw, turn
        traversed += float(length)
    return waypoints[-1], 0.0, 0.0


def _write_depth_preview(path: Path, depth: np.ndarray) -> None:
    finite = depth[np.isfinite(depth)]
    if finite.size == 0:
        normalized = np.zeros(depth.shape, dtype=np.uint8)
    else:
        near = float(np.percentile(finite, 3))
        far = float(np.percentile(finite, 97))
        scale = max(far - near, 1e-6)
        normalized = np.clip((depth - near) / scale, 0.0, 1.0)
        normalized = ((1.0 - normalized) * 255).astype(np.uint8)
    Image.fromarray(normalized, mode="L").save(path)


def _write_segmentation_preview(
    path: Path,
    segmentation: np.ndarray,
    body_registry: dict[int, tuple[int, int]],
) -> None:
    palette = {
        0: (238, 238, 233),
        CLASS_IDS["floor"]: (196, 199, 194),
        CLASS_IDS["mobile_base"]: (16, 18, 17),
        CLASS_IDS["cup"]: (109, 174, 199),
        CLASS_IDS["obstacle"]: (223, 123, 50),
        CLASS_IDS["pedestrian"]: (202, 163, 60),
    }
    preview = np.full((*segmentation.shape, 3), palette[0], dtype=np.uint8)
    object_ids = segmentation & ((1 << 24) - 1)
    for body_id, (semantic_id, _) in body_registry.items():
        preview[object_ids == body_id] = palette.get(semantic_id, palette[0])
    Image.fromarray(preview, mode="RGB").save(path)


def _write_lidar_preview(path: Path, lidar: np.ndarray, range_m: float) -> None:
    width, height = 720, 420
    image = Image.new("RGB", (width, height), (7, 9, 9))
    draw = ImageDraw.Draw(image)
    center_x, center_y = width // 2, height // 2
    observed_range = (
        float(np.max(np.hypot(lidar[:, 0], lidar[:, 1])))
        if lidar.size
        else float(range_m)
    )
    # Auto-fit the observed returns so nearby warehouse geometry does not stay
    # compressed around the origin when the configured sensor range is large.
    display_range = max(1.0, observed_range * 1.08)
    scale = min(width, height) * 0.43 / display_range
    colors = {
        CLASS_IDS["floor"]: (76, 88, 86),
        CLASS_IDS["mobile_base"]: (244, 244, 242),
        CLASS_IDS["cup"]: (92, 175, 207),
        CLASS_IDS["obstacle"]: (223, 123, 50),
        CLASS_IDS["pedestrian"]: (220, 183, 70),
    }
    for ratio in (0.25, 0.5, 0.75, 1.0):
        radius = display_range * ratio * scale
        draw.ellipse(
            (
                center_x - radius,
                center_y - radius,
                center_x + radius,
                center_y + radius,
            ),
            outline=(29, 42, 40),
            width=1,
        )
    draw.line((center_x, 18, center_x, height - 18), fill=(24, 35, 34), width=1)
    draw.line((18, center_y, width - 18, center_y), fill=(24, 35, 34), width=1)
    for row in lidar:
        x, y, _, intensity, semantic_id, _ = row
        px = int(center_x + float(x) * scale)
        py = int(center_y - float(y) * scale)
        if not (2 <= px < width - 2 and 2 <= py < height - 2):
            continue
        base = colors.get(int(semantic_id), (110, 231, 183))
        alpha = max(0.7, min(1.0, float(intensity)))
        color = tuple(int(channel * alpha) for channel in base)
        draw.ellipse((px - 3, py - 3, px + 3, py + 3), fill=color)
    draw.ellipse(
        (center_x - 5, center_y - 5, center_x + 5, center_y + 5),
        fill=(110, 231, 183),
    )
    image.save(path)


def refresh_lidar_previews(run_id: str, scenario: ScenarioV01) -> None:
    run_dir = store.run_dir(run_id)
    lidar_dir = run_dir / "sensor_data/lidar"
    preview_dir = run_dir / "sensor_data/lidar_preview"
    if not lidar_dir.is_dir():
        return
    preview_dir.mkdir(parents=True, exist_ok=True)
    for lidar_path in lidar_dir.glob("*.npy"):
        _write_lidar_preview(
            preview_dir / f"{lidar_path.stem}.png",
            np.load(lidar_path),
            scenario.sensors.lidar.range_m,
        )


def _capture_camera(
    robot_position: np.ndarray, width: int, height: int, fov: float, near: float, far: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    eye = [float(robot_position[0] - 2.4), float(robot_position[1] - 2.8), 2.35]
    target = [float(robot_position[0] + 1.0), float(robot_position[1]), 0.45]
    view = p.computeViewMatrix(eye, target, [0.0, 0.0, 1.0])
    projection = p.computeProjectionMatrixFOV(fov, width / height, near, far)
    image = p.getCameraImage(
        width,
        height,
        viewMatrix=view,
        projectionMatrix=projection,
        renderer=p.ER_TINY_RENDERER,
        flags=p.ER_SEGMENTATION_MASK_OBJECT_AND_LINKINDEX,
    )
    rgba = np.asarray(image[2], dtype=np.uint8).reshape(height, width, 4)
    depth_buffer = np.asarray(image[3], dtype=np.float32).reshape(height, width)
    segmentation = np.asarray(image[4], dtype=np.int32).reshape(height, width)
    depth = far * near / (far - (far - near) * depth_buffer)
    return rgba[:, :, :3], depth.astype(np.float32), segmentation


def _capture_lidar(
    robot_position: np.ndarray,
    yaw: float,
    body_registry: dict[int, tuple[int, int]],
    num_rays: int,
    range_m: float,
    height: float,
) -> np.ndarray:
    origin = np.asarray([robot_position[0], robot_position[1], height], dtype=np.float64)
    angles = np.linspace(-math.pi, math.pi, num_rays, endpoint=False) + yaw
    ray_from = np.repeat(origin[None, :], num_rays, axis=0)
    ray_to = ray_from + np.stack(
        [np.cos(angles) * range_m, np.sin(angles) * range_m, np.zeros(num_rays)],
        axis=1,
    )
    results = p.rayTestBatch(ray_from.tolist(), ray_to.tolist())
    rows: list[list[float]] = []
    cos_yaw, sin_yaw = math.cos(-yaw), math.sin(-yaw)
    for result in results:
        body_id, hit_fraction, hit_position = result[0], float(result[2]), result[3]
        if body_id < 0:
            continue
        relative = np.asarray(hit_position, dtype=np.float64) - origin
        local_x = relative[0] * cos_yaw - relative[1] * sin_yaw
        local_y = relative[0] * sin_yaw + relative[1] * cos_yaw
        semantic_id, instance_id = body_registry.get(body_id, (0, 0))
        rows.append(
            [
                float(local_x),
                float(local_y),
                float(relative[2]),
                max(0.05, 1.0 - hit_fraction),
                float(semantic_id),
                float(instance_id),
            ]
        )
    return np.asarray(rows, dtype=np.float32).reshape(-1, 6)


def _write_frame_labels(
    path: Path,
    frame_id: str,
    timestamp_s: float,
    body_registry: dict[int, tuple[int, int]],
    metadata: dict[int, dict[str, str]],
) -> None:
    objects = []
    for body_id, (_, instance_id) in body_registry.items():
        if body_id not in metadata:
            continue
        position, quaternion = p.getBasePositionAndOrientation(body_id)
        aabb = p.getAABB(body_id)
        dimensions = [aabb[1][axis] - aabb[0][axis] for axis in range(3)]
        yaw = p.getEulerFromQuaternion(quaternion)[2]
        objects.append(
            {
                **metadata[body_id],
                "instance_numeric_id": instance_id,
                "position_xyz": list(position),
                "orientation_xyzw": list(quaternion),
                "bbox_3d": [*position, *dimensions, yaw],
            }
        )
    path.write_text(
        json.dumps(
            {"frame_id": frame_id, "timestamp_s": timestamp_s, "objects": objects},
            indent=2,
        )
    )


def run_simulation(run_id: str) -> None:
    with store.lock:
        manifest = store.runs[run_id]
        manifest.status = "running"
        manifest.phase = "compiling_scenario"
        manifest.updated_at = datetime.now(timezone.utc)

    scenario = manifest.scenario
    run_dir = store.run_dir(run_id)
    for relative in (
        "sensor_data/rgb",
        "sensor_data/depth",
        "sensor_data/depth_preview",
        "sensor_data/seg",
        "sensor_data/seg_preview",
        "sensor_data/lidar",
        "sensor_data/lidar_preview",
        "labels",
        "eval",
        "calib",
    ):
        (run_dir / relative).mkdir(parents=True, exist_ok=True)
    (run_dir / "scenario.json").write_text(
        scenario.model_dump_json(by_alias=True, indent=2)
    )
    _set_run_state(run_id, phase="building_simulation", progress=0.04)

    client = p.connect(p.DIRECT)
    try:
        physics = scenario.environment.physics
        p.resetSimulation()
        p.setGravity(*physics.gravity.list())
        p.setTimeStep(physics.time_step)

        floor_shape = p.createCollisionShape(p.GEOM_BOX, halfExtents=[6.0, 2.2, 0.04])
        floor_colors = {
            "warehouse": [0.16, 0.2, 0.22, 1],
            "loading_bay": [0.24, 0.25, 0.24, 1],
            "white_test_floor": [0.92, 0.92, 0.9, 1],
        }
        floor_visual = p.createVisualShape(
            p.GEOM_BOX,
            halfExtents=[6.0, 2.2, 0.04],
            rgbaColor=floor_colors[scenario.environment.type],
        )
        floor_id = p.createMultiBody(
            baseMass=0,
            baseCollisionShapeIndex=floor_shape,
            baseVisualShapeIndex=floor_visual,
            basePosition=[2.7, 0, -0.04],
        )
        p.changeDynamics(floor_id, -1, lateralFriction=physics.floor_friction)

        robot_id, cup_mount_height = _create_robot(scenario, run_dir)
        obstacle = next(
            (obj for obj in scenario.objects if obj.class_name == "obstacle"),
            None,
        )
        box_id = (
            _create_box(
                [
                    obstacle.dimensions.x / 2,
                    obstacle.dimensions.y / 2,
                    obstacle.dimensions.z / 2,
                ],
                obstacle.pose.position.list(),
                [0.93, 0.35, 0.12, 1],
            )
            if obstacle
            else None
        )
        actor = scenario.dynamic_actors[0] if scenario.dynamic_actors else None
        human_id = (
            _create_box(
                [
                    actor.dimensions.x / 2,
                    actor.dimensions.y / 2,
                    actor.dimensions.z / 2,
                ],
                actor.trajectory[0].list(),
                [0.93, 0.76, 0.22, 1],
            )
            if actor
            else None
        )
        cup_id = _create_box(
            [0.08, 0.08, 0.11],
            [0.1, 0, 0.65],
            [0.72, 0.92, 1.0, 1],
        )
        goal_id = _create_box(
            [0.38, 0.38, 0.02],
            [scenario.robot.goal_pose.position.x, scenario.robot.goal_pose.position.y, 0.02],
            [0.12, 0.9, 0.42, 0.45],
        )

        body_registry: dict[int, tuple[int, int]] = {
            floor_id: (CLASS_IDS["floor"], 1),
            robot_id: (CLASS_IDS["mobile_base"], 2),
            cup_id: (CLASS_IDS["cup"], 3),
        }
        metadata: dict[int, dict[str, str]] = {
            robot_id: {"instance_id": "robot_1", "class_name": "mobile_base"},
            cup_id: {"instance_id": "cup_1", "class_name": "cup"},
            goal_id: {"instance_id": "goal_1", "class_name": "goal"},
        }
        if box_id is not None and obstacle is not None:
            body_registry[box_id] = (CLASS_IDS["obstacle"], 4)
            metadata[box_id] = {
                "instance_id": obstacle.id,
                "class_name": "obstacle",
            }
        if human_id is not None and actor is not None:
            body_registry[human_id] = (CLASS_IDS["pedestrian"], 5)
            metadata[human_id] = {
                "instance_id": actor.id,
                "class_name": "pedestrian",
            }

        duration = scenario.task.termination.timeout_s
        capture_rate = scenario.sensors.capture_rate_hz
        frame_count = max(8, int(duration * capture_rate) + 1)
        water = 100.0
        total_reward = 0.0
        max_tilt = 0.0
        collisions = 0
        telemetry_rows: list[dict[str, float | int | bool]] = []
        frame_records: list[FrameRecord] = []
        previous_position = np.asarray(scenario.robot.start_pose.position.list()[:2])
        previous_velocity = 0.0
        start_position = np.asarray(
            [
                scenario.robot.start_pose.position.x,
                scenario.robot.start_pose.position.y,
            ],
            dtype=np.float64,
        )
        goal_position = np.asarray(
            [
                scenario.robot.goal_pose.position.x,
                scenario.robot.goal_pose.position.y,
            ],
            dtype=np.float64,
        )
        obstacle_position = (
            np.asarray(
                [obstacle.pose.position.x, obstacle.pose.position.y],
                dtype=np.float64,
            )
            if obstacle
            else None
        )
        _set_run_state(run_id, phase="running_robot_test", progress=0.08)

        for frame_index in range(frame_count):
            progress = frame_index / max(frame_count - 1, 1)
            time_s = progress * duration
            position_2d, yaw, turn = _route_position(
                progress,
                start_position,
                goal_position,
                obstacle_position,
            )
            robot_position = np.asarray([position_2d[0], position_2d[1], 0.22])
            p.resetBasePositionAndOrientation(
                robot_id, robot_position.tolist(), p.getQuaternionFromEuler([0, 0, yaw])
            )

            if actor is not None and human_id is not None:
                actor_phase = min(1.0, time_s * actor.speed_mps / 2.9)
                actor_start = np.asarray(actor.trajectory[0].list())
                actor_end = np.asarray(actor.trajectory[-1].list())
                actor_position = (
                    actor_start * (1 - actor_phase) + actor_end * actor_phase
                )
                p.resetBasePositionAndOrientation(
                    human_id, actor_position.tolist(), [0, 0, 0, 1]
                )

            slip = 1.0 - min(1.0, physics.floor_friction)
            velocity = (
                np.linalg.norm(position_2d - previous_position) * capture_rate
                if frame_index
                else scenario.robot.speed_mps
            )
            acceleration = abs(float(velocity) - previous_velocity) * capture_rate
            tilt = 4.0 + scenario.robot.speed_mps * 6.5 + slip * 19.0 + turn * 12.0
            tilt += math.sin(frame_index * 0.75) * slip * 3.0
            max_tilt = max(max_tilt, tilt)
            cup_position = robot_position + np.asarray(
                [math.cos(yaw) * 0.1, math.sin(yaw) * 0.1, cup_mount_height]
            )
            p.resetBasePositionAndOrientation(
                cup_id,
                cup_position.tolist(),
                p.getQuaternionFromEuler([0, math.radians(tilt), yaw]),
            )

            spill_rate = max(0.0, tilt - 12.0) * 0.35
            spill_rate += max(0.0, acceleration - 1.5) * 0.16
            water = max(0.0, water - spill_rate / capture_rate)
            distance_to_goal = float(
                np.linalg.norm(
                    position_2d
                    - np.asarray(
                        [
                            scenario.robot.goal_pose.position.x,
                            scenario.robot.goal_pose.position.y,
                        ]
                    )
                )
            )
            reward = (
                scenario.task.reward.goal_progress * (1.0 / max(frame_count - 1, 1))
                + scenario.task.reward.spill_penalty * (100.0 - water) / 100.0
            )
            total_reward += reward

            p.performCollisionDetection()
            contact_now = bool(
                (box_id is not None and p.getContactPoints(robot_id, box_id))
                or (human_id is not None and p.getContactPoints(robot_id, human_id))
            )
            if contact_now:
                collisions += 1
                total_reward += scenario.task.reward.collision_penalty

            frame_id = f"{frame_index:06d}"
            camera = scenario.sensors.rgb_camera
            rgb, depth, segmentation = _capture_camera(
                robot_position,
                camera.width,
                camera.height,
                camera.fov_deg,
                camera.near_m,
                camera.far_m,
            )
            Image.fromarray(rgb).save(run_dir / "sensor_data/rgb" / f"{frame_id}.png")
            np.save(run_dir / "sensor_data/depth" / f"{frame_id}.npy", depth)
            np.save(run_dir / "sensor_data/seg" / f"{frame_id}.npy", segmentation)
            _write_depth_preview(
                run_dir / "sensor_data/depth_preview" / f"{frame_id}.png",
                depth,
            )
            _write_segmentation_preview(
                run_dir / "sensor_data/seg_preview" / f"{frame_id}.png",
                segmentation,
                body_registry,
            )
            lidar_cfg = scenario.sensors.lidar
            lidar = _capture_lidar(
                robot_position,
                yaw,
                body_registry,
                lidar_cfg.num_rays,
                lidar_cfg.range_m,
                lidar_cfg.height_m,
            )
            np.save(run_dir / "sensor_data/lidar" / f"{frame_id}.npy", lidar)
            _write_lidar_preview(
                run_dir / "sensor_data/lidar_preview" / f"{frame_id}.png",
                lidar,
                lidar_cfg.range_m,
            )
            _write_frame_labels(
                run_dir / "labels" / f"{frame_id}.json",
                frame_id,
                time_s,
                body_registry,
                metadata,
            )

            telemetry = {
                "frame": frame_index,
                "time_s": round(time_s, 3),
                "progress": round(progress, 4),
                "water_left_percent": round(water, 2),
                "cup_tilt_deg": round(tilt, 2),
                "collisions": collisions,
                "distance_to_goal_m": round(distance_to_goal, 2),
                "reward": round(total_reward, 3),
                "goal_reached": progress >= 0.995,
            }
            telemetry_rows.append(telemetry)
            frame_records.append(
                FrameRecord(
                    frame_id=frame_id,
                    index=frame_index,
                    timestamp_s=round(time_s, 3),
                    rgb_url=(
                        f"/artifacts/runs/{run_id}/sensor_data/rgb/{frame_id}.png"
                    ),
                    depth_preview_url=(
                        f"/artifacts/runs/{run_id}/sensor_data/depth_preview/"
                        f"{frame_id}.png"
                    ),
                    segmentation_preview_url=(
                        f"/artifacts/runs/{run_id}/sensor_data/seg_preview/"
                        f"{frame_id}.png"
                    ),
                    lidar_preview_url=(
                        f"/artifacts/runs/{run_id}/sensor_data/lidar_preview/"
                        f"{frame_id}.png"
                    ),
                    labels_url=f"/artifacts/runs/{run_id}/labels/{frame_id}.json",
                    lidar_points=int(lidar.shape[0]),
                    telemetry=telemetry,
                )
            )
            phase = (
                "running_robot_test"
                if progress < 0.35
                else "recording_sensors"
                if progress < 0.78
                else "generating_labels"
            )
            _set_run_state(
                run_id,
                phase=phase,
                progress=0.08 + progress * 0.78,
                telemetry=telemetry,
            )

            previous_position = position_2d
            previous_velocity = float(velocity)

        _set_run_state(run_id, phase="evaluating_result", progress=0.9)
        goal_reached = True
        success_cfg = scenario.task.success
        success = (
            goal_reached
            and water >= success_cfg.min_water_left_percent
            and collisions <= success_cfg.max_collisions
        )
        failure_code = None
        failure_reason = None
        if not success:
            if water < success_cfg.min_water_left_percent:
                failure_code = "INSUFFICIENT_WATER_REMAINING"
                failure_reason = (
                    f"Robot reached the goal, but only {water:.1f}% water remained. "
                    "High cup tilt while turning on the low-friction floor caused the spill."
                )
            elif collisions > success_cfg.max_collisions:
                failure_code = "COLLISION_LIMIT_EXCEEDED"
                failure_reason = "The robot exceeded the allowed collision count."
            else:
                failure_code = "GOAL_NOT_REACHED"
                failure_reason = "The robot did not reach the target zone before timeout."
        else:
            total_reward += scenario.task.reward.success_bonus

        summary = EpisodeSummary(
            success=success,
            failure_code=failure_code,
            failure_reason=failure_reason,
            goal_reached=goal_reached,
            water_left_percent=round(water, 2),
            collisions=collisions,
            max_cup_tilt_deg=round(max_tilt, 2),
            total_reward=round(total_reward, 3),
            duration_s=duration,
            frame_count=frame_count,
        )
        (run_dir / "eval" / "telemetry.json").write_text(json.dumps(telemetry_rows, indent=2))
        (run_dir / "eval" / "summary.json").write_text(summary.model_dump_json(indent=2))
        frame_manifest = FrameManifest(
            run_id=run_id,
            frame_count=frame_count,
            capture_rate_hz=capture_rate,
            width=camera.width,
            height=camera.height,
            frames=frame_records,
        )
        (run_dir / "frames.json").write_text(frame_manifest.model_dump_json(indent=2))
        (run_dir / "calib" / "camera_info_front.json").write_text(
            json.dumps(
                {
                    "width": camera.width,
                    "height": camera.height,
                    "fov_deg": camera.fov_deg,
                    "near_m": camera.near_m,
                    "far_m": camera.far_m,
                    "frame_id": "front_camera_optical",
                },
                indent=2,
            )
        )

        _set_run_state(run_id, phase="packaging_artifacts", progress=0.96)
        with store.lock:
            current = store.runs[run_id]
            current.status = "completed"
            current.phase = "completed"
            current.progress = 1.0
            current.summary = summary
            current.updated_at = datetime.now(timezone.utc)
            current.artifacts.update(
                {
                    "first_rgb": f"/artifacts/runs/{run_id}/sensor_data/rgb/000000.png",
                    "last_rgb": f"/artifacts/runs/{run_id}/sensor_data/rgb/{frame_count - 1:06d}.png",
                    "telemetry": f"/artifacts/runs/{run_id}/eval/telemetry.json",
                    "summary": f"/artifacts/runs/{run_id}/eval/summary.json",
                    "frames": f"/v1/runs/{run_id}/frames",
                }
            )
    except Exception as exc:
        with store.lock:
            current = store.runs[run_id]
            current.status = "failed"
            current.phase = "failed"
            current.error = str(exc)
            current.updated_at = datetime.now(timezone.utc)
        raise
    finally:
        p.disconnect(client)
