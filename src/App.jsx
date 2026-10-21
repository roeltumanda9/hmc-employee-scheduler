import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { canManageEmployees, getMyProfile, ROLE_LABELS } from "./lib/auth";
import { DEFAULT_SETTINGS, SettingsContext, loadSettings } from "./lib/settings";
import LoginPage from "./pages/LoginPage";
import EmployeesPage from "./pages/EmployeesPage";
import SchedulerPage from "./pages/SchedulerPage";
import SettingsPage from "./pages/SettingsPage";
import { useAutoLogout } from "./lib/useAutoLogout";
import IdleWarningModal from "./components/IdleWarningModal";
import ConfirmModal from "./components/ConfirmModal";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
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
        setProfile(null);
        // Drop loaded settings so staff names don't linger in memory.
        setSettings(DEFAULT_SETTINGS);
        setProfileLoading(false);
        setProfileError("");
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
          setProfile(null);
          setProfileError("");
          return;
        }

        setSession(data.session ?? null);
      } catch (error) {
        if (!active) return;

        console.error("Authentication initialization failed:", error);
        setSession(null);
        setProfile(null);
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

  useEffect(() => {
    let active = true;

    if (!sessionUserId) {
      setProfile(null);
      setProfileLoading(false);
      setProfileError("");
      return;
    }

    async function loadProfile() {
      setProfileLoading(true);
      setProfileError("");
      setProfile(null);

      try {
        const userProfile = await getMyProfile();

        if (!active) return;

        if (!userProfile) {
          setProfileError(
            "Your profile could not be loaded. Please sign in again or contact your administrator.",
          );
          return;
        }

        if (userProfile.id !== sessionUserId) {
          setProfileError(
            "Your profile does not match the current session. Please sign in again.",
          );
          return;
        }

        setProfile(userProfile);
      } catch (error) {
        if (!active) return;

        console.error("Profile loading failed:", error);
        setProfileError(
          "An error occurred while loading your profile. Please try again.",
        );
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [sessionUserId]);

  // Load settings once the profile (and so the role used by RLS) is known.
  // They're reset on sign-out in the auth handler above.
  const profileId = profile?.id;
  useEffect(() => {
    if (profileId) reloadSettings();
  }, [profileId, reloadSettings]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [page]);

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
      setPage(id);
    }
  }

  // --- Loading ---
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-green-600 rounded-full animate-spin" />
      </div>
    );
  }

  // --- Not signed in ---
  if (!session) return <LoginPage />;

  // --- Profile loading ---
  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-green-600 rounded-full animate-spin" />
      </div>
    );
  }

  // --- Profile unavailable ---
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
          <h2 className="text-lg font-bold text-slate-800">
            Unable to load your profile
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            {profileError ||
              "Your account profile is unavailable. Please sign in again or contact your administrator."}
          </p>

          <button
            onClick={async () => {
              const { error } = await supabase.auth.signOut();

              if (error) {
                console.error("Sign out failed:", error);
                setProfileError(
                  "Unable to sign out. Please refresh the page and try again.",
                );
              }
            }}
            className="mt-5 w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition"
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
    { id: "employees", label: "Employees", icon: "👥" },
    { id: "scheduler", label: "Scheduler", icon: "📅" },
    ...(canManageSettings
      ? [{ id: "settings", label: "Settings", icon: "⚙️" }]
      : []),
  ];

  const pageTitle = {
    employees: "Employees",
    scheduler: "Scheduler",
    settings: "Settings",
  }[effectivePage];

  return (
    <SettingsContext.Provider value={settings}>
    <div className="min-h-screen flex bg-slate-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky md:top-0 md:h-screen inset-y-0 left-0 z-50 w-64 flex flex-col transform transition-transform duration-200 ease-out
          bg-green-50/70 border-r border-green-100
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className="px-5 py-5 border-b border-green-100 flex items-center justify-between">
          <div className="flex flex-col items-center text-center gap-3 w-full min-w-0">
            <img
              src="/logo.png"
              alt="Hofileña Medical Centrum"
              className="w-20 h-20 rounded-full bg-white p-0.5 shrink-0 ring-1 ring-green-100"
            />
            <div className="min-w-0 w-full">
              <h1 className="text-xl font-bold tracking-tight leading-tight text-green-900">
                Hofileña Medical Centrum
              </h1>
              <p className="text-base text-green-700/70 leading-tight mt-0.5">
                Employee Scheduler
              </p>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden w-8 h-8 grid place-items-center rounded-lg text-green-800 hover:bg-green-100 transition shrink-0"
            title="Close menu"
            aria-label="Close menu"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = effectivePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => goToPage(item.id)}
                aria-current={active ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition ${
                  active
                    ? "bg-green-600 text-white shadow-sm shadow-green-200"
                    : "text-green-900/80 hover:bg-green-100/70 hover:text-green-900"
                }`}
              >
                <span className="text-base" aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer: signed in as + role + sign out */}
        <div className="p-3 border-t border-green-100 space-y-2">
          <div className="px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-green-800/60 font-semibold">
              Signed in as
            </p>
            <p className="text-xs text-green-900 truncate">{profile.email}</p>
            <p className="text-[10px] text-green-700/70 mt-0.5">
              {ROLE_LABELS[role] || role}
            </p>
          </div>
          <button
            onClick={() => setConfirmSignOut(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg text-green-800 hover:bg-green-100/70 transition"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white/80 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-3 md:py-4 flex items-center gap-4 sticky top-0 z-30">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-9 h-9 grid place-items-center rounded-xl text-slate-600 hover:bg-slate-100 transition shrink-0"
            title="Open menu"
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Page title block */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Icon in a soft green badge */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-green-700 grid place-items-center shrink-0 shadow-sm shadow-green-200">
              {effectivePage === "employees" ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              ) : effectivePage === "settings" ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              )}
            </div>

            {/* Text */}
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold leading-tight">
                Hofileña Medical Centrum
              </p>
              <h2 className="text-lg md:text-xl font-bold text-slate-800 leading-tight truncate">
                {pageTitle}
              </h2>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-6 flex-1">
          {effectivePage === "employees" ? (
            <EmployeesPage role={role} />
          ) : effectivePage === "settings" ? (
            <SettingsPage role={role} onSaved={reloadSettings} />
          ) : (
            <SchedulerPage role={role} onDirtyChange={setSchedulerDirty} />
          )}
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
          setPage(next);
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
        icon={
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        }
        onConfirm={async () => {
          setConfirmSignOut(false);

          // Clear protected information immediately.
          setSession(null);
          setProfile(null);
          setProfileError("");
          setProfileLoading(false);
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
