import { expect, test } from "@playwright/test";
import { TEST_DEPARTMENT, TEST_LAST_NAME, db, fullName } from "./db.js";
import { SUPER_ADMIN } from "./env.js";
import { signIn } from "./helpers.js";

test("add an employee (next number), edit them, then delete them", async ({ page }) => {
  const c = await db();
  const { data: numbers } = await c.from("employees").select("number");
  // Highest numeric employee number + 1 (src/lib/employeeData.js imports the
  // browser-only Supabase client, so it can't be imported here).
  const nums = numbers.map((r) => parseInt(r.number, 10)).filter((n) => !isNaN(n));
  const expectedNumber = String(nums.length ? Math.max(...nums) + 1 : 1001);
  const name = fullName("CHARLIE");

  await signIn(page, SUPER_ADMIN, { start: "employees" });

  // Add
  await page.getByRole("button", { name: "Add employee" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("First name").fill("Charlie");
  await form.getByLabel("Last name").fill(TEST_LAST_NAME);
  await form.getByLabel("Department").selectOption(TEST_DEPARTMENT);
  await form.getByLabel("Role").fill("tester");
  const submit = form.getByRole("button", { name: "Add employee" });
  await expect(submit).toBeEnabled(); // waits for the next number to load
  await submit.click();
  await expect(form).toHaveCount(0);

  await expect(page.getByRole("button", { name: `Edit ${name}` })).toBeVisible();
  const { data: added } = await c.from("employees").select("*").eq("name", name).single();
  expect(added.number).toBe(expectedNumber);
  expect(added.role).toBe("TESTER");

  // Edit
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  await expect(form.getByLabel("First name")).toHaveValue("CHARLIE");
  await form.getByLabel("Role").fill("senior tester");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "SENIOR TESTER" })).toBeVisible();
  const { data: edited } = await c.from("employees").select("role").eq("name", name).single();
  expect(edited.role).toBe("SENIOR TESTER");

  // Delete
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("button", { name: `Edit ${name}` })).toHaveCount(0);
  const { data: left } = await c.from("employees").select("id").eq("name", name);
  expect(left).toEqual([]);
});
