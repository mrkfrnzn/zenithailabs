import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/leagues");
  const sp = await searchParams;

  return (
    <div className="flex items-start justify-center min-h-[70vh] pt-12">
      <div className="w-full max-w-sm">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-amber-500 mx-auto flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(245,158,11,0.3)]">
            <span className="text-slate-900 font-black text-xl">W</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">CFB War Chest</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to your league</p>
        </div>

        <div className="panel border-[#1e2d45]">
          {sp.error && (
            <div className="mb-4 alert-error">
              {sp.error}
            </div>
          )}
          <form action={loginAction} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="input"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="btn-primary w-full mt-2">
              Enter the league
            </button>
          </form>
        </div>

        <p className="text-xs text-slate-600 mt-4 text-center">
          Default admin:{" "}
          <code className="text-slate-500">admin@warchest.local</code> /{" "}
          <code className="text-slate-500">admin123</code>
        </p>
      </div>
    </div>
  );
}
