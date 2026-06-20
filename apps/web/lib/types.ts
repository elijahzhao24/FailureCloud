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
  progress: number;
  scenario: Scenario;
  latest_telemetry: Record<string, string | number | boolean>;
  summary: EpisodeSummary | null;
  artifacts: Record<string, string>;
  error: string | null;
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

