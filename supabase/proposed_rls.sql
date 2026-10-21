-- =============================================================================
-- PROPOSED: row-level security for employees / schedules / profiles
-- STATUS:   NOT APPLIED. Review, then run in Supabase → SQL Editor.
--           Try it on a branch / staging project first if you have one.
-- Audit:    #1 (permissions only checked in the browser)
--
-- UPDATE 2026-10-21: the live project already had equivalent role-based
-- policies (*_super_admin, *_admin, *_select_by_role, profiles_update_super_admin).
-- Do NOT re-run Step 3 there; it only adds duplicates, and its
-- `using (true)` select policies widen reads. Kept for reference / new projects.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 0 — READ-ONLY CHECKS. Run these first and keep the output.
-- -----------------------------------------------------------------------------

-- Is RLS on for each table? (relrowsecurity must be true)
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('employees', 'schedules', 'profiles');

-- Existing policies. Policies are OR-ed together, so any permissive policy
-- left in place (e.g. "Enable all for authenticated users") defeats the
-- stricter ones below. Note their names; Step 2 lists how to drop them.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('employees', 'schedules', 'profiles')
order by tablename, policyname;

-- Column types (the RPC in proposed_integrity.sql assumes uuid / date).
select table_name, column_name, data_type, is_nullable, column_default, is_identity
from information_schema.columns
where table_schema = 'public'
  and table_name in ('employees', 'schedules', 'profiles')
order by table_name, ordinal_position;

-- Who has which app role today.
select role, count(*) from public.profiles group by role;

-- Is there a trigger that creates profiles on sign-up, and what role does it set?
select tgname, tgrelid::regclass, pg_get_triggerdef(oid)
from pg_trigger
where not tgisinternal and tgrelid = 'auth.users'::regclass;


-- -----------------------------------------------------------------------------
-- STEP 1 — Role lookup helper (used by all policies).
-- SECURITY DEFINER so it can read profiles without recursing into profiles'
-- own RLS. It only ever returns the caller's own role.
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;


-- -----------------------------------------------------------------------------
-- STEP 2 — Drop the permissive policies found in Step 0, one per line, e.g.:
--   drop policy "Enable all for authenticated users" on public.schedules;
-- (Left as a manual step on purpose: names differ per project.)
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- STEP 3 — Enable RLS and add role-based policies.
-- -----------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.employees enable row level security;
alter table public.schedules enable row level security;

-- profiles: each user reads only their own row. No insert/update/delete
-- policies, so nobody can change a role from the browser (including their
-- own). Change roles in the Table Editor or SQL Editor, which bypass RLS.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- employees: every signed-in user can read; only super_admin can write.
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (true);

drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees
  for insert to authenticated
  with check (public.current_app_role() = 'super_admin');

drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees
  for update to authenticated
  using (public.current_app_role() = 'super_admin')
  with check (public.current_app_role() = 'super_admin');

drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees
  for delete to authenticated
  using (public.current_app_role() = 'super_admin');

-- schedules: every signed-in user can read; admin + super_admin can write.
drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules
  for select to authenticated
  using (true);

drop policy if exists schedules_insert on public.schedules;
create policy schedules_insert on public.schedules
  for insert to authenticated
  with check (public.current_app_role() in ('admin', 'super_admin'));

drop policy if exists schedules_update on public.schedules;
create policy schedules_update on public.schedules
  for update to authenticated
  using (public.current_app_role() in ('admin', 'super_admin'))
  with check (public.current_app_role() in ('admin', 'super_admin'));

drop policy if exists schedules_delete on public.schedules;
create policy schedules_delete on public.schedules
  for delete to authenticated
  using (public.current_app_role() in ('admin', 'super_admin'));


-- -----------------------------------------------------------------------------
-- STEP 4 — VERIFY (do this from the app / browser, not the SQL Editor, which
-- bypasses RLS). Sign in as a `user` account, open DevTools console, and run:
--
--   const { supabase } = await import("/src/lib/supabase.js");   // dev server only
--   await supabase.from("schedules").insert({ employee_id: "<any id>", date: "2026-01-01", status: "OFF" });
--   await supabase.from("employees").delete().eq("id", "<any id>").select();
--   await supabase.from("profiles").update({ role: "super_admin" }).eq("id", (await supabase.auth.getUser()).data.user.id).select();
--
-- Expected: the insert returns a 42501 / RLS error; the delete and update
-- return `data: []` (zero rows affected). Then repeat as an `admin`
-- (schedule insert succeeds, employee delete returns []) and a `super_admin`.
-- -----------------------------------------------------------------------------
