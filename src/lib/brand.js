// Name and logo shown in the app. The portfolio demo (VITE_DEMO=true, see
// src/lib/demoClient.js) uses a made-up clinic so no real branding ships.
// Vite replaces import.meta.env at build time, so the unused branch is
// dropped from the bundle.
export const IS_DEMO = import.meta.env.VITE_DEMO === "true";

export const APP_NAME = IS_DEMO ? "Sunrise Family Clinic" : "Hofileña Medical Centrum";
export const LOGO_URL = IS_DEMO ? "/logo.svg" : "/logo.png";
export const DEFAULT_BANNER_URL = IS_DEMO ? "/banner.svg" : "/logo-banner.png";
export const EMAIL_PLACEHOLDER = IS_DEMO ? "you@example.com" : "you@hmc.com";
