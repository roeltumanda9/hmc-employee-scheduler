import { cleanup, seed } from "./db.js";

// Clears leftovers from a crashed run, then creates fresh test data.
export default async function globalSetup() {
  await cleanup();
  await seed();
}
