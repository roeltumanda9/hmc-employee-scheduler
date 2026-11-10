// Name and logo shown in the app. The portfolio demo (VITE_DEMO=true, see
// src/lib/demoClient.js) keeps the real name and logo but uses made-up data.
// Vite replaces import.meta.env at build time, so the unused branch is
// dropped from the bundle.
export const IS_DEMO = import.meta.env.VITE_DEMO === "true";

export const APP_NAME = "Hofileña Medical Centrum";
export const LOGO_URL = "/logo.png";
export const DEFAULT_BANNER_URL = "/logo-banner.png";
export const EMAIL_PLACEHOLDER = IS_DEMO ? "you@example.com" : "you@hmc.com";
