# HMC Employee Scheduler

A web app for planning staff shifts across Hofileña Medical Centrum and its sister businesses. It replaces paper and spreadsheet schedules with one shared, always-up-to-date schedule that works on a computer or a phone.

## How it helps

- **One source of truth.** Everyone sees the same schedule, so there are no outdated printouts or conflicting copies.
- **Faster scheduling.** Copy the previous period in one click, then adjust only what changed.
- **Fewer mistakes.** Changes are a draft until you press Save, unsaved cells are marked, and you're warned if someone else edited the same days.
- **Payroll-ready.** Schedules follow the payroll periods (27th–11th and 12th–26th), with working days, days off and leave totalled automatically.
- **Fair, controlled leave.** Each employee's leave is tracked by type and capped at 5 days per year, so no one goes over by accident.
- **Ready to sign.** Print a clean sheet per department with its banner, totals and "Prepared / Checked / Approved by" signature lines.
- **Safe on shared computers.** Each person signs in with their own account and is signed out automatically after 15 minutes of inactivity.

## Features

### Scheduler
- A grid of employees by day for each payroll period, with the month shown above the dates and today highlighted.
- On desktop the whole period fits on screen with no sideways scrolling. On phones the names stay pinned while you swipe through the days.
- **Edit mode:** tap a cell to pick a shift. Changes stay a draft until you **Save**, which saves everything at once. **Cancel** undoes them all.
- **Copy previous period:** fills empty days with the same weekday's shift from the last period. Shifts you've already entered are never overwritten.
- **Unsaved changes** are marked with a small dot, and a message confirms when the schedule is saved.
- **Clear** empties a whole period in one step, if you need to start over.
- **Totals** per employee (Leave, Physical Present, Physical Off, Total Working Days) and a daily **Total manpower** row.
- **Print** a formatted department sheet with banner, legend, totals and signature lines.
- **Phone friendly:** a large, easy-to-tap shift picker that slides up from the bottom, and Save/Cancel within thumb reach.

### Leave
- One **Leave** option in the shift picker, with six types: Sick, Maternity, Paternity, Incentive, Unpaid and Other.
- Leave counts toward the **Leave** total, not as a working day or toward daily manpower.
- **5 leave days per employee per year**, all types combined. Once someone reaches the limit, Leave is locked for them and the picker shows how many days are used.

### Employees
- A searchable directory, grouped by department, with a department filter.
- Each employee's **leave this year** is shown at a glance (e.g. `3/5 · SL 2 · IL 1`). Hover a chip to see the exact dates.
- Super admins can add, edit and remove staff. Employee numbers are assigned automatically.

### Settings (super admins)
- **Shifts:** create, edit and delete shift types, each with its code, name, standard time and color. Mark a type as leave to add a new kind of leave.
- **Departments:** choose which shifts each department uses and in what order, set department-specific times, and add the print banner and "Prepared by" signatory.
- **Print signatures:** the default "Prepared by", "Checked by" and "Approved by" names and titles.

## Who can do what

| Role | Can |
|---|---|
| **Super admin** | Everything: manage employees, edit schedules, and change settings |
| **Admin** | View and edit schedules |
| **User** | View schedules only |

These permissions are enforced on the server, not just hidden in the app. There is no public sign-up: accounts are created by an administrator.

## Running it locally

Requires Node.js 20 or newer and a `.env` file with the Supabase URL and anon key (see `.env.example`).

```bash
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run build` | Build for production into `dist/` |
| `npm test` | Run the automated tests |
| `npm run lint` | Check the code for problems |

Built with React 19, Vite, Tailwind CSS v4 and Supabase.
