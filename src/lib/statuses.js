// Every shift the app knows about.
// Colors: -300 fills with -950 text (≥7:1 contrast), matching the printed sheet.
export const STATUSES = [
  // DUTY — time varies per department (departments.shift_times)
  {
  code: "DUTY",
  label: "Duty",
  time: "10:00 AM – 7:00 PM",
  classes: "bg-sky-300 text-sky-950",
},

 // H Hotel
{
  code: "AM",
  label: "AM Shift",
  time: "6:00 AM – 2:00 PM",
  classes: "bg-blue-300 text-blue-950",
},
{
  code: "PM",
  label: "PM Shift",
  time: "2:00 PM – 10:00 PM",
  classes: "bg-amber-300 text-amber-950",
},
{
  code: "MS",
  label: "Morning Shift",
  time: "6:00 AM – 6:00 PM",
  classes: "bg-emerald-300 text-emerald-950",
},
{
  code: "NS",
  label: "Night Shift",
  time: "6:00 PM – 6:00 AM",
  classes: "bg-indigo-300 text-indigo-950",
},
{
  code: "G",
  label: "Graveyard Shift",
  time: "10:00 PM – 6:00 AM",
  classes: "bg-slate-600 text-white",
},
{
  code: "9-6",
  label: "9-6 Shift",
  time: "9:00 AM – 6:00 PM",
  classes: "bg-orange-300 text-orange-950",
},

  // Grocery / Pharmacy
  {
    code: "AS",
    label: "Afternoon Shift",
    time: "2:00 PM – 10:00 PM",
    classes: "bg-rose-300 text-rose-950",
  },

  // Hofitea
  {
    code: "RS",
    label: "Regular Shift",
    time: "8:00 AM – 5:00 PM",
    classes: "bg-cyan-300 text-cyan-950",
  },
  {
    code: "LS",
    label: "Late Shift",
    time: "11:00 AM – 8:00 PM",
    classes: "bg-violet-300 text-violet-950",
  },
  {
    code: "ES",
    label: "Extended Shift",
    time: "8:00 AM – 8:00 PM",
    classes: "bg-fuchsia-300 text-fuchsia-950",
  },

  // Off
  {
    code: "OFF",
    label: "Day Off",
    time: "",
    classes: "bg-slate-200 text-slate-600",
  },

    // Incentive Leave
  {
    code: "IL",
    label: "Incentive Leave",
    time: "",
    classes: "bg-emerald-100 text-emerald-800",
  },

  {
  code: "C3",
  label: "C3",
  time: "",
  classes: "bg-teal-300 text-teal-950",
},

];

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.code, s]));

// Which shifts each department may use, and its time overrides, are settings:
// see src/lib/settings.js (`shiftsForDepartment`, `resolveShift`).