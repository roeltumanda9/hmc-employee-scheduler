-- =============================================================================
-- PROPOSED: lock closed payroll periods.
-- STATUS:   APPLIED to the live project (2026-10-30).
-- Schedules dated before the PREVIOUS payroll period (counted from today in
-- Philippine time) can no longer be added, changed or deleted: their payroll
-- is done. The previous period stays open for late corrections. The app shows
-- those periods read-only (src/lib/dates.js isPeriodLocked); this is the
-- server-side guarantee.
-- Payroll periods: 1st = 27th of the previous month → 11th, 2nd = 12th → 26th.
-- Exceptions:
--  - rows removed because their employee is deleted (cascade);
--  - the automated tests' "E2E Test" department (e2e/db.js), like the
--    E2E exception in proposed_schedule_history.sql.
-- To correct a locked period anyway: run Step 4, fix it, then run Step 2 again.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 — Dates
-- -----------------------------------------------------------------------------

-- First day of the payroll period containing `d`.
create or replace function public.payroll_period_start(d date)
returns date
language sql
immutable
as $$
  select case
    when extract(day from d) >= 27 then date_trunc('month', d)::date + 26
    when extract(day from d) >= 12 then date_trunc('month', d)::date + 11
    else (date_trunc('month', d) - interval '1 month')::date + 26
  end;
$$;

-- Oldest date that can still be edited: the start of the previous period.
create or replace function public.schedule_edit_floor()
returns date
language sql
stable
as $$
  select public.payroll_period_start(
    public.payroll_period_start((now() at time zone 'Asia/Manila')::date) - 1
  );
$$;

grant execute on function public.schedule_edit_floor() to authenticated;


-- -----------------------------------------------------------------------------
-- STEP 2 — The rule
-- -----------------------------------------------------------------------------
create or replace function public.enforce_schedule_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  floor_date date := public.schedule_edit_floor();
  emp public.schedules.employee_id%type := coalesce(new.employee_id, old.employee_id);
begin
  -- Deleting an employee removes their schedules through the foreign key.
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if exists (select 1 from public.employees where id = emp and department = 'E2E Test') then
    return coalesce(new, old);
  end if;

  if (tg_op in ('UPDATE', 'DELETE') and old.date < floor_date)
     or (tg_op in ('INSERT', 'UPDATE') and new.date < floor_date) then
    raise exception 'Schedule period is locked: dates before % can no longer be changed.', floor_date
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists schedules_lock on public.schedules;
create trigger schedules_lock
  before insert or update or delete on public.schedules
  for each row execute function public.enforce_schedule_lock();


-- -----------------------------------------------------------------------------
-- STEP 3 — READ-ONLY CHECK: the date the lock uses today.
-- -----------------------------------------------------------------------------
select public.schedule_edit_floor() as editable_from;


-- -----------------------------------------------------------------------------
-- STEP 4 — ONLY TO CORRECT A LOCKED PERIOD: switch the lock off.
-- Run Step 2 again afterwards to switch it back on.
-- -----------------------------------------------------------------------------
-- drop trigger if exists schedules_lock on public.schedules;
