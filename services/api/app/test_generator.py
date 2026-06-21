from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from typing import Literal

from anthropic import Anthropic
from pydantic import BaseModel, Field, ValidationError

from .compiler import deterministic_scenario
from .models import (
    RobotTestSuggestion,
    ScenarioV01,
    TestGenerationRequest,
    TestGenerationResponse,
)


class SuggestionIdea(BaseModel):
    title: str = Field(min_length=3, max_length=80)
    summary: str = Field(min_length=12, max_length=240)
    difficulty: Literal["medium", "hard"]
    failure_risks: list[str] = Field(min_length=1, max_length=4)


class SuggestionIdeas(BaseModel):
    suggestions: list[SuggestionIdea] = Field(min_length=5, max_length=5)


@dataclass(frozen=True)
class SuggestionTemplate:
    title: str
    summary: str
    difficulty: Literal["medium", "hard"]
    failure_risks: tuple[str, ...]
    success_criteria: str


TEMPLATES = (
    SuggestionTemplate(
        title="Slippery Floor Turn",
        summary=(
            "The robot crosses a low-friction patch while turning and must keep "
            "its payload stable."
        ),
        difficulty="medium",
        failure_risks=("spill", "path deviation", "timeout"),
        success_criteria="Reach the goal with at least 70% water remaining and no collisions.",
    ),
    SuggestionTemplate(
        title="Dropped Box Obstacle",
        summary=(
            "A dropped package blocks the direct route and forces a controlled "
            "detour through the aisle."
        ),
        difficulty="medium",
        failure_risks=("collision", "spill", "timeout"),
        success_criteria="Clear the obstacle, reach the goal, and record zero collisions.",
    ),
    SuggestionTemplate(
        title="Human Crossing Aisle",
        summary=(
            "A warehouse worker crosses the route mid-task, testing perception "
            "and safe yielding behavior."
        ),
        difficulty="hard",
        failure_risks=("human collision", "sudden stop", "spill"),
        success_criteria="Yield safely, reach the goal, and retain at least 70% of the payload.",
    ),
    SuggestionTemplate(
        title="Low Light + Reflective Floor",
        summary=(
            "Dim warehouse lighting and a reflective surface reduce the quality "
            "of camera and depth observations."
        ),
        difficulty="hard",
        failure_risks=("missed obstacle", "localization error", "collision"),
        success_criteria="Reach the goal using the configured sensors with no collisions.",
    ),
    SuggestionTemplate(
        title="Sudden Stop Spill",
        summary=(
            "The robot approaches the goal at higher speed and must brake without "
            "destabilizing the carried water."
        ),
        difficulty="hard",
        failure_risks=("spill", "goal overshoot", "collision"),
        success_criteria="Stop inside the goal with at least 80% water remaining.",
    ),
)


def _stable_suffix(task: str) -> str:
    return hashlib.sha256(task.strip().lower().encode("utf-8")).hexdigest()[:8]


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return normalized[:48] or "robot-test"


def _configure_variant(base: ScenarioV01, index: int) -> ScenarioV01:
    scenario = base.model_copy(deep=True)

    if index == 0:
        scenario.environment.physics.floor_friction = 0.18
        scenario.robot.speed_mps = 0.9
        scenario.objects[1].pose.position.y = 0.85
        scenario.dynamic_actors = []
    elif index == 1:
        scenario.environment.physics.floor_friction = 0.45
        scenario.objects[1].pose.position.x = 2.65
        scenario.objects[1].pose.position.y = 0.05
        scenario.dynamic_actors = []
    elif index == 2:
        scenario.environment.physics.floor_friction = 0.45
        scenario.objects[1].pose.position.y = 1.15
        scenario.dynamic_actors[0].speed_mps = 0.95
    elif index == 3:
        scenario.environment.lighting = "low_light_reflective"
        scenario.environment.physics.floor_friction = 0.32
        scenario.objects[1].pose.position.y = 0.35
        scenario.dynamic_actors = []
    else:
        scenario.environment.physics.floor_friction = 0.35
        scenario.robot.speed_mps = 1.25
        scenario.objects[1].pose.position.y = 0.9
        scenario.dynamic_actors = []
        scenario.task.success.min_water_left_percent = 80.0

    return scenario


