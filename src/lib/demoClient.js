import { buildDemoData, DEMO_USERS } from "./demoSeed";
import { getPayrollPeriodDays, oldestEditablePeriod } from "./dates";
import { MAX_LEAVE_DAYS_PER_YEAR } from "./leave";

/**
 * In-browser stand-in for the Supabase client, used only by the portfolio
 * demo (VITE_DEMO=true, see src/lib/supabase.js). It implements the small
 * part of the API the app uses (from/select/insert/update/delete/upsert,
 * eq/gte/lte/in/order/range/limit/single/maybeSingle, rpc and auth) over
 * made-up data kept in this browser's localStorage, and mimics the database
 * rules: role permissions (RLS), unique keys, the period lock, the yearly
 * leave limit, cascades and the change-history trigger.
 */

const DB_KEY = "hmc_demo_db";
const SESSION_KEY = "hmc_demo_session";
const LATENCY_MS = 120;

const KEYS = {
  employees: "id",
  schedules: "id",
  schedule_history: "id",
  departments: "name",
  shift_types: "code",
  print_settings: "id",
  profiles: "id",
};

const SUPER_ADMIN_TABLES = ["employees", "departments", "shift_types", "print_settings"];

/* ---------- Storage ---------- */

let db = null;

function load() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) db = JSON.parse(raw);
  } catch {
    db = null;
  }
  if (!db?.employees) db = buildDemoData();
  db.profiles = DEMO_USERS.map(({ id, email, role }) => ({ id, email, role }));
  return db;
}

function persist() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked: the demo still works until the tab closes.
  }
}

