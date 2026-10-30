import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { TEST_DEPARTMENT, TEST_LAST_NAME, db, fullName } from "./db.js";
import { ADMIN, SUPABASE_ANON_KEY, SUPABASE_URL, SUPER_ADMIN, USER } from "./env.js";
import { signIn } from "./helpers.js";

// A tiny ATT2000-style export (bare BIFF stream of BIFF2 LABEL records, as
// the biometric software writes it) holding only test people.
function attExport(rows) {
  const out = [];
  const record = (type, body) => out.push(type & 0xff, type >> 8, body.length & 0xff, body.length >> 8, ...body);
  record(0x0809, [0x00, 0x06, 0x10, 0x00, 0, 0, 0, 0]); // BOF: worksheet
  rows.forEach((row, r) =>
    row.forEach((text, c) =>
      record(0x0004, [r & 0xff, r >> 8, c & 0xff, c >> 8, 0, 0, 0, text.length, ...Buffer.from(text, "latin1")]),
    ),
  );
  record(0x000a, []); // EOF
  return Buffer.from(out);
}

const DEPT = TEST_DEPARTMENT.toUpperCase();

test("dropping a biometric export renames and adds employees straight away", async ({ page }) => {
  const c = await db();
  // A test employee whose name the biometric spells differently.
  const { error } = await c.from("employees").insert({
    first_name: "ECHHO",
    middle_name: "",
    last_name: TEST_LAST_NAME,
    name: fullName("ECHHO"),
    number: "E2E-3",
    department: TEST_DEPARTMENT,
    role: "TESTER",
  });
  expect(error).toBeNull();

  const file = attExport([
    ["Department", "Name", "No.", "Date/Time"],
    [DEPT, `${TEST_LAST_NAME}, ECHO`, "9901", "10/26/2026 7:50:04 AM"],
    [DEPT, `${TEST_LAST_NAME}, ECHO`, "9901", "10/26/2026 5:02:11 PM"],
    [DEPT, `${TEST_LAST_NAME}, DELTA`, "9902", "10/26/2026 8:01:00 AM"],
    ["RESIGNED", `${TEST_LAST_NAME}, FOXTROT`, "9903", "10/26/2026 8:01:00 AM"],
  ]);

  await signIn(page, SUPER_ADMIN, { start: "employees" });
  const zone = page.getByText("Drop the biometric export (data.xls) here");
  await expect(page.getByRole("button", { name: "Choose file" })).toBeEnabled();

  // Drop it, as from File Explorer.
  const dataTransfer = await page.evaluateHandle((b64) => {
    const dt = new DataTransfer();
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    dt.items.add(new File([bytes], "data.xls", { type: "application/vnd.ms-excel" }));
    return dt;
  }, file.toString("base64"));
  await zone.dispatchEvent("drop", { dataTransfer });

  const status = page.getByRole("status");
  await expect(status).toContainText("Updated from data.xls");
  await expect(status).toContainText("1 added, 1 updated");
  await expect(page.getByRole("button", { name: `Edit ${fullName("ECHO")}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Edit ${fullName("DELTA")}` })).toBeVisible();

  const { data: rows } = await c
    .from("employees")
    .select("*")
    .eq("last_name", TEST_LAST_NAME)
    .in("first_name", ["ECHHO", "ECHO", "DELTA", "FOXTROT"]);
  const byFirst = Object.fromEntries(rows.map((r) => [r.first_name, r]));
  expect(byFirst.ECHHO).toBeUndefined();
  expect(byFirst.ECHO).toMatchObject({ name: fullName("ECHO"), department: TEST_DEPARTMENT, role: "TESTER" });
  expect(byFirst.DELTA).toMatchObject({ department: TEST_DEPARTMENT, role: "" });
  expect(byFirst.FOXTROT).toBeUndefined(); // resigned: not imported
  if ("biometric_no" in byFirst.ECHO) {
    expect(byFirst.ECHO.biometric_no).toBe("9901");
    expect(byFirst.DELTA.biometric_no).toBe("9902");
  }

  // Dropping the same file again changes nothing.
  await zone.dispatchEvent("drop", { dataTransfer });
  await expect(status).toContainText("Everyone in data.xls is already up to date.");

  // Remove what this test added (global teardown would too).
  await c.from("employees").delete().in("id", [byFirst.ECHO.id, byFirst.DELTA.id]);
});

// Only super_admin may add or change employees: the page hides the import and
// Add for everyone else, and the database (RLS) refuses their writes.
for (const [label, account] of [["admin", ADMIN], ["user", USER]]) {
  test(`${label} can't import or add employees`, async ({ page }) => {
    test.skip(!account, `E2E_${label.toUpperCase()}_EMAIL / _PASSWORD not set`);
    await signIn(page, account, { start: "employees" });
    await expect(page.getByText("Team directory")).toBeVisible();
    await expect(page.getByText("Drop the biometric export (data.xls) here")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Choose file" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add employee" })).toHaveCount(0);

    const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect((await c.auth.signInWithPassword(account)).error).toBeNull();
    const { error } = await c.from("employees").insert({
      first_name: "INTRUDER",
      middle_name: "",
      last_name: TEST_LAST_NAME,
      name: fullName("INTRUDER"),
      number: "E2E-9",
      department: TEST_DEPARTMENT,
      role: "TESTER",
    });
    expect(error?.code).toBe("42501"); // row-level security
    const { data: changed } = await c
      .from("employees")
      .update({ role: "HACKED" })
      .eq("last_name", TEST_LAST_NAME)
      .select("id");
    expect(changed).toEqual([]); // nothing they may update
  });
}
