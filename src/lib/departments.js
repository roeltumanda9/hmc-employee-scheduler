// Built-in department settings, used only until the `departments` table loads
// or if it can't be loaded. The real values are edited on the Settings page.
// Staff names are deliberately left out: they live only in the database.
// The portfolio demo uses its own made-up list (these names don't ship).
import { IS_DEMO, DEFAULT_BANNER_URL } from "./brand";

const REAL_DEPARTMENTS = [
  {
    name: "Amysthetic",
    banner_url: "/logo-banner-amystethic.png",
    shifts: ["DUTY", "IL", "OFF"],
    shift_times: { DUTY: "10:00 AM – 7:00 PM" },
  },
  {
    name: "H Hotel",
    banner_url: "/logo-banner-hhotel.png",
    shifts: ["AM", "PM", "MS", "NS", "G", "9-6", "IL", "OFF"],
    shift_times: {},
  },
  {
    name: "JA Grocery / Pharmacy",
    banner_url: "/logo-banner-jagrocery.png",
    shifts: ["AM", "PM", "DUTY", "IL", "OFF"],
    shift_times: { DUTY: "8:00 AM – 5:00 PM" },
  },
  {
    name: "Wellness",
    banner_url: "/logo-banner-wellness.png",
    shifts: ["DUTY", "IL", "OFF"],
    shift_times: { DUTY: "8:00 AM – 5:00 PM" },
  },
  {
    name: "Johanju",
    banner_url: "/logo-banner-johanju.png",
    shifts: ["9-6", "C3", "IL", "OFF"],
    shift_times: { DUTY: "9:00 AM – 6:00 PM" },
  },
  {
    name: "HMC",
    banner_url: "/logo-banner.png",
    shifts: ["DUTY", "AS", "IL", "OFF"],
    shift_times: { DUTY: "8:00 AM – 5:00 PM" },
  },
  {
    name: "HMC Laboratory",
    banner_url: "/logo-banner.png",
    shifts: ["AM", "DUTY", "IL", "OFF"],
    shift_times: { DUTY: "8:00 AM – 5:00 PM" },
  },
  {
    name: "Hofitea",
    banner_url: "/logo-banner-hofitea.png",
    shifts: ["RS", "LS", "ES", "IL", "OFF"],
    shift_times: {},
  },
];

const DEMO_DEPARTMENTS = [
  { name: "Outpatient Clinic", banner_url: "/logo-banner.png", shifts: ["DUTY", "MS", "OFF"], shift_times: {} },
  { name: "Nursing", banner_url: "/logo-banner.png", shifts: ["AM", "PM", "NS", "OFF"], shift_times: {} },
  { name: "Laboratory", banner_url: "/logo-banner.png", shifts: ["AM", "DUTY", "OFF"], shift_times: {} },
  { name: "Pharmacy", banner_url: "/logo-banner.png", shifts: ["AM", "PM", "OFF"], shift_times: {} },
];

export const FALLBACK_DEPARTMENTS = (IS_DEMO ? DEMO_DEPARTMENTS : REAL_DEPARTMENTS).map((d, i) => ({
  sort_order: i + 1,
  active: true,
  prepared_by_name: "",
  prepared_by_title: "",
  ...d,
}));

export const FALLBACK_PRINT = {
  default_banner_url: DEFAULT_BANNER_URL,
  default_prepared_by_name: "",
  default_prepared_by_title: "",
  checked_by_name: "",
  checked_by_title: "",
  approved_by_name: "",
  approved_by_title: "",
};
