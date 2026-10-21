-- =============================================================================
-- PROPOSED: data-integrity constraints and an atomic schedule save
-- STATUS:   NOT APPLIED. Steps marked DESTRUCTIVE change data — back up first
--           (Database → Backups, or export the tables as CSV).
-- Audit:    #3 (partial saves / duplicate rows), #8 (employee numbers), #15
-- Order:    run proposed_rls.sql first (the RPC relies on current_app_role()).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 0 — READ-ONLY CHECKS
-- -----------------------------------------------------------------------------

-- Duplicate shifts for the same employee + day (must be 0 rows before Step 2).
select employee_id, date, count(*) as copies, array_agg(status) as statuses
from public.schedules
group by employee_id, date
having count(*) > 1
order by date;

-- Duplicate employee numbers (must be 0 rows before Step 3).
select number, count(*), array_agg(name) from public.employees
group by number having count(*) > 1;

-- Employees with no department (must be 0 rows before Step 4).
select id, name, number from public.employees
where department is null or btrim(department) = '';


-- -----------------------------------------------------------------------------
-- STEP 1 — DESTRUCTIVE: remove duplicate schedule rows, keeping one per cell.
-- Review the Step 0 output first. If copies disagree on status, decide which
-- one is right and delete the others by id instead of running this.
-- Keeps the physically newest row (highest ctid); swap in `created_at desc`
-- if the table has that column.
-- -----------------------------------------------------------------------------
-- delete from public.schedules s
-- using (
--   select ctid, row_number() over (partition by employee_id, date order by ctid desc) as rn
--   from public.schedules
-- ) d
-- where s.ctid = d.ctid and d.rn > 1;


-- -----------------------------------------------------------------------------
-- STEP 2 — One shift per employee per day.
-- -----------------------------------------------------------------------------
alter table public.schedules
  add constraint schedules_employee_date_key unique (employee_id, date);


-- -----------------------------------------------------------------------------
-- STEP 3 — Unique employee numbers. The app already retries with a fresh
-- number when the insert hits this constraint (EmployeeForm.jsx).
-- -----------------------------------------------------------------------------
alter table public.employees
  add constraint employees_number_key unique (number);

-- Optional: let the database assign numbers instead of the browser.
-- Only needed if two admins add people at the same moment often; the unique
-- constraint above already prevents duplicates. Assumes `number` is text.
-- create sequence if not exists public.employees_number_seq;
-- select setval('public.employees_number_seq',
--   greatest(1000, (select coalesce(max(number::int), 1000)
--                   from public.employees where number ~ '^\d+$')));
-- alter table public.employees
--   alter column number set default nextval('public.employees_number_seq')::text;


-- -----------------------------------------------------------------------------
-- STEP 4 — Department required (after fixing the Step 0 rows).
-- -----------------------------------------------------------------------------
alter table public.employees alter column department set not null;


-- -----------------------------------------------------------------------------
-- STEP 5 — Atomic save. The app calls this first and falls back to batched
-- writes only while it does not exist (PostgREST error PGRST202).
-- A function body runs in one transaction, so either every change is saved
-- or none is. SECURITY INVOKER: the caller's RLS policies still apply.
-- Requires the unique constraint from Step 2 (ON CONFLICT target).
-- `changes` = [{ "employee_id": "...", "date": "YYYY-MM-DD", "status": "AM" | null }]
-- If Step 0 showed employee_id is not uuid (e.g. bigint), change the type below.
-- -----------------------------------------------------------------------------
create or replace function public.save_schedule_changes(changes jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(public.current_app_role(), '') not in ('admin', 'super_admin') then
    raise exception 'Not allowed to edit schedules' using errcode = '42501';
  end if;

  delete from public.schedules s
  using jsonb_to_recordset(changes) as c(employee_id uuid, date date, status text)
  where c.status is null
    and s.employee_id = c.employee_id
    and s.date = c.date;

  insert into public.schedules (employee_id, date, status)
  select c.employee_id, c.date, c.status
  from jsonb_to_recordset(changes) as c(employee_id uuid, date date, status text)
  where c.status is not null
  on conflict (employee_id, date) do update set status = excluded.status;
end;
$$;

revoke all on function public.save_schedule_changes(jsonb) from public, anon;
grant execute on function public.save_schedule_changes(jsonb) to authenticated;

-- PostgREST caches the schema; make the new function visible immediately.
notify pgrst, 'reload schema';
