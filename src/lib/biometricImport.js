import { buildFullName, formatName } from "./format";
import { readXls } from "./xlsReader";

/**
 * Importing employees from an ATT2000 biometric export (see xlsReader.js).
 * The export is a list of punches or attendance rows; each person appears on
 * many rows with their biometric number ("No." / "AC-No."), "LAST, FIRST"
 * name and ATT2000 department. The biometric is the master list for names
 * (last, first and middle) and departments; job titles stay as they are.
 *
 * Pure functions, so they can be tested without Supabase:
 *   parseAttendance(rows)        → people in the file
 *   matchPeople(people, emps)    → which employee each person is
 *   suggestDepartments(...)      → ATT2000 department → app department
 *   planImport(...)              → the updates / inserts to make
 * plus readAttendanceFile (File → people) and the remembered department
 * mapping (loadDeptMap / saveDeptMap, localStorage).
 */

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAP_KEY = "hmc_bio_deptmap";

/** The people in a chosen / dropped export file. Throws with a readable message. */
export async function readAttendanceFile(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That file is too large. Export a shorter date range from the biometric software.");
  }
  const people = parseAttendance(readXls(await file.arrayBuffer()));
  if (!people.length) throw new Error("No employees were found in this file.");
  return people;
}

/** ATT2000 → app departments chosen earlier in the review window. */
export function loadDeptMap() {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveDeptMap(map) {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify({ ...loadDeptMap(), ...map }));
  } catch {
    // Private mode / storage blocked: the mapping just isn't remembered.
  }
}

const HEADER = {
  number: [/^ac-?no\.?$/i, /^no\.?$/i, /^enroll(ment)?\s*no\.?$/i, /^user\s*id$/i],
  name: [/^name$/i, /^employee\s*name$/i],
  department: [/^department$/i, /^dept\.?$/i],
};

// ATT2000 departments that hold people who no longer work here.
const INACTIVE_DEPT = /resign|separated|inactive|terminated/i;

/** True for an ATT2000 department of former staff ("RESIGNED"…): never imported. */
export function isInactiveDepartment(name) {
  return INACTIVE_DEPT.test(name || "");
}

/** "0016" → "16"; non-numeric values are kept (trimmed). */
export function normalizeBioNo(value) {
  const s = String(value ?? "").trim();
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
}

/**
 * "LAST, FIRST M." → { last, first, middle, ordered } in ALL CAPS. ATT2000
 * sometimes has a period where the comma belongs ("MAG-USARA. HAZEL KATE").
 * A trailing single letter is the middle initial. Without a separator the
 * order is a guess ("JOSE P. RIZAL": last word = last name) and `ordered` is
 * false, so the import won't overwrite names with it.
 */
export function splitName(raw) {
  const s = formatName(String(raw ?? "").replace(/\s+/g, " ").trim());
  const comma = s.indexOf(",");
  const dot = s.search(/^[^ ]+\.\s/) === 0 ? s.indexOf(".") : -1;
  const at = comma > 0 ? comma : dot;
  if (at > 0) {
    const words = s.slice(at + 1).trim().split(" ").filter(Boolean);
    let middle = "";
    if (words.length > 1 && /^[A-Z]\.?$/.test(words.at(-1))) {
      middle = words.pop().replace(".", "");
    }
    return { last: s.slice(0, at).trim(), first: words.join(" "), middle, ordered: true };
  }

  const words = s.split(" ").filter(Boolean);
  const last = words.length > 1 ? words.pop() : "";
  let middle = "";
  if (words.length > 1 && /^[A-Z]\.?$/.test(words.at(-1))) {
    middle = words.pop().replace(".", "");
  }
  return { last, first: words.join(" "), middle, ordered: false };
}

/**
 * The people in an export: one entry per biometric number (or per name when a
 * row has no number), with the values of their LAST row and how many rows
 * they have. Throws if the columns can't be found.
 */
