-- =============================================================================
-- Schedule change history: who changed which shift, when, from what to what.
-- Run in Supabase → SQL Editor (all steps at once is fine).
-- Needs: proposed_rls.sql (current_app_role()).
--
-- A trigger on `schedules` writes one row per added / changed / removed shift,
-- whichever way the change was made (the app's save, the SQL editor, ...).
-- Nobody can edit history rows, and only test rows (employees named "E2E, …",
-- created by the end-to-end tests) can be deleted, by a super_admin.
-- Admins and super_admins can read it (Scheduler → History).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 — The table. Employee name and editor email are copied in, so the
-- history still reads correctly after an employee or account is deleted.
-- -----------------------------------------------------------------------------
create table if not exists public.schedule_history (
  id               bigint generated always as identity primary key,
  changed_at       timestamptz not null default now(),
  changed_by       uuid,
  changed_by_email text,
  action           text not null check (action in ('added', 'changed', 'removed')),
  employee_id      uuid not null,
  employee_name    text,
  date             date not null,
  old_status       text,
  new_status       text
);

create index if not exists schedule_history_lookup
  on public.schedule_history (date, employee_id);
create index if not exists schedule_history_recent
  on public.schedule_history (changed_at desc);


-- -----------------------------------------------------------------------------
-- STEP 2 — The trigger. SECURITY DEFINER so it can write history (clients
-- can't insert directly) and read the editor's email from profiles.
-- An update that keeps the same shift (the atomic save upserts) is skipped.
-- -----------------------------------------------------------------------------
create or replace function public.log_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.schedules;
  act text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.date = old.date and new.employee_id = old.employee_id then
    return null;
  end if;

  row_data := case when tg_op = 'DELETE' then old else new end;
  act := case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'removed' end;

  insert into public.schedule_history
    (changed_by, changed_by_email, action, employee_id, employee_name, date, old_status, new_status)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    act,
    row_data.employee_id,
    (select name from public.employees where id = row_data.employee_id),
    row_data.date,
    case when tg_op = 'INSERT' then null else old.status end,
    case when tg_op = 'DELETE' then null else new.status end
  );
  return null;
end;
$$;

drop trigger if exists schedules_history on public.schedules;
create trigger schedules_history
  after insert or update or delete on public.schedules
  for each row execute function public.log_schedule_change();


-- -----------------------------------------------------------------------------
-- STEP 3 — Access. Read: admin and super_admin. No insert/update policies:
-- only the trigger writes. Delete: super_admin, end-to-end test rows only.
-- -----------------------------------------------------------------------------
alter table public.schedule_history enable row level security;

drop policy if exists schedule_history_select on public.schedule_history;
create policy schedule_history_select on public.schedule_history
  for select to authenticated
  using (public.current_app_role() in ('admin', 'super_admin'));

drop policy if exists schedule_history_delete_e2e on public.schedule_history;
create policy schedule_history_delete_e2e on public.schedule_history
  for delete to authenticated
  using (public.current_app_role() = 'super_admin' and employee_name like 'E2E, %');

revoke all on public.schedule_history from anon;
grant select, delete on public.schedule_history to authenticated;

-- PostgREST caches the schema; make the new table visible immediately.
notify pgrst, 'reload schema';
