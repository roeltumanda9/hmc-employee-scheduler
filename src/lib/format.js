// Force ALL CAPS for names, roles, anything.
export function formatName(value) {
  return (value || "").toUpperCase();
}

export function formatRole(value) {
  return (value || "").toUpperCase();
}

// "Amiscua" → "A."   /   "" → ""
export function middleInitial(middle_name) {
  const m = (middle_name || "").trim();
  return m ? m[0].toUpperCase() + "." : "";
}

// Builds "LAST, FIRST M." for the `name` column (all caps)
export function buildFullName({ first_name, middle_name, last_name }) {
  const f = (first_name || "").trim();
  const m = middleInitial(middle_name);
  const l = (last_name || "").trim();

  const firstMiddle = [f, m].filter(Boolean).join(" ");
  if (l && firstMiddle) return `${l}, ${firstMiddle}`.toUpperCase();
  if (l) return l.toUpperCase();
  return firstMiddle.toUpperCase();
}
