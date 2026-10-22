-- =============================================================================
-- PROPOSED: at most 5 leave days per employee per calendar year (all leave
-- types together: SL, ML, PL, IL, UL, OL and any other is_leave type).
-- STATUS:   NOT APPLIED. Run in Supabase → SQL Editor, one step at a time.
-- Needs:    supabase/proposed_leave_types.sql already applied (is_leave).
-- The app blocks extra leave in the shift picker; this is the server-side
-- guarantee. To change the limit, change 5 here AND MAX_LEAVE_DAYS_PER_YEAR
-- in src/lib/statuses.js.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 0 — READ-ONLY CHECK: employees already over the limit.
-- The rule only stops NEW leave, but anyone listed here can't be given more
-- leave this year until some of it is changed. Review before Step 1.
-- -----------------------------------------------------------------------------
select s.employee_id, e.name, extract(year from s.date) as year, count(*) as leave_days
from public.schedules s
join public.shift_types t on t.code = s.status and t.is_leave
left join public.employees e on e.id = s.employee_id
group by s.employee_id, e.name, extract(year from s.date)
having count(*) > 5
order by year desc, leave_days desc;


-- -----------------------------------------------------------------------------
-- STEP 1 — The rule
-- A DEFERRED constraint trigger checks at the end of the transaction, so a
-- save that moves leave from one day to another (one atomic
-- save_schedule_changes call) is judged on the final result, not on the
-- order rows were written. SECURITY DEFINER so the count sees every row.
-- -----------------------------------------------------------------------------
create or replace function public.schedules_leave_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  yr integer;
  used integer;
begin
  if not exists (
    select 1 from public.shift_types where code = new.status and is_leave
  ) then
    return null;
  end if;

  yr := extract(year from new.date)::integer;

  select count(*) into used
  from public.schedules s
  join public.shift_types t on t.code = s.status and t.is_leave
  where s.employee_id = new.employee_id
    and s.date >= make_date(yr, 1, 1)
    and s.date < make_date(yr + 1, 1, 1);

  if used > 5 then
    raise exception 'Leave limit: % leave days in % (maximum 5 per year)', used, yr
      using errcode = 'P0001', hint = 'leave_limit';
  end if;
  return null;
end;
$$;

revoke all on function public.schedules_leave_limit() from public, anon, authenticated;

create constraint trigger schedules_leave_limit
  after insert or update on public.schedules
  deferrable initially deferred
  for each row execute function public.schedules_leave_limit();

notify pgrst, 'reload schema';
