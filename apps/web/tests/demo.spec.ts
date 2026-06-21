import { expect, test } from "@playwright/test";

const titles = [
  "Slippery Floor Turn",
  "Dropped Box Obstacle",
  "Human Crossing Aisle",
  "Low Light + Reflective Floor",
  "Sudden Stop Spill",
];

function scenario(title: string, index: number) {
  return {
    schema_version: "0.1.0",
    scenario_id: `test-${index}`,
    name: title,
    domain: "warehouse_robotics",
    seed: 42,
    environment: {
      type: "warehouse",
      lighting: index === 3 ? "low_light_reflective" : "warehouse_day",
      weather: "none",
      physics: {
        gravity: { x: 0, y: 0, z: -9.81 },
        floor_friction: index === 0 ? 0.18 : 0.45,
        time_step: 1 / 240,
      },
    },
    robot: {
      type: "mobile_base",
      asset_ref: "primitive://mobile-base",
      start_pose: { position: { x: 0, y: 0, z: 0.22 }, yaw: 0 },
      goal_pose: { position: { x: 5.4, y: 0, z: 0.22 }, yaw: 0 },
      speed_mps: index === 4 ? 1.25 : 0.85,
    },
    objects: [],
    dynamic_actors: [],
    sensors: {
      rgb_camera: {
        enabled: true,
        width: 480,
        height: 270,
        fov_deg: 72,
        near_m: 0.02,
        far_m: 20,
      },
      depth_camera: {
        enabled: true,
        width: 480,
        height: 270,
        fov_deg: 72,
        near_m: 0.02,
        far_m: 20,
      },
      lidar: { enabled: true, num_rays: 720, range_m: 12, height_m: 0.55 },
      capture_rate_hz: 5,
    },
    task: {
      type: "carry_object_to_goal",
      termination: { timeout_s: 8, on_collision: false },
      success: {
        goal_reached: true,
        min_water_left_percent: index === 4 ? 80 : 70,
        max_collisions: 0,
      },
      reward: {
        goal_progress: 1,
        collision_penalty: -10,
        spill_penalty: -0.08,
        success_bonus: 20,
      },
    },
    exports: ["pybullet", "openpcdet"],
  };
}

