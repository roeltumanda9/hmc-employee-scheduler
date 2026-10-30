import { expect, test } from "@playwright/test";
import { getPayrollPeriodDays, previousPeriod, sameWeekdayIn } from "../src/lib/dates.js";
import { MAX_LEAVE_DAYS_PER_YEAR } from "../src/lib/leave.js";
import { db, fixture, fullName, historyInstalled, savedStatus, setSchedule } from "./db.js";
import { SUPER_ADMIN } from "./env.js";
import { cell, defaultPeriod, defaultPeriodDays, pickShift, signIn, startEditing } from "./helpers.js";

const ALPHA = fullName("ALPHA");
const BRAVO = fullName("BRAVO");
const days = defaultPeriodDays();

let fx;

test.beforeAll(async () => {
  fx = await fixture();
});

test.beforeEach(async ({ page }) => {
  // Every test starts from an empty schedule for both test employees.
  await setSchedule(fx.alpha.id, []);
  await setSchedule(fx.bravo.id, []);
  await signIn(page, SUPER_ADMIN, { start: "scheduler" });
  await expect(cell(page, ALPHA, days[0])).toBeVisible();
});

test("edit a shift, save, and it is still there after a reload", async ({ page }) => {
  const day = days[1];
  await startEditing(page);
  await pickShift(page, ALPHA, day, fx.work);
  await expect(cell(page, ALPHA, day)).toHaveAccessibleName(/\(unsaved\)$/);

  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByText("Schedule saved")).toBeVisible();
  expect(await savedStatus(fx.alpha.id, day.iso)).toBe(fx.work);

  await page.reload();
  await expect(cell(page, ALPHA, day)).toContainText(fx.work);
  await expect(cell(page, ALPHA, day)).not.toHaveAccessibleName(/\(unsaved\)$/);
});

test("History shows a saved change and who made it", async ({ page }) => {
  test.skip(!(await historyInstalled()), "supabase/proposed_schedule_history.sql not run yet");
  const day = days[4];
  await startEditing(page);
  await pickShift(page, ALPHA, day, fx.work);
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByText("Schedule saved")).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  const dialog = page.getByRole("dialog", { name: "Change history" });
  const entry = dialog.getByRole("listitem").filter({ hasText: ALPHA }).first();
  await expect(entry).toContainText(fx.work);
  await expect(entry).toContainText(SUPER_ADMIN.email);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Cancel throws away unsaved edits", async ({ page }) => {
  const day = days[2];
  await startEditing(page);
  await pickShift(page, ALPHA, day, fx.work);
  await expect(cell(page, ALPHA, day)).toContainText(fx.work);

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Editing mode")).toHaveCount(0);
  await expect(cell(page, ALPHA, day)).toHaveAccessibleName(/: No shift$/);
  expect(await savedStatus(fx.alpha.id, day.iso)).toBeNull();
});

test("leaving the Scheduler with unsaved edits asks first", async ({ page }) => {
  await startEditing(page);
  await pickShift(page, ALPHA, days[3], fx.work);

  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Employees" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Discard unsaved changes?");

  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByText("Editing mode")).toBeVisible();
  await expect(cell(page, ALPHA, days[3])).toContainText(fx.work);
});

test("Copy previous period fills only empty days, from the same weekday", async ({ page }) => {
  const cur = defaultPeriod();
  const prev = previousPeriod(cur.year, cur.month, cur.half);
  const prevDays = getPayrollPeriodDays(prev.year, prev.month, prev.half);
  const source = (day) => sameWeekdayIn(day.iso, prevDays);

  // BRAVO had shifts on the matching days of the last period; one of this
  // period's days is already filled and must be kept.
  const [kept, filled] = [days[0], days[1]];
  await setSchedule(fx.bravo.id, [
    { date: source(kept), status: fx.work },
    { date: source(filled), status: fx.work },
    { date: kept.iso, status: "OFF" },
  ]);
  await page.reload();
  await expect(cell(page, BRAVO, kept)).toContainText("OFF");

  await startEditing(page);
  await page.getByRole("button", { name: "Copy previous period" }).click();
  await expect(page.getByText("Copied from the previous period")).toBeVisible();

  await expect(cell(page, BRAVO, filled)).toContainText(fx.work);
  await expect(cell(page, BRAVO, filled)).toHaveAccessibleName(/\(unsaved\)$/);
  await expect(cell(page, BRAVO, kept)).toContainText("OFF");
  // Copied shifts are drafts until saved.
  expect(await savedStatus(fx.bravo.id, filled.iso)).toBeNull();
});

test("Leave is blocked once the yearly limit is used up", async ({ page }) => {
  test.skip(!fx.leave, "no leave shift type in the database");
  const day = days[0];
  const year = day.iso.slice(0, 4);

  // Use up the year's leave on days outside this period.
  const inPeriod = new Set(days.map((d) => d.iso));
  const leaveDays = [];
  for (let d = new Date(Number(year), 0, 1); leaveDays.length < MAX_LEAVE_DAYS_PER_YEAR; d.setDate(d.getDate() + 1)) {
    const iso = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!inPeriod.has(iso)) leaveDays.push(iso);
  }
  await setSchedule(fx.bravo.id, leaveDays.map((date) => ({ date, status: fx.leave })));
  await page.reload();

  await startEditing(page);
  await cell(page, BRAVO, day).click();
  const leave = page.getByRole("menu").getByRole("menuitem", { name: /Leave/ });
  await expect(leave).toHaveAttribute("aria-disabled", "true");
  await expect(leave).toContainText("Limit reached");
});

test("closed payroll periods are view-only; Today goes back", async ({ page }) => {
  const prevMonth = page.getByRole("button", { name: "Previous month" });
  if (await prevMonth.isEnabled()) {
    // One month back = two periods back from today's, which is always locked.
    await prevMonth.click();
    await expect(page.getByRole("button", { name: "Locked" })).toBeDisabled();
    await expect(page.getByText(/this payroll period is closed/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Print/ }).first()).toBeEnabled();
  } else {
    // Still in the first month of the schedules (FIRST_MONTH in dates.js).
    await expect(prevMonth).toHaveAttribute("title", "Schedules start here");
    await page.getByRole("button", { name: "Next month" }).click();
  }

  await page.getByRole("button", { name: "Today" }).click();
  await expect(cell(page, ALPHA, days[0])).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Today" })).toHaveCount(0);

  // The database lock (supabase/proposed_schedule_lock.sql) agrees on the date.
  const c = await db();
  const { data, error } = await c.rpc("schedule_edit_floor");
  if (error?.code === "PGRST202") return; // lock SQL not applied yet: screen checks only
  expect(error).toBeNull();
  const p = previousPeriod(defaultPeriod().year, defaultPeriod().month, defaultPeriod().half);
  expect(data).toBe(getPayrollPeriodDays(p.year, p.month, p.half)[0].iso);
});
