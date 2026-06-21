import { expect, test } from "@playwright/test";

test("runs the complete local robot-test workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("UNIT TESTS")).toBeVisible();
  await expect(page.getByLabel("Failure case prompt")).toContainText("warehouse robot");

  await page.getByRole("button", { name: /compile test/i }).click();
  await expect(page.getByText("SCENARIO CONTRACT")).toBeVisible();
  await expect(page.getByText("WORLD PREVIEW")).toBeVisible();
  await expect(page.getByText("SCHEMA 0.1.0 VALID")).toBeVisible();

  await page.getByRole("button", { name: /run test/i }).click();
  await expect(page.getByText("TEST TELEMETRY")).toBeVisible();
  await expect(page.getByText("FAILED")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("WATER LEFT")).toBeVisible();

  await page.getByRole("button", { name: "Cloud Sweep" }).click();
  await page.getByRole("button", { name: /launch sweep/i }).click();
  await expect(page.getByText("SUCCESS RATE")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".heat-cell")).toHaveCount(16);
});