export function parseAttendance(rows) {
  const headerAt = rows.slice(0, 20).findIndex((r) => findColumn(r, HEADER.name) >= 0);
  if (headerAt < 0) {
    throw new Error(
      "This file has no \"Name\" column. Export the attendance or punch report from the biometric software and try again.",
    );
  }
  const header = rows[headerAt];
  const col = {
    number: findColumn(header, HEADER.number),
    name: findColumn(header, HEADER.name),
    department: findColumn(header, HEADER.department),
  };

  const byKey = new Map();
  for (const r of rows.slice(headerAt + 1)) {
    const rawName = String(r[col.name] ?? "").trim();
    if (!rawName) continue;
    const bioNo = col.number >= 0 ? normalizeBioNo(r[col.number]) : "";
    const key = bioNo ? `#${bioNo}` : `@${formatName(rawName)}`;
    const prev = byKey.get(key);
    byKey.set(key, {
      bioNo,
      rawName,
      ...splitName(rawName),
      department: col.department >= 0 ? String(r[col.department] ?? "").trim() : "",
      rows: (prev?.rows || 0) + 1,
    });
  }
  return [...byKey.values()];
}

function findColumn(row, patterns) {
  for (const p of patterns) {
    const i = row.findIndex((cell) => p.test(String(cell ?? "").trim()));
    if (i >= 0) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Matching people to employees
// ---------------------------------------------------------------------------

/** Accents removed, ALL CAPS, punctuation as spaces: "Arañez, Nilo" → "ARANEZ NILO". */
export function normalizeText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

// Name words, without middle initials.
function nameTokens(last, first) {
  return normalizeText(`${last} ${first}`)
    .split(" ")
    .filter((t) => t.length > 1);
}

// Edit distance with adjacent swaps counting as one edit (optimal string alignment).
export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Typos tolerated in one word: none in short words, more in long ones.
function tolerance(word) {
  return word.length >= 6 ? 2 : word.length >= 4 ? 1 : 0;
}

/**
 * How well two names match: every word of the shorter name must match a
 * different word of the other (in any order, within the typo tolerance), and
 * at least two words must match unless both names are a single word.
 * Returns null for no match, else { words, edits } (more words / fewer edits
 * is better).
 */
export function nameScore(aTokens, bTokens) {
  const [short, long] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  if (!short.length) return null;
  const used = new Set();
  let edits = 0;
  for (const t of short) {
    let best = -1;
    let bestDist = Infinity;
    long.forEach((u, i) => {
      if (used.has(i)) return;
      const dist = editDistance(t, u);
      if (dist <= Math.min(tolerance(t), tolerance(u)) && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    if (best < 0) return null;
    used.add(best);
    edits += bestDist;
  }
  if (short.length < 2 && long.length > 1) return null;
  return { words: short.length, edits };
}

/**
 * Pairs each person with an employee: first by stored biometric number, then
 * by name (best matches first; a person whose best match is shared with
 * another employee of the same score is left unmatched).
 * Returns Map<person, employee>.
 */
export function matchPeople(people, employees) {
  const result = new Map();
  const taken = new Set();

  const byNo = new Map();
  for (const e of employees) {
    const no = normalizeBioNo(e.biometric_no);
    if (no) byNo.set(no, e);
  }
  for (const p of people) {
    const e = p.bioNo && byNo.get(p.bioNo);
    if (e && !taken.has(e.id)) {
      result.set(p, e);
      taken.add(e.id);
    }
  }

  // Employees already linked to another biometric number are not name-matched.
  const free = employees.filter((e) => !taken.has(e.id) && !normalizeBioNo(e.biometric_no));
  const candidates = [];
  for (const p of people) {
    if (result.has(p)) continue;
    const pt = nameTokens(p.last, p.first);
    const scored = free
      .map((e) => ({ p, e, s: nameScore(pt, nameTokens(e.last_name || e.name, e.first_name)) }))
      .filter((c) => c.s)
      .sort(byScore);
    if (!scored.length) continue;
    if (scored[1] && byScore(scored[0], scored[1]) === 0) continue; // ambiguous
    candidates.push(scored[0]);
  }
  candidates.sort(byScore);
  for (const { p, e } of candidates) {
    if (taken.has(e.id)) continue;
    result.set(p, e);
    taken.add(e.id);
  }
  return result;
}

function byScore(a, b) {
  return b.s.words - a.s.words || a.s.edits - b.s.edits;
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

/**
 * Suggested app department for each ATT2000 department ("" = skip):
 * the department most of its already-matched people are in, else one whose
 * name matches (same words in any order, an acronym like "HMC", or a typo).
 * Departments for resigned staff are skipped.
 */
export function suggestDepartments(people, matches, appDepartments) {
  const out = {};
  const attDepts = [...new Set(people.map((p) => p.department))];
  for (const att of attDepts) {
    if (INACTIVE_DEPT.test(att)) {
      out[att] = "";
      continue;
    }
    const counts = {};
    for (const p of people) {
      const e = matches.get(p);
      if (p.department === att && e && appDepartments.includes(e.department)) {
        counts[e.department] = (counts[e.department] || 0) + 1;
      }
    }
    const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    out[att] = majority ? majority[0] : appDepartments.find((d) => sameDepartment(att, d)) || "";
  }
  return out;
}

/**
 * The department mapping to use: the suggestions, overridden by choices made
 * earlier (`saved`) when those still name an app department or "".
 */
export function departmentMapFor(people, matches, appDepartments, saved = {}) {
  const map = suggestDepartments(people, matches, appDepartments);
  for (const att of Object.keys(map)) {
    if (att in saved && (saved[att] === "" || appDepartments.includes(saved[att]))) {
      map[att] = saved[att];
    }
  }
  return map;
}

function sameDepartment(att, app) {
  const a = normalizeText(att).split(" ").filter(Boolean);
  const b = normalizeText(app).split(" ").filter(Boolean);
  if (!a.length || !b.length) return false;
  if (a.join("") === b.join("")) return true;
  const initials = (words) => words.map((w) => w[0]).join("");
  if (initials(a) === b.join("") || initials(b) === a.join("")) return true;
  const score = nameScore(a, b);
  return Boolean(score && score.words === Math.max(a.length, b.length));
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

const FIELD_LABELS = {
  last_name: "Last name",
  first_name: "First name",
  middle_name: "Middle name",
  department: "Department",
  biometric_no: "Biometric No.",
};

/**
 * What the import will do.
 *  - updates: [{ key, employee, person, changes: [{ field, label, from, to }], payload, doubtful }]
 *  - inserts: [{ key, person, payload, doubtful }]
 *    `doubtful` = the file's name has no comma, so which part is the last name
 *    is a guess; it starts unticked.
 *  - unchanged: number of matched employees already up to date
 *  - skipped: people whose department is mapped to "" (not imported)
 *  - missing: employees not in the file (left alone)
 * `withBioNo` = the employees table has the biometric_no column; new employees
 * are numbered from `firstNumber` (see nextNumberFrom in employeeData.js).
 */
export function planImport({ people, employees, matches, deptMap, withBioNo, firstNumber }) {
  const updates = [];
  const inserts = [];
  const skipped = [];
  let unchanged = 0;
  let next = Number(firstNumber);

  for (const p of people) {
    const department = deptMap[p.department] || "";
    const employee = matches.get(p);
    if (!department) {
      skipped.push(p);
      continue;
    }

    if (!employee) {
      const fields = {
        first_name: p.first,
        middle_name: p.middle,
        last_name: p.last,
      };
      inserts.push({
        key: `new|${p.bioNo || p.rawName}`,
        person: p,
        doubtful: !p.ordered,
        payload: {
          ...fields,
          name: buildFullName(fields),
          number: String(next++),
          department,
          role: "",
          ...(withBioNo && p.bioNo ? { biometric_no: p.bioNo } : {}),
        },
      });
      continue;
    }

    const current = {
      last_name: formatName(employee.last_name).trim(),
      first_name: formatName(employee.first_name).trim(),
      middle_name: formatName(employee.middle_name).trim(),
      department: employee.department || "",
      biometric_no: normalizeBioNo(employee.biometric_no),
    };
    // The biometric's name replaces the app's: last, first and middle name
    // (a name without a middle initial clears it).
    const wanted = {
      ...current,
      department,
      last_name: p.last,
      first_name: p.first,
      middle_name: p.middle,
    };
    if (withBioNo && p.bioNo) wanted.biometric_no = p.bioNo;

    const changes = Object.keys(FIELD_LABELS)
      .filter((f) => wanted[f] !== current[f])
      .map((f) => ({ field: f, label: FIELD_LABELS[f], from: current[f], to: wanted[f] }));
    if (!changes.length) {
      unchanged++;
      continue;
    }
    const payload = Object.fromEntries(changes.map((c) => [c.field, c.to]));
    payload.name = buildFullName(wanted);
    const nameChanged = changes.some((c) => c.field.endsWith("_name"));
    updates.push({
      key: `upd|${employee.id}`,
      employee,
      person: p,
      changes,
      payload,
      doubtful: nameChanged && !p.ordered,
    });
  }

  const matchedIds = new Set([...matches.values()].map((e) => e.id));
  const missing = employees.filter((e) => !matchedIds.has(e.id));
  return { updates, inserts, unchanged, skipped, missing };
}
