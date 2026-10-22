import { useState } from "react";
import { supabase } from "../lib/supabase";
import Icon from "../components/Icon";
import { BTN, BTN_SIZE, CARD, INPUT, LABEL, SPINNER_ON_BRAND } from "../lib/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <div className="relative min-h-dvh flex items-center justify-center p-4 overflow-hidden">
      {/* Soft brand glow behind the card */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgb(34_197_94/0.16),transparent_70%)]"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm animate-pop-in">
        <div className="flex flex-col items-center text-center gap-4 mb-7">
          <img
            src="/logo.png"
            alt="Hofileña Medical Centrum"
            className="w-20 h-20 rounded-full bg-white p-1 ring-1 ring-slate-900/[0.08] shadow-raised"
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight leading-tight text-slate-900">
              Hofileña Medical Centrum
            </h1>
            <p className="text-sm text-green-700 font-medium leading-tight mt-1.5">
              Employee Scheduler
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className={`${CARD} shadow-raised p-6 sm:p-7 space-y-5`}
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Sign in</h2>
            <p className="text-sm text-slate-500 mt-1">
              Enter your email and password to continue.
            </p>
          </div>

          <label className="block">
            <span className={LABEL}>Email</span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hmc.com"
              className={`${INPUT} h-11`}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`${INPUT} h-11`}
            />
          </label>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200/80 px-3.5 py-2.5 text-sm text-rose-800 animate-pop-in"
            >
              <Icon name="alertCircle" size={16} className="mt-0.5 shrink-0 text-rose-500" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`${BTN.primary} ${BTN_SIZE.lg} w-full`}
          >
            {loading ? (
              <>
                <span className={SPINNER_ON_BRAND} />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="mt-5 px-2 text-xs text-slate-500 text-center text-balance leading-relaxed">
          <Icon name="lock" size={12} className="inline-block -mt-0.5 mr-1.5" />
          Accounts are created by IT. Contact IT if you need access.
        </p>
      </div>
    </div>
  );
}
