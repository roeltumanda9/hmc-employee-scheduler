-- =============================================================================
-- PROPOSED: biometric number on employees (ATT2000 "No." / "AC-No.").
-- STATUS:   APPLIED to the live project (2026-10-30).
-- Used by Employees → "Import from biometric" (src/lib/biometricImport.js):
-- the first import links people to employees by name and stores their
-- biometric number here; later imports match by this number, so a name
-- spelled differently in the biometric still finds the right employee.
-- Until this is run, the import still works but matches by name every time.
-- Existing RLS on employees (supabase/proposed_rls.sql) covers the column:
-- only super_admin can change it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 — The column. Text, because ATT2000 may pad it ("0016"); the app
-- stores it without leading zeros ("16").
-- -----------------------------------------------------------------------------
alter table public.employees
  add column if not exists biometric_no text;


-- -----------------------------------------------------------------------------
-- STEP 2 — One employee per biometric number (empty is allowed for many).
-- -----------------------------------------------------------------------------
create unique index if not exists employees_biometric_no_key
  on public.employees (biometric_no)
  where biometric_no is not null and biometric_no <> '';


-- -----------------------------------------------------------------------------
-- STEP 3 — Make the API see the new column right away.
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';
