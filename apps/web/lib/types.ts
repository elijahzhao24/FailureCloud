export type Vec3 = { x: number; y: number; z: number };
export type Pose = { position: Vec3; yaw: number };

export type Scenario = {
  schema_version: "0.1.0";
  scenario_id: string;
  name: string;
  domain: "warehouse_robotics";
  seed: number;
  environment: {
    type: "warehouse";
    lighting: string;
    weather: string;
    physics: {
      gravity: Vec3;
      floor_friction: number;
      time_step: number;
    };
  };
  robot: {
    type: "mobile_base";
    asset_ref: string;
    start_pose: Pose;
    goal_pose: Pose;
    speed_mps: number;
  };
  objects: Array<{
    id: string;
    class: string;
    asset_ref: string;
    pose: Pose;
    dimensions: Vec3;
    properties: Record<string, string | number | boolean>;
  }>;
  dynamic_actors: Array<{
    id: string;
    class: string;
    trajectory: Vec3[];
    speed_mps: number;
    dimensions: Vec3;
  }>;
  sensors: {
    rgb_camera: Camera;
    depth_camera: Camera;
    lidar: { enabled: boolean; num_rays: number; range_m: number; height_m: number };
    capture_rate_hz: number;
  };
  task: {
    type: string;
    termination: { timeout_s: number; on_collision: boolean };
    success: {
      goal_reached: boolean;
      min_water_left_percent: number;
      max_collisions: number;
    };
    reward: {
      goal_progress: number;
      collision_penalty: number;
      spill_penalty: number;
      success_bonus: number;
    };
  };
  exports: string[];
};

type Camera = {
  enabled: boolean;
  width: number;
  height: number;
  fov_deg: number;
  near_m: number;
  far_m: number;
};

export type ValidationReport = {
  valid: boolean;
  normalized: boolean;
  issues: Array<{ path: string; message: string; severity: "error" | "warning" }>;
};

export type CompileResponse = {
  scenario: Scenario;
  validation_report: ValidationReport;
  compiler: "anthropic" | "deterministic";
};

export type SensorName = "rgb" | "depth" | "lidar" | "collision" | "pose";
export type ExportName =
  | "pybullet"
  | "ros2_folder"
  | "openpcdet"
  | "isaac"
  | "nebius";

export type TestGenerationRequest = {
  task: string;
  mode: "normal_task" | "exact_failure";
  robot_type: "mobile_base";
  environment: "warehouse";
  sensors: SensorName[];
  export_targets: ExportName[];
};

export type RobotTestSuggestion = {
  test_id: string;
  title: string;
  summary: string;
  difficulty: "medium" | "hard";
  sensors: SensorName[];
  success_criteria: string;
  failure_risks: string[];
  scenario: Scenario;
};

export type TestGenerationResponse = {
  source_task: string;
  mode: TestGenerationRequest["mode"];
  suggestions: RobotTestSuggestion[];
  generator: "anthropic" | "deterministic";
};

export type ScenarioValidationResponse = {
  scenario: Scenario | null;
  validation_report: ValidationReport;
};

export type ScenarioVariantResponse = {
  scenario: Scenario;
  validation_report: ValidationReport;
  strategy: "harder";
  changes: string[];
};

export type EpisodeSummary = {
  success: boolean;
  failure_code: string | null;
  failure_reason: string | null;
  goal_reached: boolean;
  water_left_percent: number;
  collisions: number;
  max_cup_tilt_deg: number;
  total_reward: number;
  duration_s: number;
  frame_count: number;
};

export type RunManifest = {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed";
  phase:
    | "queued"
    | "compiling_scenario"
    | "building_simulation"
    | "running_robot_test"
    | "recording_sensors"
    | "generating_labels"
    | "evaluating_result"
    | "packaging_artifacts"
    | "completed"
    | "failed";
  progress: number;
  scenario: Scenario;
  latest_telemetry: Record<string, string | number | boolean>;
  summary: EpisodeSummary | null;
  artifacts: Record<string, string>;
  error: string | null;
};

export type FrameRecord = {
  frame_id: string;
  index: number;
  timestamp_s: number;
  rgb_url: string;
  depth_preview_url: string;
  segmentation_preview_url: string;
  lidar_preview_url: string;
  labels_url: string;
  lidar_points: number;
  telemetry: {
    frame: number;
    time_s: number;
    progress: number;
    water_left_percent: number;
    cup_tilt_deg: number;
    collisions: number;
    distance_to_goal_m: number;
    reward: number;
    goal_reached: boolean;
  };
};

export type FrameManifest = {
  run_id: string;
  frame_count: number;
  capture_rate_hz: number;
  width: number;
  height: number;
  frames: FrameRecord[];
};

export type VisualPreviewStatus = {
  preview_id: string;
  status: "queued" | "generating" | "completed" | "failed" | "timed_out";
  provider: "reactor" | "local_fallback";
  media_url: string | null;
  poster_url: string | null;
  illustrative_only: boolean;
  error: string | null;
};

export type SweepVariant = {
  variant_id: string;
  parameters: Record<string, number>;
  success: boolean;
  water_left_percent: number;
  collisions: number;
  reward: number;
  failure_reason: string | null;
};

export type SweepSummary = {
  sweep_id: string;
  run_id: string;
  status: "queued" | "running" | "completed" | "failed";
  provider: "nebius" | "local_fallback";
  specification: {
    axes: Array<{ name: string; values: number[] }>;
  };
  results: SweepVariant[];
  success_rate: number;
  error: string | null;
};
