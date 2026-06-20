import { expect, test } from "@playwright/test";

test("renders the robot test compiler", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("UNIT TESTS")).toBeVisible();
  await expect(page.getByRole("button", { name: /compile test/i })).toBeVisible();
  await expect(page.getByLabel("Failure case prompt")).toContainText("warehouse robot");
});

