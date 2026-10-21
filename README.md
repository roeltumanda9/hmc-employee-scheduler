# HMC Employee Scheduler

A web app for planning staff shifts across Hofileña Medical Centrum and its sister businesses. Staff sign in, view and edit schedules by payroll period, manage the employee list, and print signed schedule sheets.

Built with React 19, Vite, Tailwind CSS v4 and Supabase (authentication and database).

## Features

- **Scheduler**: a grid of employees by day for each payroll period (27th–11th and 12th–26th). Admins edit in a draft mode and save all changes at once. Saving is all-or-nothing, and you get a warning if someone else changed the same cells.
- **Employees**: a searchable directory you can filter by department. Super admins add, edit and remove staff.
- **Settings** (super admins): departments, the shifts each one uses and their times, print banners, and the "Prepared by", "Checked by" and "Approved by" signatures.
- **Printing**: a formatted sheet per department with a banner, totals and signature lines.
- **Roles**: `super_admin` (everything), `admin` (edit schedules), `user` (view only). Enforced in the database with row-level security, not just in the browser.
- **Security**: sessions last per browser tab, staff are signed out automatically after 15 minutes of inactivity, and there is no public sign-up. Accounts are created by an administrator.
- **Mobile-friendly**: compact toolbar and grid on phones, and a bottom-sheet shift picker.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # then fill in your Supabase URL and anon key
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |

## Supabase setup

The app expects these tables in the `public` schema: `profiles` (`id`, `email`, `role`), `employees`, `schedules`, `departments` and `print_settings`.

The SQL in [`supabase/`](supabase/) sets up the database. Run it in the Supabase SQL Editor, one step at a time, and do the read-only checks at the top of each file first:

| File | Purpose |
|---|---|
| `proposed_rls.sql` | Row-level security policies by role (reference, for a new project) |
| `proposed_integrity.sql` | Unique and required-field rules, plus the atomic `save_schedule_changes` function |
| `proposed_settings.sql` | `departments` and `print_settings` tables, their policies, and starting data |

In **Authentication** settings, turn off **"Allow new users to sign up"**. To add a staff member, create the account under **Authentication → Users**, then add a matching row in `profiles` with their role.

## Project structure

```
src/
  App.jsx            Auth, layout, navigation, settings loading
  pages/             Employees, Scheduler, Settings, Login
  components/        Schedule grid, dialogs, employee form, error banner
  lib/               Supabase client, settings, dates, shift codes, printing, helpers
supabase/            SQL to set up the database
public/              Logo and print banner images
```

Shift codes and their colors are defined in `src/lib/statuses.js`. Everything else about departments is edited on the Settings page.
