import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { canManageEmployees, getMyProfile, ROLE_LABELS } from "./lib/auth";
import { DEFAULT_SETTINGS, SettingsContext, loadSettings } from "./lib/settings";
// Pages load on first use, so the sign-in screen doesn't wait for them.
const LoginPage = lazy(() => import("./pages/LoginPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const SchedulerPage = lazy(() => import("./pages/SchedulerPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
import { useAutoLogout } from "./lib/useAutoLogout";
import IdleWarningModal from "./components/IdleWarningModal";
import ConfirmModal from "./components/ConfirmModal";
import Icon from "./components/Icon";
import { BTN, BTN_SIZE, CARD, EYEBROW, SPINNER } from "./lib/ui";

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Outcome of loading a user's profile: { userId, profile, error }. Tied to
  // the user it was loaded for, so a stale result never shows for another.
  const [profileResult, setProfileResult] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // True while the scheduler holds unsaved edits; guards page switches.
  const [schedulerDirty, setSchedulerDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState(null);

  const [page, setPage] = useState(() => {
    const saved = localStorage.getItem("hmc_page");
    return ["employees", "scheduler", "settings"].includes(saved)
      ? saved
      : "employees";
  });

  // Department & print settings from the database (built-in defaults until loaded)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const reloadSettings = useCallback(async () => {
    const next = await loadSettings();
    if (next.loadError) console.error("Settings:", next.loadError);
    setSettings(next);
  }, []);

  // Auto-logout after inactivity (only when signed in)
  const {
    warning: idleWarning,
    deadline: idleDeadline,
    staySignedIn,
  } = useAutoLogout(!!session);

  // --- Auth bootstrap ---
  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;

      setSession(nextSession);

      if (!nextSession || event === "SIGNED_OUT") {
        setProfileResult(null);
        // Drop loaded settings so staff names don't linger in memory.
        setSettings(DEFAULT_SETTINGS);
        setConfirmSignOut(false);
        setSidebarOpen(false);
      }
    });

    async function initializeAuth() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active) return;

        if (error) {
          console.error("Failed to restore session:", error);
          setSession(null);
          setProfileResult(null);
          return;
        }

        setSession(data.session ?? null);
      } catch (error) {
        if (!active) return;

        console.error("Authentication initialization failed:", error);
        setSession(null);
        setProfileResult(null);
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    initializeAuth();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // --- Load the signed-in user's profile ---
  const sessionUserId = session?.user?.id;

  const result = profileResult?.userId === sessionUserId ? profileResult : null;
  const profile = result?.profile ?? null;
  const profileError = result?.error ?? "";
  const profileLoading = !!sessionUserId && !result;

  useEffect(() => {
    if (!sessionUserId) return;
    let active = true;
    const finish = (userProfile, error = "") =>
      setProfileResult({ userId: sessionUserId, profile: userProfile, error });

    getMyProfile()
      .then((userProfile) => {
        if (!active) return;

        if (!userProfile) {
          finish(
            null,
            "Your profile could not be loaded. Please sign in again or contact your administrator.",
          );
          return;
        }

        if (userProfile.id !== sessionUserId) {
          finish(
            null,
            "Your profile does not match the current session. Please sign in again.",
          );
          return;
        }

        finish(userProfile);
        // Settings are read under RLS, so they load once the role is known.
        // They're reset on sign-out in the auth handler above.
        reloadSettings();
      })
      .catch((error) => {
        if (!active) return;

        console.error("Profile loading failed:", error);
        finish(null, "An error occurred while loading your profile. Please try again.");
      });

    return () => {
      active = false;
    };
  }, [sessionUserId, reloadSettings]);

  // Switching pages also closes the mobile sidebar.
  function showPage(id) {
    setPage(id);
    setSidebarOpen(false);
  }

  useEffect(() => {
    localStorage.setItem("hmc_page", page);
  }, [page]);

  useEffect(() => {
    if (sidebarOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      function onKey(e) {
        if (e.key === "Escape") setSidebarOpen(false);
      }
      window.addEventListener("keydown", onKey);
      return () => {
        document.body.style.overflow = prev;
        window.removeEventListener("keydown", onKey);
      };
    }
  }, [sidebarOpen]);

  function goToPage(id) {
    if (id !== page && page === "scheduler" && schedulerDirty) {
      setPendingPage(id);
    } else {
      showPage(id);
    }
  }

  // --- Loading ---
  if (authLoading) return <FullScreenLoader />;

  // --- Not signed in ---
  if (!session) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <LoginPage />
      </Suspense>
    );
  }

  // --- Profile loading ---
  if (profileLoading) return <FullScreenLoader />;

  // --- Profile unavailable ---
  if (!profile) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className={`${CARD} w-full max-w-md p-6 sm:p-8 text-center animate-pop-in`}>
          <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-600/15 grid place-items-center">
            <Icon name="alert" size={22} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900 tracking-tight">
            Unable to load your profile
          </h2>

          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {profileError ||
              "Your account profile is unavailable. Please sign in again or contact your administrator."}
          </p>

          <button
            onClick={async () => {
              const { error } = await supabase.auth.signOut();

              if (error) {
                console.error("Sign out failed:", error);
                setProfileResult({
                  userId: sessionUserId,
                  profile: null,
                  error: "Unable to sign out. Please refresh the page and try again.",
                });
              }
            }}
            className={`${BTN.primary} ${BTN_SIZE.lg} mt-6 w-full`}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const role = profile.role;
  const canManageSettings = canManageEmployees(role);
  const effectivePage =
    page === "settings" && !canManageSettings ? "employees" : page;

  const navItems = [
    { id: "employees", label: "Employees", icon: "users" },
    { id: "scheduler", label: "Scheduler", icon: "calendar" },
    ...(canManageSettings
      ? [{ id: "settings", label: "Settings", icon: "sliders" }]
      : []),
  ];

  const pageTitle = {
    employees: "Employees",
    scheduler: "Scheduler",
    settings: "Settings",
  }[effectivePage];

  const pageIcon = navItems.find((n) => n.id === effectivePage)?.icon || "users";

  return (
    <SettingsContext.Provider value={settings}>
    <div className="min-h-dvh flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] md:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky md:top-0 md:h-dvh inset-y-0 left-0 z-50 w-64 flex flex-col transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
          bg-white border-r border-slate-900/[0.06] ${sidebarOpen ? "shadow-overlay md:shadow-none" : ""}
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className="px-4 pt-5 pb-4 flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="Hofileña Medical Centrum"
              className="w-12 h-12 rounded-full bg-white p-0.5 shrink-0 ring-1 ring-slate-900/[0.08] shadow-card"
            />
            <div className="min-w-0">
              <h1 className="text-[0.9375rem] font-semibold tracking-tight leading-tight text-slate-900">
                Hofileña Medical Centrum
              </h1>
              <p className="text-xs text-green-700 font-medium leading-tight mt-1">
                Employee Scheduler
              </p>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className={`${BTN.ghost} ${BTN_SIZE.iconSm} md:hidden shrink-0 -mr-1`}
            title="Close menu"
            aria-label="Close menu"
          >
            <Icon name="x" size={16} strokeWidth={2.5} />
          </button>
        </div>

        <nav className="flex-1 px-3 pt-2 space-y-1" aria-label="Main">
          <div className={`${EYEBROW} px-3 pb-2`} aria-hidden="true">
            Workspace
          </div>
          {navItems.map((item) => {
            const active = effectivePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => goToPage(item.id)}
                aria-current={active ? "page" : undefined}
                className={`group w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-green-50 text-green-800 ring-1 ring-inset ring-green-600/15"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon
                  name={item.icon}
                  size={18}
                  className={
                    active
                      ? "text-green-600"
                      : "text-slate-400 group-hover:text-slate-600 transition-colors"
                  }
                />
                {item.label}
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-600" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer: signed in as + role + sign out */}
        <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-100 space-y-1.5">
          <div className="min-w-0 px-3 py-2">
            <p className="text-[0.625rem] uppercase tracking-wider font-semibold text-slate-400">
              Signed in as
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-900 truncate">{profile.email}</p>
            <p className="mt-1">
              <span className="inline-flex items-center text-[0.625rem] uppercase tracking-wider font-semibold text-green-800 bg-green-50 ring-1 ring-inset ring-green-600/15 rounded-full px-1.5 py-0.5">
                {ROLE_LABELS[role] || role}
              </span>
            </p>
          </div>
          <button
            onClick={() => setConfirmSignOut(true)}
            className={`${BTN.ghost} ${BTN_SIZE.md} w-full justify-start px-3`}
          >
            <Icon name="logout" size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 sm:h-16 md:h-14 bg-white/80 backdrop-blur-md border-b border-slate-900/[0.06] px-3 sm:px-4 md:px-6 flex items-center gap-2 sm:gap-3">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className={`${BTN.ghost} ${BTN_SIZE.icon} md:hidden shrink-0`}
            title="Open menu"
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
          >
            <Icon name="menu" size={20} strokeWidth={2.25} />
          </button>

          {/* Page title block */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="hidden sm:grid w-10 h-10 md:w-9 md:h-9 rounded-xl bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/15 place-items-center shrink-0"
              aria-hidden="true"
            >
              <Icon name={pageIcon} size={20} />
            </div>

            <div className="min-w-0">
              <p className="text-[0.625rem] uppercase tracking-[0.12em] text-slate-400 font-semibold leading-tight truncate md:hidden">
                Hofileña Medical Centrum
              </p>
              <h2 className="text-lg md:text-xl font-semibold text-slate-900 tracking-tight leading-tight truncate">
                {pageTitle}
              </h2>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-6 flex-1">
          <Suspense
            fallback={
              <div className="py-20 grid place-items-center">
                <span className={`${SPINNER} w-6 h-6`} role="status" aria-label="Loading" />
              </div>
            }
          >
            {effectivePage === "employees" ? (
              <EmployeesPage role={role} />
            ) : effectivePage === "settings" ? (
              <SettingsPage role={role} onSaved={reloadSettings} />
            ) : (
              <SchedulerPage role={role} onDirtyChange={setSchedulerDirty} />
            )}
          </Suspense>
        </div>
      </main>

      {/* Idle auto-logout warning */}
      <IdleWarningModal
        open={idleWarning}
        deadline={idleDeadline}
        onStaySignedIn={staySignedIn}
      />

      {/* Leaving the scheduler with unsaved edits */}
      <ConfirmModal
        open={pendingPage !== null}
        title="Discard unsaved changes?"
        message="You have unsaved schedule changes. Leaving the Scheduler will discard them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        variant="warning"
        onConfirm={() => {
          const next = pendingPage;
          setPendingPage(null);
          showPage(next);
        }}
        onCancel={() => setPendingPage(null)}
      />

      {/* Sign out confirmation */}
      <ConfirmModal
        open={confirmSignOut}
        title="Sign out?"
        message={
          schedulerDirty
            ? "You have unsaved schedule changes that will be lost. You'll need to log in again to access the app."
            : "You'll need to log in again to access the app."
        }
        confirmLabel="Yes, sign out"
        cancelLabel="Stay"
        variant="warning"
        icon={<Icon name="logout" size={22} strokeWidth={2.25} />}
        onConfirm={async () => {
          setConfirmSignOut(false);

          // Clear protected information immediately.
          setSession(null);
          setProfileResult(null);
          sessionStorage.removeItem("hmc_last_activity");

          const { error } = await supabase.auth.signOut({
            scope: "local",
          });

          if (error) {
            console.error("Sign out failed:", error);
          }
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </div>
    </SettingsContext.Provider>
  );
}

function FullScreenLoader() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-5">
      <img
        src="/logo.png"
        alt=""
        className="w-14 h-14 rounded-full bg-white p-0.5 ring-1 ring-slate-900/[0.08] shadow-raised"
      />
      <span className={`${SPINNER} w-5 h-5`} role="status" aria-label="Loading" />
    </div>
  );
}
