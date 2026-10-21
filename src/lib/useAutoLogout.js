
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

// 15 minutes of inactivity before sign-out
const IDLE_TIMEOUT = 15 * 60 * 1000;

// Show warning 2 minutes before sign-out
const WARN_BEFORE = 2 * 60 * 1000;

// sessionStorage is isolated per tab and survives refreshes
const STORAGE_KEY = "hmc_last_activity";

export function useAutoLogout(enabled) {
  const [warning, setWarning] = useState(false);
  // Timestamp (ms) at which the idle sign-out will happen, for the countdown.
  const [deadline, setDeadline] = useState(null);
  const warningRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setWarning(false);
      warningRef.current = false;
      return;
    }

    let disposed = false;
    let logoutStarted = false;

    function showWarning() {
      if (disposed) return;

      const last = Number(sessionStorage.getItem(STORAGE_KEY));
      setDeadline(
        Number.isFinite(last) && last > 0
          ? last + IDLE_TIMEOUT
          : Date.now() + WARN_BEFORE,
      );
      warningRef.current = true;
      setWarning(true);
    }

    function recordActivity() {
      if (disposed || logoutStarted || warningRef.current) return;

      sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
    }

    async function signOutForInactivity() {
      if (disposed || logoutStarted) return;

      logoutStarted = true;
      sessionStorage.removeItem(STORAGE_KEY);

      try {
        // "local" ends this tab's session: Supabase revokes its refresh
        // token server-side, but an already-issued access token stays valid
        // until it expires (the project's JWT expiry setting).
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
      } catch (error) {
        if (disposed) return;

        console.error("Automatic sign-out failed:", error);

        // Allow the user to recover if sign-out fails.
        sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
        logoutStarted = false;
        showWarning();
      }
    }

    const stored = Number(sessionStorage.getItem(STORAGE_KEY));
    const now = Date.now();

    if (!Number.isFinite(stored) || stored <= 0) {
      sessionStorage.setItem(STORAGE_KEY, String(now));
    } else {
      const elapsed = Math.max(0, now - stored);

      if (elapsed >= IDLE_TIMEOUT) {
        void signOutForInactivity();
      } else if (elapsed >= IDLE_TIMEOUT - WARN_BEFORE) {
        showWarning();
      } else {
        warningRef.current = false;
        setWarning(false);
      }
    }

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, {
        passive: true,
      });
    });

    function onVisible() {
      if (
        document.visibilityState === "visible" &&
        !warningRef.current
      ) {
        recordActivity();
      }
    }

    document.addEventListener("visibilitychange", onVisible);

    const interval = setInterval(() => {
      if (disposed || logoutStarted) return;

      const last = Number(sessionStorage.getItem(STORAGE_KEY));

      if (!Number.isFinite(last) || last <= 0) {
        void signOutForInactivity();
        return;
      }

      const elapsed = Math.max(0, Date.now() - last);

      if (elapsed >= IDLE_TIMEOUT) {
        void signOutForInactivity();
      } else if (elapsed >= IDLE_TIMEOUT - WARN_BEFORE) {
        showWarning();
      }
    }, 3000);

    return () => {
      disposed = true;

      events.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });

      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [enabled]);

  function staySignedIn() {
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
    warningRef.current = false;
    setWarning(false);
    setDeadline(null);
  }

  return { warning, deadline, staySignedIn };
}
