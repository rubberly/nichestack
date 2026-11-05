"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg, hashToken, newToken } from "@/lib/tenancy";
import { canAssignRole, canRemove, type Role } from "@/lib/permissions";
import { rateLimit } from "@/lib/ratelimit";
import { buttonEmail, sendEmail } from "@/lib/email";
import { SITE, appUrl } from "@/lib/site";
import { PLAN_KEYS, PRODUCT_KEYS, TRIAL_DAYS, getProduct } from "@/lib/billing/plans";
import { hasAccess, seatLimit } from "@/lib/billing/entitlements";
import { stripe } from "@/lib/billing/stripe";
import { findPrice, portalConfigId } from "@/lib/billing/checkout";
import { syncSubscription } from "@/lib/billing/sync";
import type { ActionState } from "@/components/action-form";

const PlanChoice = z.object({ product: z.enum(PRODUCT_KEYS), plan: z.enum(PLAN_KEYS) });

// ── Billing ────────────────────────────────────────────────────────────────

/** Start a subscription (with a free trial the first time) via Stripe Checkout. */
export async function startCheckout(slug: string, formData: FormData) {
  const ctx = await requireOrg(slug, "billing:manage");
  const parsed = PlanChoice.safeParse({ product: formData.get("product"), plan: formData.get("plan") });
  if (!parsed.success) redirect(`/app/${slug}/billing?error=invalid`);
  const { product, plan } = parsed.data;

  const existing = await ctx.db.subscription.findFirst({ where: { product } });
  if (hasAccess(existing)) redirect(`/app/${slug}/billing?error=already`);

  const price = await findPrice(product, plan);
  if (!price) redirect(`/app/${slug}/billing?error=price`);

  const s = stripe();
  let customer = ctx.org.stripeCustomerId;
  if (!customer) {
    const c = await s.customers.create(
      { name: ctx.org.name, email: ctx.user.email, metadata: { orgId: ctx.org.id } },
      { idempotencyKey: `customer-${ctx.org.id}` },
    );
    customer = c.id;
    await ctx.db.org.update({ where: { id: ctx.org.id }, data: { stripeCustomerId: customer } });
  }

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: ctx.org.id,
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { orgId: ctx.org.id },
      // One free trial per product per org.
      ...(existing ? {} : { trial_period_days: TRIAL_DAYS }),
    },
    success_url: appUrl(`/app/${slug}/billing?checkout=success`),
    cancel_url: appUrl(`/app/${slug}/billing?checkout=cancel`),
  });
  redirect(session.url!);
}

/** Upgrade / downgrade within the same product. Prorated by Stripe. */
export async function changePlan(slug: string, formData: FormData) {
  const ctx = await requireOrg(slug, "billing:manage");
  const parsed = PlanChoice.safeParse({ product: formData.get("product"), plan: formData.get("plan") });
  if (!parsed.success) redirect(`/app/${slug}/billing?error=invalid`);
  const { product, plan } = parsed.data;

  const sub = await ctx.db.subscription.findFirst({ where: { product } });
  if (!sub || !hasAccess(sub)) redirect(`/app/${slug}/billing?error=invalid`);
  const price = await findPrice(product, plan);
  if (!price) redirect(`/app/${slug}/billing?error=price`);

  const s = stripe();
  const live = await s.subscriptions.retrieve(sub.stripeSubscriptionId);
  await s.subscriptions.update(live.id, {
    items: [{ id: live.items.data[0].id, price: price.id }],
    proration_behavior: "create_prorations",
  });
  await syncSubscription(live.id);
  await ctx.db.auditLog.create({ data: { orgId: ctx.org.id, userId: ctx.user.id, action: "billing.plan_changed", meta: { product, plan } } });
  redirect(`/app/${slug}/billing?changed=${encodeURIComponent(getProduct(product)!.name)}`);
}

/** Stripe-hosted page to update the card, see invoices or cancel. */
export async function openBillingPortal(slug: string) {
  const ctx = await requireOrg(slug, "billing:manage");
  if (!ctx.org.stripeCustomerId) redirect(`/app/${slug}/billing`);
  const session = await stripe().billingPortal.sessions.create({
    customer: ctx.org.stripeCustomerId,
    configuration: await portalConfigId(),
    return_url: appUrl(`/app/${slug}/billing`),
  });
  redirect(session.url);
}

// ── Members ────────────────────────────────────────────────────────────────

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
});

export async function inviteMember(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg(slug, "members:manage");
  const parsed = InviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, role } = parsed.data;

  if (!canAssignRole(ctx.role, role as Role)) return { error: "You can't give that role." };
  if (!(await rateLimit(`invite:${ctx.org.id}`, 30, 60 * 60)).ok) return { error: "Too many invites. Try again in an hour." };

  const [members, pending, subs, already] = await Promise.all([
    ctx.db.membership.count(),
    ctx.db.invite.count({ where: { acceptedAt: null, expiresAt: { gt: new Date() } } }),
    ctx.db.subscription.findMany(),
    ctx.db.membership.findFirst({ where: { user: { email } } }),
  ]);
  if (already) return { error: `${email} is already a member.` };
  const limit = seatLimit(subs);
  if (limit !== null && members + pending >= limit) {
    return { error: `Your plan includes ${limit} seats. Upgrade on the Billing page to add more people.` };
  }

  const token = newToken();
  await ctx.db.invite.create({
    data: { orgId: ctx.org.id, email, role, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
  });
  await sendEmail({
    to: email,
    subject: `You're invited to ${ctx.org.name} on ${SITE.name}`,
    ...buttonEmail({
      heading: `Join ${ctx.org.name}`,
      body: `${ctx.user.email} invited you to join ${ctx.org.name} on ${SITE.name}.`,
      button: "Accept invite",
      url: appUrl(`/invite/${token}`),
      footer: "This invite expires in 7 days.",
    }),
  });
  await ctx.db.auditLog.create({ data: { orgId: ctx.org.id, userId: ctx.user.id, action: "member.invited", meta: { email, role } } });
  revalidatePath(`/app/${slug}/members`);
  return { ok: `Invite sent to ${email}.` };
}

export async function revokeInvite(slug: string, formData: FormData) {
  const ctx = await requireOrg(slug, "members:manage");
  const id = z.string().cuid().parse(formData.get("id"));
  await ctx.db.invite.deleteMany({ where: { id, acceptedAt: null } });
  revalidatePath(`/app/${slug}/members`);
}

export async function removeMember(slug: string, formData: FormData) {
  const ctx = await requireOrg(slug, "members:manage");
  const id = z.string().cuid().parse(formData.get("id"));
  const target = await ctx.db.membership.findUnique({ where: { id } });
  if (!target || !canRemove(ctx.role, target.role as Role)) return;
  if (target.role === "OWNER" && (await ctx.db.membership.count({ where: { role: "OWNER" } })) <= 1) return; // keep at least one owner
  await ctx.db.membership.delete({ where: { id } });
  await ctx.db.auditLog.create({ data: { orgId: ctx.org.id, userId: ctx.user.id, action: "member.removed", meta: { userId: target.userId } } });
  revalidatePath(`/app/${slug}/members`);
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function renameOrg(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg(slug, "org:update");
  const parsed = z.string().trim().min(2, "Name is too short.").max(80).safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await ctx.db.org.update({ where: { id: ctx.org.id }, data: { name: parsed.data } });
  revalidatePath(`/app/${slug}`, "layout");
  return { ok: "Saved." };
}
