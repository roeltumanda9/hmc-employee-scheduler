import { MAX_LEAVE_DAYS_PER_YEAR } from "./leave";

/**
 * Turns a Supabase / network error into a plain-language sentence.
 * `action` completes "Couldn't …", e.g. "save the schedule".
 * The raw message is kept in brackets for unknown errors so staff can
 * pass it on to whoever supports the app.
 */
export function friendlyError(error, action = "complete this action") {
  if (!error) return "";

  const code = error.code;
  const msg = String(error.message || "");

  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return `Couldn't ${action} because the server couldn't be reached. Check your internet connection and try again.`;
  }
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return `You don't have permission to ${action}. Ask an administrator if you think this is a mistake.`;
  }
  if (code === "PGRST301" || code === "PGRST303" || /jwt expired|invalid jwt/i.test(msg)) {
    return "Your session has expired. Please sign out and sign in again.";
  }
  if (code === "23505") {
    return `Couldn't ${action} because a record with the same details already exists.`;
  }
  // Raised by supabase/proposed_leave_limit.sql.
  if (/leave limit/i.test(msg)) {
    return `Couldn't ${action}: an employee would have more than ${MAX_LEAVE_DAYS_PER_YEAR} leave days in a year (all leave types together). Change some of that leave and try again.`;
  }
  if (code === "23503") {
    return `Couldn't ${action} because other records still depend on it.`;
  }

  return `Couldn't ${action}. Please try again.${msg ? ` (${msg})` : ""}`;
}
