// Shared Tailwind class strings: the app's design system in one place.
// Brand = Tailwind green (green-600), neutrals = slate, warning = amber,
// destructive = rose. Tokens (shadows, motion, font) live in src/index.css.

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap select-none transition duration-150 ease-out active:scale-[0.97] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none";

/** Button sizes. md is the default; lg is for primary page actions. */
export const BTN_SIZE = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
  icon: "h-10 w-10 text-sm",
  iconSm: "h-8 w-8 text-xs",
};

/** Button hierarchy: primary → secondary → tertiary → ghost, plus destructive. */
export const BTN = {
  primary: `${BTN_BASE} bg-green-600 text-white shadow-brand hover:bg-green-700 disabled:hover:bg-green-600`,
  secondary: `${BTN_BASE} bg-white text-slate-700 ring-1 ring-inset ring-slate-200 shadow-card hover:bg-slate-50 hover:text-slate-900 hover:ring-slate-300 disabled:hover:bg-white`,
  tertiary: `${BTN_BASE} bg-green-50 text-green-800 ring-1 ring-inset ring-green-600/15 hover:bg-green-100 disabled:hover:bg-green-50`,
  ghostBrand: `${BTN_BASE} text-green-700 hover:bg-green-50 hover:text-green-800 disabled:hover:bg-transparent`,
  ghost: `${BTN_BASE} text-slate-600 hover:bg-slate-900/[0.05] hover:text-slate-900 disabled:hover:bg-transparent`,
  destructive: `${BTN_BASE} bg-rose-600 text-white shadow-sm shadow-rose-900/20 hover:bg-rose-700`,
  destructiveSoft: `${BTN_BASE} bg-white text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:hover:bg-white`,
  destructiveGhost: `${BTN_BASE} text-rose-600 hover:bg-rose-50 disabled:hover:bg-transparent`,
  warning: `${BTN_BASE} bg-amber-500 text-amber-950 shadow-sm shadow-amber-900/15 hover:bg-amber-400`,
};

/** Text inputs and selects. */
export const INPUT =
  "w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm ring-1 ring-inset ring-slate-200 shadow-card placeholder:text-slate-400 hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-green-600 disabled:bg-slate-50 disabled:text-slate-500 transition";

/** Smaller input for dense rows (e.g. shift times). */
export const INPUT_SM =
  "w-full rounded-lg border-0 bg-white px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-green-600 transition";

export const LABEL = "block text-xs font-semibold text-slate-700 mb-1.5";
export const HINT = "block text-xs text-slate-500 mt-1.5 leading-relaxed";

/** Surfaces */
export const CARD = "bg-white rounded-2xl ring-1 ring-slate-900/[0.06] shadow-card";
export const CARD_FOOTER =
  "px-4 sm:px-6 py-3.5 bg-slate-50/70 border-t border-slate-100";

/** Floating menus / dropdown panels */
export const MENU =
  "bg-white rounded-2xl shadow-overlay p-1.5 animate-pop-in origin-top";
export const MENU_ITEM =
  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-colors focus:outline-none";
export const MENU_HEADING =
  "px-3 pt-1.5 pb-1 text-[0.6875rem] uppercase tracking-[0.08em] text-slate-400 font-semibold";

/** Small uppercase label above a group of controls. */
export const EYEBROW =
  "text-[0.6875rem] uppercase tracking-[0.08em] font-semibold text-slate-500";

/** Modal shell */
export const BACKDROP = "absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] animate-fade-in";
export const DIALOG =
  "relative w-full bg-white shadow-overlay focus:outline-none animate-pop-in";

/** Loading spinner (pair with a size, e.g. "w-5 h-5"). */
export const SPINNER =
  "inline-block rounded-full border-2 border-slate-200 border-t-green-600 animate-spin";
export const SPINNER_ON_BRAND =
  "inline-block w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin";
