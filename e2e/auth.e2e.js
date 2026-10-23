import { expect, test } from "@playwright/test";
import { ADMIN, SUPER_ADMIN, USER } from "./env.js";
import { signIn } from "./helpers.js";

const nav = (page) => page.getByRole("navigation", { name: "Main" });

test("a wrong password shows an error and stays on the sign-in page", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("you@hmc.com").fill(SUPER_ADMIN.email);
  await page.locator('input[type="password"]').fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
});

test("super admin signs in, sees every page, and signs out", async ({ page }) => {
  await signIn(page, SUPER_ADMIN);
  for (const item of ["Employees", "Scheduler", "Settings"]) {
    await expect(nav(page).getByRole("button", { name: item })).toBeVisible();
  }

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("admin can edit schedules but has no Settings page", async ({ page }) => {
  test.skip(!ADMIN, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");
  await signIn(page, ADMIN, { start: "scheduler" });

  await expect(nav(page).getByRole("button", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
});

test("user is read-only: no Edit, History or Settings", async ({ page }) => {
  test.skip(!USER, "E2E_USER_EMAIL / E2E_USER_PASSWORD not set");
  await signIn(page, USER, { start: "scheduler" });

  await expect(page.getByRole("region", { name: "Schedule grid" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "History" })).toHaveCount(0);
  await expect(nav(page).getByRole("button", { name: "Settings" })).toHaveCount(0);
});
