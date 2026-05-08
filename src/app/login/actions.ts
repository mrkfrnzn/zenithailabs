"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    redirect("/login?error=" + encodeURIComponent("Email and password required."));
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=" + encodeURIComponent("Invalid email or password."));
  }
  await createSession(user.id);
  redirect(user.role === "admin" ? "/admin" : "/leagues");
}
