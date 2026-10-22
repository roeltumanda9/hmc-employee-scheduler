-- =============================================================================
-- PROPOSED: shift types in the database (create / edit / delete on Settings)
-- STATUS:   NOT APPLIED. Run in Supabase → SQL Editor, one step at a time.
-- Needs:    supabase/proposed_settings.sql already applied (departments table,
--           public.touch_updated_at()) and public.current_app_role().
-- Order:    safe to run before or after deploying the app version with the
--           "Shifts" section: until this runs, the app keeps using its
--           built-in shift list and the section shows a setup notice.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 0 — READ-ONLY CHECK
-- Must be NULL. If it shows a name, the table already exists: stop.
-- -----------------------------------------------------------------------------
select to_regclass('public.shift_types') as shift_types;

-- Shift codes currently stored in schedules. Every code here should appear in
-- the Step 2 insert (unknown codes still display, but in grey).
select status, count(*) from public.schedules group by status order by 1;


-- -----------------------------------------------------------------------------
-- STEP 1 — Table and access rules
-- -----------------------------------------------------------------------------
create table public.shift_types (
  -- Stored in schedules.status, so it can't be renamed once created.
  code          text primary key check (code ~ '^[A-Z0-9][A-Z0-9-]{0,5}$'),
  label         text not null check (btrim(label) <> ''),
  -- Standard time; departments can override it (departments.shift_times).
  default_time  text,
  -- A key from SHIFT_COLORS in src/lib/statuses.js (unknown keys show grey).
  color         text not null default 'gray' check (color ~ '^[a-z]+$'),
  sort_order    integer not null default 0,
  updated_at    timestamptz not null default now()
);

alter table public.shift_types enable row level security;

-- Read: any signed-in account with a known role. Write: super_admin only.
-- OFF drives the day totals, so it can never be deleted (IL was protected too
-- until supabase/proposed_leave_types.sql Step 3 made every leave type equal).
create policy shift_types_select_by_role on public.shift_types
  for select to authenticated
  using ((select public.current_app_role()) = any (array['super_admin', 'admin', 'user']));
create policy shift_types_insert_super_admin on public.shift_types
  for insert to authenticated
  with check ((select public.current_app_role()) = 'super_admin');
create policy shift_types_update_super_admin on public.shift_types
  for update to authenticated
  using ((select public.current_app_role()) = 'super_admin')
  with check ((select public.current_app_role()) = 'super_admin');
create policy shift_types_delete_super_admin on public.shift_types
  for delete to authenticated
  using ((select public.current_app_role()) = 'super_admin'
         and code not in ('OFF', 'IL'));

create trigger shift_types_touch before update on public.shift_types
  for each row execute function public.touch_updated_at();

-- Codes are permanent (schedules store them).
create or replace function public.shift_types_keep_code()
returns trigger language plpgsql as $$
begin
  if new.code <> old.code then
    raise exception 'A shift code cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger shift_types_keep_code before update on public.shift_types
  for each row execute function public.shift_types_keep_code();

-- Deleting: refuse while any schedule still uses the code; otherwise remove it
-- from every department's shift list and time overrides in the same
-- transaction. SECURITY DEFINER so the check sees every schedule row.
create or replace function public.shift_types_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  select count(*) into used from public.schedules where status = old.code;
  if used > 0 then
    raise exception 'Shift % is used in % saved schedule entries', old.code, used
      using errcode = '23503';
  end if;

  update public.departments
     set shifts = array_remove(shifts, old.code),
         shift_times = shift_times - old.code
   where old.code = any (shifts) or shift_times ? old.code;

  return old;
end;
$$;

revoke all on function public.shift_types_before_delete() from public, anon, authenticated;

create trigger shift_types_before_delete before delete on public.shift_types
  for each row execute function public.shift_types_before_delete();


-- -----------------------------------------------------------------------------
-- STEP 2 — Starting values: the shifts built into the app as of 2026-10-22.
-- -----------------------------------------------------------------------------
insert into public.shift_types (code, label, default_time, color, sort_order)
values
  ('DUTY', 'Duty',            '10:00 AM – 7:00 PM', 'sky',     1),
  ('AM',   'AM Shift',        '6:00 AM – 2:00 PM',  'blue',    2),
  ('PM',   'PM Shift',        '2:00 PM – 10:00 PM', 'amber',   3),
  ('MS',   'Morning Shift',   '6:00 AM – 6:00 PM',  'emerald', 4),
  ('NS',   'Night Shift',     '6:00 PM – 6:00 AM',  'indigo',  5),
  ('G',    'Graveyard Shift', '10:00 PM – 6:00 AM', 'slate',   6),
  ('9-6',  '9-6 Shift',       '9:00 AM – 6:00 PM',  'orange',  7),
  ('AS',   'Afternoon Shift', '2:00 PM – 10:00 PM', 'rose',    8),
  ('RS',   'Regular Shift',   '8:00 AM – 5:00 PM',  'cyan',    9),
  ('LS',   'Late Shift',      '11:00 AM – 8:00 PM', 'violet', 10),
  ('ES',   'Extended Shift',  '8:00 AM – 8:00 PM',  'fuchsia',11),
  ('OFF',  'Day Off',         null,                 'gray',   12),
  ('IL',   'Incentive Leave', null,                 'mint',   13),
  ('C3',   'C3',              null,                 'teal',   14);

-- Should return 14.
select count(*) from public.shift_types;

notify pgrst, 'reload schema';
