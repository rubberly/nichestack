"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { bookUnit } from "@/lib/facility/public";
import { rateLimit } from "@/lib/ratelimit";
import type { ActionState } from "@/components/action-form";

const Booking = z.object({
  unitId: z.string().cuid("Pick a unit."),
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254),
  phone: z.string().trim().min(7, "Enter a phone number.").max(30),
  agree: z.literal("on", { errorMap: () => ({ message: "Please accept the rental terms." }) }),
});

export async function book(slug: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = Booking.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`book:${ip}`, 10, 60 * 60)).ok) return { error: "Too many attempts. Please try again later or call the facility." };

  const { unitId, name, email, phone } = parsed.data;
  const result = await bookUnit(slug, unitId, { name, email, phone });
  if ("error" in result) return { error: result.error };
  redirect(result.url);
}
