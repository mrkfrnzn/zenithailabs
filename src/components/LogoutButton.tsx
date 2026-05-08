"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-[#152033] transition-all text-sm disabled:opacity-50"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login");
          router.refresh();
        })
      }
    >
      Sign out
    </button>
  );
}