/** Puts the demo back to its starting data. */
export function resetDemoData() {
  db = buildDemoData();
  persist();
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function currentUser() {
  const session = readSession();
  return session ? DEMO_USERS.find((u) => u.id === session.user.id) || null : null;
}

/* ---------- Errors ---------- */

const err = (code, message, details = "") => ({ code, message, details });
const denied = () => err("42501", "permission denied (demo: this role can't make that change)");

function nextId(rows) {
  return rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
}

function uniqueViolation(table, rows, row, ignore) {
  const others = rows.filter((r) => r !== ignore);
  if (table === "employees") {
    if (row.number && others.some((r) => r.number === row.number)) {
      return err("23505", 'duplicate key value violates unique constraint "employees_number_key"', "Key (number) already exists.");
    }
    if (row.biometric_no && others.some((r) => r.biometric_no === row.biometric_no)) {
      return err("23505", 'duplicate key value violates unique constraint "employees_biometric_no_key"');
    }
  }
  const key = KEYS[table];
  if (key !== "id" && others.some((r) => r[key] === row[key])) {
    return err("23505", `duplicate key value violates unique constraint "${table}_pkey"`);
  }
  return null;
}

/* ---------- Query builder ---------- */

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Loose equality for ids: "6" matches 6, as Postgres would cast it.
function same(a, b) {
  return a === b || (a != null && b != null && String(a) === String(b));
}

function project(row, columns) {
  if (!columns || columns.trim() === "*") return { ...row };
  const out = {};
  for (const c of columns.split(",").map((s) => s.trim())) out[c] = row[c];
  return out;
}

class Query {
  constructor(table) {
    this.table = table;
    this.op = "select";
    this.columns = "*";
    this.returning = false;
    this.filters = [];
    this.orders = [];
    this.from = null;
    this.to = null;
    this.max = null;
    this.mode = null;
  }

  select(columns = "*") {
    if (this.op === "select") this.columns = columns;
    else this.returning = columns;
    return this;
  }
  insert(payload) { this.op = "insert"; this.payload = payload; return this; }
  update(payload) { this.op = "update"; this.payload = payload; return this; }
  upsert(payload) { this.op = "upsert"; this.payload = payload; return this; }
  delete() { this.op = "delete"; return this; }

  eq(col, v) { this.filters.push((r) => same(r[col], v)); return this; }
  gte(col, v) { this.filters.push((r) => r[col] >= v); return this; }
  lte(col, v) { this.filters.push((r) => r[col] <= v); return this; }
  in(col, list) { const s = new Set(list.map(String)); this.filters.push((r) => r[col] != null && s.has(String(r[col]))); return this; }
  order(col, { ascending = true } = {}) { this.orders.push([col, ascending ? 1 : -1]); return this; }
  range(from, to) { this.from = from; this.to = to; return this; }
  limit(n) { this.max = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then(resolve, reject) {
    return new Promise((r) => setTimeout(r, LATENCY_MS))
      .then(() => this.run())
      .then(resolve, reject);
  }

  matching(rows) {
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }

  run() {
    const data = load();
    const rows = data[this.table];
    if (!rows) return { data: null, error: err("PGRST205", `Could not find the table '${this.table}'`) };

    if (this.op === "select") return this.finish(this.read(rows));

    const user = currentUser();
    if (!user) return { data: null, error: err("42501", "permission denied: not signed in") };
    const allowed =
      SUPER_ADMIN_TABLES.includes(this.table) ? user.role === "super_admin"
      : this.table === "schedules" ? user.role !== "user"
      : false;
    if (!allowed) return { data: null, error: denied() };

    const before = JSON.stringify(data);
    const result = this.write(data, rows);
    if (result.error) {
      db = JSON.parse(before); // roll back, like a failed transaction
      return { data: null, error: result.error };
    }
    persist();
    const out = this.returning ? result.rows.map((r) => project(r, this.returning)) : null;
    return { data: out, error: null };
  }

  read(rows) {
    let out = this.matching(rows);
    if (this.orders.length) {
      out = [...out].sort((a, b) => {
        for (const [col, dir] of this.orders) {
          const c = compare(a[col], b[col]);
          if (c) return c * dir;
        }
        return 0;
      });
    }
    if (this.from != null) out = out.slice(this.from, this.to + 1);
    if (this.max != null) out = out.slice(0, this.max);
    return out.map((r) => project(r, this.columns));
  }

  finish(rows) {
    if (this.mode === "single") {
      return rows.length === 1
        ? { data: rows[0], error: null }
        : { data: null, error: err("PGRST116", "JSON object requested, multiple (or no) rows returned") };
    }
    if (this.mode === "maybe") return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  write(data, rows) {
    const table = this.table;
    const key = KEYS[table];

    if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const changed = [];
      for (const input of list) {
        const existing = this.op === "upsert" ? rows.find((r) => r[key] === input[key]) : null;
        if (existing) {
          Object.assign(existing, input);
          changed.push(existing);
          continue;
        }
        const row = { ...input };
        if (key === "id" && row.id == null) row.id = nextId(rows);
        const e = uniqueViolation(table, rows, row);
        if (e) return { error: e };
        rows.push(row);
        changed.push(row);
      }
      return { rows: changed };
    }

    const targets = this.matching(rows);

    if (this.op === "update") {
      for (const row of targets) {
        const oldKey = row[key];
        const next = { ...row, ...this.payload };
        const e = uniqueViolation(table, rows, next, row);
        if (e) return { error: e };
        Object.assign(row, next);
        // departments.name is referenced by employees `on update cascade`.
        if (table === "departments" && next.name !== oldKey) {
          for (const emp of data.employees) if (emp.department === oldKey) emp.department = next.name;
        }
        if (table === "employees") {
          for (const h of data.schedule_history) if (h.employee_id === row.id) h.employee_name = row.name;
        }
      }
      return { rows: targets };
    }

    // delete
    for (const row of targets) {
      if (table === "departments" && data.employees.some((e) => e.department === row.name)) {
        return { error: err("23503", "update or delete on table \"departments\" violates foreign key constraint") };
      }
      if (table === "shift_types") {
        if (data.schedules.some((s) => s.status === row.code)) {
          return { error: err("23503", `Shift ${row.code} is still used in saved schedules`) };
        }
        for (const d of data.departments) d.shifts = d.shifts.filter((c) => c !== row.code);
      }
      if (table === "employees") {
        data.schedules = data.schedules.filter((s) => s.employee_id !== row.id);
      }
    }
    const gone = new Set(targets);
    data[table] = data[table].filter((r) => !gone.has(r));
    return { rows: targets };
  }
}

/* ---------- save_schedule_changes (atomic save, like the SQL function) ---------- */

function saveScheduleChanges(changes) {
  const user = currentUser();
  if (!user || user.role === "user") return { data: null, error: denied() };

  const data = load();
  const before = JSON.stringify(data);
  const op = oldestEditablePeriod();
  const floor = getPayrollPeriodDays(op.year, op.month, op.half)[0].iso;
  // Ids may arrive as text (from cell keys); Postgres would coerce them.
  const empById = new Map(data.employees.map((e) => [String(e.id), e]));
  const touched = new Set();
  const fail = (error) => {
    db = JSON.parse(before);
    return { data: null, error };
  };

  for (const { employee_id, date, status } of changes) {
    if (date < floor) return fail(err("42501", `This payroll period is locked (before ${floor}).`));
    const emp = empById.get(String(employee_id));
    if (!emp) return fail(err("23503", "Employee not found"));

    const row = data.schedules.find((s) => s.employee_id === emp.id && s.date === date);
    const old = row?.status ?? null;
    if (old === (status ?? null)) continue;

    if (status == null) data.schedules = data.schedules.filter((s) => s !== row);
    else if (row) row.status = status;
    else data.schedules.push({ id: nextId(data.schedules), employee_id: emp.id, date, status });

    data.schedule_history.push({
      id: nextId(data.schedule_history),
      employee_id: emp.id,
      employee_name: emp.name,
      date,
      action: old == null ? "INSERT" : status == null ? "DELETE" : "UPDATE",
      old_status: old,
      new_status: status ?? null,
      changed_by: user.id,
      changed_by_email: user.email,
      changed_at: new Date().toISOString(),
    });
    touched.add(`${emp.id}|${date.slice(0, 4)}`);
  }

  // Yearly leave limit, checked once at the end like the deferred trigger.
  const leaveCodes = new Set(data.shift_types.filter((s) => s.is_leave).map((s) => s.code));
  for (const k of touched) {
    const [id, year] = k.split("|");
    const used = data.schedules.filter(
      (s) => String(s.employee_id) === id && s.date.startsWith(year) && leaveCodes.has(s.status),
    ).length;
    if (used > MAX_LEAVE_DAYS_PER_YEAR) return fail(err("P0001", "leave limit exceeded"));
  }

  persist();
  return { data: null, error: null };
}

/* ---------- Auth ---------- */

function createAuth() {
  const listeners = new Set();
  const emit = (event, session) => listeners.forEach((cb) => cb(event, session));
  const delay = () => new Promise((r) => setTimeout(r, LATENCY_MS));

  return {
    async getSession() {
      return { data: { session: readSession() }, error: null };
    },
    async getUser() {
      const session = readSession();
      return session
        ? { data: { user: session.user }, error: null }
        : { data: { user: null }, error: err("401", "Not signed in") };
    },
    onAuthStateChange(cb) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    async signInWithPassword({ email }) {
      await delay();
      const user = DEMO_USERS.find((u) => u.email === String(email).toLowerCase());
      if (!user) return { data: null, error: err("400", "Invalid login credentials") };
      const session = { access_token: "demo", user: { id: user.id, email: user.email } };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      emit("SIGNED_IN", session);
      return { data: { session, user: session.user }, error: null };
    },
    async signOut() {
      sessionStorage.removeItem(SESSION_KEY);
      emit("SIGNED_OUT", null);
      return { error: null };
    },
  };
}

export function createDemoClient() {
  return {
    from: (table) => new Query(table),
    async rpc(name, args) {
      await new Promise((r) => setTimeout(r, LATENCY_MS));
      if (name === "save_schedule_changes") return saveScheduleChanges(args.changes || []);
      return { data: null, error: err("PGRST202", `Could not find the function ${name}`) };
    },
    auth: createAuth(),
  };
}
