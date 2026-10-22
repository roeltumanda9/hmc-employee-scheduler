// Shift types live in the `shift_types` table and are edited on the Settings
// page (see src/lib/settings.js). This file holds what can't come from the
// database: the color palette, and the built-in list used until it loads.

// Colors a shift can use. Tailwind only generates classes it finds in source,
// so every option is spelled out here. Fills are -300 with -950 text (≥7:1
// contrast); `print` is [background, text] for the printed sheet.
export const SHIFT_COLORS = {
  sky: { label: "Sky", classes: "bg-sky-300 text-sky-950", print: ["#7dd3fc", "#0c4a6e"] },
  blue: { label: "Blue", classes: "bg-blue-300 text-blue-950", print: ["#93c5fd", "#1e3a8a"] },
  indigo: { label: "Indigo", classes: "bg-indigo-300 text-indigo-950", print: ["#a5b4fc", "#1e1b4b"] },
  violet: { label: "Violet", classes: "bg-violet-300 text-violet-950", print: ["#c4b5fd", "#3b0764"] },
  purple: { label: "Purple", classes: "bg-purple-300 text-purple-950", print: ["#d8b4fe", "#581c87"] },
  fuchsia: { label: "Fuchsia", classes: "bg-fuchsia-300 text-fuchsia-950", print: ["#f0abfc", "#581c87"] },
  pink: { label: "Pink", classes: "bg-pink-300 text-pink-950", print: ["#f9a8d4", "#831843"] },
  rose: { label: "Rose", classes: "bg-rose-300 text-rose-950", print: ["#fda4af", "#881337"] },
  red: { label: "Red", classes: "bg-red-300 text-red-950", print: ["#fca5a5", "#7f1d1d"] },
  orange: { label: "Orange", classes: "bg-orange-300 text-orange-950", print: ["#fdba74", "#7c2d12"] },
  amber: { label: "Amber", classes: "bg-amber-300 text-amber-950", print: ["#fcd34d", "#78350f"] },
  yellow: { label: "Yellow", classes: "bg-yellow-200 text-yellow-950", print: ["#fef08a", "#713f12"] },
  lime: { label: "Lime", classes: "bg-lime-300 text-lime-950", print: ["#bef264", "#365314"] },
  emerald: { label: "Emerald", classes: "bg-emerald-300 text-emerald-950", print: ["#86efac", "#14532d"] },
  mint: { label: "Mint", classes: "bg-emerald-100 text-emerald-800", print: ["#a7f3d0", "#064e3b"] },
  teal: { label: "Teal", classes: "bg-teal-300 text-teal-950", print: ["#5eead4", "#134e4a"] },
  cyan: { label: "Cyan", classes: "bg-cyan-300 text-cyan-950", print: ["#67e8f9", "#164e63"] },
  stone: { label: "Stone", classes: "bg-stone-300 text-stone-900", print: ["#d6d3d1", "#292524"] },
  slate: { label: "Dark", classes: "bg-slate-600 text-white", print: ["#cbd5e1", "#0f172a"] },
  gray: { label: "Gray", classes: "bg-slate-200 text-slate-600", print: ["#e2e8f0", "#334155"] },
};

const FALLBACK_COLOR = "gray";

// A code the app doesn't know (e.g. a schedule written before its shift
// type was added here) still shows, just without a color.
const UNKNOWN_CLASSES = "bg-white text-slate-600 ring-1 ring-inset ring-slate-300";

/** Normalized shift: { code, label, time, color, classes, print, sortOrder }. */
export function makeShift({ code, label, time, color, sort_order }) {
  const key = SHIFT_COLORS[color] ? color : FALLBACK_COLOR;
  return {
    code,
    label: label || code,
    time: time || "",
    color: key,
    classes: SHIFT_COLORS[key].classes,
    print: SHIFT_COLORS[key].print,
    sortOrder: sort_order ?? 0,
  };
}

export function unknownShift(code) {
  return {
    code,
    label: code,
    time: "",
    color: FALLBACK_COLOR,
    classes: UNKNOWN_CLASSES,
    print: SHIFT_COLORS[FALLBACK_COLOR].print,
  };
}

// OFF and IL drive the day totals (present / off / incentive leave), so they
// can't be deleted.
export const PROTECTED_SHIFTS = ["OFF", "IL"];

// Codes: 1–6 characters, capital letters, digits or "-" (not first).
// Matches the check constraint in supabase/proposed_shift_types.sql.
export const SHIFT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,5}$/;

// Built-in shifts, used until the `shift_types` table loads or if it can't.
export const STATUSES = [
  { code: "DUTY", label: "Duty", time: "10:00 AM – 7:00 PM", color: "sky" },
  { code: "AM", label: "AM Shift", time: "6:00 AM – 2:00 PM", color: "blue" },
  { code: "PM", label: "PM Shift", time: "2:00 PM – 10:00 PM", color: "amber" },
  { code: "MS", label: "Morning Shift", time: "6:00 AM – 6:00 PM", color: "emerald" },
  { code: "NS", label: "Night Shift", time: "6:00 PM – 6:00 AM", color: "indigo" },
  { code: "G", label: "Graveyard Shift", time: "10:00 PM – 6:00 AM", color: "slate" },
  { code: "9-6", label: "9-6 Shift", time: "9:00 AM – 6:00 PM", color: "orange" },
  { code: "AS", label: "Afternoon Shift", time: "2:00 PM – 10:00 PM", color: "rose" },
  { code: "RS", label: "Regular Shift", time: "8:00 AM – 5:00 PM", color: "cyan" },
  { code: "LS", label: "Late Shift", time: "11:00 AM – 8:00 PM", color: "violet" },
  { code: "ES", label: "Extended Shift", time: "8:00 AM – 8:00 PM", color: "fuchsia" },
  { code: "OFF", label: "Day Off", time: "", color: "gray" },
  { code: "IL", label: "Incentive Leave", time: "", color: "mint" },
  { code: "C3", label: "C3", time: "", color: "teal" },
].map(makeShift);

// Which shifts each department may use, and its time overrides, are settings:
// see src/lib/settings.js (`shiftsForDepartment`, `resolveShift`).
