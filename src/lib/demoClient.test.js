import { beforeEach, describe, expect, it, vi } from "vitest";

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// Fresh module (and fake database) per test.
async function setup(role = "super_admin") {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  const { createDemoClient, resetDemoData } = await import("./demoClient");
  const { DEMO_USERS } = await import("./demoSeed");
  resetDemoData();
  const client = createDemoClient();
  if (role) {
    const user = DEMO_USERS.find((u) => u.role === role);
    await client.auth.signInWithPassword({ email: user.email, password: "x" });
  }
  return client;
}

describe("demo client", () => {
  beforeEach(() => vi.useRealTimers());

  it("reads with filters, ordering and paging", async () => {
    const c = await setup();
    const { data } = await c.from("employees").select("id, name").order("name").range(0, 2);
    expect(data).toHaveLength(3);
    expect(Object.keys(data[0])).toEqual(["id", "name"]);
    expect(data.map((r) => r.name)).toEqual([...data.map((r) => r.name)].sort());

    const nursing = await c.from("employees").select("*").eq("department", "Nursing");
    expect(nursing.data.length).toBeGreaterThan(0);
    expect(nursing.data.every((e) => e.department === "Nursing")).toBe(true);
  });

  it("saves schedule changes with text ids and records history", async () => {
    const c = await setup("admin");
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    const { error } = await c.rpc("save_schedule_changes", {
      changes: [{ employee_id: "1", date: iso, status: "OFF" }],
    });
    expect(error).toBeNull();
    const { data } = await c.from("schedules").select("*").eq("employee_id", 1).eq("date", iso);
    expect(data[0].status).toBe("OFF");
    const hist = await c.from("schedule_history").select("*");
    expect(hist.data.at(-1)).toMatchObject({ employee_id: 1, new_status: "OFF" });
  });

  it("rolls back a save that breaks the yearly leave limit", async () => {
    const c = await setup("admin");
    const year = new Date().getFullYear();
    const changes = ["01", "02", "03", "04", "05", "06"].map((d) => ({
      employee_id: 3,
      date: `${year + 1}-01-${d}`,
      status: "SL",
    }));
    const { error } = await c.rpc("save_schedule_changes", { changes });
    expect(error.message).toMatch(/leave limit/);
    const { data } = await c.from("schedules").select("*").eq("employee_id", 3).gte("date", `${year + 1}-01-01`);
    expect(data).toHaveLength(0);
  });

  it("enforces roles like the database policies", async () => {
    const viewer = await setup("user");
    const save = await viewer.rpc("save_schedule_changes", { changes: [] });
    expect(save.error.code).toBe("42501");

    const admin = await setup("admin");
    const ins = await admin.from("employees").insert({ name: "X" });
    expect(ins.error.code).toBe("42501");
  });

  it("checks unique keys and cascades department renames", async () => {
    const c = await setup();
    const dup = await c.from("employees").insert({ name: "DUP", number: "1001" });
    expect(dup.error.code).toBe("23505");

    const { data } = await c.from("departments").update({ name: "Wards" }).eq("name", "Nursing").select();
    expect(data).toHaveLength(1);
    const moved = await c.from("employees").select("*").eq("department", "Wards");
    expect(moved.data.length).toBeGreaterThan(0);

    const del = await c.from("departments").delete().eq("name", "Wards").select();
    expect(del.error.code).toBe("23503");
  });
});
