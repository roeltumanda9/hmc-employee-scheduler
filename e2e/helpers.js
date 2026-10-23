import { expect } from "@playwright/test";
import { MONTHS, getPayrollPeriodDays } from "../src/lib/dates.js";
import { TEST_DEPARTMENT } from "./db.js";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Signs in through the login form. `page` options: start on a page and, for
 * the Scheduler, the test department (both are remembered in localStorage).
 */
export async function signIn(page, account, { start = "employees" } = {}) {
  await page.addInitScript(
    ({ start, dept }) => {
      // Only on the first load of this test, so reloads keep the app's own choices.
      if (sessionStorage.getItem("e2e_init")) return;
      sessionStorage.setItem("e2e_init", "1");
      localStorage.setItem("hmc_page", start);
      localStorage.setItem("hmc_sched_dept", dept);
      for (const key of ["hmc_sched_month", "hmc_sched_year", "hmc_sched_half"]) {
        localStorage.removeItem(key);
      }
    },
    { start, dept: TEST_DEPARTMENT },
  );
  await page.goto("/");
  await page.getByPlaceholder("you@hmc.com").fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeAttached();
}

// The period the Scheduler opens on with nothing remembered: this month, 1st period.
export function defaultPeriodDays() {
  const now = new Date();
  return getPayrollPeriodDays(now.getFullYear(), now.getMonth() + 1, 1);
}

// "Mon, Oct 12", as in the grid's cell labels.
function spokenDate(day) {
  const [, m] = day.iso.split("-").map(Number);
  return `${day.weekday}, ${MONTHS[m - 1].slice(0, 3)} ${day.day}`;
}

/** The grid cell button for an employee name and a day from getPayrollPeriodDays. */
export function cell(page, name, day) {
  return page.getByRole("button", {
    name: new RegExp(`^${escapeRe(name)}, ${escapeRe(spokenDate(day))}:`),
  });
}

/** Opens a cell's picker and chooses a shift code (null = Clear). */
export async function pickShift(page, name, day, code) {
  await cell(page, name, day).click();
  const menu = page.getByRole("menu");
  if (code === null) await menu.getByRole("menuitem", { name: "Clear" }).click();
  else await menu.getByRole("menuitemradio", { name: new RegExp(`^${escapeRe(code)} `) }).click();
}

export async function startEditing(page) {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByText("Editing mode")).toBeVisible();
}
