from __future__ import annotations

from .compiler import validation_report
from .models import ScenarioVariantResponse, ScenarioV01


def harder_variant(scenario: ScenarioV01) -> ScenarioVariantResponse:
    variant = scenario.model_copy(deep=True)
    changes: list[str] = []

    old_friction = variant.environment.physics.floor_friction
    variant.environment.physics.floor_friction = max(0.05, round(old_friction * 0.72, 3))
    changes.append(
        f"Floor friction reduced from {old_friction:.2f} to "
        f"{variant.environment.physics.floor_friction:.2f}."
    )

    old_speed = variant.robot.speed_mps
    variant.robot.speed_mps = min(3.0, round(old_speed * 1.18, 3))
    changes.append(
        f"Robot speed increased from {old_speed:.2f} to "
        f"{variant.robot.speed_mps:.2f} m/s."
    )

    obstacle = next(
        (item for item in variant.objects if item.class_name == "obstacle"),
        None,
    )
    if obstacle is not None:
        old_offset = obstacle.pose.position.y
        obstacle.pose.position.y = round(old_offset * 0.55, 3)
        changes.append("The primary obstacle was moved closer to the planned route.")

    if variant.dynamic_actors:
        actor = variant.dynamic_actors[0]
        old_actor_speed = actor.speed_mps
        actor.speed_mps = min(3.0, round(old_actor_speed * 1.2, 3))
        changes.append(
            f"Crossing actor speed increased from {old_actor_speed:.2f} to "
            f"{actor.speed_mps:.2f} m/s."
        )

    old_water = variant.task.success.min_water_left_percent
    variant.task.success.min_water_left_percent = min(95.0, old_water + 10.0)
    changes.append(
        f"Minimum water remaining increased from {old_water:.0f}% to "
        f"{variant.task.success.min_water_left_percent:.0f}%."
    )

    old_timeout = variant.task.termination.timeout_s
    variant.task.termination.timeout_s = max(1.0, round(old_timeout * 0.85, 2))
    changes.append(
        f"Timeout reduced from {old_timeout:.1f}s to "
        f"{variant.task.termination.timeout_s:.1f}s."
    )

    if not variant.name.endswith("— harder"):
        variant.name = f"{variant.name} — harder"
    if not variant.scenario_id.endswith("_harder"):
        variant.scenario_id = f"{variant.scenario_id}_harder"

    return ScenarioVariantResponse(
        scenario=variant,
        validation_report=validation_report(variant),
        strategy="harder",
        changes=changes,
    )
