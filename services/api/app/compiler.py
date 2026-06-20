from __future__ import annotations

import json
import os
import re
from typing import Any

from anthropic import Anthropic
from pydantic import ValidationError

from .models import (
    CompileResponse,
    DynamicActor,
    EnvironmentConfig,
    PhysicsConfig,
    Pose,
    RobotConfig,
    ScenarioV01,
    SceneObject,
    SensorConfig,
    TaskConfig,
    ValidationIssue,
    ValidationReport,
    Vec3,
)


def deterministic_scenario(prompt: str) -> ScenarioV01:
    normalized = re.sub(r"\s+", " ", prompt.strip().lower())
    friction = 0.22
    if "very slippery" in normalized or "ice" in normalized:
        friction = 0.1
    elif "slippery" not in normalized:
        friction = 0.45

    speed = 0.85
    if "fast" in normalized or "quickly" in normalized:
        speed = 1.2
    elif "slow" in normalized or "careful" in normalized:
        speed = 0.6

    lighting = "industrial_night" if any(
        token in normalized for token in ("dim", "night", "dark")
    ) else "warehouse_day"

    return ScenarioV01(
        scenario_id="fc_slippery_carry_001",
        name="Slippery cup carry",
        environment=EnvironmentConfig(
            lighting=lighting,
            physics=PhysicsConfig(floor_friction=friction),
        ),
        robot=RobotConfig(
            speed_mps=speed,
            start_pose=Pose(position=Vec3(x=0.0, y=0.0, z=0.22)),
            goal_pose=Pose(position=Vec3(x=5.4, y=0.0, z=0.22)),
        ),
        objects=[
            SceneObject(
                id="cup_1",
                **{"class": "cup"},
                asset_ref="primitive://cup",
                pose=Pose(position=Vec3(x=0.1, y=0.0, z=0.72)),
                dimensions=Vec3(x=0.16, y=0.16, z=0.22),
                properties={"contains": "water", "initial_water_percent": 100},
            ),
            SceneObject(
                id="box_1",
                **{"class": "obstacle"},
                asset_ref="primitive://box",
                pose=Pose(position=Vec3(x=2.65, y=0.18, z=0.28), yaw=0.12),
                dimensions=Vec3(x=0.65, y=0.75, z=0.56),
            ),
        ],
        dynamic_actors=[
            DynamicActor(
                id="worker_1",
                **{"class": "pedestrian"},
                trajectory=[
                    Vec3(x=3.85, y=-1.45, z=0.85),
                    Vec3(x=3.85, y=1.45, z=0.85),
                ],
                speed_mps=0.62,
            )
        ],
        sensors=SensorConfig(),
        task=TaskConfig(),
    )


def validation_report(scenario: ScenarioV01) -> ValidationReport:
    issues: list[ValidationIssue] = []
    if scenario.environment.physics.floor_friction < 0.15:
        issues.append(
            ValidationIssue(
                path="environment.physics.floor_friction",
                message="Extremely low friction may produce unstable motion.",
                severity="warning",
            )
        )
    if not scenario.dynamic_actors:
        issues.append(
            ValidationIssue(
                path="dynamic_actors",
                message="No dynamic actor is present; the edge case will be less challenging.",
                severity="warning",
            )
        )
    return ValidationReport(valid=True, issues=issues)


def compile_prompt(prompt: str) -> CompileResponse:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        scenario = deterministic_scenario(prompt)
        return CompileResponse(
            scenario=scenario,
            validation_report=validation_report(scenario),
            compiler="deterministic",
        )

    try:
        client = Anthropic(api_key=api_key)
        template = deterministic_scenario(prompt)
        schema = ScenarioV01.model_json_schema(by_alias=True)
        response = client.messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
            max_tokens=3000,
            system=(
                "You compile natural-language warehouse robot failure cases into "
                "strictly executable FailureCloud scenarios. Preserve the schema, "
                "use primitive:// assets, and never add unsupported fields."
            ),
            tools=[
                {
                    "name": "emit_scenario",
                    "description": "Emit the normalized FailureCloud scenario.",
                    "input_schema": schema,
                }
            ],
            tool_choice={"type": "tool", "name": "emit_scenario"},
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Prompt: {prompt}\n"
                        "Use this deterministic scenario as a safe baseline and only "
                        f"adjust values supported by the prompt:\n{template.model_dump_json(by_alias=True)}"
                    ),
                }
            ],
        )
        tool_block = next(block for block in response.content if block.type == "tool_use")
        scenario = ScenarioV01.model_validate(tool_block.input)
        return CompileResponse(
            scenario=scenario,
            validation_report=validation_report(scenario),
            compiler="anthropic",
        )
    except (StopIteration, ValidationError, ValueError, json.JSONDecodeError, Exception):
        scenario = deterministic_scenario(prompt)
        return CompileResponse(
            scenario=scenario,
            validation_report=ValidationReport(
                valid=True,
                normalized=True,
                issues=[
                    ValidationIssue(
                        path="compiler",
                        message="Claude was unavailable or returned an invalid scenario; deterministic fallback used.",
                        severity="warning",
                    )
                ],
            ),
            compiler="deterministic",
        )


def validate_payload(payload: dict[str, Any]) -> tuple[ScenarioV01 | None, ValidationReport]:
    try:
        scenario = ScenarioV01.model_validate(payload)
        return scenario, validation_report(scenario)
    except ValidationError as exc:
        issues = [
            ValidationIssue(
                path=".".join(str(part) for part in error["loc"]),
                message=error["msg"],
                severity="error",
            )
            for error in exc.errors()
        ]
        return None, ValidationReport(valid=False, normalized=False, issues=issues)

