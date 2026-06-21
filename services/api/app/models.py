from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Vec3(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def list(self) -> list[float]:
        return [self.x, self.y, self.z]


class Pose(BaseModel):
    position: Vec3 = Field(default_factory=Vec3)
    yaw: float = 0.0


class PhysicsConfig(BaseModel):
    gravity: Vec3 = Field(default_factory=lambda: Vec3(z=-9.81))
    floor_friction: float = Field(default=0.22, ge=0.02, le=2.0)
    time_step: float = Field(default=1 / 240, gt=0.0, le=0.05)


class EnvironmentConfig(BaseModel):
    type: Literal["warehouse"] = "warehouse"
    lighting: str = "industrial_night"
    weather: str = "none"
    physics: PhysicsConfig = Field(default_factory=PhysicsConfig)


class RobotConfig(BaseModel):
    type: Literal["mobile_base"] = "mobile_base"
    asset_ref: str = "primitive://mobile-base"
    start_pose: Pose = Field(default_factory=Pose)
    goal_pose: Pose = Field(
        default_factory=lambda: Pose(position=Vec3(x=5.4, y=0.0, z=0.22))
    )
    speed_mps: float = Field(default=0.85, gt=0.1, le=3.0)


class SceneObject(BaseModel):
    id: str
    class_name: str = Field(alias="class")
    asset_ref: str = "primitive://box"
    pose: Pose
    dimensions: Vec3 = Field(default_factory=lambda: Vec3(x=0.5, y=0.5, z=0.5))
    properties: dict[str, str | float | int | bool] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class DynamicActor(BaseModel):
    id: str
    class_name: str = Field(alias="class")
    trajectory: list[Vec3]
    speed_mps: float = Field(default=0.6, gt=0.0, le=3.0)
    dimensions: Vec3 = Field(default_factory=lambda: Vec3(x=0.4, y=0.4, z=1.7))

    model_config = ConfigDict(populate_by_name=True)


class CameraConfig(BaseModel):
    enabled: bool = True
    width: int = Field(default=480, ge=64, le=1920)
    height: int = Field(default=270, ge=64, le=1080)
    fov_deg: float = Field(default=72, ge=20, le=140)
    near_m: float = Field(default=0.02, gt=0.0)
    far_m: float = Field(default=20.0, gt=1.0)


class LidarConfig(BaseModel):
    enabled: bool = True
    num_rays: int = Field(default=720, ge=32, le=4096)
    range_m: float = Field(default=12.0, gt=1.0, le=100.0)
    height_m: float = Field(default=0.55, ge=0.05, le=5.0)


class SensorConfig(BaseModel):
    rgb_camera: CameraConfig = Field(default_factory=CameraConfig)
    depth_camera: CameraConfig = Field(default_factory=CameraConfig)
    lidar: LidarConfig = Field(default_factory=LidarConfig)
    capture_rate_hz: float = Field(default=5.0, gt=0.1, le=30.0)


class TerminationConfig(BaseModel):
    timeout_s: float = Field(default=8.0, ge=1.0, le=120.0)
    on_collision: bool = False


class SuccessConfig(BaseModel):
    goal_reached: bool = True
    min_water_left_percent: float = Field(default=70.0, ge=0.0, le=100.0)
    max_collisions: int = Field(default=0, ge=0)


class RewardConfig(BaseModel):
    goal_progress: float = 1.0
    collision_penalty: float = -10.0
    spill_penalty: float = -0.08
    success_bonus: float = 20.0


class TaskConfig(BaseModel):
    type: Literal["carry_object_to_goal"] = "carry_object_to_goal"
    termination: TerminationConfig = Field(default_factory=TerminationConfig)
    success: SuccessConfig = Field(default_factory=SuccessConfig)
    reward: RewardConfig = Field(default_factory=RewardConfig)


ExportName = Literal["pybullet", "ros2_folder", "openpcdet", "isaac", "nebius"]
SensorName = Literal["rgb", "depth", "lidar", "collision", "pose"]


class ScenarioV01(BaseModel):
    schema_version: Literal["0.1.0"] = "0.1.0"
    scenario_id: str
    name: str
    domain: Literal["warehouse_robotics"] = "warehouse_robotics"
    seed: int = 42
    environment: EnvironmentConfig = Field(default_factory=EnvironmentConfig)
    robot: RobotConfig = Field(default_factory=RobotConfig)
    objects: list[SceneObject]
    dynamic_actors: list[DynamicActor] = Field(default_factory=list)
    sensors: SensorConfig = Field(default_factory=SensorConfig)
    task: TaskConfig = Field(default_factory=TaskConfig)
    exports: list[ExportName] = Field(
        default_factory=lambda: ["pybullet", "ros2_folder", "openpcdet", "isaac", "nebius"]
    )

    @model_validator(mode="after")
    def unique_ids(self) -> "ScenarioV01":
        ids = [obj.id for obj in self.objects] + [actor.id for actor in self.dynamic_actors]
        if len(ids) != len(set(ids)):
            raise ValueError("Object and actor IDs must be globally unique")
        return self


class CompileRequest(BaseModel):
    prompt: str = Field(min_length=8, max_length=4000)


class ValidationIssue(BaseModel):
    path: str
    message: str
    severity: Literal["error", "warning"]


class ValidationReport(BaseModel):
    valid: bool
    issues: list[ValidationIssue] = Field(default_factory=list)
    normalized: bool = True


class CompileResponse(BaseModel):
    scenario: ScenarioV01
    validation_report: ValidationReport
    compiler: Literal["anthropic", "deterministic"]


class TestGenerationRequest(BaseModel):
    task: str = Field(min_length=8, max_length=2000)
    mode: Literal["normal_task", "exact_failure"] = "normal_task"
    robot_type: Literal["mobile_base"] = "mobile_base"
    environment: Literal["warehouse"] = "warehouse"
    sensors: list[SensorName] = Field(
        default_factory=lambda: ["rgb", "depth", "lidar", "collision", "pose"],
        min_length=1,
    )
    export_targets: list[ExportName] = Field(
        default_factory=lambda: [
            "pybullet",
            "ros2_folder",
            "openpcdet",
            "isaac",
            "nebius",
        ],
        min_length=1,
    )


class RobotTestSuggestion(BaseModel):
    test_id: str
    title: str
    summary: str
    difficulty: Literal["medium", "hard"]
    sensors: list[SensorName]
    success_criteria: str
    failure_risks: list[str] = Field(min_length=1)
    scenario: ScenarioV01


class TestGenerationResponse(BaseModel):
    source_task: str
    mode: Literal["normal_task", "exact_failure"]
    suggestions: list[RobotTestSuggestion] = Field(min_length=1, max_length=5)
    generator: Literal["anthropic", "deterministic"]


class RunCreateRequest(BaseModel):
    scenario: ScenarioV01


class EpisodeSummary(BaseModel):
    success: bool
    failure_code: str | None = None
    failure_reason: str | None = None
    goal_reached: bool
    water_left_percent: float
    collisions: int
    max_cup_tilt_deg: float
    total_reward: float
    duration_s: float
    frame_count: int


class RunManifest(BaseModel):
    run_id: str
    status: Literal["queued", "running", "completed", "failed"]
    progress: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    scenario: ScenarioV01
    latest_telemetry: dict[str, float | int | str | bool] = Field(default_factory=dict)
    summary: EpisodeSummary | None = None
    artifacts: dict[str, str] = Field(default_factory=dict)
    error: str | None = None


class VisualPreviewRequest(BaseModel):
    scenario: ScenarioV01


class VisualPreviewStatus(BaseModel):
    preview_id: str
    status: Literal["queued", "generating", "completed", "failed", "timed_out"]
    provider: Literal["reactor", "local_fallback"]
    media_url: str | None = None
    poster_url: str | None = None
    illustrative_only: bool = True
    error: str | None = None


class ReactorTokenResponse(BaseModel):
    jwt: str
    expires_at: int


class SweepAxis(BaseModel):
    name: Literal[
        "floor_friction", "robot_speed", "obstacle_offset", "human_crossing_speed"
    ]
    values: list[float] = Field(min_length=2, max_length=8)


class SweepSpecification(BaseModel):
    axes: list[SweepAxis] = Field(
        default_factory=lambda: [
            SweepAxis(name="floor_friction", values=[0.12, 0.2, 0.32, 0.5]),
            SweepAxis(name="robot_speed", values=[0.55, 0.8, 1.05, 1.3]),
        ],
        min_length=2,
        max_length=2,
    )


class SweepCreateRequest(BaseModel):
    specification: SweepSpecification = Field(default_factory=SweepSpecification)


class SweepVariantResult(BaseModel):
    variant_id: str
    parameters: dict[str, float]
    success: bool
    water_left_percent: float
    collisions: int
    reward: float
    failure_reason: str | None


class SweepSummary(BaseModel):
    sweep_id: str
    run_id: str
    status: Literal["queued", "running", "completed", "failed"]
    provider: Literal["nebius", "local_fallback"]
    specification: SweepSpecification
    results: list[SweepVariantResult] = Field(default_factory=list)
    success_rate: float = 0.0
    error: str | None = None