def _apply_request_settings(
    scenario: ScenarioV01,
    request: TestGenerationRequest,
) -> ScenarioV01:
    scenario.environment.type = request.environment
    scenario.robot.type = request.robot_type
    scenario.robot.asset_ref = (
        request.custom_robot_asset_ref
        if request.robot_type == "custom_urdf"
        else f"primitive://{request.robot_type.replace('_', '-')}"
    )
    scenario.sensors.rgb_camera.enabled = "rgb" in request.sensors
    scenario.sensors.depth_camera.enabled = "depth" in request.sensors
    scenario.sensors.lidar.enabled = "lidar" in request.sensors
    scenario.exports = list(request.export_targets)
    return scenario


def _anthropic_ideas(task: str) -> list[SuggestionIdea] | None:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    try:
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
            max_tokens=1200,
            system=(
                "You are a robotics test engineer. Produce five concise, distinct "
                "warehouse mobile-robot edge cases. Do not claim unsupported physics "
                "or sensors. Focus on hazards, observability, and measurable failure."
            ),
            tools=[
                {
                    "name": "emit_test_suggestions",
                    "description": "Emit five robot test suggestion summaries.",
                    "input_schema": SuggestionIdeas.model_json_schema(),
                }
            ],
            tool_choice={"type": "tool", "name": "emit_test_suggestions"},
            messages=[{"role": "user", "content": f"Robot task: {task}"}],
        )
        tool_block = next(block for block in response.content if block.type == "tool_use")
        return SuggestionIdeas.model_validate(tool_block.input).suggestions
    except (StopIteration, ValidationError, ValueError, Exception):
        return None


def _exact_failure(request: TestGenerationRequest) -> TestGenerationResponse:
    suffix = _stable_suffix(request.task)
    scenario = _apply_request_settings(deterministic_scenario(request.task), request)
    scenario.scenario_id = f"fc_exact_{suffix}"
    scenario.name = "Exact requested failure"
    title = request.task.strip().rstrip(".")
    if len(title) > 72:
        title = f"{title[:69].rstrip()}…"

    suggestion = RobotTestSuggestion(
        test_id=f"exact-{suffix}",
        title=title,
        summary=(
            "A direct executable scenario built from the requested failure case, "
            "with canonical sensors and evaluation criteria."
        ),
        difficulty="hard",
        sensors=list(request.sensors),
        success_criteria=(
            "Reach the goal with at least "
            f"{scenario.task.success.min_water_left_percent:.0f}% water remaining "
            "and no collisions."
        ),
        failure_risks=["requested failure", "collision", "timeout"],
        scenario=scenario,
    )
    return TestGenerationResponse(
        source_task=request.task,
        mode=request.mode,
        suggestions=[suggestion],
        generator="deterministic",
    )


def generate_test_suggestions(
    request: TestGenerationRequest,
) -> TestGenerationResponse:
    if request.mode == "exact_failure":
        return _exact_failure(request)

    ideas = _anthropic_ideas(request.task)
    generator: Literal["anthropic", "deterministic"] = (
        "anthropic" if ideas is not None else "deterministic"
    )
    base = deterministic_scenario(request.task)
    suffix = _stable_suffix(request.task)
    suggestions: list[RobotTestSuggestion] = []

    for index, template in enumerate(TEMPLATES):
        idea = ideas[index] if ideas is not None else None
        title = idea.title if idea else template.title
        scenario = _apply_request_settings(
            _configure_variant(base, index),
            request,
        )
        scenario.scenario_id = f"fc_{_slug(title)}_{index + 1}_{suffix}"
        scenario.name = title
        suggestions.append(
            RobotTestSuggestion(
                test_id=f"{_slug(title)}-{index + 1}-{suffix}",
                title=title,
                summary=idea.summary if idea else template.summary,
                difficulty=idea.difficulty if idea else template.difficulty,
                sensors=list(request.sensors),
                success_criteria=template.success_criteria,
                failure_risks=(
                    idea.failure_risks if idea else list(template.failure_risks)
                ),
                scenario=scenario,
            )
        )

    return TestGenerationResponse(
        source_task=request.task,
        mode=request.mode,
        suggestions=suggestions,
        generator=generator,
    )
