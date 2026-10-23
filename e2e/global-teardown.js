import { cleanup } from "./db.js";

// Runs after every test run, passed or failed.
export default async function globalTeardown() {
  await cleanup();
}
