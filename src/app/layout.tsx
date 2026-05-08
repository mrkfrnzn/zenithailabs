import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata: Metadata = {
  title: "CFB War Chest",
  description: "College football futures fantasy game.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const homeHref = user ? (user.role === "admin" ? "/admin" : "/leagues") : "/";

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0B1020] text-[#E2E8F0]">
        {/* Top gold accent line */}
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-amber-500 to-transparent" />

        <header className="sticky top-0 z-40 bg-[#0B1020]/90 backdrop-blur-xl border-b border-[#1e2d45]">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
            {/* Brand */}
            <Link href={homeHref} className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center group-hover:shadow-[0_0_12px_rgba(245,158,11,0.5)] transition-shadow">
                <span className="text-slate-900 font-black text-sm leading-none">W</span>
              </div>
              <span className="font-extrabold tracking-tight text-base text-white">
                CFB <span className="text-amber-400 group-hover:text-amber-300 transition-colors">War Chest</span>
              </span>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-1 text-sm">
              {user ? (
                <>
                  {user.role === "admin" && (
                    <Link
                      className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-amber-400 hover:bg-[#152033] transition-all"
                      href="/admin"
                    >
                      Admin
                    </Link>
                  )}
                  <Link
                    className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-amber-400 hover:bg-[#152033] transition-all"
                    href="/leagues"
                  >
                    My Leagues
                  </Link>
                  <div className="w-px h-4 bg-[#1e2d45] mx-1" />
                  <span className="text-slate-500 text-xs px-2">{user.displayName}</span>
                  <LogoutButton />
                </>
              ) : (
                <Link className="btn-primary btn-sm" href="/login">
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>

        {/* Bottom fade */}
        <div className="fixed bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent pointer-events-none" />
      </body>
    </html>
  );
}