test("moves from landing page through generated test selection", async ({
  page,
}) => {
  await page.route("**/v1/tests/generate", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source_task: request.task,
        mode: request.mode,
        generator: "deterministic",
        suggestions: titles.map((title, index) => ({
          test_id: `test-${index}`,
          title,
          summary: `Executable warehouse edge case ${index + 1}.`,
          difficulty: index < 2 ? "medium" : "hard",
          sensors: request.sensors,
          success_criteria:
            "Reach the goal with at least 70% water remaining and no collisions.",
          failure_risks: ["spill", "collision", "timeout"],
          scenario: scenario(title, index),
        })),
      }),
    });
  });
  await page.route("**/v1/scenarios/variant", async (route) => {
    const request = route.request().postDataJSON();
    const harder = structuredClone(request.scenario);
    harder.name = `${harder.name} — harder`;
    harder.scenario_id = `${harder.scenario_id}_harder`;
    harder.environment.physics.floor_friction = 0.13;
    harder.robot.speed_mps = 1.06;
    harder.task.success.min_water_left_percent = 80;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        scenario: harder,
        validation_report: { valid: true, normalized: true, issues: [] },
        strategy: "harder",
        changes: [
          "Floor friction reduced from 0.18 to 0.13.",
          "Robot speed increased from 0.90 to 1.06 m/s.",
          "The primary obstacle was moved closer to the planned route.",
          "Minimum water remaining increased from 70% to 80%.",
        ],
      }),
    });
  });
  await page.route("**/v1/scenarios/validate", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        scenario: route.request().postDataJSON(),
        validation_report: { valid: true, normalized: true, issues: [] },
      }),
    });
  });
  await page.route("**/v1/previews/reactor", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        preview_id: "preview-test",
        status: "queued",
        provider: "local_fallback",
        media_url: null,
        poster_url: null,
        illustrative_only: true,
        error: null,
      }),
    });
  });
  await page.route("**/v1/previews/reactor/preview-test", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        preview_id: "preview-test",
        status: "completed",
        provider: "local_fallback",
        media_url: null,
        poster_url: null,
        illustrative_only: true,
        error: null,
      }),
    });
  });
  await page.route("**/v1/runs", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-test",
        status: "completed",
        phase: "completed",
        progress: 1,
        scenario: request.scenario,
        latest_telemetry: {
          frame: 2,
          time_s: 1,
          progress: 1,
          water_left_percent: 61.5,
          cup_tilt_deg: 29.4,
          collisions: 0,
          distance_to_goal_m: 0,
          reward: -2.1,
          goal_reached: true,
        },
        summary: {
          success: false,
          failure_code: "INSUFFICIENT_WATER_REMAINING",
          failure_reason:
            "Robot reached the goal, but only 61.5% water remained.",
          goal_reached: true,
          water_left_percent: 61.5,
          collisions: 0,
          max_cup_tilt_deg: 29.4,
          total_reward: -2.1,
          duration_s: 1,
          frame_count: 3,
        },
        artifacts: {},
        error: null,
      }),
    });
  });
  await page.route("**/v1/runs/run-test", async (route) => {
    const editedScenario = scenario("Slippery Floor Turn — harder", 0);
    editedScenario.task.success.min_water_left_percent = 82;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-test",
        status: "completed",
        phase: "completed",
        progress: 1,
        scenario: editedScenario,
        latest_telemetry: {
          frame: 2,
          time_s: 1,
          progress: 1,
          water_left_percent: 61.5,
          cup_tilt_deg: 29.4,
          collisions: 0,
          distance_to_goal_m: 0,
          reward: -2.1,
          goal_reached: true,
        },
        summary: {
          success: false,
          failure_code: "INSUFFICIENT_WATER_REMAINING",
          failure_reason:
            "Robot reached the goal, but only 61.5% water remained.",
          goal_reached: true,
          water_left_percent: 61.5,
          collisions: 0,
          max_cup_tilt_deg: 29.4,
          total_reward: -2.1,
          duration_s: 1,
          frame_count: 3,
        },
        artifacts: {},
        error: null,
      }),
    });
  });
  await page.route("**/v1/runs/run-test/frames", async (route) => {
    const telemetry = [
      {
        frame: 0,
        time_s: 0,
        progress: 0,
        water_left_percent: 100,
        cup_tilt_deg: 8,
        collisions: 0,
        distance_to_goal_m: 5.4,
        reward: 0,
        goal_reached: false,
      },
      {
        frame: 1,
        time_s: 0.5,
        progress: 0.5,
        water_left_percent: 79.2,
        cup_tilt_deg: 21.8,
        collisions: 0,
        distance_to_goal_m: 2.6,
        reward: -0.8,
        goal_reached: false,
      },
      {
        frame: 2,
        time_s: 1,
        progress: 1,
        water_left_percent: 61.5,
        cup_tilt_deg: 29.4,
        collisions: 0,
        distance_to_goal_m: 0,
        reward: -2.1,
        goal_reached: true,
      },
    ];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-test",
        frame_count: 3,
        capture_rate_hz: 2,
        width: 480,
        height: 270,
        frames: telemetry.map((item, index) => ({
          frame_id: String(index).padStart(6, "0"),
          index,
          timestamp_s: item.time_s,
          rgb_url: `https://frames.failurecloud.test/rgb-${index}.svg`,
          depth_preview_url: `https://frames.failurecloud.test/depth-${index}.svg`,
          segmentation_preview_url: `https://frames.failurecloud.test/labels-${index}.svg`,
          lidar_preview_url: `https://frames.failurecloud.test/lidar-${index}.svg`,
          labels_url: `/mock-labels/${index}.json`,
          lidar_points: 64,
          telemetry: item,
        })),
      }),
    });
  });
  await page.route("**/mock-labels/*.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        frame_id: "000002",
        timestamp_s: 1,
        objects: [
          {
            instance_id: "cup_1",
            class_name: "cup",
            position_xyz: [5.4, 0, 0.66],
            bbox_3d: [5.4, 0, 0.66, 0.16, 0.16, 0.22, 0],
          },
          {
            instance_id: "box_1",
            class_name: "obstacle",
            position_xyz: [2.65, 0.18, 0.28],
            bbox_3d: [2.65, 0.18, 0.28, 0.65, 0.75, 0.56, 0.12],
          },
        ],
      }),
    });
  });
  await page.route("**/v1/runs/run-test/exports", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "completed",
        bundle_url: "/v1/runs/run-test/bundle",
        file: "run-test.zip",
      }),
    });
  });
  await page.route("**/v1/runs/run-test/sweeps/nebius", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sweep_id: "sweep-test",
        run_id: "run-test",
        status: "completed",
        provider: "local_fallback",
        specification: {
          axes: [
            { name: "floor_friction", values: [0.12, 0.2] },
            { name: "robot_speed", values: [0.8, 1.2] },
          ],
        },
        results: [],
        success_rate: 0.5,
        error: null,
      }),
    });
  });
  await page.route(
    "**/v1/runs/run-test/sweeps/sweep-test",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          sweep_id: "sweep-test",
          run_id: "run-test",
          status: "completed",
          provider: "local_fallback",
          specification: {
            axes: [
              { name: "floor_friction", values: [0.12, 0.2] },
              { name: "robot_speed", values: [0.8, 1.2] },
            ],
          },
          results: [],
          success_rate: 0.5,
          error: null,
        }),
      });
    },
  );
  await page.route("https://frames.failurecloud.test/*.svg", async (route) => {
    const depth = route.request().url().includes("depth");
    const labels = route.request().url().includes("labels");
    await route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270">
        <rect width="480" height="270" fill="${depth ? "#b8b8b2" : labels ? "#df7b32" : "#172126"}"/>
        <path d="M40 220 C160 180 300 190 440 80" fill="none" stroke="#6ee7b7" stroke-width="6"/>
        <rect x="220" y="110" width="70" height="62" fill="#df7b32"/>
        <circle cx="390" cy="85" r="26" fill="#6ee7b7"/>
      </svg>`,
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /find failures before robots/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /start a test/i }).click();

  await expect(
    page.getByRole("heading", { name: /what robot task/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /advanced options/i }).click();
  await expect(page.getByLabel("Robot type")).toHaveValue("mobile_base");

  await page.getByRole("button", { name: /generate robot tests/i }).click();
  await expect(page).toHaveURL(/\/app\/tests$/);
  await expect(
    page.getByRole("heading", { name: "Choose an edge case." }),
  ).toBeVisible();
  await expect(page.locator(".fc-test-card")).toHaveCount(5);

  await page
    .getByRole("button", { name: "Select Slippery Floor Turn" })
    .click();
  await expect(page.getByText(/Selection saved as/i)).toBeVisible();
  await page.getByRole("link", { name: /edit scenario/i }).click();

  await expect(page).toHaveURL(/\/app\/tests\/test-0\/edit$/);
  await expect(
    page.getByRole("heading", { name: "Slippery Floor Turn" }),
  ).toBeVisible();
  const floorFriction = page.getByRole("slider", { name: "Floor friction" });
  await expect(floorFriction).toHaveValue("0.18");

  await floorFriction.fill("0.25");
  await expect(floorFriction).toHaveValue("0.25");
  await page
    .getByRole("button", { name: /generate harder variant/i })
    .click();
  await expect(page.getByText("Harder variant applied")).toBeVisible();
  await expect(floorFriction).toHaveValue("0.13");

  await page.getByRole("tab", { name: "JSON" }).click();
  const jsonEditor = page.getByLabel("Scenario JSON");
  const edited = JSON.parse(await jsonEditor.inputValue());
  edited.task.success.min_water_left_percent = 82;
  await jsonEditor.fill(JSON.stringify(edited, null, 2));
  await page
    .getByRole("button", { name: /apply and validate json/i })
    .click();
  await page.getByRole("tab", { name: /scenario controls/i }).click();
  await expect(
    page.getByRole("slider", { name: "Minimum water remaining" }),
  ).toHaveValue("82");
  await Promise.all([
    page.waitForURL(/\/app\/tests\/test-0\/preview$/, { timeout: 15_000 }),
    page.getByRole("link", { name: /preview scene/i }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: /inspect the test before physics/i }),
  ).toBeVisible();
  await expect(page.locator(".fc-schematic-frame canvas")).toBeVisible();
  await page.getByRole("tab", { name: "Sensor setup" }).click();
  await expect(page.getByText("720 rays · 12m")).toBeVisible();
  await page.getByRole("tab", { name: "Success logic" }).click();
  await expect(page.getByText("water_left ≥ 82%")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /reactor cinematic preview/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /use local fallback/i }).click();
  await expect(page.getByText("Local fallback preview ready")).toBeVisible();
  await page
    .getByRole("button", { name: "Run simulation →" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/runs\/run-test$/);
  await expect(
    page.getByRole("heading", { name: /recorded simulation ready/i }),
  ).toBeVisible();
  await expect(page.getByAltText("rgb simulation frame")).toBeVisible();
  await page.getByLabel("Simulation timeline").fill("2");
  await expect(page.getByText("61.50%")).toBeVisible();
  await page.getByRole("button", { name: "Depth" }).click();
  await expect(page.getByAltText("depth simulation frame")).toBeVisible();
  await expect(page.getByText("FAILED")).toBeVisible();
  await page.getByRole("link", { name: /review results/i }).click();
  await expect(page).toHaveURL(/\/app\/runs\/run-test\/results$/);
  await expect(
    page.getByText("INSUFFICIENT_WATER_REMAINING"),
  ).toBeVisible();
  await page.getByRole("button", { name: "LiDAR" }).click();
  await expect(page.getByAltText("lidar result frame")).toBeVisible();
  await page.getByRole("button", { name: "Labels" }).click();
  await expect(page.getByText("2 instances")).toBeVisible();
  await page.getByRole("button", { name: "Reward" }).click();
  await expect(
    page.getByLabel("Reward, water, and cup tilt over time"),
  ).toBeVisible();
  await page.getByRole("link", { name: /export test case/i }).click();
  await expect(page).toHaveURL(/\/app\/runs\/run-test\/export$/);
  await page.getByRole("button", { name: /generate test bundle/i }).click();
  await expect(page.getByRole("link", { name: /download zip/i })).toBeVisible();
  await page.getByRole("button", { name: /launch stress test/i }).click();
  await expect(page.getByText("50% success rate")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Describe" }),
  ).toBeVisible();
});
