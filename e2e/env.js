import { existsSync } from "node:fs";

// Supabase URL/key from `.env`, test accounts from `.env.e2e` (both
// gitignored). Already-set environment variables win.
for (const file of [".env", ".env.e2e"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

function account(prefix) {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
}

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// super_admin: required (sets up the test department and employees).
export const SUPER_ADMIN = account("E2E_SUPER_ADMIN");
// admin and user: optional; their role tests are skipped without them.
export const ADMIN = account("E2E_ADMIN");
export const USER = account("E2E_USER");
