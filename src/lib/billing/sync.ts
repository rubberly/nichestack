import type Stripe from "stripe";
import { db } from "../db";
import { stripe } from "./stripe";
import { customerId, shouldApply, toSubRecord, type StripeSubLike } from "./mapping";
import { handleRentEvent } from "../facility/sync";

/**
 * Pull the subscription fresh from Stripe (so out-of-order webhooks can't leave stale state)
 * and write it to our Subscription table.
 */
export async function syncSubscription(subscriptionId: string): Promise<"saved" | "ignored"> {
  const sub = (await stripe().subscriptions.retrieve(subscriptionId)) as unknown as StripeSubLike;
  const rec = toSubRecord(sub);
  if (!rec) return "ignored";

  // Defense in depth: the org must own this Stripe customer.
  const org = await db.org.findUnique({ where: { id: rec.orgId }, select: { stripeCustomerId: true } });
  if (!org || org.stripeCustomerId !== customerId(sub)) return "ignored";

  const existing = await db.subscription.findUnique({ where: { orgId_product: { orgId: rec.orgId, product: rec.product } } });
  if (!shouldApply(existing, rec)) return "ignored";

  await db.subscription.upsert({
    where: { orgId_product: { orgId: rec.orgId, product: rec.product } },
    create: rec,
    update: rec,
  });
  await db.auditLog.create({
    data: { orgId: rec.orgId, action: "billing.subscription", meta: { product: rec.product, plan: rec.planKey, status: rec.status } },
  });
  return "saved";
}

/** Re-sync every subscription for a customer. Used after checkout so local testing works even without webhooks. */
export async function syncCustomer(stripeCustomerId: string) {
  const subs = await stripe().subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 20 });
  // Oldest first, so the newest subscription for a product is written last.
  for (const s of [...subs.data].reverse()) await syncSubscription(s.id);
}

const SUB_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

/** Returns false if the event was a duplicate (already processed). */
export async function handleStripeEvent(event: Stripe.Event): Promise<boolean> {
  try {
    await db.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch {
    return false; // unique violation: Stripe re-sent an event we already handled
  }
  try {
    if (await handleRentEvent(event)) return true;
    if (SUB_EVENTS.has(event.type)) {
      await syncSubscription((event.data.object as { id: string }).id);
    }
    return true;
  } catch (err) {
    // Let Stripe retry: forget we saw it.
    await db.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    throw err;
  }
}
