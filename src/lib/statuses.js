// Every shift the app knows about.
export const STATUSES = [
  // DUTY — time varies per department (departments.shift_times)
  {
  code: "DUTY",
  label: "Duty",
  time: "10:00 AM – 7:00 PM",
  classes: "bg-sky-500 text-white",
},

 // H Hotel
{
  code: "AM",
  label: "AM Shift",
  time: "6:00 AM – 2:00 PM",
  classes: "bg-blue-500 text-white",
},
{
  code: "PM",
  label: "PM Shift",
  time: "2:00 PM – 10:00 PM",
  classes: "bg-amber-500 text-white",
},
{
  code: "MS",
  label: "Morning Shift",
  time: "6:00 AM – 6:00 PM",
  classes: "bg-emerald-500 text-white",
},
{
  code: "NS",
  label: "Night Shift",
  time: "6:00 PM – 6:00 AM",
  classes: "bg-indigo-500 text-white",
},
{
  code: "G",
  label: "Graveyard Shift",
  time: "10:00 PM – 6:00 AM",
  classes: "bg-slate-700 text-white",
},
{
  code: "9-6",
  label: "9-6 Shift",
  time: "9:00 AM – 6:00 PM",
  classes: "bg-orange-500 text-white",
},

  // Grocery / Pharmacy
  {
    code: "AS",
    label: "Afternoon Shift",
    time: "2:00 PM – 10:00 PM",
    classes: "bg-rose-500 text-white",
  },

  // Hofitea
  {
    code: "RS",
    label: "Regular Shift",
    time: "8:00 AM – 5:00 PM",
    classes: "bg-cyan-500 text-white",
  },
  {
    code: "LS",
    label: "Late Shift",
    time: "11:00 AM – 8:00 PM",
    classes: "bg-violet-500 text-white",
  },
  {
    code: "ES",
    label: "Extended Shift",
    time: "8:00 AM – 8:00 PM",
    classes: "bg-fuchsia-500 text-white",
  },

  // Off
  {
    code: "OFF",
    label: "Day Off",
    time: "",
    classes: "bg-slate-300 text-slate-700",
  },

    // Incentive Leave
  {
    code: "IL",
    label: "Incentive Leave",
    time: "",
    classes: "bg-emerald-200 text-emerald-900",
  },

  {
  code: "C3",
  label: "C3",
  time: "",
  classes: "bg-teal-500 text-white",
},

];

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.code, s]));

// Which shifts each department may use, and its time overrides, are settings:
// see src/lib/settings.js (`shiftsForDepartment`, `resolveShift`).