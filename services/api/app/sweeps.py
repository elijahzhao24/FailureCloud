from __future__ import annotations

import itertools
import os
import threading

import httpx

from .models import (
    RunManifest,
    SweepSpecification,
    SweepSummary,
    SweepVariantResult,
)
from .store import store


def _local_variant(
    manifest: RunManifest, variant_id: str, parameters: dict[str, float]
) -> SweepVariantResult:
    scenario = manifest.scenario
    friction = parameters.get(
        "floor_friction", scenario.environment.physics.floor_friction
    )
    speed = parameters.get("robot_speed", scenario.robot.speed_mps)
    obstacle_offset = parameters.get("obstacle_offset", 0.18)
    human_speed = parameters.get(
        "human_crossing_speed",
        scenario.dynamic_actors[0].speed_mps if scenario.dynamic_actors else 0.0,
    )
    slip = 1.0 - min(1.0, friction)
    spill = 9.0 + slip * 37.0 + speed * 16.0 + max(0.0, speed - 0.85) * 18.0
    collision_risk = abs(obstacle_offset) < 0.08 and speed > 1.0
    crossing_risk = 0.45 < human_speed < 0.75 and speed > 1.15
    collisions = int(collision_risk or crossing_risk)
    water = max(0.0, 100.0 - spill - collisions * 8.0)
    success = water >= scenario.task.success.min_water_left_percent and collisions == 0
    reward = 20.0 if success else -((100.0 - water) * 0.08 + collisions * 10.0)
    reason = None
    if not success:
        reason = (
            "Collision limit exceeded."
            if collisions
            else "Water retention fell below the configured threshold."
        )
    return SweepVariantResult(
        variant_id=variant_id,
        parameters=parameters,
        success=success,
        water_left_percent=round(water, 2),
        collisions=collisions,
        reward=round(reward, 2),
        failure_reason=reason,
    )


def create_sweep(
    run_id: str, specification: SweepSpecification
) -> SweepSummary:
    with store.lock:
        run = store.runs[run_id]
        sweep_id = store.new_id("sweep")
        summary = SweepSummary(
            sweep_id=sweep_id,
            run_id=run_id,
            status="queued",
            provider="nebius" if os.getenv("NEBIUS_EXECUTION_ENDPOINT") else "local_fallback",
            specification=specification,
        )
        store.sweeps[sweep_id] = summary
    threading.Thread(
        target=_execute_sweep, args=(run, sweep_id), daemon=True
    ).start()
    return summary


def _execute_sweep(run: RunManifest, sweep_id: str) -> None:
    with store.lock:
        store.sweeps[sweep_id].status = "running"
        specification = store.sweeps[sweep_id].specification
    try:
        endpoint = os.getenv("NEBIUS_EXECUTION_ENDPOINT")
        api_key = os.getenv("NEBIUS_API_KEY")
        if endpoint and api_key:
            response = httpx.post(
                endpoint,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "run_id": run.run_id,
                    "scenario": run.scenario.model_dump(by_alias=True),
                    "specification": specification.model_dump(),
                },
                timeout=60,
            )
            response.raise_for_status()
            payload = response.json()
            results = [
                SweepVariantResult.model_validate(item)
                for item in payload.get("results", [])
            ]
            if not results:
                raise ValueError("Nebius job returned no normalized results")
            provider = "nebius"
        else:
            axes = specification.axes
            results = []
            for index, values in enumerate(
                itertools.product(axes[0].values, axes[1].values)
            ):
                parameters = {
                    axes[0].name: values[0],
                    axes[1].name: values[1],
                }
                results.append(_local_variant(run, f"variant_{index:03d}", parameters))
            provider = "local_fallback"
        success_rate = (
            sum(1 for result in results if result.success) / len(results) if results else 0.0
        )
        with store.lock:
            current = store.sweeps[sweep_id]
            current.results = results
            current.success_rate = round(success_rate, 4)
            current.provider = provider
            current.status = "completed"
    except Exception as exc:
        axes = specification.axes
        results = [
            _local_variant(
                run,
                f"variant_{index:03d}",
                {axes[0].name: values[0], axes[1].name: values[1]},
            )
            for index, values in enumerate(
                itertools.product(axes[0].values, axes[1].values)
            )
        ]
        with store.lock:
            current = store.sweeps[sweep_id]
            current.results = results
            current.success_rate = round(
                sum(1 for result in results if result.success) / len(results), 4
            )
            current.provider = "local_fallback"
            current.status = "completed"
            current.error = f"Nebius unavailable; local sweep completed: {exc}"

