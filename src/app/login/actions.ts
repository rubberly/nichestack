"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { safeNext } from "@/lib/permissions";
import type { ActionState } from "@/components/action-form";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  next: z.string().optional(),
});

export async function requestLoginLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = LoginSchema.safeParse({ email: formData.get("email"), next: formData.get("next") ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const rl = await rateLimit(`login:ip:${ip}`, 20, 15 * 60);
  if (!rl.ok) return { error: "Too many sign-in attempts. Please wait 15 minutes and try again." };

  try {
    await signIn("resend", { email: parsed.data.email, redirect: false, redirectTo: safeNext(parsed.data.next) });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "We couldn't send a sign-in link right now. If you just requested several, wait 15 minutes." };
    }
    throw err;
  }
  redirect(`/login/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
