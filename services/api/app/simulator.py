from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pybullet as p
from PIL import Image

from .models import EpisodeSummary, RunManifest, ScenarioV01
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


def _route_position(progress: float) -> tuple[np.ndarray, float, float]:
    waypoints = np.asarray(
        [[0.0, 0.0], [1.85, 0.0], [2.35, -0.85], [3.15, -0.85], [3.7, 0.0], [5.4, 0.0]],
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
        manifest.updated_at = datetime.now(timezone.utc)

    scenario = manifest.scenario
    run_dir = store.run_dir(run_id)
    for relative in (
        "sensor_data/rgb",
        "sensor_data/depth",
        "sensor_data/seg",
        "sensor_data/lidar",
        "labels",
        "eval",
        "calib",
    ):
        (run_dir / relative).mkdir(parents=True, exist_ok=True)
    (run_dir / "scenario.json").write_text(
        scenario.model_dump_json(by_alias=True, indent=2)
    )

    client = p.connect(p.DIRECT)
    try:
        physics = scenario.environment.physics
        p.resetSimulation()
        p.setGravity(*physics.gravity.list())
        p.setTimeStep(physics.time_step)

        floor_shape = p.createCollisionShape(p.GEOM_BOX, halfExtents=[6.0, 2.2, 0.04])
        floor_visual = p.createVisualShape(
            p.GEOM_BOX, halfExtents=[6.0, 2.2, 0.04], rgbaColor=[0.16, 0.2, 0.22, 1]
        )
        floor_id = p.createMultiBody(
            baseMass=0,
            baseCollisionShapeIndex=floor_shape,
            baseVisualShapeIndex=floor_visual,
            basePosition=[2.7, 0, -0.04],
        )
        p.changeDynamics(floor_id, -1, lateralFriction=physics.floor_friction)

        robot_id = _create_box(
            [0.32, 0.26, 0.18],
            scenario.robot.start_pose.position.list(),
            [0.1, 0.95, 0.88, 1],
        )
        obstacle = next(obj for obj in scenario.objects if obj.id == "box_1")
        box_id = _create_box(
            [obstacle.dimensions.x / 2, obstacle.dimensions.y / 2, obstacle.dimensions.z / 2],
            obstacle.pose.position.list(),
            [0.93, 0.35, 0.12, 1],
        )
        actor = scenario.dynamic_actors[0]
        human_id = _create_box(
            [actor.dimensions.x / 2, actor.dimensions.y / 2, actor.dimensions.z / 2],
            actor.trajectory[0].list(),
            [0.93, 0.76, 0.22, 1],
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

        body_registry = {
            floor_id: (CLASS_IDS["floor"], 1),
            robot_id: (CLASS_IDS["mobile_base"], 2),
            cup_id: (CLASS_IDS["cup"], 3),
            box_id: (CLASS_IDS["obstacle"], 4),
            human_id: (CLASS_IDS["pedestrian"], 5),
        }
        metadata = {
            robot_id: {"instance_id": "robot_1", "class_name": "mobile_base"},
            cup_id: {"instance_id": "cup_1", "class_name": "cup"},
            box_id: {"instance_id": "box_1", "class_name": "obstacle"},
            human_id: {"instance_id": "worker_1", "class_name": "pedestrian"},
            goal_id: {"instance_id": "goal_1", "class_name": "goal"},
        }

        duration = scenario.task.termination.timeout_s
        capture_rate = scenario.sensors.capture_rate_hz
        frame_count = max(8, int(duration * capture_rate) + 1)
        water = 100.0
        total_reward = 0.0
        max_tilt = 0.0
        collisions = 0
        telemetry_rows: list[dict[str, float | int | bool]] = []
        previous_position = np.asarray(scenario.robot.start_pose.position.list()[:2])
        previous_velocity = 0.0

        for frame_index in range(frame_count):
            progress = frame_index / max(frame_count - 1, 1)
            time_s = progress * duration
            position_2d, yaw, turn = _route_position(progress)
            robot_position = np.asarray([position_2d[0], position_2d[1], 0.22])
            p.resetBasePositionAndOrientation(
                robot_id, robot_position.tolist(), p.getQuaternionFromEuler([0, 0, yaw])
            )

            actor_phase = min(1.0, time_s * actor.speed_mps / 2.9)
            actor_start = np.asarray(actor.trajectory[0].list())
            actor_end = np.asarray(actor.trajectory[-1].list())
            actor_position = actor_start * (1 - actor_phase) + actor_end * actor_phase
            p.resetBasePositionAndOrientation(human_id, actor_position.tolist(), [0, 0, 0, 1])

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
                [math.cos(yaw) * 0.1, math.sin(yaw) * 0.1, 0.44]
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
            contact_now = bool(p.getContactPoints(robot_id, box_id) or p.getContactPoints(robot_id, human_id))
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
            with store.lock:
                current = store.runs[run_id]
                current.progress = progress
                current.latest_telemetry = telemetry
                current.updated_at = datetime.now(timezone.utc)

            previous_position = position_2d
            previous_velocity = float(velocity)

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

        with store.lock:
            current = store.runs[run_id]
            current.status = "completed"
            current.progress = 1.0
            current.summary = summary
            current.updated_at = datetime.now(timezone.utc)
            current.artifacts.update(
                {
                    "first_rgb": f"/artifacts/runs/{run_id}/sensor_data/rgb/000000.png",
                    "last_rgb": f"/artifacts/runs/{run_id}/sensor_data/rgb/{frame_count - 1:06d}.png",
                    "telemetry": f"/artifacts/runs/{run_id}/eval/telemetry.json",
                    "summary": f"/artifacts/runs/{run_id}/eval/summary.json",
                }
            )
    except Exception as exc:
        with store.lock:
            current = store.runs[run_id]
            current.status = "failed"
            current.error = str(exc)
            current.updated_at = datetime.now(timezone.utc)
        raise
    finally:
        p.disconnect(client)
