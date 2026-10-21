import { useState } from "react";
import { supabase } from "../lib/supabase";

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <img
            src="/logo.png"
            alt="Hofileña Medical Centrum"
            className="w-20 h-20 rounded-full bg-white p-0.5 ring-1 ring-green-100"
          />
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-tight text-green-900">
              Hofileña Medical Centrum
            </h1>
            <p className="text-sm text-green-700/70 leading-tight mt-1">
              Employee Scheduler
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-6 space-y-4"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-800">Sign in</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your email and password to continue.
            </p>
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1.5">
              Email
            </span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hmc.com"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1.5">
              Password
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
            />
          </label>

          {error && (
            <div className="rounded-xl bg-rose-50 ring-1 ring-rose-100 px-3.5 py-2.5 text-xs text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 active:scale-95 shadow-sm shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <p className="text-[11px] text-slate-400 text-center">
            Accounts are created by HR. Contact the admin if you need access.
          </p>
        </form>
      </div>
    </div>
  );
}
