-- =============================================================================
-- PROPOSED: leave types (Sick, Maternity, Paternity, Incentive, Unpaid, Other)
-- STATUS:   NOT APPLIED. Run in Supabase → SQL Editor, one step at a time.
-- Needs:    supabase/proposed_shift_types.sql already applied.
-- Order:    safe before or after deploying the app version with "Leave":
--           until this runs, the app treats only IL as leave and the leave
--           picker offers IL alone.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 0 — READ-ONLY CHECK
-- Must return 0 rows. If any of these codes already exists, stop.
-- -----------------------------------------------------------------------------
select code, label from public.shift_types
where code in ('SL', 'ML', 'PL', 'UL', 'OL');


-- -----------------------------------------------------------------------------
-- STEP 1 — Mark shift types as leave
-- Leave days count in the "Leave" total, not as working days or manpower,
-- and every department can use them (the Scheduler's "Leave" picker).
-- -----------------------------------------------------------------------------
alter table public.shift_types
  add column is_leave boolean not null default false;

update public.shift_types set is_leave = true where code = 'IL';


-- -----------------------------------------------------------------------------
-- STEP 2 — The leave types
-- -----------------------------------------------------------------------------
insert into public.shift_types (code, label, default_time, color, sort_order, is_leave)
values
  ('SL', 'Sick Leave',      null, 'red',    101, true),
  ('ML', 'Maternity Leave', null, 'pink',   102, true),
  ('PL', 'Paternity Leave', null, 'purple', 103, true),
  ('UL', 'Unpaid Leave',    null, 'stone',  105, true),
  ('OL', 'Other Leave',     null, 'yellow', 106, true);

-- IL keeps its code and color; it's ordered with the other leave types.
update public.shift_types set sort_order = 104 where code = 'IL';

-- Should list the six leave types.
select code, label, color from public.shift_types where is_leave order by sort_order;

-- -----------------------------------------------------------------------------
-- STEP 3 — Incentive Leave no longer "required"
-- Totals now count every leave type, so only OFF must never be deleted.
-- (IL still can't be deleted while saved schedules use it.)
-- If you already ran Steps 1–2 earlier, run just this step.
-- -----------------------------------------------------------------------------
drop policy if exists shift_types_delete_super_admin on public.shift_types;
create policy shift_types_delete_super_admin on public.shift_types
  for delete to authenticated
  using ((select public.current_app_role()) = 'super_admin' and code <> 'OFF');

-- Leave counts per employee (Employees page) read schedules by status and
-- date; this index keeps that fast as the table grows.
create index if not exists schedules_status_date_idx
  on public.schedules (status, date);

notify pgrst, 'reload schema';
