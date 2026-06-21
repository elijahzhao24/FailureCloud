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
  await expect(page.getByText("Selection saved.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Describe" }),
  ).toBeVisible();
});
