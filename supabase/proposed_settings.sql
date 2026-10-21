-- =============================================================================
-- PROPOSED: department & print settings in the database (audit #18)
-- STATUS:   NOT APPLIED. Run in Supabase → SQL Editor, one step at a time.
-- Needs:    public.current_app_role() (already in this project).
-- Order:    run this BEFORE deploying the app version with the Settings page;
--           until then that version falls back to built-in defaults with
--           blank signature names on printouts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 0 — READ-ONLY CHECKS (run each query on its own)
-- -----------------------------------------------------------------------------

-- Both must be NULL. If either shows a name, a table already exists: stop and
-- send the result before running anything else.
select to_regclass('public.departments') as departments,
       to_regclass('public.print_settings') as print_settings;

-- Employee departments, with counts. After Step 2, every value here must exist
-- in the new departments table or Step 3 will fail. Watch for typos / spaces.
select department, count(*) from public.employees group by department order by 1;


-- -----------------------------------------------------------------------------
-- STEP 1 — Tables and access rules
-- -----------------------------------------------------------------------------
create table public.departments (
  name               text primary key check (btrim(name) <> ''),
  sort_order         integer not null default 0,
  active             boolean not null default true,
  banner_url         text,
  prepared_by_name   text,
  prepared_by_title  text,
  shifts             text[]  not null default array['OFF'],
  -- per-shift time overrides for this department, e.g. {"DUTY": "8:00 AM – 5:00 PM"}
  shift_times        jsonb   not null default '{}'::jsonb,
  updated_at         timestamptz not null default now()
);

create table public.print_settings (
  id                         smallint primary key default 1 check (id = 1),
  default_banner_url         text,
  default_prepared_by_name   text,
  default_prepared_by_title  text,
  checked_by_name            text,
  checked_by_title           text,
  approved_by_name           text,
  approved_by_title          text,
  updated_at                 timestamptz not null default now()
);

alter table public.departments    enable row level security;
alter table public.print_settings enable row level security;

-- Read: any signed-in account with a known role. Write: super_admin only.
create policy departments_select_by_role on public.departments
  for select to authenticated
  using ((select public.current_app_role()) = any (array['super_admin', 'admin', 'user']));
create policy departments_insert_super_admin on public.departments
  for insert to authenticated
  with check ((select public.current_app_role()) = 'super_admin');
create policy departments_update_super_admin on public.departments
  for update to authenticated
  using ((select public.current_app_role()) = 'super_admin')
  with check ((select public.current_app_role()) = 'super_admin');
create policy departments_delete_super_admin on public.departments
  for delete to authenticated
  using ((select public.current_app_role()) = 'super_admin');

create policy print_settings_select_by_role on public.print_settings
  for select to authenticated
  using ((select public.current_app_role()) = any (array['super_admin', 'admin', 'user']));
create policy print_settings_insert_super_admin on public.print_settings
  for insert to authenticated
  with check ((select public.current_app_role()) = 'super_admin');
create policy print_settings_update_super_admin on public.print_settings
  for update to authenticated
  using ((select public.current_app_role()) = 'super_admin')
  with check ((select public.current_app_role()) = 'super_admin');

-- Keep updated_at current (the app uses it to refresh the Settings page).
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger departments_touch before update on public.departments
  for each row execute function public.touch_updated_at();
create trigger print_settings_touch before update on public.print_settings
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- STEP 2 — Starting values (departments, shifts, banners as of 2026-10-21).
-- Staff names are left out on purpose (null) so they aren't published with
-- the source code: after running this, enter the "Prepared by", "Checked by"
-- and "Approved by" names on the app's Settings page.
-- -----------------------------------------------------------------------------
insert into public.departments
  (name, sort_order, banner_url, prepared_by_name, prepared_by_title, shifts, shift_times)
values
  ('Amysthetic', 1, '/logo-banner-amystethic.png', null, 'Info Clerk',
   array['DUTY','IL','OFF'], '{"DUTY": "10:00 AM – 7:00 PM"}'),
  ('H Hotel', 2, '/logo-banner-hhotel.png', null, 'OIC-Manager',
   array['AM','PM','MS','NS','G','9-6','IL','OFF'], '{}'),
  ('JA Grocery / Pharmacy', 3, '/logo-banner-jagrocery.png', null, 'Pharmacist',
   array['AM','PM','DUTY','IL','OFF'], '{"DUTY": "8:00 AM – 5:00 PM"}'),
  ('Wellness', 4, '/logo-banner-wellness.png', null, 'Human Resource Manager',
   array['DUTY','IL','OFF'], '{"DUTY": "8:00 AM – 5:00 PM"}'),
  ('Johanju', 5, '/logo-banner-johanju.png', null, 'Pharmacist',
   array['9-6','C3','IL','OFF'], '{"DUTY": "9:00 AM – 6:00 PM"}'),
  ('HMC', 6, '/logo-banner.png', null, 'Pharmacist',
   array['DUTY','AS','IL','OFF'], '{"DUTY": "8:00 AM – 5:00 PM"}'),
  ('HMC Laboratory', 7, '/logo-banner.png', null, 'MedTech',
   array['AM','DUTY','IL','OFF'], '{"DUTY": "8:00 AM – 5:00 PM"}'),
  ('Hofitea', 8, '/logo-banner-hofitea.png', null, 'Pharmacist',
   array['RS','LS','ES','IL','OFF'], '{}');

insert into public.print_settings
  (id, default_banner_url, default_prepared_by_name, default_prepared_by_title,
   checked_by_name, checked_by_title, approved_by_name, approved_by_title)
values
  (1, '/logo-banner.png', null, 'OIC-Manager',
   null, 'Human Resource Manager',
   null, 'Medical Director');

-- Must return 0 rows before Step 3 (employees whose department has no row).
select e.department, count(*)
from public.employees e
left join public.departments d on d.name = e.department
where d.name is null
group by e.department;


-- -----------------------------------------------------------------------------
-- STEP 3 — Link employees to departments.
-- ON UPDATE CASCADE: renaming a department on the Settings page renames it on
-- every employee. Deleting a department that still has employees is refused.
-- -----------------------------------------------------------------------------
alter table public.employees
  add constraint employees_department_fkey
  foreign key (department) references public.departments (name)
  on update cascade on delete restrict;

notify pgrst, 'reload schema';
